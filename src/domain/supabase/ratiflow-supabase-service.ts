import type {
  HumanRatificationInput,
  MutationReceipt,
  MutationToolName,
  RatiflowServicePort,
  RealtimeRevisionNotice,
  SetLaunchCapacityInput,
  ToolResult,
  WebMCPMutationRequest,
  WorkspaceView,
} from "@/contracts";

export const RATIFLOW_SUPABASE_URL_ENV = "RATIFLOW_SUPABASE_URL";
export const RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV = "RATIFLOW_SUPABASE_PUBLISHABLE_KEY";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;

export type SupabaseRatiflowServiceOptions = {
  url: string;
  publishableKey: string;
  fetch?: FetchLike;
  noticePollIntervalMs?: number;
};

export type SupabaseDemoLaunch = {
  workspace: WorkspaceView;
  mayaSessionToken: string;
  jordanSessionToken: string;
  agentSessionToken: string;
  expiresAt: string;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is JsonObject {
  return isObject(value) && required.every((key) => key in value)
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isActor(value: unknown): boolean {
  return hasExactKeys(value, ["id", "name", "role"])
    && typeof value.id === "string" && typeof value.name === "string" && typeof value.role === "string";
}

function isSelection(value: unknown): boolean {
  return hasExactKeys(value, ["kind", "id"]) && ["DECISION", "OPTION", "FOLLOWUP"].includes(String(value.kind)) && typeof value.id === "string";
}

function isDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isMetrics(value: unknown): boolean {
  if (!hasExactKeys(value, [], ["engineerDays", "annualValueUsd", "date"])) return false;
  return (value.engineerDays === undefined || Number.isInteger(value.engineerDays) && Number(value.engineerDays) >= 0 && Number(value.engineerDays) <= 90)
    && (value.annualValueUsd === undefined || Number.isInteger(value.annualValueUsd) && Number(value.annualValueUsd) >= 0 && Number(value.annualValueUsd) <= 10_000_000)
    && (value.date === undefined || isDate(value.date));
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCapabilities(value: unknown): boolean {
  return hasExactKeys(value, ["state", "workspaceRevision", "contextEpoch", "selection", "availableTools", "unavailableActions"])
    && typeof value.state === "string" && Number.isInteger(value.workspaceRevision) && Number.isInteger(value.contextEpoch)
    && isSelection(value.selection) && Array.isArray(value.availableTools) && Array.isArray(value.unavailableActions);
}

function isWorkspaceView(value: unknown): value is WorkspaceView {
  if (!hasExactKeys(value, ["id", "name", "revision", "decision", "customer", "options", "evidence", "challenges", "preparedDecision", "followup", "provenance", "readiness"])
    || typeof value.id !== "string" || typeof value.name !== "string" || !Number.isInteger(value.revision)) return false;
  if (!hasExactKeys(value.decision, ["id", "question", "state", "selectedOptionId", "launchDate", "launchCapacityEngineerDays", "coreReliabilityEngineerDays"])
    || !hasExactKeys(value.customer, ["id", "name", "annualRenewalUsd", "usableExportDueDate"])
    || !hasExactKeys(value.followup, ["id", "slug", "status", "ownerId", "dueDate", "inheritedContext"])
    || !hasExactKeys(value.readiness, ["activeOptionCount", "hasCurrentCapacityEvidence", "hasNorthstarDeadlineEvidence", "selectedOptionId", "selectedOptionEngineerDays", "launchCapacityEngineerDays", "unresolvedBlockingChallengeCount"])
    || !Array.isArray(value.options) || !Array.isArray(value.evidence) || !Array.isArray(value.challenges) || !Array.isArray(value.provenance)) return false;
  if (typeof value.decision.id !== "string" || typeof value.decision.question !== "string" || !["OPTIONS", "CONTESTED", "READY", "REVIEW", "COMMITTED"].includes(String(value.decision.state)) || typeof value.decision.selectedOptionId !== "string" || !isDate(value.decision.launchDate) || !Number.isInteger(value.decision.launchCapacityEngineerDays) || !Number.isInteger(value.decision.coreReliabilityEngineerDays)
    || typeof value.customer.id !== "string" || typeof value.customer.name !== "string" || !Number.isInteger(value.customer.annualRenewalUsd) || !isDate(value.customer.usableExportDueDate)
    || typeof value.followup.id !== "string" || value.followup.slug !== "customer-launch-brief" || !["BLOCKED", "READY"].includes(String(value.followup.status)) || typeof value.followup.ownerId !== "string" || !isDate(value.followup.dueDate) || !isStringArray(value.followup.inheritedContext)
    || !Number.isInteger(value.readiness.activeOptionCount) || typeof value.readiness.hasCurrentCapacityEvidence !== "boolean" || typeof value.readiness.hasNorthstarDeadlineEvidence !== "boolean" || !(typeof value.readiness.selectedOptionId === "string" || value.readiness.selectedOptionId === null) || !(Number.isInteger(value.readiness.selectedOptionEngineerDays) || value.readiness.selectedOptionEngineerDays === null) || !Number.isInteger(value.readiness.launchCapacityEngineerDays) || !Number.isInteger(value.readiness.unresolvedBlockingChallengeCount)) return false;
  return value.options.every((option) => hasExactKeys(option, ["id", "title", "summary", "launchDate", "exportEngineerDays", "totalEngineerDays", "postLaunchEngineerDays"]) && typeof option.id === "string" && typeof option.title === "string" && typeof option.summary === "string" && isDate(option.launchDate) && Number.isInteger(option.exportEngineerDays) && Number.isInteger(option.totalEngineerDays) && Number.isInteger(option.postLaunchEngineerDays))
    && value.evidence.every((evidence) => hasExactKeys(evidence, ["id", "optionId", "kind", "stance", "title", "detail", "sourceLabel", "actor", "createdAt"], ["metrics"]) && typeof evidence.id === "string" && (typeof evidence.optionId === "string" || evidence.optionId === null) && ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"].includes(String(evidence.kind)) && ["SUPPORTS", "CHALLENGES", "CONTEXT"].includes(String(evidence.stance)) && typeof evidence.title === "string" && typeof evidence.detail === "string" && typeof evidence.sourceLabel === "string" && isActor(evidence.actor) && typeof evidence.createdAt === "string" && (!("metrics" in evidence) || isMetrics(evidence.metrics)))
    && value.challenges.every((challenge) => hasExactKeys(challenge, ["id", "optionId", "summary", "severity", "resolved"]) && typeof challenge.id === "string" && typeof challenge.optionId === "string" && typeof challenge.summary === "string" && ["BLOCKING", "ADVISORY"].includes(String(challenge.severity)) && typeof challenge.resolved === "boolean")
    && value.provenance.every((event) => hasExactKeys(event, ["id", "actor", "actorType", "origin", "baseRevision", "resultingRevision", "rationale", "reviewStatus", "changedEntities", "createdAt"], ["toolName"]) && typeof event.id === "string" && isActor(event.actor) && ["HUMAN", "AGENT", "SYSTEM"].includes(String(event.actorType)) && ["ORDINARY_UI", "WEBMCP", "SYNTHETIC_DEMO", "SYSTEM"].includes(String(event.origin)) && Number.isInteger(event.baseRevision) && Number.isInteger(event.resultingRevision) && typeof event.rationale === "string" && ["NOT_APPLICABLE", "PROPOSED", "EDITED", "RATIFIED", "REJECTED"].includes(String(event.reviewStatus)) && isStringArray(event.changedEntities) && typeof event.createdAt === "string" && (!("toolName" in event) || typeof event.toolName === "string"))
    && (value.preparedDecision === null || (hasExactKeys(value.preparedDecision, ["id", "optionId", "recommendation", "risks", "customerMessageDraft", "reviewStatus", "preparedBy"], ["ratifiedBy"]) && typeof value.preparedDecision.id === "string" && typeof value.preparedDecision.optionId === "string" && typeof value.preparedDecision.recommendation === "string" && isStringArray(value.preparedDecision.risks) && typeof value.preparedDecision.customerMessageDraft === "string" && ["NOT_APPLICABLE", "PROPOSED", "EDITED", "RATIFIED", "REJECTED"].includes(String(value.preparedDecision.reviewStatus)) && isActor(value.preparedDecision.preparedBy) && (!("ratifiedBy" in value.preparedDecision) || isActor(value.preparedDecision.ratifiedBy))));
}

/**
 * Defends the public service façade from malformed PostgREST data. The SQL boundary
 * returns the frozen wire shape, but database output is still treated as untrusted IO.
 */
export function normalizeWorkspaceView(value: unknown): WorkspaceView {
  if (!isWorkspaceView(value)) throw new Error("Supabase RPC returned an invalid WorkspaceView.");
  return value;
}

export function normalizeToolResult(value: unknown): ToolResult<MutationReceipt> {
  if (!isObject(value) || typeof value.ok !== "boolean" || !Number.isInteger(value.currentWorkspaceRevision)
    || !Number.isInteger(value.contextEpoch) || !isCapabilities(value.currentCapabilities)) {
    throw new Error("Supabase RPC returned an invalid ToolResult.");
  }
  if (value.ok) {
    if (!hasExactKeys(value, ["ok", "data", "currentWorkspaceRevision", "contextEpoch", "currentCapabilities"])
      || !hasExactKeys(value.data, ["eventId", "resultingRevision", "changedEntityIds", "workspace"]) || typeof value.data.eventId !== "string" || !Number.isInteger(value.data.resultingRevision)
      || !Array.isArray(value.data.changedEntityIds) || !isWorkspaceView(value.data.workspace)) {
      throw new Error("Supabase RPC returned an invalid mutation receipt.");
    }
  } else if (!hasExactKeys(value, ["ok", "code", "message", "retryable", "currentWorkspaceRevision", "contextEpoch", "currentCapabilities"], ["expectedWorkspaceRevision", "actualWorkspaceRevision", "expectedContextEpoch", "actualContextEpoch", "changes", "nextAction"])
    || typeof value.code !== "string" || typeof value.message !== "string" || typeof value.retryable !== "boolean") {
    throw new Error("Supabase RPC returned an invalid error result.");
  }
  return value as unknown as ToolResult<MutationReceipt>;
}

export class SupabaseRatiflowService implements RatiflowServicePort {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly request: FetchLike;
  private readonly noticePollIntervalMs: number;

  constructor({ url, publishableKey, fetch: fetchOverride, noticePollIntervalMs = 2_000 }: SupabaseRatiflowServiceOptions) {
    if (!/^https:\/\//.test(url) || !publishableKey) throw new Error("A HTTPS Supabase URL and publishable key are required.");
    this.endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc`;
    this.publishableKey = publishableKey;
    this.request = fetchOverride ?? fetch;
    this.noticePollIntervalMs = Math.max(250, noticePollIntervalMs);
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): SupabaseRatiflowService | undefined {
    const url = environment[RATIFLOW_SUPABASE_URL_ENV];
    const publishableKey = environment[RATIFLOW_SUPABASE_PUBLISHABLE_KEY_ENV];
    return url && publishableKey ? new SupabaseRatiflowService({ url, publishableKey }) : undefined;
  }

  async launchDemo(signal?: AbortSignal): Promise<SupabaseDemoLaunch> {
    const value = await this.rpc("ratiflow_launch_demo", { p_ttl_seconds: 28_800 }, signal);
    if (!isObject(value) || !isWorkspaceView(value.workspace) || typeof value.mayaSessionToken !== "string"
      || typeof value.jordanSessionToken !== "string" || typeof value.agentSessionToken !== "string" || typeof value.expiresAt !== "string") {
      throw new Error("Supabase RPC returned an invalid demo launch.");
    }
    return value as SupabaseDemoLaunch;
  }

  async inspect(sessionToken: string, signal?: AbortSignal): Promise<WorkspaceView> {
    const value = await this.rpc("ratiflow_inspect", { p_handle: sessionToken }, signal);
    if (!isObject(value) || value.ok !== true) throw new Error("Unauthorized session");
    return normalizeWorkspaceView(value.workspace);
  }

  async mutateFromWebMCP<TTool extends MutationToolName>(request: WebMCPMutationRequest<TTool>): Promise<ToolResult<MutationReceipt>> {
    return normalizeToolResult(await this.rpc("ratiflow_mutate_webmcp", {
      p_handle: request.sessionToken,
      p_tool_name: request.toolName,
      p_envelope: request.envelope,
      p_captured_selection: request.capturedSelection,
      p_captured_context_epoch: request.capturedContextEpoch,
    }, request.signal));
  }

  async setLaunchCapacityFromCollaboratorUi(sessionToken: string, input: SetLaunchCapacityInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return normalizeToolResult(await this.rpc("ratiflow_set_launch_capacity", { p_handle: sessionToken, p_input: input }, signal));
  }

  async ratifyFromHumanUi(sessionToken: string, input: HumanRatificationInput, signal?: AbortSignal): Promise<ToolResult<MutationReceipt>> {
    return normalizeToolResult(await this.rpc("ratiflow_ratify_human", { p_handle: sessionToken, p_input: input }, signal));
  }

  /**
   * A polling implementation intentionally reads only the authorized notice RPC.
   * It never treats the notice as state: UI code must refetch before recompiling.
   */
  subscribe(sessionToken: string, onRevision: (notice: RealtimeRevisionNotice) => void): () => void {
    let active = true;
    let lastRevision = -1;
    const poll = async () => {
      while (active) {
        try {
          const value = await this.rpc("ratiflow_workspace_notice", { p_handle: sessionToken });
          const notice = Array.isArray(value) ? value[0] : value;
          const revision = isObject(notice) && Number.isInteger(notice.workspace_revision)
            ? Number(notice.workspace_revision) : undefined;
          if (revision !== undefined && isObject(notice) && typeof notice.event_id === "string"
            && revision > lastRevision) {
            lastRevision = revision;
            onRevision({ workspaceRevision: revision, eventId: notice.event_id });
          }
        } catch {
          // An expired/revoked handle stops producing usable notices; the normal
          // workspace fetch is responsible for surfacing authorization failure.
        }
        await new Promise<void>((resolve) => setTimeout(resolve, this.noticePollIntervalMs));
      }
    };
    void poll();
    return () => { active = false; };
  }

  private async rpc(name: string, body: JsonObject, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(`${this.endpoint}/${name}`, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${this.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status}).`);
    return value;
  }
}
