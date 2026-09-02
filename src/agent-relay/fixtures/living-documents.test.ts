import { describe, expect, it } from "vitest";

import managedRelayGolden from "../../../evals/goldens/repo-document-v4.2/managed-relay.json";
import { LocalRepositoryService } from "@/domain/repository-service";
import { MANAGED_RELAY_EXAMPLE_OVERLAYS } from "@/domain/repository-examples";
import type { IssueDocumentKind, RepositoryResult } from "@/repository/contracts";
import { splitLivingDocumentIntoSheets } from "./living-documents";

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

function occurrenceCount(value: string, target: string): number {
  return value.split(target).length - 1;
}

describe.each([
  ["POSTMORTEM", managedRelayGolden.postmortem] as const,
  ["PRODUCT_DOCUMENT", managedRelayGolden.productDocument] as const,
])("v4.2 living %s source", (kind, golden) => {
  it("creates a fresh two-sheet clone with prior collaboration and one pending managed action", async () => {
    const service = new LocalRepositoryService({ now: () => Date.parse("2026-09-02T12:00:00.000Z") });
    const bundle = success(await service.launchExample({
      kind: kind as IssueDocumentKind,
      displayName: "Demo Judge",
    }));
    const { surface } = bundle;
    const overlay = MANAGED_RELAY_EXAMPLE_OVERLAYS[kind];
    const sheets = splitLivingDocumentIntoSheets(kind, surface.document.body);

    expect(surface.document.title).toBe(golden.title);
    expect(surface.document.revision).toBe(overlay.seededHistory.headRevision);
    expect(sheets).toHaveLength(2);
    expect(`${sheets[0].markdown}\n${sheets[1].markdown}`).toBe(surface.document.body);
    expect(sheets.map(({ ariaLabel }) => ariaLabel)).toEqual(["Page 1 of 2", "Page 2 of 2"]);
    for (const heading of overlay.sheetHeadings[0]) {
      expect(sheets[0].markdown).toContain(heading);
      expect(sheets[1].markdown).not.toContain(heading);
    }
    for (const heading of overlay.sheetHeadings[1]) {
      expect(sheets[1].markdown).toContain(heading);
      expect(sheets[0].markdown).not.toContain(heading);
    }

    expect(overlay.guidedWork.prompt).toBe(golden.prompt);
    expect(overlay.guidedWork.sectionHeading).toBe(`## ${golden.guidedSection}`);
    expect(occurrenceCount(surface.document.body, overlay.guidedWork.selectionText)).toBe(1);
    expect(surface.tasks.some(({ instruction }) => instruction === overlay.guidedWork.prompt)).toBe(false);
    expect(overlay.seededHistory).toMatchObject({
      hasHumanRevision: true,
      hasAgentRevision: true,
      historicalAgentIdentitySource: "SELF_DECLARED",
      hasClosedHumanDiscussion: true,
      liveManagedActionPending: true,
    });
    expect(surface.history.some(({ provenance }) => provenance.author.actorType === "HUMAN")).toBe(true);
    expect(surface.history.some(({ provenance }) => provenance.author.actorType === "AGENT")).toBe(true);
    expect(surface.threads.some(({ status, taskId }) => status === "RESOLVED" && taskId === null)).toBe(true);
  });
});
it("fails closed rather than silently inventing a sheet boundary", () => {
  expect(() => splitLivingDocumentIntoSheets("POSTMORTEM", "## Summary\n\nNo second sheet."))
    .toThrow("Living document must contain exactly one ## Detection and response sheet break.");
});
