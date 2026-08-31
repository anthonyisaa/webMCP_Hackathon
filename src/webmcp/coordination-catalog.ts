import {
  AGENT_COORDINATION_TOOL_NAMES,
  type AgentCoordinationToolName,
  type AgentToolDefinition,
  type JsonObjectSchema,
} from "../contracts/index";

const emptyInput = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies JsonObjectSchema;

const entityId = {
  type: "string",
  minLength: 1,
  maxLength: 80,
} as const;

const uuid = {
  type: "string",
  format: "uuid",
  maxLength: 36,
} as const;

const boundedText = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: ".*\\S.*",
});

const target = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["DECISION", "OPTION", "FOLLOWUP"] },
    id: entityId,
  },
  required: ["kind", "id"],
  additionalProperties: false,
} as const;

function objectSchema(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = [],
): JsonObjectSchema {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

const CATALOG_BY_NAME: Record<AgentCoordinationToolName, AgentToolDefinition> = {
  join_session: {
    name: "join_session",
    description:
      "Join this decision room as the fixed Ratiflow agent. This creates a visible renewable live lease; it does not authorize ratification.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  wait_for_activity: {
    name: "wait_for_activity",
    description:
      "Wait for relevant teammate, inbox, question, or decision activity after an opaque activity cursor. Timeout returns successfully with no events.",
    inputSchema: objectSchema(
      {
        cursor: uuid,
        // Integer values are accepted here and clamped by the handler to 1..30.
        timeoutSeconds: { type: "integer" },
      },
      ["cursor"],
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  catch_up: {
    name: "catch_up",
    description:
      "Read relevant collaboration activity, inbox work, and human-input questions since an optional opaque activity cursor.",
    inputSchema: objectSchema({ sinceCursor: uuid }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  leave_session: {
    name: "leave_session",
    description:
      "Leave the visible live agent session and revoke this page session. This does not delete collaboration history.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  get_state_brief: {
    name: "get_state_brief",
    description:
      "Read a compact current decision brief, participant state, open questions, selected target, revision, and activity cursor.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  get_thread: {
    name: "get_thread",
    description:
      "Read attributed comments and human-input questions for an explicit target, or for the target currently selected on the page.",
    inputSchema: objectSchema({ target }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  get_inbox: {
    name: "get_inbox",
    description:
      "Read the bounded inbox of mentions and tasks assigned to the fixed Ratiflow agent, including current claim state.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  claim_agent_task: {
    name: "claim_agent_task",
    description:
      "Atomically claim one open agent task before doing addressed work. The private claim generation is retained by the page adapter, not returned as model input.",
    inputSchema: objectSchema({ taskId: entityId, requestId: uuid }, [
      "taskId",
      "requestId",
    ]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  resolve_task: {
    name: "resolve_task",
    description:
      "Resolve a task currently claimed by this page session with a bounded outcome and optional same-origin result path.",
    inputSchema: objectSchema(
      {
        taskId: entityId,
        requestId: uuid,
        outcome: boundedText(600),
        resultLink: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          pattern: "^/(?!/)",
        },
      },
      ["taskId", "requestId", "outcome"],
    ),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  post_comment: {
    name: "post_comment",
    description:
      "Post an attributed agent comment to a decision target. A task-linked comment requires the private current claim generation.",
    inputSchema: objectSchema(
      {
        target,
        body: boundedText(1_200),
        replyTo: entityId,
        taskId: entityId,
        requestId: uuid,
      },
      ["target", "body", "requestId"],
    ),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  request_human_input: {
    name: "request_human_input",
    description:
      "Persist an attributed question for a person to answer in the ordinary UI. A task-linked question pauses and releases that task claim.",
    inputSchema: objectSchema(
      {
        question: boundedText(600),
        target,
        taskId: entityId,
        requestId: uuid,
      },
      ["question", "target", "requestId"],
    ),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export const AGENT_COORDINATION_TOOL_CATALOG: readonly AgentToolDefinition[] =
  deepFreeze(
    AGENT_COORDINATION_TOOL_NAMES.map((name) => CATALOG_BY_NAME[name]),
  );

export function getAgentCoordinationToolDefinition(
  name: AgentCoordinationToolName,
): AgentToolDefinition {
  return CATALOG_BY_NAME[name];
}
