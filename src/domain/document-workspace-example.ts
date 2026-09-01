import { randomUUID } from "node:crypto";

import type {
  DocumentSessionBundleV3,
  DocumentV3Result,
  DocumentV3ServicePort,
  LaunchDocumentV3Input,
} from "../document/contracts";

export const DOCUMENT_WORKSPACE_EXAMPLE_TITLE = "Northstar CSV launch memo";
export const DOCUMENT_WORKSPACE_EXAMPLE_BODY = `Recommendation

Launch CSV export as generally available on October 15.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?`;
export const DOCUMENT_WORKSPACE_EXAMPLE_SELECTION =
  "Launch CSV export as generally available on October 15.";
export const DOCUMENT_WORKSPACE_EXAMPLE_INSTRUCTION =
  "Rewrite this recommendation to fit the 14-day capacity and protect the Northstar renewal. Keep both launch dates explicit.";
export const DOCUMENT_WORKSPACE_EXAMPLE_REPLACEMENT =
  "Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.";
export const DOCUMENT_WORKSPACE_EXAMPLE_SUMMARY =
  "Replace October 15 GA with a single-tenant beta, then move general availability to November 1.";
export const DOCUMENT_WORKSPACE_EXAMPLE_RATIONALE =
  "Accepted because the beta uses the four export days left after reliability and still meets Northstar's November 1 deadline. Full GA on October 15 was rejected because it requires eight export days.";

function codePointOffset(value: string, codeUnitOffset: number): number {
  return Array.from(value.slice(0, codeUnitOffset)).length;
}

/** Creates a fresh, completed example through the same public collaboration APIs as the UI. */
export async function createCompletedDocumentWorkspaceExample(
  service: DocumentV3ServicePort,
  viewer: LaunchDocumentV3Input = {},
  signal?: AbortSignal,
): Promise<DocumentV3Result<DocumentSessionBundleV3>> {
  const jordan = await service.launchV3({ displayName: "Jordan Lee" }, signal);
  if (!jordan.ok) return jordan;

  const seeded = await service.saveHuman(jordan.data.humanSessionToken, {
    expectedRevision: 0,
    requestId: randomUUID(),
    title: DOCUMENT_WORKSPACE_EXAMPLE_TITLE,
    body: DOCUMENT_WORKSPACE_EXAMPLE_BODY,
  }, signal);
  if (!seeded.ok) return seeded;

  const maya = await service.joinV3({
    shareToken: jordan.data.shareToken,
    displayName: "Maya Chen",
  }, signal);
  if (!maya.ok) return maya;

  const selectionStart = DOCUMENT_WORKSPACE_EXAMPLE_BODY.indexOf(
    DOCUMENT_WORKSPACE_EXAMPLE_SELECTION,
  );
  if (selectionStart < 0) {
    throw new Error("The completed example selection is absent from its source document.");
  }
  const rangeStart = codePointOffset(DOCUMENT_WORKSPACE_EXAMPLE_BODY, selectionStart);
  const rangeEnd = rangeStart + Array.from(DOCUMENT_WORKSPACE_EXAMPLE_SELECTION).length;
  const assigned = await service.createWorkOrder(jordan.data.humanSessionToken, {
    expectedRevision: 1,
    requestId: randomUUID(),
    source: "CONTEXT_MENU",
    intent: "REWRITE",
    instruction: DOCUMENT_WORKSPACE_EXAMPLE_INSTRUCTION,
    assignedToMemberId: maya.data.selfMemberId,
    targetField: "BODY",
    rangeStart,
    rangeEnd,
  }, signal);
  if (!assigned.ok) return assigned;
  const workOrder = assigned.data.workOrders.find(
    (candidate) =>
      candidate.status === "PENDING" &&
      candidate.assignedToMemberId === maya.data.selfMemberId,
  );
  if (!workOrder) {
    throw new Error("The completed example work order was not created.");
  }

  const proposed = await service.submitWorkProposal(maya.data.agentSessionToken, {
    workOrderId: workOrder.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    replacementText: DOCUMENT_WORKSPACE_EXAMPLE_REPLACEMENT,
    changeSummary: DOCUMENT_WORKSPACE_EXAMPLE_SUMMARY,
  }, randomUUID(), signal);
  if (!proposed.ok) return proposed;

  const accepted = await service.acceptWorkProposal(jordan.data.humanSessionToken, {
    workOrderId: workOrder.workOrderId,
    expectedRevision: 1,
    requestId: randomUUID(),
    rationale: DOCUMENT_WORKSPACE_EXAMPLE_RATIONALE,
  }, signal);
  if (!accepted.ok) return accepted;

  return service.joinV3({
    shareToken: jordan.data.shareToken,
    ...(viewer.displayName ? { displayName: viewer.displayName } : {}),
  }, signal);
}
