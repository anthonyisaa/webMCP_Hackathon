import type {
  AnswerHumanInputInput,
  CancelAgentTaskInput,
  CreateAgentTaskInput,
  PageSelection,
  UpdateStandingInstructionsInput,
} from "@/contracts";
import { jsonObject, sessionTokenFrom } from "@/domain/http-session";
import { getRuntimeRatiflowService } from "@/domain/ratiflow-runtime";

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isSelection(value: unknown): value is PageSelection {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && exactKeys(value as Record<string, unknown>, ["kind", "id"])
    && ["DECISION", "OPTION", "FOLLOWUP"].includes(String((value as Record<string, unknown>).kind))
    && typeof (value as Record<string, unknown>).id === "string";
}

function malformed(message: string, status = 400): Response {
  return Response.json({ ok: false, code: status === 401 ? "UNAUTHORIZED" : "INVALID_INPUT", message }, { status });
}

async function authorizedBody(request: Request): Promise<{ token: string; body: Record<string, unknown> } | Response> {
  const token = sessionTokenFrom(request);
  if (!token) return malformed("A human membership is required.", 401);
  const body = await jsonObject(request);
  if (!body) return malformed("A JSON object body is required.");
  return { token, body };
}

export async function handleCreateTask(request: Request): Promise<Response> {
  const parsed = await authorizedBody(request);
  if (parsed instanceof Response) return parsed;
  const { token, body } = parsed;
  if (!exactKeys(body, ["kind", "body", "target", "requestId"]) || (body.kind !== "MENTION" && body.kind !== "TASK")
    || typeof body.body !== "string" || !isSelection(body.target) || typeof body.requestId !== "string") return malformed("Malformed task request.");
  return Response.json(await getRuntimeRatiflowService().createAgentTaskFromHumanUi(token, body as unknown as CreateAgentTaskInput, request.signal));
}

export async function handleCancelTask(request: Request): Promise<Response> {
  const parsed = await authorizedBody(request);
  if (parsed instanceof Response) return parsed;
  const { token, body } = parsed;
  if (!exactKeys(body, ["taskId", "requestId"]) || typeof body.taskId !== "string" || typeof body.requestId !== "string") return malformed("Malformed task cancellation request.");
  return Response.json(await getRuntimeRatiflowService().cancelAgentTaskFromHumanUi(token, body as unknown as CancelAgentTaskInput, request.signal));
}

export async function handleAnswerQuestion(request: Request): Promise<Response> {
  const parsed = await authorizedBody(request);
  if (parsed instanceof Response) return parsed;
  const { token, body } = parsed;
  if (!exactKeys(body, ["questionId", "answer", "requestId"]) || typeof body.questionId !== "string" || typeof body.answer !== "string" || typeof body.requestId !== "string") return malformed("Malformed answer request.");
  return Response.json(await getRuntimeRatiflowService().answerHumanInputFromHumanUi(token, body as unknown as AnswerHumanInputInput, request.signal));
}

export async function handleStandingInstructions(request: Request): Promise<Response> {
  const parsed = await authorizedBody(request);
  if (parsed instanceof Response) return parsed;
  const { token, body } = parsed;
  if (!exactKeys(body, ["autoPickup", "scopes", "maxActionsPerHour", "requestId"]) || typeof body.autoPickup !== "boolean"
    || !Array.isArray(body.scopes) || !body.scopes.every((scope) => typeof scope === "string") || !Number.isInteger(body.maxActionsPerHour)
    || typeof body.requestId !== "string") return malformed("Malformed standing-instructions request.");
  return Response.json(await getRuntimeRatiflowService().updateStandingInstructionsFromHumanUi(token, body as unknown as UpdateStandingInstructionsInput, request.signal));
}
