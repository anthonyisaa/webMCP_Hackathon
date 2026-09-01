import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LocalRepositoryService } from "../repository-service";
import {
  SupabaseRepositoryService,
  isIssueWorkspaceSurface,
  normalizeRepositoryResult,
} from "./repository-supabase-service";

async function fixture() {
  const local = new LocalRepositoryService();
  const launched = await local.launchExample({});
  if (!launched.ok) throw new Error("example launch failed");
  const bundle = JSON.parse(JSON.stringify(launched.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof launched.data;
  const history = await local.readHistory(launched.data.humanSessionToken, { limit: 20 });
  const direct = bundle.surface.tasks.find((task) => task.mode === "DIRECT");
  const review = bundle.surface.tasks.find((task) => task.mode === "REVIEW");
  const reviewThread = bundle.surface.threads.find((thread) => thread.taskId === review?.taskId);
  const agentComment = reviewThread?.comments.find((comment) => comment.author.actorType === "AGENT");
  const resultRevision = direct?.result?.resultRevision;
  if (!direct || !review || !agentComment || resultRevision === undefined) {
    throw new Error("example work missing");
  }
  const revision = await local.readRevision(launched.data.humanSessionToken, resultRevision);
  if (!history.ok || !revision.ok) throw new Error("example history failed");
  const cleanHistory = JSON.parse(JSON.stringify(history.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof history.data;
  const cleanRevision = JSON.parse(JSON.stringify(revision.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof revision.data;
  return { bundle, history: cleanHistory, revision: cleanRevision, direct, review, agentComment };
}

describe("SupabaseRepositoryService strict normalization", () => {
  it("accepts the complete example and rejects provenance, thread, and capacity drift", async () => {
    const { bundle } = await fixture();
    expect(isIssueWorkspaceSurface(bundle.surface)).toBe(true);
    const reversed = structuredClone(bundle.surface);
    reversed.threads.find((thread) => thread.comments.length > 1)!.comments.reverse();
    expect(isIssueWorkspaceSurface(reversed)).toBe(false);
    const taskOrder = structuredClone(bundle.surface);
    taskOrder.tasks.reverse();
    expect(isIssueWorkspaceSurface(taskOrder)).toBe(false);
    const threadOrder = structuredClone(bundle.surface);
    [threadOrder.threads[0], threadOrder.threads[1]] = [
      threadOrder.threads[1]!, threadOrder.threads[0]!,
    ];
    expect(isIssueWorkspaceSurface(threadOrder)).toBe(false);
    const presence = structuredClone(bundle.surface);
    presence.presence.push({
      memberId: presence.members[0]!.memberId,
      displayName: presence.members[0]!.displayName,
      color: "#2563EB",
      state: "VIEWING",
      field: null,
      isTyping: true,
      selectionStart: null,
      selectionEnd: null,
      observedRevision: presence.document.revision,
      lastSeenAt: new Date().toISOString(),
    });
    expect(isIssueWorkspaceSurface(presence)).toBe(false);
    const wrongAuthor = structuredClone(bundle.surface);
    const directRevision = wrongAuthor.history.find((entry) => entry.provenance.authority === "DIRECT")!;
    if (directRevision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
    directRevision.provenance.committer = {
      ...directRevision.provenance.committer,
      member: bundle.surface.members.find((member) => member.displayName === "Priya Shah")!,
    };
    expect(isIssueWorkspaceSurface(wrongAuthor)).toBe(false);
    expect(() => normalizeRepositoryResult(
      { ok: true, data: { ...bundle.surface, secret: "no" } },
      isIssueWorkspaceSurface,
    )).toThrow("invalid repository-v4");
  });

  it("requires immutable creation targets and discriminated submission snapshots", async () => {
    const { bundle, direct, review } = await fixture();
    expect(direct.result?.outcome).toBe("COMMITTED");
    expect(direct.result?.liveAnchor.selectedText).toBe("Investigation in progress.");
    expect(direct.result?.replacementText).not.toBeNull();
    expect(review.proposal?.liveAnchor.selectedText).toBe("Investigation in progress.");

    const missingCreation = structuredClone(bundle.surface) as unknown as {
      tasks: Array<Record<string, unknown>>;
    };
    delete missingCreation.tasks[0]!.creationAnchor;
    expect(isIssueWorkspaceSurface(missingCreation)).toBe(false);

    const badDirect = structuredClone(bundle.surface);
    const directTask = badDirect.tasks.find((task) => task.mode === "DIRECT")!;
    if (directTask.status !== "COMPLETED" || directTask.result === null
      || directTask.result.outcome !== "COMMITTED") {
      throw new Error("bad direct fixture");
    }
    (directTask.result as { replacementText: string | null }).replacementText = null;
    expect(isIssueWorkspaceSurface(badDirect)).toBe(false);

    const badProposal = structuredClone(bundle.surface);
    const reviewTask = badProposal.tasks.find((task) => task.mode === "REVIEW")!;
    if (!reviewTask.proposal) throw new Error("bad review fixture");
    reviewTask.proposal.liveAnchor.anchorState = "STALE";
    expect(isIssueWorkspaceSurface(badProposal)).toBe(false);
  });

  it("rejects uppercase digests, broken parent chains, and incomplete replies", async () => {
    const { bundle } = await fixture();
    const digest = structuredClone(bundle.surface);
    digest.history[0]!.contentDigest = digest.history[0]!.contentDigest.toUpperCase() as `sha256:${string}`;
    expect(isIssueWorkspaceSurface(digest)).toBe(false);
    const parent = structuredClone(bundle.surface);
    parent.history[0]!.parentRevision = 1;
    expect(isIssueWorkspaceSurface(parent)).toBe(false);
    const truncated = structuredClone(bundle.surface);
    truncated.history.pop();
    truncated.hasMoreHistory = true;
    expect(isIssueWorkspaceSurface(truncated)).toBe(false);
    const reply = structuredClone(bundle.surface);
    const thread = reply.threads.find((entry) => entry.comments.some((comment) => comment.replyToCommentId));
    thread!.comments = thread!.comments.slice(1);
    expect(isIssueWorkspaceSurface(reply)).toBe(false);
  });
});

describe("SupabaseRepositoryService RPC adapter", () => {
  it("uses exact RPC names, forwards page identity, and isolates reset credentials", async () => {
    const f = await fixture();
    const requests: Array<{ name: string; body: Record<string, unknown>; authorization: string | null }> = [];
    const reset = {
      fixtureVersion: "repo-document-v4.postmortem.v1" as const,
      shareToken: "s".repeat(64),
      priyaBootstrapPath: `/issue/${"s".repeat(64)}#ratiflow-bootstrap=${"p".repeat(32)}`,
      nadiaBootstrapPath: `/issue/${"s".repeat(64)}#ratiflow-bootstrap=${"n".repeat(32)}`,
      leoBootstrapPath: `/issue/${"s".repeat(64)}#ratiflow-bootstrap=${"l".repeat(32)}`,
      samBootstrapPath: `/issue/${"s".repeat(64)}#ratiflow-bootstrap=${"m".repeat(32)}`,
      expiresAt: "2026-09-30T00:00:00.000Z",
      revision: 1 as const,
      activityVersion: 4 as const,
    };
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      serviceRoleKey: "service-secret",
      fetch: async (url, init) => {
        const name = String(url).split("/").at(-1)!;
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const headers = new Headers(init?.headers);
        requests.push({ name, body, authorization: headers.get("Authorization") });
        const data = name === "ratiflow_launch_issue_v4" || name === "ratiflow_join_issue_v4"
          ? f.bundle
          : name === "ratiflow_read_issue_history_v4" ? f.history
            : name === "ratiflow_read_issue_revision_v4" ? f.revision
              : name === "ratiflow_list_my_issue_tasks_v4" ? {
                  tasks: [], revision: 4, activityVersion: 10,
                }
                : name === "ratiflow_comment_on_issue_task_v4" ? {
                    task: f.review, comment: f.agentComment, activityVersion: 10,
                  }
                  : name === "ratiflow_submit_issue_task_result_v4" ? {
                      outcome: "COMMITTED", task: f.direct, revision: f.revision, activityVersion: 10,
                    }
                    : name === "ratiflow_reset_postmortem_hero_v4" ? reset : f.bundle.surface;
        return Response.json({ ok: true, data });
      },
    });
    const human = "h".repeat(64);
    const agent = "a".repeat(64);
    const page = randomUUID();
    await service.launch({ kind: "POSTMORTEM" });
    await service.launchExample({});
    await service.join({ shareToken: "s".repeat(64), displayName: "Maya" });
    await service.inspect(human);
    await service.readHistory(human, { limit: 20 });
    await service.readRevision(human, 2);
    await service.listMyTasks(agent, {}, page);
    await service.commentOnTask(agent, {
      requestId: randomUUID(), taskId: f.review.taskId, body: "Finding.",
    }, page);
    await service.submitTaskResult(agent, {
      requestId: randomUUID(), taskId: f.direct.taskId, basedOnRevision: 1,
      resultSummary: "Applied.", replacementText: "replacement",
    }, page);
    await service.resetPostmortemHero();

    expect(requests.map(({ name }) => name).slice(0, 10)).toEqual([
      "ratiflow_launch_issue_v4", "ratiflow_launch_issue_v4", "ratiflow_join_issue_v4",
      "ratiflow_inspect_issue_v4", "ratiflow_read_issue_history_v4",
      "ratiflow_read_issue_revision_v4", "ratiflow_list_my_issue_tasks_v4",
      "ratiflow_comment_on_issue_task_v4", "ratiflow_submit_issue_task_result_v4",
      "ratiflow_reset_postmortem_hero_v4",
    ]);
    expect(requests[1]?.body).toEqual({ p_input: {}, p_example: true });
    for (const request of requests.filter(({ name }) => [
      "ratiflow_list_my_issue_tasks_v4", "ratiflow_comment_on_issue_task_v4",
      "ratiflow_submit_issue_task_result_v4",
    ].includes(name))) expect(request.body).toMatchObject({ p_page_session_id: page });
    expect(requests.at(-1)?.authorization).toBe("Bearer service-secret");
    expect(JSON.stringify(requests)).not.toContain("actorType");
    expect(JSON.stringify(requests)).not.toContain('"origin"');
  });

  it("rejects invalid page/example input before transport and does not invent a wait RPC", async () => {
    const f = await fixture();
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    const page = randomUUID();
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async (url, init) => {
        requests.push({
          name: String(url).split("/").at(-1)!,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return Response.json({ ok: true, data: { tasks: [], revision: 4, activityVersion: 10 } });
      },
    });
    await expect(service.listMyTasks("a".repeat(64), {}, "bad")).resolves.toMatchObject({
      ok: false, code: "INVALID_INPUT",
    });
    await expect(service.launchExample({ surprise: true } as never)).resolves.toMatchObject({
      ok: false, code: "INVALID_INPUT",
    });
    await expect(service.waitForMyTasks("a".repeat(64), {
      afterActivityVersion: 10, afterRevision: 4, timeoutSeconds: 1,
    }, page)).resolves.toMatchObject({ ok: true, data: { outcome: "TIMEOUT" } });
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests.every(({ name }) => name === "ratiflow_list_my_issue_tasks_v4")).toBe(true);
    expect(requests.every(({ body }) => body.p_page_session_id === page)).toBe(true);
    expect(requests.map(({ name }) => name)).not.toContain("ratiflow_wait_for_my_tasks_v4");
    expect(f.bundle.surface.document.revision).toBe(4);
  });

  it("rejects explicit null evidence arrays before transport", async () => {
    const f = await fixture();
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => {
        calls += 1;
        return Response.json({ ok: true, data: f.bundle.surface });
      },
    });
    const invalidEvidence = { evidenceRefs: null } as never;
    await expect(service.addHumanComment("h".repeat(64), invalidEvidence))
      .resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(service.commentOnTask("a".repeat(64), invalidEvidence, randomUUID()))
      .resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(service.submitTaskResult("a".repeat(64), invalidEvidence, randomUUID()))
      .resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(calls).toBe(0);
  });

  it("rechecks server authorization while waiting", async () => {
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json({
            ok: true,
            data: { tasks: [], revision: 4, activityVersion: 10 },
          });
        }
        return Response.json({
          ok: false,
          code: "UNAUTHORIZED",
          message: "The agent session expired while waiting.",
          retryable: false,
        });
      },
    });
    await expect(service.waitForMyTasks("a".repeat(64), {
      afterActivityVersion: 10,
      afterRevision: 4,
      timeoutSeconds: 1,
    }, randomUUID())).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(calls).toBe(2);
  });
});
