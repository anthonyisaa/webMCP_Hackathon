import type {
  AgentCaller,
  AgentRegistryExecutionContext,
  CatchUpInput,
  ClaimAgentTaskInput,
  GetThreadInput,
  MutationToolName,
  PageSelection,
  PostAgentCommentInput,
  RequestHumanInputInput,
  ResolveAgentTaskInput,
  WebMCPMutationHttpBody,
} from "@/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";

export const AGENT_ACTIONS = ["join", "catch-up", "leave", "state", "thread", "inbox", "claim", "resolve", "comment", "question", "authorize"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

const MUTATION_NAMES = new Set<MutationToolName>(["recommend_option", "add_evidence", "challenge_option", "prepare_decision"]);

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelection(value: unknown): value is PageSelection {
  if (!isObject(value) || !exactKeys(value, ["kind", "id"]) || typeof value.id !== "string") return false;
  return value.kind === "DECISION" || value.kind === "OPTION" || value.kind === "FOLLOWUP";
}

function selectionFrom(request: Request): PageSelection | null {
  const kind = request.headers.get("x-ratiflow-selection-kind");
  const id = request.headers.get("x-ratiflow-selection-id");
  const selection = { kind, id };
  return isSelection(selection) ? selection : null;
}

function contextFrom(request: Request, caller: AgentCaller): AgentRegistryExecutionContext | null {
  const agentSessionToken = sessionTokenFrom(request);
  const pageSessionId = request.headers.get("x-ratiflow-page-session");
  const claimId = request.headers.get("x-ratiflow-claim") ?? undefined;
  if (!agentSessionToken || !pageSessionId) return null;
  return { caller, pageSessionId, agentSessionToken, ...(claimId ? { claimId } : {}), signal: request.signal };
}

function malformed(message: string, status = 400): Response {
  return Response.json({ ok: false, code: status === 401 ? "UNAUTHORIZED" : "INVALID_INPUT", message }, { status });
}

export async function handleAgentMutation(request: Request, caller: AgentCaller): Promise<Response> {
  const context = contextFrom(request, caller);
  if (!context) return malformed("Agent membership and page-session headers are required.", 401);
  const body = await jsonObject(request);
  if (!body || !exactKeys(body, ["toolName", "envelope", "capturedSelection", "capturedContextEpoch"])
    || typeof body.toolName !== "string" || !MUTATION_NAMES.has(body.toolName as MutationToolName)
    || !isObject(body.envelope) || !isSelection(body.capturedSelection) || !Number.isInteger(body.capturedContextEpoch)) {
    return malformed("Malformed agent decision mutation request.");
  }
  const typedBody = body as unknown as WebMCPMutationHttpBody;
  return Response.json(await getRuntimeRatiflowService().mutateFromWebMCP({ ...typedBody, executionContext: context }));
}

export async function handleAgentAction(request: Request, caller: AgentCaller, action: string): Promise<Response> {
  if (!(AGENT_ACTIONS as readonly string[]).includes(action)) return malformed("Unknown agent action.", 404);
  const context = contextFrom(request, caller);
  if (!context) return malformed("Agent membership and page-session headers are required.", 401);
  const body = await jsonObject(request);
  if (!body) return malformed("A JSON object body is required.");
  const service = getRuntimeRatiflowService();

  switch (action as AgentAction) {
    case "join": {
      const selection = selectionFrom(request);
      if (!exactKeys(body, []) || !selection || caller !== "BROWSER_AGENT") return malformed("Malformed join request.");
      return Response.json(await service.joinAgentSession(context, selection));
    }
    case "catch-up": {
      if (!exactKeys(body, [], ["sinceCursor"]) || (body.sinceCursor !== undefined && typeof body.sinceCursor !== "string")) return malformed("Malformed catch-up request.");
      return Response.json(await service.catchUpAgentSession(context, body as CatchUpInput));
    }
    case "leave":
      if (!exactKeys(body, []) || caller !== "BROWSER_AGENT") return malformed("Malformed leave request.");
      return Response.json(await service.leaveAgentSession(context));
    case "state": {
      const selection = selectionFrom(request);
      if (!exactKeys(body, []) || !selection) return malformed("Malformed state-brief request.");
      return Response.json(await service.getAgentStateBrief(context, selection));
    }
    case "thread": {
      const selection = selectionFrom(request);
      if (!exactKeys(body, [], ["target"]) || (body.target !== undefined && !isSelection(body.target)) || !selection) return malformed("Malformed thread request.");
      return Response.json(await service.getAgentThread(context, body as GetThreadInput, selection));
    }
    case "inbox":
      if (!exactKeys(body, [])) return malformed("Malformed inbox request.");
      return Response.json(await service.getAgentInbox(context));
    case "claim":
      if (!exactKeys(body, ["taskId", "requestId"]) || typeof body.taskId !== "string" || typeof body.requestId !== "string") return malformed("Malformed claim request.");
      return Response.json(await service.claimAgentTask(context, body as unknown as ClaimAgentTaskInput));
    case "resolve":
      if (!exactKeys(body, ["taskId", "requestId", "outcome"], ["resultLink"]) || typeof body.taskId !== "string" || typeof body.requestId !== "string" || typeof body.outcome !== "string" || (body.resultLink !== undefined && typeof body.resultLink !== "string")) return malformed("Malformed task resolution request.");
      return Response.json(await service.resolveAgentTask(context, body as unknown as ResolveAgentTaskInput));
    case "comment":
      if (!exactKeys(body, ["target", "body", "requestId"], ["replyTo", "taskId"]) || !isSelection(body.target) || typeof body.body !== "string" || typeof body.requestId !== "string" || (body.replyTo !== undefined && typeof body.replyTo !== "string") || (body.taskId !== undefined && typeof body.taskId !== "string")) return malformed("Malformed comment request.");
      return Response.json(await service.postAgentComment(context, body as unknown as PostAgentCommentInput));
    case "question":
      if (!exactKeys(body, ["question", "target", "requestId"], ["taskId"]) || typeof body.question !== "string" || !isSelection(body.target) || typeof body.requestId !== "string" || (body.taskId !== undefined && typeof body.taskId !== "string")) return malformed("Malformed question request.");
      return Response.json(await service.requestHumanInput(context, body as unknown as RequestHumanInputInput));
    case "authorize":
      if (caller !== "AUTO_RUNNER" || !exactKeys(body, ["taskId"]) || typeof body.taskId !== "string") return malformed("Malformed auto-runner authorization request.");
      return Response.json(await service.authorizeAutoRunner(context, body.taskId));
  }
}
