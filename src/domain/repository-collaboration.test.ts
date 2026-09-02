import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LocalRepositoryService } from "@/domain/repository-service";
import type { RepositoryResult } from "@/repository/contracts";
import { issuePointLength } from "@/repository/range";

function ok<T>(result: RepositoryResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}

function bodyAnchor(body: string, selectedText: string) {
  const codeUnitStart = body.indexOf(selectedText);
  expect(codeUnitStart).toBeGreaterThanOrEqual(0);
  const rangeStart = issuePointLength(body.slice(0, codeUnitStart));
  return {
    scope: "SELECTION" as const,
    field: "BODY" as const,
    rangeStart,
    rangeEnd: rangeStart + issuePointLength(selectedText),
  };
}

describe("comment-first repository collaboration", () => {
  it("binds duplicate self-declared names to owners and atomically compiles an exact mention", async () => {
    const service = new LocalRepositoryService();
    const owner = ok(await service.launch({ kind: "POSTMORTEM", displayName: "Priya Shah" }));
    const first = ok(await service.join({ shareToken: owner.shareToken, displayName: "Nadia Chen" }));
    const second = ok(await service.join({ shareToken: owner.shareToken, displayName: "Leo Park" }));
    const firstPage = randomUUID();
    const secondPage = randomUUID();
    const firstProfile = ok(await service.connectAgent(first.agentSessionToken, {
      requestId: randomUUID(), name: "Databot",
    }, firstPage));
    ok(await service.connectAgent(second.agentSessionToken, {
      requestId: randomUUID(), name: "Databot",
    }, secondPage));
    const before = ok(await service.inspect(owner.humanSessionToken));
    expect(before.agents.map(({ name, member }) => `${name} · ${member.displayName}`)).toEqual([
      "Databot · Leo Park",
      "Databot · Nadia Chen",
    ]);

    const selectedText = "Describe what happened, when it started, and when service recovered.";
    const visible = "@Databot \tReplace this with verified numbers.\n";
    const created = ok(await service.createMentionTask(owner.humanSessionToken, {
      requestId: randomUUID(),
      expectedRevision: 1,
      comment: visible,
      mentionedAgentName: "Databot",
      assignedToMemberId: first.selfMemberId,
      anchor: bodyAnchor(before.document.body, selectedText),
    }));
    expect(created.tasks).toHaveLength(1);
    expect(created.tasks[0]).toMatchObject({
      taskKey: "TASK-1",
      title: "Replace this with verified numbers.",
      instruction: "Replace this with verified numbers.",
      category: "GENERAL",
      mode: "DIRECT",
      agentLabel: "Databot",
      agentProfileId: firstProfile.profile.profileId,
      context: { sourceRevision: 1, targetText: selectedText },
    });
    expect(created.threads[0]?.comments[0]).toMatchObject({ body: visible, createdRevision: 1 });
    expect(created.document.activityVersion).toBe(2);
  });

  it("requires page identity, keeps assignment snapshots across rename, and blocks ABA-stale pages", async () => {
    const service = new LocalRepositoryService();
    const owner = ok(await service.launch({ kind: "POSTMORTEM", displayName: "Priya Shah" }));
    const agent = ok(await service.join({ shareToken: owner.shareToken, displayName: "Sam Rivera" }));
    const pageX = randomUUID();
    const pageY = randomUUID();
    const pageX2 = randomUUID();
    const missing = await service.listMyTasks(agent.agentSessionToken, {}, pageX);
    expect(missing).toMatchObject({ ok: false, code: "AGENT_IDENTITY_REQUIRED" });
    const x = ok(await service.connectAgent(agent.agentSessionToken, {
      requestId: randomUUID(), name: "Builder",
    }, pageX));
    const surface = ok(await service.inspect(owner.humanSessionToken));
    const target = "Distinguish the triggering event from the system condition that amplified it.";
    const created = ok(await service.createMentionTask(owner.humanSessionToken, {
      requestId: randomUUID(), expectedRevision: 1,
      comment: "@Builder Rewrite this as a crisp root-cause statement.",
      mentionedAgentName: "Builder", assignedToMemberId: agent.selfMemberId,
      anchor: bodyAnchor(surface.document.body, target),
    }));
    const task = created.tasks[0]!;
    expect(task).toMatchObject({ taskKey: "TASK-1", mode: "DIRECT", category: "GENERAL", agentLabel: "Builder" });
    expect(task.context?.priorContext.map(({ activityVersion }) => activityVersion)).toEqual([1]);

    const renamed = ok(await service.connectAgent(agent.agentSessionToken, {
      requestId: randomUUID(), name: "Writer",
    }, pageY));
    expect(renamed.profile.profileId).toBe(x.profile.profileId);
    const staleX = await service.listMyTasks(agent.agentSessionToken, {}, pageX);
    expect(staleX).toMatchObject({ ok: false, code: "STALE_AGENT_PROFILE" });
    const completed = ok(await service.submitTaskResult(agent.agentSessionToken, {
      requestId: randomUUID(), taskId: task.taskId, basedOnRevision: 1,
      resultSummary: "Separated the external trigger from the internal amplifier.",
      replacementText: "Provider throttling was the trigger; immediate retries were the internal amplifier.",
      evidenceRefs: ["checkout.log"],
    }, pageY));
    expect(completed.outcome).toBe("COMMITTED");
    if (completed.outcome !== "COMMITTED") return;
    expect(completed.task.agentLabel).toBe("Builder");
    expect(completed.task.result?.submittedBy).toMatchObject({
      displayName: "Writer", agentLabel: "Writer", agentProfileId: x.profile.profileId,
    });
    expect(completed.revision.changeSummary).toBe("Separated the external trigger from the internal amplifier.");

    ok(await service.connectAgent(agent.agentSessionToken, {
      requestId: randomUUID(), name: "Builder",
    }, pageX2));
    const aba = await service.listMyTasks(agent.agentSessionToken, { includeResolved: true }, pageX);
    expect(aba).toMatchObject({ ok: false, code: "STALE_AGENT_PROFILE" });
  });

  it("touches profiles once per committed connect/comment/result while reads remain no-touch", async () => {
    const service = new LocalRepositoryService();
    const owner = ok(await service.launch({ kind: "PRODUCT_DOCUMENT", displayName: "Jordan Lee" }));
    const agent = ok(await service.join({ shareToken: owner.shareToken, displayName: "Avery Singh" }));
    const page = randomUUID();
    const requestId = randomUUID();
    const first = ok(await service.connectAgent(agent.agentSessionToken, { requestId, name: "ChatGPT" }, page));
    const replay = ok(await service.connectAgent(agent.agentSessionToken, { requestId, name: "ChatGPT" }, page));
    expect(first.profile.accessCount).toBe(1);
    expect(replay.profile.accessCount).toBe(1);
    ok(await service.inspectAsAgent(agent.agentSessionToken, page));
    ok(await service.readHistoryAsAgent(agent.agentSessionToken, {}, page));
    ok(await service.readCollaborationContext(agent.agentSessionToken, {}, page));
    ok(await service.listMyTasks(agent.agentSessionToken, {}, page));
    const afterReads = ok(await service.inspect(owner.humanSessionToken));
    expect(afterReads.agents[0]?.accessCount).toBe(1);
  });

  it("keeps generic reads human-only and agent reads connected to one page", async () => {
    const service = new LocalRepositoryService();
    const owner = ok(await service.launch({ kind: "POSTMORTEM", displayName: "Priya Shah" }));

    ok(await service.inspect(owner.humanSessionToken));
    ok(await service.readHistory(owner.humanSessionToken, {}));
    ok(await service.readRevision(owner.humanSessionToken, 1));

    const genericAgentReads = await Promise.all([
      service.inspect(owner.agentSessionToken),
      service.readHistory(owner.agentSessionToken, {}),
      service.readRevision(owner.agentSessionToken, 1),
    ]);
    for (const result of genericAgentReads) {
      expect(result).toMatchObject({
        ok: false,
        code: "UNAUTHORIZED",
        message: "A valid human session is required.",
      });
    }

    const page = randomUUID();
    expect(await service.inspectAsAgent(owner.agentSessionToken, page)).toMatchObject({
      ok: false,
      code: "AGENT_IDENTITY_REQUIRED",
    });
    ok(await service.connectAgent(owner.agentSessionToken, {
      requestId: randomUUID(),
      name: "Contextbot",
    }, page));
    ok(await service.inspectAsAgent(owner.agentSessionToken, page));
    ok(await service.readHistoryAsAgent(owner.agentSessionToken, {}, page));
    ok(await service.readRevisionAsAgent(owner.agentSessionToken, 1, page));
  });

  it("snapshots compatibility proposal and rejection context from the immutable task instruction", async () => {
    const service = new LocalRepositoryService();
    const owner = ok(await service.launch({ kind: "POSTMORTEM", displayName: "Priya Shah" }));
    const agent = ok(await service.join({ shareToken: owner.shareToken, displayName: "Sam Rivera" }));
    const page = randomUUID();
    ok(await service.connectAgent(agent.agentSessionToken, {
      requestId: randomUUID(), name: "Builder",
    }, page));
    const initial = ok(await service.inspect(owner.humanSessionToken));
    const reviewTarget = "Describe what happened, when it started, and when service recovered.";
    const instruction = `Review the evidence boundary: ${"e".repeat(650)}`;
    const created = ok(await service.createTask(owner.humanSessionToken, {
      requestId: randomUUID(),
      expectedRevision: 1,
      title: "Compatibility review",
      category: "GENERAL",
      instruction,
      agentLabel: "Builder",
      mode: "REVIEW",
      assignedToMemberId: agent.selfMemberId,
      anchor: bodyAnchor(initial.document.body, reviewTarget),
    }));
    const reviewTask = created.tasks[0]!;
    const proposalExcerpt = "Proposal prose must not enter later prior context.";
    const proposed = ok(await service.submitTaskResult(agent.agentSessionToken, {
      requestId: randomUUID(),
      taskId: reviewTask.taskId,
      basedOnRevision: 1,
      resultSummary: proposalExcerpt,
      replacementText: "The incident began at 09:17 UTC and recovered at 09:55 UTC.",
    }, page));
    expect(proposed.outcome).toBe("PROPOSED");
    const rejectionExcerpt = "Rejection prose must not enter later prior context.";
    ok(await service.rejectTaskProposal(owner.humanSessionToken, {
      requestId: randomUUID(),
      taskId: reviewTask.taskId,
      expectedRevision: 1,
      note: rejectionExcerpt,
    }));

    const mentionTarget = "Quantify affected customers, failed operations, and data integrity.";
    const mentioned = ok(await service.createMentionTask(owner.humanSessionToken, {
      requestId: randomUUID(),
      expectedRevision: 1,
      comment: "@Builder Replace this placeholder with the verified impact statement.",
      mentionedAgentName: "Builder",
      assignedToMemberId: agent.selfMemberId,
      anchor: bodyAnchor(initial.document.body, mentionTarget),
    }));
    const priorContext = mentioned.tasks.find(({ taskKey }) => taskKey === "TASK-2")?.context?.priorContext;
    const truncatedInstruction = Array.from(instruction).slice(0, 600).join("");
    expect(priorContext?.map(({ activityVersion }) => activityVersion)).toEqual([4, 3, 2, 1]);
    expect(priorContext?.slice(0, 3).map(({ kind, excerpt }) => [kind, excerpt])).toEqual([
      ["TASK_REJECTED", truncatedInstruction],
      ["TASK_PROPOSED", truncatedInstruction],
      ["TASK_CREATED", truncatedInstruction],
    ]);
    expect(issuePointLength(priorContext?.[0]?.excerpt ?? "")).toBe(600);
    expect(JSON.stringify(priorContext)).not.toContain(proposalExcerpt);
    expect(JSON.stringify(priorContext)).not.toContain(rejectionExcerpt);
  });

  it("builds completed Postmortem and Product examples with continuity history", async () => {
    const service = new LocalRepositoryService();
    const postmortem = ok(await service.launchExample({ kind: "POSTMORTEM", displayName: "Quinn Patel" }));
    expect(postmortem.surface.document).toMatchObject({ revision: 5, activityVersion: 11 });
    expect(postmortem.surface.document.body).toContain("| Outcome | Count |");
    expect(postmortem.surface.document.body).toContain("```chart");
    expect(postmortem.surface.agents.map(({ name, accessCount }) => [name, accessCount])).toEqual([
      ["Builder", 3], ["Databot", 2], ["Logbot", 2],
    ]);
    expect(postmortem.surface.agents.some(({ member }) => member.displayName === "Quinn Patel")).toBe(false);
    const page = randomUUID();
    const connected = ok(await service.connectAgent(postmortem.agentSessionToken, {
      requestId: randomUUID(), name: "Contextbot",
    }, page));
    expect(connected.profile).toMatchObject({ name: "Contextbot", accessCount: 1 });
    const context = ok(await service.readCollaborationContext(postmortem.agentSessionToken, { limit: 5 }, page));
    expect(context.events.map(({ activityVersion }) => activityVersion)).toEqual([11, 10, 9, 8, 7]);
    expect(context.nextBeforeActivityVersion).toBe(7);
    expect(context.events[1]).toMatchObject({ kind: "TASK_COMPLETED", documentRevision: 5 });

    const product = ok(await service.launchExample({ kind: "PRODUCT_DOCUMENT", displayName: "Quinn Patel" }));
    expect(product.surface.document).toMatchObject({ revision: 6, activityVersion: 11 });
    expect(product.surface.document.body).toContain("| Option | Reliability |");
    expect(product.surface.document.body).toContain("full GA on November 1");
    const history = product.surface.history;
    expect(history[0]).toMatchObject({ revision: 6, provenance: { authority: "RESTORE", restoredRevision: 4 } });
    expect(history[0]?.contentDigest).toBe(history.find(({ revision }) => revision === 4)?.contentDigest);
    expect(history.find(({ revision }) => revision === 5)?.changeSummary).toBe("Edited the document.");
    const expectedDigest = `sha256:${createHash("sha256")
      .update(JSON.stringify({ title: product.surface.document.title, body: product.surface.document.body }), "utf8")
      .digest("hex")}`;
    expect(history[0]?.contentDigest).toBe(expectedDigest);
  });

  it("seeds reset profiles at zero with three comment-first Direct mentions and no connection", async () => {
    const service = new LocalRepositoryService();
    const reset = ok(await service.resetPostmortemHero());
    expect(reset).toMatchObject({ revision: 1, activityVersion: 4 });
    const encoded = reset.nadiaBootstrapPath.split("#ratiflow-bootstrap=")[1]!;
    const bundle = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      agentSessionToken: string;
      sessionInstanceId: string;
      surface: { agents: Array<{ name: string; accessCount: number }>; tasks: Array<{ taskKey: string; mode: string }> };
    };
    expect(bundle.surface.agents.map(({ name, accessCount }) => [name, accessCount])).toEqual([
      ["Builder", 0], ["Databot", 0], ["Logbot", 0],
    ]);
    expect(bundle.surface.tasks.map(({ taskKey, mode }) => [taskKey, mode]).sort()).toEqual([
      ["TASK-1", "DIRECT"], ["TASK-2", "DIRECT"], ["TASK-3", "DIRECT"],
    ]);
    const beforeConnect = await service.listMyTasks(bundle.agentSessionToken, {}, randomUUID());
    expect(beforeConnect).toMatchObject({ ok: false, code: "AGENT_IDENTITY_REQUIRED" });
  });
});
