import { describe, expect, it } from "vitest";

import {
  SupabaseDocumentService,
  normalizeApplyAgentAnnotationResult,
  normalizeDocumentAnnotationListResult,
  normalizeDocumentSessionResult,
  normalizeDocumentSurfaceResult,
} from "./document-supabase-service";

const pendingAnnotation = {
  annotationId: "9e14352c-76f8-430f-98ae-25703f45ac7e",
  kind: "HUMAN_REQUEST",
  presetId: "continue_thought",
  label: "Continue the thought",
  instruction:
    "Continue naturally from the target, matching the document voice and adding no unsupported factual claims.",
  stageAtCreation: "BRAINSTORMING",
  source: "ANNOTATION_RAIL",
  targetField: "BODY",
  targetKind: "CARET",
  rangeStart: 0,
  rangeEnd: 0,
  selectedText: "",
  createdRevision: 0,
  anchorRevision: 0,
  status: "PENDING",
  createdBy: {
    memberId: "e338b198-32c1-4d81-9b26-a075ac48af50",
    displayName: "Guest 1",
  },
  createdAt: "2026-08-31T02:21:22.000Z",
  transition: null,
};

const completedAnnotation = {
  ...pendingAnnotation,
  status: "COMPLETED",
  resolvedAt: "2026-08-31T02:22:22.000Z",
  resolvedRevision: 1,
};

const surface = {
  document: {
    id: "2cb92206-86a1-4dba-af17-b3914d886025",
    title: "",
    body: "",
    stage: "BRAINSTORMING",
    revision: 0,
    updatedAt: "2026-08-31T02:21:22.000Z",
    lastEditor: null,
  },
  presence: [{
    memberId: "e338b198-32c1-4d81-9b26-a075ac48af50",
    displayName: "Guest 1",
    color: "#007AFF",
    state: "VIEWING",
    field: null,
    isTyping: false,
    selectionStart: null,
    selectionEnd: null,
    observedRevision: 0,
    lastSeenAt: "2026-08-31T02:21:22.000Z",
  }],
  annotations: [pendingAnnotation],
  undoAgentEdit: null,
};

const bundle = {
  shareToken: "a".repeat(64),
  humanSessionToken: "b".repeat(64),
  agentSessionToken: "c".repeat(64),
  sessionInstanceId: "0988379b-da81-40a9-adab-0409dba089c4",
  selfMemberId: "e338b198-32c1-4d81-9b26-a075ac48af50",
  expiresAt: "2026-09-01T02:21:22.000Z",
  surface,
};

const outcome = {
  surface: {
    ...surface,
    annotations: [completedAnnotation],
  },
  annotation: completedAnnotation,
  change: {
    summary: "No content change was required.",
    fromRevision: 0,
    toRevision: 0,
    annotationId: pendingAnnotation.annotationId,
  },
  undoAvailable: false,
};

describe("SupabaseDocumentService normalization", () => {
  it("accepts exact v1.2 session/surface envelopes and rejects shape drift", () => {
    const launched = normalizeDocumentSessionResult({ ok: true, data: bundle });
    expect(launched).toMatchObject({ ok: true, data: { shareToken: "a".repeat(64) } });
    expect(() => normalizeDocumentSessionResult({
      ok: true,
      data: { ...bundle, serviceRoleKey: "must-not-pass" },
    })).toThrow("invalid document result");
    expect(() => normalizeDocumentSurfaceResult({
      ok: true,
      data: { ...surface, pendingAction: null },
    })).toThrow("invalid document result");
    expect(normalizeDocumentSurfaceResult({
      ok: true,
      data: { ...surface, document: { ...surface.document, body: "😀".repeat(50_000) } },
    })).toMatchObject({ ok: true });
  });

  it("enforces annotation unions, resolution metadata, and owner-list status", () => {
    expect(normalizeDocumentAnnotationListResult({
      ok: true,
      data: [pendingAnnotation],
    })).toMatchObject({ ok: true, data: [{ status: "PENDING" }] });
    expect(() => normalizeDocumentAnnotationListResult({
      ok: true,
      data: [completedAnnotation],
    })).toThrow("invalid document result");
    expect(() => normalizeDocumentSurfaceResult({
      ok: true,
      data: {
        ...surface,
        annotations: [{ ...pendingAnnotation, resolvedRevision: 0 }],
      },
    })).toThrow("invalid document result");
    expect(() => normalizeDocumentSurfaceResult({
      ok: true,
      data: {
        ...surface,
        annotations: [{
          ...pendingAnnotation,
          kind: "STAGE_PREPARATION",
          presetId: "prepare_for_refine",
          source: "STAGE_TRANSITION",
          transition: { fromStage: "BRAINSTORMING", toStage: "RESEARCHING" },
        }],
      },
    })).toThrow("invalid document result");
  });

  it("accepts changed and no-op apply outcomes but rejects inconsistent IDs", () => {
    expect(normalizeApplyAgentAnnotationResult({ ok: true, data: outcome })).toMatchObject({
      ok: true,
      data: { undoAvailable: false, change: { fromRevision: 0, toRevision: 0 } },
    });
    expect(() => normalizeApplyAgentAnnotationResult({
      ok: true,
      data: {
        ...outcome,
        change: { ...outcome.change, annotationId: "0126f977-153e-4736-a51d-3f84aaa12802" },
      },
    })).toThrow("invalid document result");
  });

  it("accepts the exact stale envelope and rejects incomplete failures", () => {
    const stale = {
      ok: false,
      code: "STALE_WORK_STATE",
      message: "The note advanced from revision 0 to 1.",
      retryable: true,
      currentSurface: {
        ...surface,
        document: { ...surface.document, revision: 1 },
        annotations: [{ ...pendingAnnotation, anchorRevision: 1 }],
      },
      expectedRevision: 0,
      actualRevision: 1,
      nextAction: "Read the current note and retry against revision 1.",
    };
    expect(normalizeDocumentSurfaceResult(stale)).toMatchObject({
      ok: false,
      code: "STALE_WORK_STATE",
      actualRevision: 1,
    });
    expect(() => normalizeDocumentSurfaceResult({
      ok: false,
      code: "STALE_WORK_STATE",
      message: "stale",
      retryable: true,
    })).toThrow("invalid document result");
  });
});

describe("SupabaseDocumentService RPC adapter", () => {
  it("maps the frozen port only to versioned allow-listed RPCs", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const service = new SupabaseDocumentService({
      url: "https://example.supabase.co/",
      publishableKey: "sb_publishable_example",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        const name = String(url).split("/").at(-1);
        const data = name === "ratiflow_document_launch_v2"
          || name === "ratiflow_document_join_v2"
          ? bundle
          : name === "ratiflow_document_list_agent_annotations_v2"
            ? [pendingAnnotation]
            : name === "ratiflow_document_apply_agent_annotation_v2"
              ? outcome
              : surface;
        return Response.json({ ok: true, data });
      },
    });

    await service.launch({ displayName: "Maya" });
    await service.join({ shareToken: "a".repeat(64), displayName: "Jordan" });
    await service.inspect("human-handle-that-is-long-enough");
    await service.listAgentAnnotations("agent-handle-that-is-long-enough");
    await service.createAnnotation("human-handle-that-is-long-enough", {
      expectedRevision: 0,
      requestId: "0ba2ab8f-c590-4501-b3c9-862098cb04ba",
      presetId: "continue_thought",
      source: "ANNOTATION_RAIL",
      targetField: "BODY",
      targetKind: "CARET",
      rangeStart: 0,
      rangeEnd: 0,
    });
    await service.cancelAnnotation("human-handle-that-is-long-enough", {
      annotationId: pendingAnnotation.annotationId,
      requestId: "a570d7cf-3fd1-4a33-81d9-b71351995e82",
    });
    await service.applyAgentAnnotation("agent-handle-that-is-long-enough", {
      annotationId: pendingAnnotation.annotationId,
      expectedRevision: 0,
      requestId: "9ec9867a-95fa-4527-a47e-64589df68d58",
      replacementText: "",
      changeSummary: "No content change was required.",
    });

    expect(requests.map(({ url }) => url.split("/").at(-1))).toEqual([
      "ratiflow_document_launch_v2",
      "ratiflow_document_join_v2",
      "ratiflow_document_inspect_v2",
      "ratiflow_document_list_agent_annotations_v2",
      "ratiflow_document_create_annotation_v2",
      "ratiflow_document_cancel_annotation_v2",
      "ratiflow_document_apply_agent_annotation_v2",
    ]);
    expect(requests[0].init?.headers).toMatchObject({
      apikey: "sb_publishable_example",
      Authorization: "Bearer sb_publishable_example",
    });
    expect(requests[1].init?.body).toBe(JSON.stringify({
      p_share_token: "a".repeat(64),
      p_input: { displayName: "Jordan" },
    }));
    expect(requests[6].init?.body).not.toContain("actorType");
    expect(requests[6].init?.body).not.toContain("origin");
    expect(requests[6].init?.body).not.toContain("documentId");
    expect(requests[6].init?.body).not.toContain("memberId");
  });

  it("does not turn an HTTP failure into a typed success", async () => {
    const service = new SupabaseDocumentService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
      fetch: async () => Response.json({ message: "temporarily unavailable" }, { status: 503 }),
    });
    await expect(service.inspect("opaque-handle-that-is-long-enough")).rejects.toThrow(
      "failed (503)",
    );
  });

  it("preserves unknown join keys so the RPC can reject shape drift", async () => {
    const requests: unknown[] = [];
    const service = new SupabaseDocumentService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          p_input: Record<string, unknown>;
        };
        requests.push(body);
        return Response.json(
          Object.hasOwn(body.p_input, "unexpected")
            ? {
                ok: false,
                code: "INVALID_INPUT",
                message: "The request shape is invalid.",
                retryable: false,
              }
            : { ok: true, data: bundle },
        );
      },
    });
    const input = {
      shareToken: "a".repeat(64),
      displayName: "Jordan",
      unexpected: "must reach the exact-key check",
    };

    await expect(service.join(input)).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(requests).toEqual([{
      p_share_token: "a".repeat(64),
      p_input: {
        displayName: "Jordan",
        unexpected: "must reach the exact-key check",
      },
    }]);
  });
});
