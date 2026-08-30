import { TOOL_NAMES, type ToolName } from "../contracts/index";
import type { WebMCPToolLike } from "./types";

export type WebMCPToolCatalogEntry = Omit<WebMCPToolLike, "execute"> & { name: ToolName };

const emptyInput = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const entityId = {
  type: "string",
  minLength: 1,
  maxLength: 80,
} as const;

const boundedText = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
  pattern: ".*\\S.*",
});

const mutationEnvelope = (payload: Record<string, unknown>) => ({
  type: "object",
  properties: {
    expectedWorkspaceRevision: { type: "integer", minimum: 0 },
    contextEpoch: { type: "integer", minimum: 0 },
    requestId: { type: "string", format: "uuid", maxLength: 36 },
    rationale: boundedText(600),
    payload,
  },
  required: [
    "expectedWorkspaceRevision",
    "contextEpoch",
    "requestId",
    "rationale",
    "payload",
  ],
  additionalProperties: false,
});

const evidenceKind = ["CUSTOMER_DEADLINE", "ENGINEERING_ESTIMATE", "DELIVERY_RISK"];
const evidenceStance = ["SUPPORTS", "CHALLENGES", "CONTEXT"];

const CATALOG_BY_NAME: Record<ToolName, WebMCPToolCatalogEntry> = {
  inspect_decision: {
    name: "inspect_decision",
    title: "Inspect decision",
    description:
      "Read the authoritative decision workspace, current revision, options, evidence, challenges, review state, follow-up, and provenance.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  inspect_selected_option: {
    name: "inspect_selected_option",
    title: "Inspect selected option",
    description:
      "Read the option currently selected on the page together with its evidence and challenges. Refresh tools after the page selection changes.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  recommend_option: {
    name: "recommend_option",
    title: "Recommend option",
    description:
      "Change the decision recommendation to an explicit option using the current workspace revision and page context. This does not ratify the decision.",
    inputSchema: mutationEnvelope({
      type: "object",
      properties: { optionId: entityId },
      required: ["optionId"],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  challenge_option: {
    name: "challenge_option",
    title: "Challenge selected option",
    description:
      "Add a blocking or advisory challenge to the option currently selected on the page. Refresh tools after the selection changes.",
    inputSchema: mutationEnvelope({
      type: "object",
      properties: {
        summary: boundedText(600),
        severity: { type: "string", enum: ["BLOCKING", "ADVISORY"] },
        requiredEvidenceKind: { type: "string", enum: evidenceKind },
      },
      required: ["summary", "severity"],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  add_evidence: {
    name: "add_evidence",
    title: "Add evidence",
    description:
      "Add bounded decision evidence against the current workspace revision. This tool remains available during stale-work recovery.",
    inputSchema: mutationEnvelope({
      type: "object",
      properties: {
        optionId: entityId,
        kind: { type: "string", enum: evidenceKind },
        stance: { type: "string", enum: evidenceStance },
        title: boundedText(120),
        detail: boundedText(1200),
        sourceLabel: boundedText(120),
        metrics: {
          type: "object",
          properties: {
            engineerDays: { type: "integer", minimum: 0, maximum: 90 },
            annualValueUsd: { type: "integer", minimum: 0, maximum: 10_000_000 },
            date: {
              type: "string",
              format: "date",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["optionId", "kind", "stance", "title", "detail", "sourceLabel"],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  compare_options: {
    name: "compare_options",
    title: "Compare options",
    description:
      "Compare two or three explicit options, or all active options when optionIds is omitted, against capacity and the customer deadline.",
    inputSchema: {
      type: "object",
      properties: {
        optionIds: {
          type: "array",
          items: entityId,
          minItems: 2,
          maxItems: 3,
          uniqueItems: true,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  prepare_decision: {
    name: "prepare_decision",
    title: "Prepare decision for human review",
    description:
      "Create an editable review card for the selected recommendation. A person must ratify it in the ordinary UI; this tool cannot commit a decision.",
    inputSchema: mutationEnvelope({
      type: "object",
      properties: {
        optionId: entityId,
        recommendation: boundedText(600),
        risks: {
          type: "array",
          items: boundedText(240),
          minItems: 0,
          maxItems: 5,
        },
        customerMessageDraft: boundedText(800),
      },
      required: ["optionId", "recommendation", "risks", "customerMessageDraft"],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  trace_decision: {
    name: "trace_decision",
    title: "Trace decision",
    description:
      "Read the decision provenance and prepared or ratified review card, including attributed actors, origins, revisions, and changed entities.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  inspect_followup: {
    name: "inspect_followup",
    title: "Inspect selected follow-up",
    description:
      "Read the committed customer launch brief currently selected on the page, including status, owner, due date, and inherited context.",
    inputSchema: emptyInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  why_not: {
    name: "why_not",
    title: "Explain unavailable action",
    description:
      "Explain the exact failed predicates for preparing or ratifying this decision. Ratification is never available through WebMCP.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["prepare_decision", "ratify_decision"],
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
};

export const WEBMCP_TOOL_CATALOG: readonly WebMCPToolCatalogEntry[] = TOOL_NAMES.map(
  (name) => CATALOG_BY_NAME[name],
);

export function getWebMCPToolDefinition(name: ToolName): WebMCPToolCatalogEntry {
  return CATALOG_BY_NAME[name];
}
