import {
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_BOUNDS,
  type ManagedAgentLogicalToolName,
  type RelayBrowserClientPort,
  type RelayCapabilityGrant,
  type RelayClaimedAttemptView,
  type RelayExecutionPermit,
  type RelayGrant,
} from "../contracts";
import {
  capabilityGrantMatchesPolicy,
  relayAccessPolicy,
} from "../access-policy";
import type {
  WebMCPConsumerModelContext,
  WebMCPExecutionOptionsLike,
  WebMCPRegisteredToolLike,
  WebMCPToolLike,
} from "../../webmcp/types";
import { canonicalJson, sha256CanonicalJson, utf8ByteLength } from "./canonical-json";
import { RelayBrowserError, relayAbortError } from "./errors";
import { makeRelayPhysicalToolName } from "./physical-name";
import {
  relayFailureOutput,
  validateRelayToolTransportData,
  wrapRelayNativeResult,
} from "./result-decoder";

interface RelayRegistrationRecord {
  logicalName: ManagedAgentLogicalToolName;
  controller: AbortController;
  removeParentAbort: () => void;
}

interface RelayRegistrationSession {
  grant: RelayGrant;
  attempt: RelayClaimedAttemptView;
  capabilityGrant: RelayCapabilityGrant;
}

interface RelayExecutionArm {
  permit: RelayExecutionPermit;
  argumentsDigest: `sha256:${string}`;
  consumed: boolean;
  executionSignal?: AbortSignal;
}

function objectInput(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function linkSignals(
  registrationSignal: AbortSignal,
  executionSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!executionSignal) return { signal: registrationSignal, cleanup: () => undefined };
  if (registrationSignal.aborted) return { signal: registrationSignal, cleanup: () => undefined };
  if (executionSignal.aborted) return { signal: executionSignal, cleanup: () => undefined };
  const controller = new AbortController();
  const fromRegistration = () => controller.abort(relayAbortError(registrationSignal.reason));
  const fromExecution = () => controller.abort(relayAbortError(executionSignal.reason));
  registrationSignal.addEventListener("abort", fromRegistration, { once: true });
  executionSignal.addEventListener("abort", fromExecution, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      registrationSignal.removeEventListener("abort", fromRegistration);
      executionSignal.removeEventListener("abort", fromExecution);
    },
  };
}

function notArmedResult() {
  return wrapRelayNativeResult({
    ok: false,
    code: "RELAY_EXECUTION_NOT_ARMED",
    message: "This Relay tool has no matching live execution permit.",
    retryable: false,
  });
}

export class RelayWebMCPRegistrationManager {
  readonly #context: WebMCPConsumerModelContext;
  readonly #client: RelayBrowserClientPort;
  readonly #now: () => number;
  readonly #registrations = new Map<string, RelayRegistrationRecord>();
  readonly #inFlight = new Set<Promise<void>>();
  readonly #consumedPermitTokens = new Set<string>();
  #session: RelayRegistrationSession | null = null;
  #arm: RelayExecutionArm | null = null;
  #disposed = false;

  constructor(input: {
    context: WebMCPConsumerModelContext;
    client: RelayBrowserClientPort;
    now?: () => number;
  }) {
    this.#context = input.context;
    this.#client = input.client;
    this.#now = input.now ?? (() => Date.now());
  }

  get registeredNames(): string[] {
    const session = this.#session;
    if (!session) return [];
    return relayAccessPolicy(session.capabilityGrant.accessProfile).logicalToolNames
      .map((logicalName) => makeRelayPhysicalToolName({
        accessProfile: session.capabilityGrant.accessProfile,
        registrationScope: session.attempt.registrationScope,
        registrationGeneration: session.attempt.registrationGeneration,
        logicalName,
      }))
      .filter((name) => this.#registrations.has(name));
  }

  logicalNameForPhysical(physicalName: string): ManagedAgentLogicalToolName | null {
    return this.#registrations.get(physicalName)?.logicalName ?? null;
  }

  updateLease(attempt: RelayClaimedAttemptView): void {
    const session = this.#session;
    if (
      !session
      || attempt.attemptId !== session.attempt.attemptId
      || attempt.registrationGeneration !== session.attempt.registrationGeneration
      || attempt.registrationScope !== session.attempt.registrationScope
    ) {
      throw new RelayBrowserError("RELAY_LEASE_LOST", "The renewed lease no longer owns this Relay catalog.");
    }
    this.#session = { ...session, attempt };
  }

  async register(input: {
    grant: RelayGrant;
    attempt: RelayClaimedAttemptView;
    capabilityGrant: RelayCapabilityGrant;
    signal?: AbortSignal;
  }): Promise<string[]> {
    if (this.#disposed) {
      throw new RelayBrowserError("RELAY_UNAVAILABLE", "The Relay registration manager is closed.");
    }
    await this.withdraw("Relay registration replaced");
    if (input.signal?.aborted) throw relayAbortError(input.signal.reason);
    if (!capabilityGrantMatchesPolicy(input.capabilityGrant)) {
      throw new RelayBrowserError("RELAY_MANIFEST_MISMATCH", "The claimed website access grant is invalid.");
    }
    const logicalNames = relayAccessPolicy(input.capabilityGrant.accessProfile).logicalToolNames;
    this.#session = {
      grant: input.grant,
      attempt: input.attempt,
      capabilityGrant: input.capabilityGrant,
    };

    try {
      for (const logicalName of logicalNames) {
        if (input.signal?.aborted) throw relayAbortError(input.signal.reason);
        const definition = MANAGED_AGENT_TOOL_DEFINITIONS[logicalName];
        const physicalName = makeRelayPhysicalToolName({
          accessProfile: input.capabilityGrant.accessProfile,
          registrationScope: input.attempt.registrationScope,
          registrationGeneration: input.attempt.registrationGeneration,
          logicalName,
        });
        const controller = new AbortController();
        // Native registerTool() owns this signal. Keep its teardown reason on the
        // registration control plane as a string; execution boundaries translate
        // cancellation to AbortError below.
        const abortFromParent = () => controller.abort("Relay registration cancelled");
        input.signal?.addEventListener("abort", abortFromParent, { once: true });
        const record: RelayRegistrationRecord = {
          logicalName,
          controller,
          removeParentAbort: () => input.signal?.removeEventListener("abort", abortFromParent),
        };
        this.#registrations.set(physicalName, record);
        const tool: WebMCPToolLike = {
          name: physicalName,
          title: `Ratiflow · ${logicalName.replaceAll("_", " ")}`,
          description: definition.description,
          inputSchema: JSON.parse(canonicalJson(definition.inputSchema)) as Record<string, unknown>,
          annotations: {
            readOnlyHint: definition.annotations.readOnlyHint,
            untrustedContentHint: definition.annotations.untrustedContentHint,
          },
          execute: (rawInput, options) => this.#executeCallback(
            physicalName,
            rawInput,
            options,
            controller.signal,
          ),
        };
        try {
          await this.#context.registerTool(tool, { signal: controller.signal });
        } catch (error) {
          this.#registrations.delete(physicalName);
          record.removeParentAbort();
          controller.abort("Relay registration failed");
          throw error;
        }
        if (controller.signal.aborted || input.signal?.aborted) {
          throw relayAbortError(input.signal?.reason ?? controller.signal.reason);
        }
      }
      return this.registeredNames;
    } catch (error) {
      await this.withdraw("Relay catalog registration failed");
      throw error;
    }
  }

  async executeArmed(input: {
    descriptor: WebMCPRegisteredToolLike;
    arguments: Readonly<Record<string, unknown>>;
    permit: RelayExecutionPermit;
    signal?: AbortSignal;
  }): Promise<string> {
    const session = this.#session;
    const logicalName = this.logicalNameForPhysical(input.descriptor.name);
    if (!session || !logicalName || this.#arm) {
      throw new RelayBrowserError("RELAY_EXECUTION_NOT_ARMED", "The Relay catalog cannot arm this descriptor.");
    }
    const argumentsDigest = await sha256CanonicalJson(input.arguments);
    const permitExpiry = Date.parse(input.permit.expiresAt);
    if (
      this.#consumedPermitTokens.has(input.permit.token)
      || input.permit.attemptId !== session.attempt.attemptId
      || input.permit.physicalToolName !== input.descriptor.name
      || input.permit.argumentsDigest !== argumentsDigest
      || input.permit.registrationGeneration !== session.attempt.registrationGeneration
      || input.permit.leaseId !== session.attempt.leaseId
      || !Number.isFinite(permitExpiry)
      || permitExpiry <= this.#now()
    ) {
      throw new RelayBrowserError("RELAY_EXECUTION_NOT_ARMED", "The Relay permit does not match this exact call.");
    }
    const arm: RelayExecutionArm = {
      permit: input.permit,
      argumentsDigest,
      consumed: false,
      executionSignal: input.signal,
    };
    this.#arm = arm;
    try {
      // The current draft accepts an object. Chrome 152 temporarily exposes the
      // earlier JSON-string descriptor shape and correspondingly requires a
      // JSON string here. Bind the encoding to the exact discovered descriptor.
      const nativeInput = typeof input.descriptor.inputSchema === "string"
        ? canonicalJson(input.arguments)
        : input.arguments as Record<string, unknown>;
      return await this.#context.executeTool(
        input.descriptor,
        nativeInput,
        { signal: input.signal },
      );
    } finally {
      if (this.#arm === arm) this.#arm = null;
    }
  }

  async #executeCallback(
    physicalName: string,
    rawInput: unknown,
    options: WebMCPExecutionOptionsLike | undefined,
    registrationSignal: AbortSignal,
  ): Promise<unknown> {
    const session = this.#session;
    const input = objectInput(rawInput);
    const arm = this.#arm;
    if (!session || !input || !arm || arm.consumed) return notArmedResult();
    if (utf8ByteLength(canonicalJson(input)) > RELAY_BOUNDS.maxFunctionArgumentsBytes) {
      return notArmedResult();
    }
    const argumentsDigest = await sha256CanonicalJson(input);
    const permitExpiry = Date.parse(arm.permit.expiresAt);
    if (
      this.#consumedPermitTokens.has(arm.permit.token)
      || arm.argumentsDigest !== argumentsDigest
      || arm.permit.physicalToolName !== physicalName
      || arm.permit.registrationGeneration !== session.attempt.registrationGeneration
      || arm.permit.leaseId !== session.attempt.leaseId
      || !Number.isFinite(permitExpiry)
      || permitExpiry <= this.#now()
    ) {
      return notArmedResult();
    }

    arm.consumed = true;
    this.#consumedPermitTokens.add(arm.permit.token);
    // Chrome 152 cancels executeTool() but does not yet forward the callback's
    // options.signal. Because Ratiflow owns both sides of this in-page relay,
    // preserve cancellation by falling back to the exact caller signal stored
    // on the one-shot execution arm.
    const linked = linkSignals(registrationSignal, options?.signal ?? arm.executionSignal);
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.#inFlight.add(settled);
    try {
      if (linked.signal.aborted) throw relayAbortError(linked.signal.reason);
      const result = await this.#client.executeTool(
        session.grant,
        arm.permit.token,
        physicalName,
        input,
        linked.signal,
      );
      if (!result.ok) return wrapRelayNativeResult(relayFailureOutput(result));
      const receipt = validateRelayToolTransportData(result.data);
      return wrapRelayNativeResult({
        resultReceiptId: receipt.resultReceiptId,
        output: receipt.output,
      });
    } finally {
      linked.cleanup();
      if (this.#arm === arm) this.#arm = null;
      settle();
      this.#inFlight.delete(settled);
    }
  }

  async withdraw(reason = "Relay catalog withdrawn"): Promise<void> {
    this.#arm = null;
    this.#consumedPermitTokens.clear();
    for (const [name, registration] of this.#registrations) {
      this.#registrations.delete(name);
      registration.removeParentAbort();
      registration.controller.abort(reason);
    }
    await Promise.allSettled([...this.#inFlight]);
    this.#session = null;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.withdraw("Relay registration manager disposed");
  }
}
