import {
  RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS,
  RELAY_BOUNDS,
  type RelayBrowserObservedCatalogTransition,
  type RelayClaimOutcome,
  type RelayClaimedAttemptView,
  type RelayGrant,
  type RelayResult,
  type RelayWorkspaceState,
} from "../contracts";
import { relayAccessPolicy } from "../access-policy";
import { REPOSITORY_TOOL_NAMES } from "../../repository/contracts";
import type { WebMCPRegisteredToolLike } from "../../webmcp/types";
import { RelayBrowserError, relayAbortError, safeRelayErrorMessage } from "./errors";
import { normalizeRelayManifest, type DiscoveredRelayCatalog } from "./manifest";
import { RelayWebMCPRegistrationManager } from "./registration";
import { decodeRelayExecuteToolResult } from "./result-decoder";
import type {
  RelayBrowserRuntimeDependencies,
  RelayBrowserRuntimeStatus,
} from "./types";

const CATALOG_SETTLE_TIMEOUT_MS = 4_000;
const CATALOG_POLL_MS = 25;
const RELEASE_TIMEOUT_MS = 2_000;

function resultData<T>(result: RelayResult<T>): T {
  if (!result.ok) throw new RelayBrowserError(result.code, result.message);
  return result.data;
}

function abortableDelay(
  dependencies: RelayBrowserRuntimeDependencies,
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(relayAbortError(signal.reason));
      return;
    }
    const timer = dependencies.environment.setTimer(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      dependencies.environment.clearTimer(timer);
      reject(relayAbortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function relayQueueHead(state: RelayWorkspaceState | null): RelayWorkspaceState["runs"][number] | null {
  if (!state || state.activeAttempt !== null) return null;
  return state.runs
    .filter((run) => run.status === "QUEUED" || run.status === "WAITING_RETRY")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
      || left.runId.localeCompare(right.runId))[0] ?? null;
}

export class RelayBrowserRuntime {
  readonly #dependencies: RelayBrowserRuntimeDependencies;
  readonly #relayRegistrations: RelayWebMCPRegistrationManager;
  #status: RelayBrowserRuntimeStatus = {
    phase: "IDLE",
    activeLogicalTool: null,
    lastError: null,
    webMcpAvailable: true,
  };
  #started = false;
  #disposed = false;
  #busy = false;
  #wakeQueued = false;
  #explicitRetryRunId: string | null = null;
  #lastState: RelayWorkspaceState | null = null;
  #heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  #leaseTimer: ReturnType<typeof setTimeout> | null = null;
  #activeController: AbortController | null = null;
  #activePromise: Promise<void> | null = null;
  #removeVisibilityListener: (() => void) | null = null;
  #toolchangeVersion = 0;
  #activeGrant: RelayGrant | null = null;
  #activeAttempt: RelayClaimedAttemptView | null = null;

  constructor(dependencies: RelayBrowserRuntimeDependencies) {
    this.#dependencies = dependencies;
    this.#relayRegistrations = new RelayWebMCPRegistrationManager({
      context: dependencies.context,
      client: dependencies.client,
      now: dependencies.environment.now,
    });
  }

  get status(): RelayBrowserRuntimeStatus {
    return { ...this.#status };
  }

  start(): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    this.#dependencies.context.addEventListener("toolchange", this.#onToolchange);
    this.#removeVisibilityListener = this.#dependencies.environment.subscribeVisibility(
      this.#onVisibilityChange,
    );
    if (this.#dependencies.environment.isVisible()) {
      this.#setStatus({ phase: "IDLE", lastError: null });
      this.wake();
    } else {
      this.#setStatus({ phase: "PAUSED_HIDDEN", lastError: null });
    }
  }

  wake(): void {
    if (this.#disposed || !this.#started || !this.#dependencies.environment.isVisible()) return;
    if (this.#busy) {
      this.#wakeQueued = true;
      return;
    }
    this.#scheduleTick(0);
  }

  /** Human-confirmed second attempt. Ordinary wakes never claim WAITING_RETRY work. */
  retry(): void {
    if (this.#disposed || !this.#started || !this.#dependencies.environment.isVisible()) return;
    const head = relayQueueHead(this.#lastState);
    if (!head || head.status !== "WAITING_RETRY") return;
    this.#explicitRetryRunId = head.runId;
    this.wake();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#started = false;
    this.#clearHeartbeat();
    this.#clearLeaseTimer();
    this.#activeController?.abort(relayAbortError("Relay page unmounted"));
    this.#dependencies.context.removeEventListener("toolchange", this.#onToolchange);
    this.#removeVisibilityListener?.();
    this.#removeVisibilityListener = null;
    await this.#activePromise?.catch(() => undefined);
    await this.#relayRegistrations.dispose();
    this.#activeGrant = null;
    this.#activeAttempt = null;
    this.#lastState = null;
    this.#dependencies.onStateChange?.(null);
  }

  readonly #onToolchange = () => {
    this.#toolchangeVersion += 1;
  };

  readonly #onVisibilityChange = () => {
    if (this.#disposed) return;
    if (!this.#dependencies.environment.isVisible()) {
      this.#clearHeartbeat();
      this.#activeController?.abort(relayAbortError("Relay paused while the page is hidden"));
      this.#setStatus({ phase: "PAUSED_HIDDEN", activeLogicalTool: null, lastError: null });
      return;
    }
    this.#setStatus({ phase: "IDLE", activeLogicalTool: null, lastError: null });
    this.wake();
  };

  #setStatus(change: Partial<RelayBrowserRuntimeStatus>): void {
    this.#status = { ...this.#status, ...change };
    this.#dependencies.onStatusChange?.({ ...this.#status });
  }

  #scheduleTick(delayMs: number): void {
    this.#clearHeartbeat();
    this.#heartbeatTimer = this.#dependencies.environment.setTimer(() => {
      this.#heartbeatTimer = null;
      const run = this.#tick();
      this.#activePromise = run;
      const clearActivePromise = () => {
        if (this.#activePromise === run) this.#activePromise = null;
      };
      void run.then(clearActivePromise, clearActivePromise);
    }, delayMs);
  }

  #clearHeartbeat(): void {
    if (this.#heartbeatTimer === null) return;
    this.#dependencies.environment.clearTimer(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }

  #clearLeaseTimer(): void {
    if (this.#leaseTimer === null) return;
    this.#dependencies.environment.clearTimer(this.#leaseTimer);
    this.#leaseTimer = null;
  }

  async #tick(): Promise<void> {
    if (
      this.#disposed
      || this.#busy
      || !this.#dependencies.environment.isVisible()
    ) return;
    this.#busy = true;
    this.#wakeQueued = false;
    const explicitRetryRunId = this.#explicitRetryRunId;
    this.#explicitRetryRunId = null;
    const controller = new AbortController();
    this.#activeController = controller;
    try {
      const state = resultData(await this.#dependencies.client.readState(controller.signal));
      this.#lastState = state;
      this.#dependencies.onStateChange?.(state);
      const head = relayQueueHead(state);
      const isExactRetry = explicitRetryRunId !== null
        && head?.status === "WAITING_RETRY"
        && head.runId === explicitRetryRunId;
      const isOrdinaryQueuedClaim = explicitRetryRunId === null && head?.status === "QUEUED";
      if (!isExactRetry && !isOrdinaryQueuedClaim) {
        this.#setStatus({ phase: "IDLE", activeLogicalTool: null, lastError: null });
        return;
      }

      await this.#waitForExactCatalog(REPOSITORY_TOOL_NAMES, -1, controller.signal);
      this.#setStatus({ phase: "CLAIMING", activeLogicalTool: null, lastError: null });
      const claim = resultData(await this.#dependencies.client.claim(
        this.#dependencies.pageSessionId,
        explicitRetryRunId ?? undefined,
        controller.signal,
      ));
      if (claim.outcome === "CLAIMED") await this.#runClaim(claim, controller);
      else this.#setStatus({ phase: "IDLE", activeLogicalTool: null, lastError: null });
    } catch (error) {
      if (this.#disposed) return;
      if (error instanceof RelayBrowserError
        && error.code === "RATE_LIMITED"
        && explicitRetryRunId !== null) {
        // A claim-time quota refusal creates no attempt. Preserve the human's
        // exact retry target so the heartbeat can reclaim it when the window opens.
        this.#explicitRetryRunId ??= explicitRetryRunId;
      }
      if (!this.#dependencies.environment.isVisible()) {
        this.#setStatus({ phase: "PAUSED_HIDDEN", activeLogicalTool: null, lastError: null });
      } else {
        this.#setStatus({
          phase: "FAILED",
          activeLogicalTool: null,
          lastError: safeRelayErrorMessage(error),
        });
      }
    } finally {
      if (this.#activeController === controller) this.#activeController = null;
      this.#busy = false;
      if (!this.#disposed && this.#dependencies.environment.isVisible()) {
        this.#scheduleTick(this.#wakeQueued ? 0 : RELAY_BOUNDS.recoveryHeartbeatMs);
      }
    }
  }

  async #runClaim(
    claim: Extract<RelayClaimOutcome, { outcome: "CLAIMED" }>,
    controller: AbortController,
  ): Promise<void> {
    if (claim.run.accessProfile !== claim.capabilityGrant.accessProfile) {
      throw new RelayBrowserError(
        "RELAY_MANIFEST_MISMATCH",
        "The claimed run and website access grant do not match.",
      );
    }
    this.#activeGrant = claim.grant;
    this.#activeAttempt = claim.attempt;
    let runError: unknown = null;
    let completed = false;
    let relayRemovalEventBaseline = this.#toolchangeVersion;
    let relayCatalogObserved = false;
    this.#scheduleLeaseRenewal(controller);

    try {
      this.#setStatus({ phase: "TRANSITIONING_TO_RELAY", lastError: null });
      const idleRemovalBaseline = this.#toolchangeVersion;
      await this.#dependencies.idleCatalog.withdraw("Managed Relay claimed queued work");
      await this.#waitForExactCatalog([], idleRemovalBaseline, controller.signal);
      await this.#recordObservedCatalogTransition(
        claim.grant,
        "IDLE_CATALOG_WITHDRAWN",
        controller.signal,
      );

      const relayRegistrationBaseline = this.#toolchangeVersion;
      const registeredNames = await this.#relayRegistrations.register({
        grant: claim.grant,
        attempt: claim.attempt,
        capabilityGrant: claim.capabilityGrant,
        signal: controller.signal,
      });
      const expectedNames = relayAccessPolicy(claim.capabilityGrant.accessProfile).logicalToolNames.map(
        (logicalName) => registeredNames.find((name) =>
          this.#relayRegistrations.logicalNameForPhysical(name) === logicalName,
        ) ?? "",
      );
      if (expectedNames.some((name) => name.length === 0)) {
        throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The Relay catalog registration was incomplete.");
      }
      await this.#waitForExactCatalog(expectedNames, relayRegistrationBaseline, controller.signal);
      await this.#recordObservedCatalogTransition(
        claim.grant,
        "RELAY_CATALOG_REGISTERED",
        controller.signal,
      );
      relayCatalogObserved = true;
      relayRemovalEventBaseline = this.#toolchangeVersion;

      this.#setStatus({ phase: "AWAITING_MODEL", activeLogicalTool: null });
      let outcome = resultData(await this.#dependencies.client.step(claim.grant, {
        action: "START",
        attemptId: claim.attempt.attemptId,
        expectedStep: claim.attempt.currentStep,
      }, controller.signal));
      let discovered: DiscoveredRelayCatalog | null = null;
      const maximumTransitions = RELAY_BOUNDS.maxResponsesCallsPerAttempt
        + RELAY_BOUNDS.maxToolCallsPerAttempt + 2;

      for (let transition = 0; transition < maximumTransitions; transition += 1) {
        if (outcome.attemptId !== claim.attempt.attemptId) {
          throw new RelayBrowserError("RELAY_STATE_CONFLICT", "The Relay step changed attempt identity.");
        }
        if (outcome.outcome === "DISCOVER_TOOLS") {
          this.#setStatus({ phase: "DISCOVERING", activeLogicalTool: null });
          const tools = await this.#dependencies.context.getTools();
          discovered = await normalizeRelayManifest({
            tools,
            capabilityGrant: claim.capabilityGrant,
            attempt: claim.attempt,
            origin: this.#dependencies.environment.origin,
            topLevelWindow: this.#dependencies.environment.topLevelWindow,
          });
          this.#setStatus({ phase: "AWAITING_MODEL", activeLogicalTool: null });
          outcome = resultData(await this.#dependencies.client.step(claim.grant, {
            action: "SUBMIT_SEARCH_RESULT",
            attemptId: claim.attempt.attemptId,
            expectedStep: outcome.nextStep,
            toolSearchCallId: outcome.toolSearchCallId,
            manifest: discovered.manifest,
          }, controller.signal));
          continue;
        }
        if (outcome.outcome === "EXECUTE_TOOL") {
          if (!discovered) {
            throw new RelayBrowserError("RELAY_STATE_CONFLICT", "A tool was selected before WebMCP discovery.");
          }
          const descriptor = discovered.descriptors.get(outcome.physicalToolName);
          const logicalName = this.#relayRegistrations.logicalNameForPhysical(outcome.physicalToolName);
          if (!descriptor || !logicalName) {
            throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The selected physical tool is not active.");
          }
          this.#setStatus({ phase: "EXECUTING_TOOL", activeLogicalTool: logicalName });
          const raw = await this.#relayRegistrations.executeArmed({
            descriptor,
            arguments: outcome.arguments,
            permit: outcome.permit,
            signal: controller.signal,
          });
          const receipt = decodeRelayExecuteToolResult(raw);
          if (logicalName === "submit_scoped_revision") {
            this.#stopLeaseRenewal(claim.attempt);
          }
          this.#setStatus({ phase: "AWAITING_MODEL", activeLogicalTool: null });
          outcome = resultData(await this.#dependencies.client.step(claim.grant, {
            action: "SUBMIT_FUNCTION_RESULT",
            attemptId: claim.attempt.attemptId,
            expectedStep: outcome.nextStep,
            functionCallId: outcome.functionCallId,
            resultReceiptId: receipt.resultReceiptId,
          }, controller.signal));
          continue;
        }
        if (outcome.outcome === "COMPLETED") {
          completed = true;
          break;
        }
        if (outcome.outcome === "RETRY_REQUIRED") {
          runError = new RelayBrowserError("RELAY_STATE_CONFLICT", outcome.message);
          break;
        }
        const exhaustive: never = outcome;
        throw new RelayBrowserError("RELAY_STATE_CONFLICT", `Unknown Relay outcome: ${String(exhaustive)}`);
      }
      if (!completed && !runError) {
        throw new RelayBrowserError("RELAY_STATE_CONFLICT", "The Relay exceeded its browser transition bound.");
      }
    } catch (error) {
      runError = error;
      throw error;
    } finally {
      this.#clearLeaseTimer();
      this.#setStatus({ phase: "RESTORING_IDLE", activeLogicalTool: null });
      await this.#relayRegistrations.withdraw("Relay attempt ended");
      if (!this.#disposed) {
        try {
          await this.#waitForExactCatalog([], relayRemovalEventBaseline);
          if (relayCatalogObserved) {
            await this.#bestEffortRecordObservedCatalogTransition(
              claim.grant,
              "RELAY_CATALOG_WITHDRAWN",
            );
          }
          const idleRestoreBaseline = this.#toolchangeVersion;
          await this.#dependencies.idleCatalog.restore();
          await this.#waitForExactCatalog(REPOSITORY_TOOL_NAMES, idleRestoreBaseline);
          await this.#bestEffortRecordObservedCatalogTransition(
            claim.grant,
            "IDLE_CATALOG_RESTORED",
          );
        } catch (restoreError) {
          runError ??= restoreError;
        }
      }
      await this.#bestEffortRelease(claim.grant);
      this.#activeGrant = null;
      this.#activeAttempt = null;
      if (!this.#disposed) {
        if (!this.#dependencies.environment.isVisible()) {
          this.#setStatus({ phase: "PAUSED_HIDDEN", activeLogicalTool: null, lastError: null });
        } else if (runError) {
          this.#setStatus({
            phase: "FAILED",
            activeLogicalTool: null,
            lastError: safeRelayErrorMessage(runError),
          });
        } else {
          this.#setStatus({ phase: "IDLE", activeLogicalTool: null, lastError: null });
        }
        void this.#refreshState();
      }
    }
  }

  #scheduleLeaseRenewal(controller: AbortController): void {
    this.#clearLeaseTimer();
    this.#leaseTimer = this.#dependencies.environment.setTimer(() => {
      this.#leaseTimer = null;
      void this.#renewLease(controller);
    }, RELAY_BOUNDS.leaseRenewalMs);
  }

  async #renewLease(controller: AbortController): Promise<void> {
    const grant = this.#activeGrant;
    const attempt = this.#activeAttempt;
    if (this.#disposed || controller.signal.aborted || !grant || !attempt) return;
    try {
      const result = await this.#dependencies.client.renewLease(
        grant,
        attempt.leaseId,
        controller.signal,
      );
      if (!this.#isExactActiveAttempt(grant, attempt, controller)) return;
      const renewed = resultData(result);
      this.#activeAttempt = renewed;
      this.#relayRegistrations.updateLease(renewed);
      this.#scheduleLeaseRenewal(controller);
    } catch (error) {
      if (!this.#isExactActiveAttempt(grant, attempt, controller)) return;
      controller.abort(error instanceof Error ? error : relayAbortError("Relay lease lost"));
    }
  }

  #isExactActiveAttempt(
    grant: RelayGrant,
    attempt: RelayClaimedAttemptView,
    controller: AbortController,
  ): boolean {
    const active = this.#activeAttempt;
    return !this.#disposed
      && !controller.signal.aborted
      && this.#activeController === controller
      && this.#activeGrant === grant
      && active?.attemptId === attempt.attemptId
      && active.leaseId === attempt.leaseId
      && active.registrationGeneration === attempt.registrationGeneration;
  }

  #stopLeaseRenewal(attempt: RelayClaimedAttemptView): void {
    this.#clearLeaseTimer();
    const active = this.#activeAttempt;
    if (
      active?.attemptId === attempt.attemptId
      && active.leaseId === attempt.leaseId
      && active.registrationGeneration === attempt.registrationGeneration
    ) {
      this.#activeAttempt = null;
    }
  }

  async #bestEffortRelease(grant: RelayGrant): Promise<void> {
    const controller = new AbortController();
    const timer = this.#dependencies.environment.setTimer(
      () => controller.abort(relayAbortError("Relay lease release timed out")),
      RELEASE_TIMEOUT_MS,
    );
    try {
      await this.#dependencies.client.releaseLease(grant, controller.signal);
    } catch {
      // The server authoritatively expires/reconciles a lost release response.
    } finally {
      this.#dependencies.environment.clearTimer(timer);
    }
  }

  async #recordObservedCatalogTransition(
    grant: RelayGrant,
    transition: RelayBrowserObservedCatalogTransition,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!RELAY_BROWSER_OBSERVED_CATALOG_TRANSITIONS.includes(transition)) {
      throw new RelayBrowserError("RELAY_STATE_CONFLICT", "The catalog observation is invalid.");
    }
    resultData(await this.#dependencies.client.recordTrace(grant, {
      kind: transition,
      detail: { transition },
    }, signal));
    resultData(await this.#dependencies.client.recordTrace(grant, {
      kind: "WEBMCP_TOOLCHANGE_OBSERVED",
      detail: { transition },
    }, signal));
  }

  async #bestEffortRecordObservedCatalogTransition(
    grant: RelayGrant,
    transition: RelayBrowserObservedCatalogTransition,
  ): Promise<void> {
    const controller = new AbortController();
    const timer = this.#dependencies.environment.setTimer(
      () => controller.abort(relayAbortError("Relay trace recording timed out")),
      RELEASE_TIMEOUT_MS,
    );
    try {
      await this.#recordObservedCatalogTransition(grant, transition, controller.signal);
    } catch {
      // A failed application trace is omitted; it never fabricates an observation.
    } finally {
      this.#dependencies.environment.clearTimer(timer);
    }
  }

  async #refreshState(): Promise<void> {
    if (this.#disposed) return;
    try {
      const state = resultData(await this.#dependencies.client.readState());
      if (!this.#disposed) {
        this.#lastState = state;
        this.#dependencies.onStateChange?.(state);
      }
    } catch {
      // The next visible heartbeat retries state recovery.
    }
  }

  async #waitForExactCatalog(
    expectedNames: readonly string[],
    eventBaseline: number,
    signal?: AbortSignal,
  ): Promise<WebMCPRegisteredToolLike[]> {
    const deadline = this.#dependencies.environment.now() + CATALOG_SETTLE_TIMEOUT_MS;
    let latest: WebMCPRegisteredToolLike[] = [];
    do {
      if (signal?.aborted) throw relayAbortError(signal.reason);
      latest = await this.#dependencies.context.getTools();
      // WebMCP getTools() returns descriptors in ascending name order, which is not
      // the access catalog's semantic order. Compare the exact set here; manifest
      // normalization restores the frozen logical order separately.
      const names = latest.map(({ name }) => name).sort();
      const exactNames = names.length === expectedNames.length
        && JSON.stringify(names) === JSON.stringify([...expectedNames].sort());
      const exactOwners = latest.every(
        (tool) => tool.origin === this.#dependencies.environment.origin
          && tool.window === this.#dependencies.environment.topLevelWindow,
      );
      if (exactNames && exactOwners && this.#toolchangeVersion > eventBaseline) return latest;
      await abortableDelay(this.#dependencies, CATALOG_POLL_MS, signal);
    } while (this.#dependencies.environment.now() < deadline);
    throw new RelayBrowserError(
      "RELAY_MANIFEST_MISMATCH",
      `The live WebMCP catalog did not become [${expectedNames.join(", ")}].`,
    );
  }
}

export function unavailableRelayStatus(): RelayBrowserRuntimeStatus {
  return {
    phase: "UNAVAILABLE",
    activeLogicalTool: null,
    lastError: "RELAY_UNAVAILABLE: The standard document.modelContext consumer surface is unavailable.",
    webMcpAvailable: false,
  };
}
