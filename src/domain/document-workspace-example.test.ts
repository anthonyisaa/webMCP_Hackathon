import { describe, expect, it } from "vitest";

import { LocalDocumentWorkspaceService } from "./document-workspace-service";
import {
  createCompletedDocumentWorkspaceExample,
  DOCUMENT_WORKSPACE_EXAMPLE_RATIONALE,
  DOCUMENT_WORKSPACE_EXAMPLE_REPLACEMENT,
} from "./document-workspace-example";

describe("completed document workspace example", () => {
  it("creates a fresh viewer whose paired agent can recover the rejected plan", async () => {
    const service = new LocalDocumentWorkspaceService();
    const example = await createCompletedDocumentWorkspaceExample(
      service,
      { displayName: "Demo viewer" },
    );

    expect(example.ok).toBe(true);
    if (!example.ok) return;
    expect(example.data.surface.document).toMatchObject({
      revision: 2,
      activityVersion: 4,
    });
    expect(example.data.surface.document.body).toContain(
      DOCUMENT_WORKSPACE_EXAMPLE_REPLACEMENT,
    );
    expect(example.data.surface.workOrders).toHaveLength(1);
    expect(example.data.surface.workOrders[0]).toMatchObject({
      status: "COMPLETED",
      decision: {
        kind: "ACCEPTED",
        rationale: DOCUMENT_WORKSPACE_EXAMPLE_RATIONALE,
      },
    });

    const memory = await service.readMemory(example.data.agentSessionToken, { limit: 20 });
    expect(memory.ok).toBe(true);
    if (!memory.ok) return;
    expect(memory.data.events.map((event) => event.kind)).toEqual([
      "DOCUMENT_EDITED",
      "WORK_CREATED",
      "PROPOSAL_SUBMITTED",
      "PROPOSAL_ACCEPTED",
    ]);
    expect(memory.data.events.at(-1)?.rationale).toBe(
      DOCUMENT_WORKSPACE_EXAMPLE_RATIONALE,
    );
  });
});
