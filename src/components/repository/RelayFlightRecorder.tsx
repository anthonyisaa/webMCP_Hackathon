import {
  MANAGED_AGENT_MODEL,
  MANAGED_AGENT_RUNTIME,
  RELAY_ACCESS_POLICIES,
  type ManagedAgentDirectoryEntry,
  type RelayAttemptStatus,
  type RelayRun,
  type RelayTraceEvent,
  type RelayWorkspaceState,
} from "@/agent-relay/contracts";

import styles from "./repository-workspace.module.css";
import { repositoryAccessProfileLabel } from "./relay-access-copy";

export interface RelayRuntimeView {
  phase: string;
  activeLogicalTool: string | null;
  lastError: string | null;
  webMcpAvailable: boolean;
}

export interface RelayFlightRecorderProps {
  state: RelayWorkspaceState | null;
  runtime: RelayRuntimeView | null;
  onRetry?: (runId: string) => void;
}

const TRACE_COPY: Readonly<Record<RelayTraceEvent["kind"], string>> = {
  RUN_QUEUED: "Mention became durable work",
  RUN_CLAIMED: "This page claimed one lease",
  LEASE_RENEWED: "Page lease renewed",
  IDLE_CATALOG_WITHDRAWN: "Idle tools withdrawn",
  RELAY_CATALOG_REGISTERED: "Granted catalog registered",
  WEBMCP_TOOLCHANGE_OBSERVED: "WebMCP announced the catalog change",
  MODEL_TOOL_SEARCH_REQUESTED: "Luna requested page tools",
  WEBMCP_GET_TOOLS_COMPLETED: "Page returned the discovered catalog",
  MODEL_TOOL_SELECTED: "Luna returned the required tool call",
  WEBMCP_EXECUTE_STARTED: "Page dispatched the selected tool",
  WEBMCP_EXECUTE_COMPLETED: "Application recorded the tool result",
  REVISION_COMMITTED: "Scoped revision committed",
  RELAY_CATALOG_WITHDRAWN: "Granted catalog withdrawn",
  IDLE_CATALOG_RESTORED: "Idle tools restored",
  ATTEMPT_RECONCILING: "Checking an ambiguous dispatch",
  ATTEMPT_FAILED: "Attempt stopped safely",
  RUN_WAITING_RETRY: "Run is ready to retry",
  RUN_COMPLETED: "Run completed",
  RUN_EXHAUSTED: "Attempt budget exhausted",
  RUN_CANCELLED: "Run cancelled",
};

const TERMINAL_RUNS = new Set<RelayRun["status"]>(["COMPLETED", "EXHAUSTED", "CANCELLED"]);

function activeRun(state: RelayWorkspaceState | null): RelayRun | null {
  if (!state) return null;
  return state.runs.find((run) => !TERMINAL_RUNS.has(run.status)) ?? state.runs.at(-1) ?? null;
}

function activeAgent(
  state: RelayWorkspaceState | null,
  run: RelayRun | null,
): ManagedAgentDirectoryEntry | null {
  if (!state || !run) return null;
  const entry = state.directory.find(
    (candidate): candidate is ManagedAgentDirectoryEntry =>
      candidate.kind === "AGENT"
      && candidate.identitySource === "DEMO_DIRECTORY"
      && candidate.profileId === run.profileId,
  );
  return entry ?? null;
}

function statusCopy(
  run: RelayRun | null,
  runtime: RelayRuntimeView | null,
  attemptStatus?: RelayAttemptStatus,
): string {
  if (runtime?.phase === "CLAIMING") {
    return run?.status === "WAITING_RETRY"
      ? "Starting bounded retry"
      : "Claiming queued assignment";
  }
  if (runtime?.phase === "TRANSITIONING_TO_RELAY") return "Switching to granted website tools";
  if (runtime?.phase === "EXECUTING_TOOL" && runtime.activeLogicalTool) {
    return `Running ${runtime.activeLogicalTool}`;
  }
  if (runtime?.phase === "DISCOVERING") return "Discovering page tools";
  if (runtime?.phase === "AWAITING_MODEL") return "Luna is composing the required call";
  if (runtime?.phase === "RESTORING_IDLE") return "Restoring idle page tools";
  if (attemptStatus === "RECONCILING" || runtime?.phase === "RECONCILING") {
    return "Reconciling the provider result";
  }
  if (run?.status === "QUEUED") return "Queued for this open page";
  if (run?.status === "WAITING_RETRY") return "Needs a bounded retry";
  if (run?.status === "COMPLETED") return "Revision recorded";
  if (run?.status === "EXHAUSTED") return "Stopped after two attempts";
  if (run?.status === "CANCELLED") return "Cancelled";
  return runtime?.webMcpAvailable === false ? "Waiting for WebMCP" : "Ready for a mention";
}

function eventTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

export function RelayFlightRecorder({ state, runtime, onRetry }: RelayFlightRecorderProps) {
  const run = activeRun(state);
  const agent = activeAgent(state, run);
  const accessPolicy = run ? RELAY_ACCESS_POLICIES[run.accessProfile] : null;
  const accessLabel = run ? repositoryAccessProfileLabel(run.accessProfile) : null;
  const events = state?.trace.filter((event) => !run || event.runId === run.runId).slice(-8) ?? [];
  const status = statusCopy(run, runtime, state?.activeAttempt?.status);
  const hasError = Boolean(
    (runtime?.phase !== "UNAVAILABLE" && runtime?.lastError)
    || run?.status === "EXHAUSTED",
  );
  const canRetry = run?.status === "WAITING_RETRY"
    && (runtime?.phase === "IDLE" || runtime?.phase === "FAILED");

  return (
    <section className={styles.flightRecorder} data-testid="relay-flight-recorder" aria-labelledby="relay-flight-recorder-title">
      <header className={styles.flightRecorderHeader}>
        <div>
          <p>Flight Recorder</p>
          <h2 id="relay-flight-recorder-title">The application trace stays with the document.</h2>
        </div>
        <span className={styles.relayLiveState} data-state={hasError ? "error" : run?.status.toLowerCase() ?? "ready"}>
          <i aria-hidden="true" />{status}
        </span>
      </header>

      <div className={styles.relayIdentityRow}>
        <span><small>Agent</small><strong>{agent ? `@${agent.displayName}` : "Waiting"}</strong></span>
        <span><small>Bot expertise</small><strong>{run ? run.agentExpertise.toLocaleLowerCase() : "—"}</strong></span>
        <span><small>Website access</small><strong>{accessLabel ?? "Not selected"}</strong></span>
        <span><small>Runtime</small><strong>{MANAGED_AGENT_MODEL} · {MANAGED_AGENT_RUNTIME === "OPENAI_LUNA_WEBMCP_RELAY" ? "Application-owned Luna ↔ WebMCP relay" : MANAGED_AGENT_RUNTIME}</strong></span>
      </div>

      {run && accessPolicy && accessLabel ? (
        <div className={styles.discoveredCatalog}>
          <div><span>Discovered website catalog</span><small>{accessPolicy.logicalToolNames.length} tools · {accessLabel} grant</small></div>
          <ul aria-label={`${accessLabel} website tool catalog`}>
            {accessPolicy.logicalToolNames.map((tool) => (
              <li key={tool} data-active={runtime?.activeLogicalTool === tool ? "true" : undefined}>{tool}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={styles.recorderEmpty}>
          <strong>Mention a bot, then choose its website access.</strong>
          <span>This panel will show the access-driven catalog WebMCP exposes, Luna&apos;s calls, verified evidence, and the resulting revision.</span>
        </div>
      )}

      {events.length ? (
        <ol className={styles.relayTrace} aria-label="Relay trace">
          {events.map((event) => (
            <li key={event.relayEventId} data-kind={event.kind}>
              <i aria-hidden="true" />
              <span><strong>{TRACE_COPY[event.kind]}</strong><small>{event.logicalToolName ?? event.kind.toLowerCase().replaceAll("_", " ")}</small></span>
              <time dateTime={event.createdAt}>{eventTime(event.createdAt)}</time>
            </li>
          ))}
        </ol>
      ) : null}

      {runtime?.phase !== "UNAVAILABLE" && runtime?.lastError ? <p className={styles.recorderError} role="status">{runtime.lastError}</p> : null}
      {canRetry && onRetry ? (
        <button className={styles.recorderRetry} type="button" onClick={() => onRetry(run.runId)}>Retry once</button>
      ) : null}

      <footer className={styles.flightRecorderFooter}>
        <span><i aria-hidden="true" />Synthetic sources are labeled</span>
        <span>Native invocation is verified separately · 15s recovery</span>
      </footer>
    </section>
  );
}
