import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { LocalRepositoryService } from "../repository-service";
import {
  SupabaseRepositoryService,
  isIssueWorkspaceSurface,
  normalizeRepositoryResult,
} from "./repository-supabase-service";

async function fixture() {
  const local = new LocalRepositoryService();
  const launched = await local.launchExample({
    kind: "POSTMORTEM",
    displayName: "Adapter Viewer",
  });
  if (!launched.ok) throw new Error("example launch failed");
  const bundle = JSON.parse(JSON.stringify(launched.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof launched.data;
  const history = await local.readHistory(launched.data.humanSessionToken, { limit: 20 });
  const direct = bundle.surface.tasks.find((task) =>
    task.mode === "DIRECT" && task.status === "COMPLETED");
  const resultRevision = direct?.result?.resultRevision;
  if (!direct || direct.status !== "COMPLETED" || direct.result?.outcome !== "COMMITTED"
    || resultRevision === undefined) {
    throw new Error("example work missing");
  }
  const agentComment = {
    commentId: randomUUID(),
    threadId: direct.threadId,
    replyToCommentId: null,
    author: direct.result.submittedBy,
    origin: "WEBMCP" as const,
    createdRevision: direct.result.resultRevision,
    body: "The checked source supports this change.",
    evidenceRefs: ["fixture:evidence"],
    createdAt: direct.result.submittedAt,
  };
  const revision = await local.readRevision(launched.data.humanSessionToken, resultRevision);
  if (!history.ok || !revision.ok) throw new Error("example history failed");
  const cleanHistory = JSON.parse(JSON.stringify(history.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof history.data;
  const cleanRevision = JSON.parse(JSON.stringify(revision.data), (key, value: unknown) =>
    key === "color" ? undefined : value) as typeof revision.data;
  return { bundle, history: cleanHistory, revision: cleanRevision, direct, agentComment };
}

async function openTaskListFixture() {
  const local = new LocalRepositoryService();
  const launched = await local.launch({
    kind: "POSTMORTEM",
    displayName: "Priya Shah",
  });
  if (!launched.ok) throw new Error("template launch failed");
  const created = await local.createTask(launched.data.humanSessionToken, {
    requestId: randomUUID(),
    expectedRevision: 1,
    title: "Review the complete incident",
    category: "GENERAL",
    instruction: "Read the document and report one evidence-backed finding.",
    agentLabel: "Incident agent",
    mode: "COMMENT",
    assignedToMemberId: launched.data.selfMemberId,
    anchor: { scope: "DOCUMENT" },
  });
  if (!created.ok) throw new Error("task creation failed");
  const pageSessionId = randomUUID();
  const connected = await local.connectAgent(
    launched.data.agentSessionToken,
    { requestId: randomUUID(), name: "Fixturebot" },
    pageSessionId,
  );
  if (!connected.ok) throw new Error("agent connection failed");
  const listed = await local.listMyTasks(
    launched.data.agentSessionToken,
    {},
    pageSessionId,
  );
  if (!listed.ok || listed.data.tasks.length !== 1) {
    throw new Error("open task listing failed");
  }
  return listed.data;
}

async function collaborationContextFixture() {
  const local = new LocalRepositoryService();
  const launched = await local.launchExample({
    kind: "POSTMORTEM",
    displayName: "Context Viewer",
  });
  if (!launched.ok) throw new Error("context example launch failed");
  const pageSessionId = randomUUID();
  const connected = await local.connectAgent(
    launched.data.agentSessionToken,
    { requestId: randomUUID(), name: "Contextbot" },
    pageSessionId,
  );
  if (!connected.ok) throw new Error("context agent connection failed");
  const context = await local.readCollaborationContext(
    launched.data.agentSessionToken,
    { limit: 50 },
    pageSessionId,
  );
  if (!context.ok || context.data.events.length < 7) {
    throw new Error("context example is incomplete");
  }
  return structuredClone(context.data);
}

function waitRpcFetch(
  read: (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
  observed?: string[],
) {
  return async (url: URL | RequestInfo, init?: RequestInit) => {
    const name = String(url).split("/").at(-1)!;
    observed?.push(name);
    if (name === "ratiflow_begin_issue_task_wait_v4") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { p_lease_id?: unknown };
      return Response.json({
        ok: true,
        data: {
          leaseId: body.p_lease_id,
          expiresAt: "2026-09-02T00:00:06.000Z",
        },
      });
    }
    if (name === "ratiflow_end_issue_task_wait_v4") {
      return Response.json({ ok: true, data: { released: true } });
    }
    return read(url, init);
  };
}

describe("SupabaseRepositoryService strict normalization", () => {
  it("accepts the complete example and rejects provenance, thread, and capacity drift", async () => {
    const { bundle, direct, agentComment } = await fixture();
    expect(isIssueWorkspaceSurface(bundle.surface)).toBe(true);
    const reversed = structuredClone(bundle.surface);
    const reversedThread = reversed.threads.find((thread) => thread.threadId === direct.threadId)!;
    reversedThread.comments.push({
      ...agentComment,
      replyToCommentId: reversedThread.comments[0]!.commentId,
      createdAt: new Date(Date.parse(reversedThread.comments[0]!.createdAt) + 1).toISOString(),
    });
    expect(isIssueWorkspaceSurface(reversed)).toBe(true);
    reversedThread.comments.reverse();
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
    const swappedProfiles = structuredClone(bundle.surface);
    expect(swappedProfiles.agents.length).toBeGreaterThan(1);
    const firstProfileId = swappedProfiles.agents[0]!.profileId;
    swappedProfiles.agents[0]!.profileId = swappedProfiles.agents[1]!.profileId;
    swappedProfiles.agents[1]!.profileId = firstProfileId;
    expect(isIssueWorkspaceSurface(swappedProfiles)).toBe(false);
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

  it("rejects incoherent direct task and revision joins on the workspace surface", async () => {
    const { bundle, direct } = await fixture();
    const directRevision = bundle.surface.history.find((entry) =>
      entry.provenance.authority === "DIRECT"
        && entry.provenance.taskId === direct.taskId);
    if (!directRevision || directRevision.provenance.authority !== "DIRECT") {
      throw new Error("bad direct revision fixture");
    }
    const otherMember = bundle.surface.members.find((member) =>
      member.memberId !== direct.creator.memberId);
    if (!otherMember) throw new Error("missing alternate fixture member");

    const wrongProfile = structuredClone(bundle.surface);
    const wrongProfileRevision = wrongProfile.history.find((entry) =>
      entry.revisionId === directRevision.revisionId)!;
    if (wrongProfileRevision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
    wrongProfileRevision.provenance.author.agentProfileId = randomUUID();
    expect(isIssueWorkspaceSurface(wrongProfile)).toBe(false);

    const wrongGrant = structuredClone(bundle.surface);
    const wrongGrantRevision = wrongGrant.history.find((entry) =>
      entry.revisionId === directRevision.revisionId)!;
    if (wrongGrantRevision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
    wrongGrantRevision.provenance.grantedBy = otherMember;
    expect(isIssueWorkspaceSurface(wrongGrant)).toBe(false);

    const wrongSummary = structuredClone(bundle.surface);
    const wrongSummaryRevision = wrongSummary.history.find((entry) =>
      entry.revisionId === directRevision.revisionId)!;
    wrongSummaryRevision.changeSummary = `${wrongSummaryRevision.changeSummary} altered`;
    expect(isIssueWorkspaceSurface(wrongSummary)).toBe(false);

    const wrongEvidence = structuredClone(bundle.surface);
    const wrongEvidenceRevision = wrongEvidence.history.find((entry) =>
      entry.revisionId === directRevision.revisionId)!;
    expect(wrongEvidenceRevision.evidenceRefs.length).toBeGreaterThan(1);
    wrongEvidenceRevision.evidenceRefs.reverse();
    expect(isIssueWorkspaceSurface(wrongEvidence)).toBe(false);
  });

  it("requires immutable creation targets and discriminated submission snapshots", async () => {
    const { bundle, direct } = await fixture();
    expect(direct.result?.outcome).toBe("COMMITTED");
    expect(direct.result?.liveAnchor.selectedText).toBeTruthy();
    expect(direct.result?.replacementText).not.toBeNull();

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

  });

  it("rejects uppercase digests, broken parent chains, and incomplete replies", async () => {
    const { bundle, direct, agentComment } = await fixture();
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
    const thread = reply.threads.find((entry) => entry.threadId === direct.threadId)!;
    thread.comments.push({
      ...agentComment,
      replyToCommentId: thread.comments[0]!.commentId,
      createdAt: new Date(Date.parse(thread.comments[0]!.createdAt) + 1).toISOString(),
    });
    thread.comments = thread.comments.slice(1);
    expect(isIssueWorkspaceSurface(reply)).toBe(false);
  });
});

describe("SupabaseRepositoryService RPC adapter", () => {
  it("routes ordinary task creation through the managed-principal guard without blocking humans or BYOA", async () => {
    const f = await fixture();
    const managedIds = new Map<string, string>([
      [randomUUID(), "Data"],
      [randomUUID(), "Code"],
      [randomUUID(), "General"],
    ]);
    const requests: Array<{ name: string; body: Record<string, unknown> }> = [];
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async (url, init) => {
        const name = String(url).split("/").at(-1)!;
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push({ name, body });
        const input = body.p_input as { assignedToMemberId?: string } | undefined;
        if (input?.assignedToMemberId && managedIds.has(input.assignedToMemberId)) {
          return Response.json({
            ok: false,
            code: "STALE_AGENT_PROFILE",
            message: "Managed directory agents require the directory mention flow.",
            retryable: false,
          });
        }
        return Response.json({ ok: true, data: f.bundle.surface });
      },
    });
    const createInput = (assignedToMemberId: string, label: string) => ({
      requestId: randomUUID(),
      expectedRevision: f.bundle.surface.document.revision,
      title: `${label} review`,
      category: "GENERAL" as const,
      instruction: "Review the issue and report one finding.",
      agentLabel: label,
      mode: "COMMENT" as const,
      assignedToMemberId,
      anchor: { scope: "DOCUMENT" as const },
    });

    for (const [memberId, label] of managedIds) {
      await expect(service.createTask(
        "h".repeat(64), createInput(memberId, label),
      )).resolves.toMatchObject({ ok: false, code: "STALE_AGENT_PROFILE" });
    }
    const byoaMemberId = f.bundle.surface.agents[0]?.member.memberId;
    const humanMemberId = f.bundle.surface.members.find((member) =>
      member.memberId !== byoaMemberId)?.memberId;
    if (!byoaMemberId || !humanMemberId) throw new Error("missing human/BYOA fixture members");
    await expect(service.createTask(
      "h".repeat(64), createInput(humanMemberId, "Human"),
    )).resolves.toMatchObject({ ok: true });
    await expect(service.createTask(
      "h".repeat(64), createInput(byoaMemberId, "BYOA"),
    )).resolves.toMatchObject({ ok: true });

    expect(requests).toHaveLength(5);
    expect(requests.every(({ name }) => name === "ratiflow_create_issue_task_v4")).toBe(true);
    expect(requests.every(({ body }) => body.p_response_contract === "v4.1")).toBe(true);
  });

  it("rejects tampered direct submit and history provenance responses", async () => {
    const f = await fixture();
    const otherMember = f.bundle.surface.members.find((member) =>
      member.memberId !== f.direct.creator.memberId);
    if (!otherMember || f.revision.provenance.authority !== "DIRECT") {
      throw new Error("bad direct fixture");
    }
    const committed = () => ({
      outcome: "COMMITTED" as const,
      task: structuredClone(f.direct),
      revision: structuredClone(f.revision),
      activityVersion: f.bundle.surface.document.activityVersion,
    });
    const tampered = [
      (() => {
        const value = committed();
        if (value.revision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
        value.revision.provenance.author.agentProfileId = randomUUID();
        return value;
      })(),
      (() => {
        const value = committed();
        if (value.revision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
        value.revision.provenance.grantedBy = otherMember;
        return value;
      })(),
      (() => {
        const value = committed();
        value.revision.changeSummary = `${value.revision.changeSummary} altered`;
        return value;
      })(),
      (() => {
        const value = committed();
        expect(value.revision.evidenceRefs.length).toBeGreaterThan(1);
        value.revision.evidenceRefs.reverse();
        return value;
      })(),
      (() => {
        const value = committed();
        expect(value.revision.diffs).toHaveLength(1);
        value.revision.diffs[0]!.field = value.revision.diffs[0]!.field === "BODY"
          ? "TITLE"
          : "BODY";
        return value;
      })(),
      (() => {
        const value = committed();
        expect(value.revision.diffs).toHaveLength(1);
        value.revision.diffs[0]!.rangeStart += 1;
        value.revision.diffs[0]!.rangeEnd += 1;
        return value;
      })(),
      (() => {
        const value = committed();
        expect(value.revision.diffs).toHaveLength(1);
        const before = value.revision.diffs[0]!.before;
        expect(before.length).toBeGreaterThan(0);
        value.revision.diffs[0]!.before = `${before[0] === "X" ? "Y" : "X"}${before.slice(1)}`;
        return value;
      })(),
      (() => {
        const value = committed();
        expect(value.revision.diffs).toHaveLength(1);
        value.revision.diffs[0]!.after = `${value.revision.diffs[0]!.after} altered`;
        return value;
      })(),
      (() => {
        const value = committed();
        if (value.revision.provenance.authority !== "DIRECT") throw new Error("bad fixture");
        for (const actor of [
          value.revision.provenance.author,
          value.revision.provenance.committer,
        ]) {
          actor.displayName = "Renamed response bot";
          actor.agentLabel = "Renamed response bot";
        }
        return value;
      })(),
    ];
    for (const data of tampered) {
      const service = new SupabaseRepositoryService({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable",
        fetch: async () => Response.json({ ok: true, data }),
      });
      await expect(service.submitTaskResult("a".repeat(64), {
        requestId: randomUUID(), taskId: f.direct.taskId, basedOnRevision: 1,
        resultSummary: "Applied.", replacementText: "replacement",
      }, randomUUID())).rejects.toThrow("invalid repository-v4");
    }

    const history = structuredClone(f.history);
    const historyRevision = history.revisions.find((entry) =>
      entry.provenance.authority === "DIRECT");
    if (!historyRevision || historyRevision.provenance.authority !== "DIRECT") {
      throw new Error("bad history fixture");
    }
    historyRevision.provenance.author.agentProfileId = randomUUID();
    const historyService = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => Response.json({ ok: true, data: history }),
    });
    await expect(historyService.readHistory("h".repeat(64), { limit: 20 }))
      .rejects.toThrow("invalid repository-v4");
  });

  it("requires exact collaboration-context page coverage and preserves terminal empties", async () => {
    const full = await collaborationContextFixture();
    const input = { limit: 6 } as const;
    const validPage = {
      ...full,
      events: full.events.slice(0, input.limit),
      hasMoreOlder: true,
      nextBeforeActivityVersion: full.events[input.limit - 1]!.activityVersion,
    };
    const call = (data: unknown, callInput: { limit: number; beforeActivityVersion?: number } = input) => {
      const service = new SupabaseRepositoryService({
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable",
        fetch: async () => Response.json({ ok: true, data }),
      });
      return service.readCollaborationContext(
        "a".repeat(64),
        callInput,
        randomUUID(),
      );
    };
    await expect(call(validPage)).resolves.toMatchObject({
      ok: true,
      data: { events: validPage.events },
    });

    const duplicateProfile = structuredClone(validPage);
    expect(duplicateProfile.agents.length).toBeGreaterThan(1);
    duplicateProfile.agents[1]!.profileId = duplicateProfile.agents[0]!.profileId;
    await expect(call(duplicateProfile)).rejects.toThrow("invalid repository-v4");

    const duplicateMember = structuredClone(validPage);
    duplicateMember.agents[1]!.member = structuredClone(duplicateMember.agents[0]!.member);
    await expect(call(duplicateMember)).rejects.toThrow("invalid repository-v4");

    const swappedProfiles = structuredClone(validPage);
    const taskProfileIds = Array.from(new Set(swappedProfiles.events.flatMap((event) =>
      event.task?.agentProfileId ? [event.task.agentProfileId] : [])));
    expect(taskProfileIds.length).toBeGreaterThan(1);
    const firstProfile = swappedProfiles.agents.find((agent) =>
      agent.profileId === taskProfileIds[0]);
    const secondProfile = swappedProfiles.agents.find((agent) =>
      agent.profileId === taskProfileIds[1]);
    if (!firstProfile || !secondProfile) throw new Error("missing context task profiles");
    [firstProfile.profileId, secondProfile.profileId] = [
      secondProfile.profileId,
      firstProfile.profileId,
    ];
    await expect(call(swappedProfiles)).rejects.toThrow("invalid repository-v4");

    const futureDocumentEvent = structuredClone(validPage);
    const eventWithoutRevision = futureDocumentEvent.events.find((event) => event.revision === null);
    if (!eventWithoutRevision) throw new Error("missing context event without revision");
    eventWithoutRevision.documentRevision = futureDocumentEvent.currentRevision + 1;
    await expect(call(futureDocumentEvent)).rejects.toThrow("invalid repository-v4");

    const incoherentJoin = structuredClone(validPage);
    const directEvent = incoherentJoin.events.find((event) =>
      event.revision?.provenance.authority === "DIRECT");
    if (!directEvent?.revision) throw new Error("missing direct context event");
    directEvent.revision.changeSummary = `${directEvent.revision.changeSummary} altered`;
    await expect(call(incoherentJoin)).rejects.toThrow("invalid repository-v4");

    await expect(call({
      ...validPage,
      events: [],
      hasMoreOlder: false,
      nextBeforeActivityVersion: null,
    })).rejects.toThrow("invalid repository-v4");

    const truncatedEvents = validPage.events.slice(0, -1);
    await expect(call({
      ...validPage,
      events: truncatedEvents,
      nextBeforeActivityVersion: truncatedEvents.at(-1)!.activityVersion,
    })).rejects.toThrow("invalid repository-v4");

    const gappedEvents = [
      ...full.events.slice(0, 2),
      ...full.events.slice(3, input.limit + 1),
    ];
    await expect(call({
      ...validPage,
      events: gappedEvents,
      nextBeforeActivityVersion: gappedEvents.at(-1)!.activityVersion,
    })).rejects.toThrow("invalid repository-v4");

    await expect(call({
      ...full,
      events: [],
      hasMoreOlder: false,
      nextBeforeActivityVersion: null,
    }, { limit: input.limit, beforeActivityVersion: 1 })).resolves.toMatchObject({
      ok: true,
      data: { events: [], hasMoreOlder: false, nextBeforeActivityVersion: null },
    });
  });

  it("uses exact RPC names, forwards page identity, and isolates reset credentials", async () => {
    const f = await fixture();
    const requests: Array<{ name: string; body: Record<string, unknown>; authorization: string | null }> = [];
    const localReset = await new LocalRepositoryService().resetPostmortemHero();
    if (!localReset.ok) throw new Error("canonical reset failed");
    const reset = localReset.data;
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
                      task: f.direct, comment: f.agentComment, activityVersion: 10,
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
    await service.launch({ kind: "POSTMORTEM", displayName: "Priya" });
    await service.launchExample({ kind: "POSTMORTEM", displayName: "Viewer" });
    await service.join({ shareToken: "s".repeat(64), displayName: "Maya" });
    await service.inspect(human);
    await service.readHistory(human, { limit: 20 });
    await service.readRevision(human, 2);
    await service.listMyTasks(agent, {}, page);
    await service.commentOnTask(agent, {
      requestId: randomUUID(), taskId: f.direct.taskId, body: "Finding.",
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
    expect(requests[1]?.body).toEqual({
      p_input: { kind: "POSTMORTEM", displayName: "Viewer" },
      p_example: true,
      p_response_contract: "v4.1",
    });
    for (const request of requests.filter(({ name }) => [
      "ratiflow_list_my_issue_tasks_v4", "ratiflow_comment_on_issue_task_v4",
      "ratiflow_submit_issue_task_result_v4",
    ].includes(name))) expect(request.body).toMatchObject({ p_page_session_id: page });
    expect(requests.at(-1)?.authorization).toBe("Bearer service-secret");
    expect(JSON.stringify(requests)).not.toContain("actorType");
    expect(JSON.stringify(requests)).not.toContain('"origin"');
  });

  it("accepts the canonical reset bootstrap and rejects malformed or oversized fragments", async () => {
    const localReset = await new LocalRepositoryService().resetPostmortemHero();
    if (!localReset.ok) throw new Error("canonical reset failed");
    const canonical = localReset.data;
    const prefix = `/issue/${canonical.shareToken}#ratiflow-bootstrap=`;
    const fragments = [
      canonical.priyaBootstrapPath,
      canonical.nadiaBootstrapPath,
      canonical.leoBootstrapPath,
      canonical.samBootstrapPath,
    ].map((path) => path.slice(prefix.length));
    expect(Math.max(...fragments.map((fragment) => fragment.length))).toBeGreaterThan(16_384);
    expect(fragments.every((fragment) => fragment.length <= 65_536)).toBe(true);

    const resetWith = (data: unknown) => new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      serviceRoleKey: "service-secret",
      fetch: async () => Response.json({ ok: true, data }),
    }).resetPostmortemHero();

    await expect(resetWith(canonical)).resolves.toEqual({ ok: true, data: canonical });

    const oversized = structuredClone(canonical);
    oversized.priyaBootstrapPath = `${prefix}${"a".repeat(65_537)}`;
    await expect(resetWith(oversized)).rejects.toThrow("invalid repository-v4");

    const malformed = structuredClone(canonical);
    malformed.nadiaBootstrapPath = `${malformed.nadiaBootstrapPath.slice(0, -1)}.`;
    await expect(resetWith(malformed)).rejects.toThrow("invalid repository-v4");
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
        return Response.json({ ok: true, data: { tasks: [], revision: 5, activityVersion: 11 } });
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
    }, page)).resolves.toMatchObject({ ok: true, data: { outcome: "DOCUMENT_CHANGED" } });
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests.every(({ name }) => name === "ratiflow_list_my_issue_tasks_v4")).toBe(true);
    expect(requests.every(({ body }) => body.p_page_session_id === page)).toBe(true);
    expect(requests.map(({ name }) => name)).not.toContain("ratiflow_wait_for_my_tasks_v4");
    expect(f.bundle.surface.document.revision).toBeGreaterThanOrEqual(1);
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

  it("rejects legacy Save keys before v4.1 transport", async () => {
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async () => {
        calls += 1;
        return Response.json({ ok: false, code: "INVALID_INPUT", message: "unused", retryable: false });
      },
    });
    await expect(service.saveHumanRevision("h".repeat(64), {
      requestId: randomUUID(), expectedRevision: 1, title: "Incident", body: "Body",
      changeSummary: "Legacy caller summary",
    } as never)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
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

  it("does not settle early and sees work that arrives during the final sleep", async () => {
    const available = await openTaskListFixture();
    const empty = {
      tasks: [],
      revision: available.revision,
      activityVersion: available.activityVersion - 1,
    };
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async () => {
        calls += 1;
        return Response.json({
          ok: true,
          data: calls < 3 ? empty : available,
        });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      let settled = false;
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: empty.activityVersion,
        afterRevision: empty.revision,
        timeoutSeconds: 1,
      }, randomUUID()).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: {
          outcome: "TASKS_AVAILABLE",
          tasks: available.tasks,
          revision: available.revision,
          activityVersion: available.activityVersion,
        },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(3);
  });

  it("performs the boundary refresh when a pre-deadline read resumes after the deadline", async () => {
    const available = await openTaskListFixture();
    const empty = {
      tasks: [],
      revision: available.revision,
      activityVersion: available.activityVersion - 1,
    };
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async () => {
        calls += 1;
        if (calls === 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
          return Response.json({ ok: true, data: empty });
        }
        return Response.json({ ok: true, data: calls < 3 ? empty : available });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: empty.activityVersion,
        afterRevision: empty.revision,
        timeoutSeconds: 1,
      }, randomUUID());
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: {
          outcome: "TASKS_AVAILABLE",
          tasks: available.tasks,
          revision: available.revision,
          activityVersion: available.activityVersion,
        },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(3);
  });

  it("translates a hung initial read through the bounded final refresh", async () => {
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async (_url, init) => {
        calls += 1;
        if (calls === 1) {
          const requestSignal = init?.signal;
          return await new Promise<Response>((_resolve, reject) => {
            const rejectWithReason = () => reject(
              requestSignal?.reason
                ?? new DOMException("The task wait was cancelled.", "AbortError"),
            );
            if (requestSignal?.aborted) rejectWithReason();
            else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
          });
        }
        return Response.json({
          ok: true,
          data: { tasks: [], revision: 1, activityVersion: 1 },
        });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      let settled = false;
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, randomUUID()).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TIMEOUT", tasks: [], revision: 1, activityVersion: 1 },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(2);
  });

  it("bounds a hung wait-lease begin and still performs the authoritative refresh", async () => {
    const observed: string[] = [];
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async (url, init) => {
        const name = String(url).split("/").at(-1)!;
        observed.push(name);
        if (name === "ratiflow_begin_issue_task_wait_v4") {
          const requestSignal = init?.signal;
          return await new Promise<Response>((_resolve, reject) => {
            const rejectWithReason = () => reject(
              requestSignal?.reason
                ?? new DOMException("The wait-lease begin was cancelled.", "AbortError"),
            );
            if (requestSignal?.aborted) rejectWithReason();
            else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
          });
        }
        if (name === "ratiflow_end_issue_task_wait_v4") {
          throw new Error("An ambiguously timed-out lease must expire server-side.");
        }
        return Response.json({
          ok: true,
          data: { tasks: [], revision: 1, activityVersion: 1 },
        });
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      let settled = false;
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, randomUUID()).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TIMEOUT", tasks: [], revision: 1, activityVersion: 1 },
      });
      expect(Date.now()).toBe(Date.parse("2026-09-02T00:00:01.000Z"));
    } finally {
      vi.useRealTimers();
    }
    expect(observed).toEqual([
      "ratiflow_list_my_issue_tasks_v4",
      "ratiflow_begin_issue_task_wait_v4",
      "ratiflow_list_my_issue_tasks_v4",
    ]);
  });

  it("bounds a hung lease release after the fetch-subscribe-refetch result", async () => {
    const available = await openTaskListFixture();
    const empty = {
      tasks: [],
      revision: available.revision,
      activityVersion: available.activityVersion - 1,
    };
    const observed: string[] = [];
    let listCalls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: async (url, init) => {
        const name = String(url).split("/").at(-1)!;
        observed.push(name);
        if (name === "ratiflow_begin_issue_task_wait_v4") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { p_lease_id?: unknown };
          return Response.json({
            ok: true,
            data: {
              leaseId: body.p_lease_id,
              expiresAt: "2026-09-02T00:00:06.000Z",
            },
          });
        }
        if (name === "ratiflow_end_issue_task_wait_v4") {
          const requestSignal = init?.signal;
          return await new Promise<Response>((_resolve, reject) => {
            const rejectWithReason = () => reject(
              requestSignal?.reason
                ?? new DOMException("The wait-lease release was cancelled.", "AbortError"),
            );
            if (requestSignal?.aborted) rejectWithReason();
            else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
          });
        }
        listCalls += 1;
        return Response.json({ ok: true, data: listCalls === 1 ? empty : available });
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      let settled = false;
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: empty.activityVersion,
        afterRevision: empty.revision,
        timeoutSeconds: 1,
      }, randomUUID()).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(249);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TASKS_AVAILABLE", tasks: available.tasks },
      });
      expect(Date.now()).toBe(Date.parse("2026-09-02T00:00:00.750Z"));
    } finally {
      vi.useRealTimers();
    }
    expect(observed).toEqual([
      "ratiflow_list_my_issue_tasks_v4",
      "ratiflow_begin_issue_task_wait_v4",
      "ratiflow_list_my_issue_tasks_v4",
      "ratiflow_end_issue_task_wait_v4",
    ]);
  });

  it("fails honestly when neither the initial nor final refresh yields a snapshot", async () => {
    const available = await openTaskListFixture();
    let calls = 0;
    const pageSessionId = randomUUID();
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async (_url, init) => {
        calls += 1;
        if (calls <= 2) {
          const requestSignal = init?.signal;
          return await new Promise<Response>((_resolve, reject) => {
            const rejectWithReason = () => reject(
              requestSignal?.reason
                ?? new DOMException("The task wait was cancelled.", "AbortError"),
            );
            if (requestSignal?.aborted) rejectWithReason();
            else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
          });
        }
        return Response.json({ ok: true, data: available });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 99,
        afterRevision: 99,
        timeoutSeconds: 1,
      }, pageSessionId);
      const rejected = expect(waiting).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(2_000);
      await rejected;

      await expect(service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId)).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TASKS_AVAILABLE", tasks: available.tasks },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(3);
  });

  it("bounds a hung final refresh, returns TIMEOUT, and releases the page wait key", async () => {
    const available = await openTaskListFixture();
    let calls = 0;
    const pageSessionId = randomUUID();
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async (_url, init) => {
        calls += 1;
        if (calls < 3) {
          return Response.json({
            ok: true,
            data: { tasks: [], revision: 1, activityVersion: 1 },
          });
        }
        if (calls === 3) {
          const requestSignal = init?.signal;
          return await new Promise<Response>((_resolve, reject) => {
            const rejectWithReason = () => reject(
              requestSignal?.reason
                ?? new DOMException("The task wait was cancelled.", "AbortError"),
            );
            if (requestSignal?.aborted) rejectWithReason();
            else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
          });
        }
        return Response.json({ ok: true, data: available });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId);
      let settled = false;
      void waiting.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TIMEOUT", tasks: [], revision: 1, activityVersion: 1 },
      });
      expect(Date.now()).toBe(Date.parse("2026-09-02T00:00:02.000Z"));

      await expect(service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId)).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TASKS_AVAILABLE", tasks: available.tasks },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(4);
  });

  it("preserves external abort and duplicate-wait cleanup", async () => {
    const available = await openTaskListFixture();
    let calls = 0;
    const pageSessionId = randomUUID();
    const controller = new AbortController();
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async () => {
        calls += 1;
        return Response.json({
          ok: true,
          data: calls < 2
            ? { tasks: [], revision: 1, activityVersion: 1 }
            : available,
        });
      }),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    try {
      const waiting = service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId, controller.signal);
      await vi.advanceTimersByTimeAsync(0);
      await expect(service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId)).resolves.toMatchObject({
        ok: false,
        code: "WAIT_ALREADY_ACTIVE",
      });

      controller.abort(new DOMException("cancel task wait", "AbortError"));
      await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
      await expect(service.waitForMyTasks("a".repeat(64), {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 1,
      }, pageSessionId)).resolves.toMatchObject({
        ok: true,
        data: { outcome: "TASKS_AVAILABLE", tasks: available.tasks },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toBe(2);
  });

  it("reserves the duplicate guard before transport and preserves body-decode AbortError", async () => {
    const available = await openTaskListFixture();
    const controller = new AbortController();
    let calls = 0;
    const service = new SupabaseRepositoryService({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable",
      fetch: waitRpcFetch(async (_url, init) => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => await new Promise<unknown>((_resolve, reject) => {
              const requestSignal = init?.signal;
              const rejectWithReason = () => reject(
                requestSignal?.reason
                  ?? new DOMException("The response read was cancelled.", "AbortError"),
              );
              if (requestSignal?.aborted) rejectWithReason();
              else requestSignal?.addEventListener("abort", rejectWithReason, { once: true });
            }),
          } as Response;
        }
        return Response.json({ ok: true, data: available });
      }),
    });
    const pageSessionId = randomUUID();
    const waiting = service.waitForMyTasks("a".repeat(64), {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 1,
    }, pageSessionId, controller.signal);

    await expect(service.waitForMyTasks("a".repeat(64), {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 1,
    }, pageSessionId)).resolves.toMatchObject({
      ok: false,
      code: "WAIT_ALREADY_ACTIVE",
    });
    expect(calls).toBe(1);

    controller.abort(new DOMException("cancel response body", "AbortError"));
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await expect(service.waitForMyTasks("a".repeat(64), {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 1,
    }, pageSessionId)).resolves.toMatchObject({
      ok: true,
      data: { outcome: "TASKS_AVAILABLE", tasks: available.tasks },
    });
    expect(calls).toBe(2);
  });
});
