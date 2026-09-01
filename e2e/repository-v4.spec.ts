import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  POSTMORTEM_TEMPLATE_BODY,
  POSTMORTEM_TEMPLATE_TITLE,
  PRODUCT_DOCUMENT_TEMPLATE_BODY,
  PRODUCT_DOCUMENT_TEMPLATE_TITLE,
  REPOSITORY_SESSION_STORAGE_PREFIX,
  type IssueDocumentKind,
  type IssueSessionBundle,
  type IssueTask,
} from "../src/repository/contracts";

const POSTMORTEM_SELECTION =
  "Describe what happened, when it started, and when service recovered.";

const TEMPLATE_CASES: ReadonlyArray<{
  kind: IssueDocumentKind;
  title: string;
  body: string;
  sections: readonly string[];
}> = [
  {
    kind: "POSTMORTEM",
    title: POSTMORTEM_TEMPLATE_TITLE,
    body: POSTMORTEM_TEMPLATE_BODY,
    sections: [
      "## Summary",
      "## Impact",
      "## Timeline",
      "## Root cause",
      "## Detection and response",
      "## Contributing factors",
      "## Corrective actions",
      "## Learnings",
    ],
  },
  {
    kind: "PRODUCT_DOCUMENT",
    title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
    body: PRODUCT_DOCUMENT_TEMPLATE_BODY,
    sections: [
      "## Problem",
      "## Users and need",
      "## Goals",
      "## Non-goals",
      "## Requirements",
      "## Decisions",
      "## Risks",
      "## Success metrics",
      "## Open questions",
    ],
  },
];

async function launchTemplate(page: Page, kind: IssueDocumentKind): Promise<void> {
  await page.goto("/");
  const picker = page.getByTestId("template-picker");
  await expect(picker).toBeVisible();
  const card = picker.locator(`[data-document-kind="${kind}"]`);
  await expect(card).toBeEnabled();
  await card.click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/);
  await expect(page.getByTestId("repository-workspace")).toBeVisible();
}

async function launchExample(page: Page): Promise<void> {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Open incident example" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/);
  await expect(page.getByTestId("repository-workspace")).toBeVisible();
}

async function readTabSession(page: Page): Promise<IssueSessionBundle> {
  return page.evaluate((prefix) => {
    const key = Object.keys(window.sessionStorage).find((candidate) =>
      candidate.startsWith(prefix));
    if (!key) throw new Error("Repository tab session was not persisted.");
    const value = window.sessionStorage.getItem(key);
    if (!value) throw new Error("Repository tab session was empty.");
    return JSON.parse(value) as IssueSessionBundle;
  }, REPOSITORY_SESSION_STORAGE_PREFIX);
}

async function waitForTask(
  page: Page,
  predicate: (task: IssueTask) => boolean,
): Promise<IssueTask> {
  await expect.poll(async () => {
    const bundle = await readTabSession(page);
    return bundle.surface.tasks.some(predicate);
  }).toBe(true);
  const bundle = await readTabSession(page);
  const task = bundle.surface.tasks.find(predicate);
  if (!task) throw new Error("Created task was absent from the persisted surface.");
  return task;
}

async function submitAgentResult(
  page: Page,
  task: IssueTask,
  replacementText: string,
  expectedOutcome: "PROPOSED" | "COMMITTED",
): Promise<void> {
  const response = await page.evaluate(async ({ prefix, taskId, basedOnRevision, replacement }) => {
    const key = Object.keys(window.sessionStorage).find((candidate) =>
      candidate.startsWith(prefix));
    const raw = key ? window.sessionStorage.getItem(key) : null;
    if (!raw) throw new Error("Repository tab session was unavailable to the agent call.");
    const bundle = JSON.parse(raw) as IssueSessionBundle;
    const result = await fetch("/api/repository-v4/agent/result", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.agentSessionToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "X-Ratiflow-Page-Session": bundle.sessionInstanceId,
      },
      body: JSON.stringify({
        taskId,
        basedOnRevision,
        resultSummary: "Replace the placeholder with the verified incident timing.",
        replacementText: replacement,
        evidenceRefs: ["incident-timeline"],
      }),
    });
    return { status: result.status, body: await result.json() as unknown };
  }, {
    prefix: REPOSITORY_SESSION_STORAGE_PREFIX,
    taskId: task.taskId,
    basedOnRevision: task.anchor.anchorRevision,
    replacement: replacementText,
  });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ ok: true, data: { outcome: expectedOutcome } });
}

async function selectVisibleBodyText(page: Page, selectedText: string): Promise<void> {
  const body = page.getByLabel("Document body");
  await body.evaluate((element: HTMLTextAreaElement, target) => {
    const start = element.value.indexOf(target);
    if (start < 0) throw new Error(`Visible document text was absent: ${target}`);
    element.focus();
    element.setSelectionRange(start, start + target.length - 1);
  }, selectedText);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => body.evaluate((element: HTMLTextAreaElement) =>
    element.value.slice(element.selectionStart, element.selectionEnd))).toMatch(
    /^Describe what happened, when it started, and when service recovered\.?$/u,
  );
  await expect(page.getByTestId("selection-actions")).toBeVisible();
}

function waitForSuccessfulMutation(page: Page, path: string) {
  return page.waitForResponse((response) =>
    response.url().endsWith(path)
    && response.request().method() === "POST"
    && response.ok());
}

function waitForSuccessfulRevisionSave(
  page: Page,
  expected: { title: string; body: string; changeSummary: string },
) {
  return page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/repository-v4/revision/save")
      || response.request().method() !== "POST"
      || !response.ok()
    ) return false;
    try {
      const payload = response.request().postDataJSON() as Record<string, unknown>;
      return payload.title === expected.title
        && payload.body === expected.body
        && payload.changeSummary === expected.changeSummary;
    } catch {
      return false;
    }
  });
}

async function expectMinimumTarget(locator: Locator, minimum = 44): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, "control must have a rendered hit target").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(minimum);
  expect(box!.height).toBeGreaterThanOrEqual(minimum);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("landing offers only the two document templates with their exact section bodies", async ({
  browser,
  baseURL,
}) => {
  for (const template of TEMPLATE_CASES) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto("/");
      const picker = page.getByTestId("template-picker");
      await expect(picker.locator("[data-document-kind]")).toHaveCount(2);
      await expect(picker.locator('[data-document-kind="POSTMORTEM"]')).toContainText("Postmortem");
      await expect(picker.locator('[data-document-kind="PRODUCT_DOCUMENT"]')).toContainText("Product document");

      await picker.locator(`[data-document-kind="${template.kind}"]`).click();
      await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/);
      await expect(page.getByLabel("Document title")).toHaveValue(template.title);
      await expect(page.getByLabel("Document body")).toHaveValue(template.body);
      const headings = (await page.getByLabel("Document body").inputValue())
        .split("\n")
        .filter((line) => line.startsWith("## "));
      expect(headings).toEqual(template.sections);
    } finally {
      await context.close();
    }
  }
});

test("New document bypasses stored resume while Home still resumes the latest issue", async ({
  page,
}) => {
  await launchExample(page);
  const issueUrl = page.url();

  await page.getByRole("button", { name: "New document" }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByTestId("template-picker")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByTestId("template-picker")).toBeVisible();

  await page.getByRole("link", { name: "Ratiflow home" }).click();
  await expect(page).toHaveURL(issueUrl);
  await expect(page.getByTestId("repository-workspace")).toBeVisible();
});

test("completed incident example keeps resolved work, discussion, diffs, and full provenance inspectable", async ({
  page,
}) => {
  await launchExample(page);
  await expect(page.getByLabel(/Open revision history\. Revision 4, Saved/)).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "INC-482 · Checkout outage postmortem",
  );
  const lineage = page.getByTestId("revision-lineage");
  await expect(lineage).toContainText("r1");
  await expect(lineage).toContainText("Data agent · Direct");
  await expect(lineage).toContainText("Logging agent · Direct from r1, safely rebased");
  await expect(lineage).toContainText("Builder agent · Reviewed by Priya Shah");

  const lineageRevision = lineage.getByRole("button", {
    name: /Open r3 revision details: Logging agent/,
  });
  await lineageRevision.focus();
  await lineageRevision.press("Enter");
  await expect(page.getByRole("tab", { name: /^History/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("revision-detail")).toHaveAttribute("data-revision", "3");
  await page.getByRole("button", { name: "All revisions" }).click();
  await page.getByRole("tab", { name: /^Threads/ }).click();

  await page.getByText(/^Done and resolved 3$/).click();
  const taskCards = page.getByTestId("task-card");
  await expect(taskCards).toHaveCount(3);
  for (const taskKey of ["DATA-17", "LOG-22", "CODE-9"]) {
    const card = taskCards.filter({ hasText: taskKey });
    await expect(card).toContainText("Done");
  }

  await taskCards.filter({ hasText: "CODE-9" }).getByRole("button").click();
  const thread = page.getByTestId("thread-detail");
  await expect(thread).toContainText("Review required");
  await expect(thread.getByTestId("thread-message")).toHaveCount(2);
  await expect(thread).toContainText(
    "Provider throttling happened first. Are we overclaiming our code as the root cause?",
  );
  await expect(thread).toContainText("That raised retry traffic to 5.8×");
  await expect(thread).toContainText(
    "Accepted after separating the external trigger from the internal retry amplifier.",
  );
  const proposal = thread.getByTestId("task-proposal");
  await expect(thread).toContainText("Created by Priya Shah");
  await expect(thread).toContainText("Assigned to Sam Rivera");
  await expect(thread).toContainText("Agent label: Builder agent");
  await expect(proposal).toContainText("Agent · paired with Sam Rivera");
  await expect(proposal.locator("del")).toContainText("Investigation in progress.");
  await expect(proposal.locator("ins")).toContainText(
    "Provider throttling triggered the incident.",
  );

  await page.getByRole("tab", { name: /^History/ }).click();
  const revisions = page.getByTestId("revision-card");
  await expect(revisions).toHaveCount(4);
  await page.locator('[data-testid="revision-card"][data-revision="4"] button').click();

  const detail = page.getByTestId("revision-detail");
  await expect(detail).toContainText(
    "Separated the provider trigger from the retry regression that sustained the outage.",
  );
  const diff = detail.getByTestId("revision-diff");
  await expect(diff).toContainText("Investigation in progress.");
  await expect(diff).toContainText("Provider throttling triggered the incident.");

  const provenance = detail.getByTestId("revision-provenance");
  await expect(provenance).toContainText("Parent");
  await expect(provenance).toContainText("r3");
  await expect(provenance).toContainText("Source");
  await expect(provenance).toContainText("r1");
  await expect(provenance).toContainText("Human UI");
  await expect(provenance).toContainText("WebMCP");
  await expect(provenance).toContainText("Committer");
  await expect(provenance).toContainText("Priya Shah");
  await expect(
    provenance.locator("div").filter({ hasText: /^Task ID/ }).locator("dd"),
  ).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  await expect(provenance).toContainText("Authority granted by");
  await expect(provenance).toContainText("Approved by");
  await expect(
    provenance.locator("div").filter({ hasText: /^Revision ID/ }).locator("dd"),
  ).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  await expect(
    provenance.locator("div").filter({ hasText: /^Content digest/ }).locator("dd"),
  ).toHaveText(/^sha256:[0-9a-f]{64}$/u);
  await expect(detail.getByText("View complete r4 snapshot")).toBeVisible();
});

test("a whole-document task is reachable and fixed to comment-only authority", async ({
  page,
}) => {
  await launchTemplate(page, "PRODUCT_DOCUMENT");
  await page.getByRole("button", { name: "Create whole-document comment task" }).click();

  const composer = page.getByRole("dialog", {
    name: "Delegate work with explicit authority",
  });
  await expect(composer.getByTestId("task-target-preview")).toContainText("Whole document · r1");
  await expect(composer.getByRole("radio", { name: /^Comment only/ })).toBeChecked();
  await expect(composer.getByRole("radio", { name: /^Review required/ })).toBeDisabled();
  await expect(composer.getByRole("radio", { name: /^Can edit directly/ })).toBeDisabled();
  await composer.getByLabel("Task instruction").fill(
    "Read the complete product document and report any unresolved assumptions with evidence.",
  );

  const taskCreated = waitForSuccessfulMutation(page, "/api/repository-v4/task/create");
  await composer.getByRole("button", { name: "Create task" }).click();
  await taskCreated;
  const detail = page.getByTestId("thread-detail");
  await expect(detail).toContainText("Whole document");
  await expect(detail).toContainText("Comment only");
  const task = await waitForTask(page, (candidate) => candidate.title === "Review the whole document");
  expect(task.creationAnchor.scope).toBe("DOCUMENT");
  expect(task.anchor.scope).toBe("DOCUMENT");
});

test("accepting a real Review proposal and restoring r1 adopt the authoritative snapshots", async ({
  page,
}) => {
  await launchTemplate(page, "POSTMORTEM");
  await selectVisibleBodyText(page, POSTMORTEM_SELECTION);
  await page.getByTestId("selection-actions").getByRole("button", { name: "Create task" }).click();
  const composer = page.getByRole("dialog", {
    name: "Delegate work with explicit authority",
  });
  await composer.getByLabel("Task title").fill("Verify incident timing");
  await composer.getByLabel("Task instruction").fill(
    "Verify the incident start and recovery times, then propose exact replacement text.",
  );
  const taskCreated = waitForSuccessfulMutation(page, "/api/repository-v4/task/create");
  await composer.getByRole("button", { name: "Create task" }).click();
  await taskCreated;

  const task = await waitForTask(page, (candidate) => candidate.title === "Verify incident timing");
  const replacement = "The incident began at 10:32 UTC and service recovered at 11:04 UTC.";
  await submitAgentResult(page, task, replacement, "PROPOSED");

  const proposal = page.getByTestId("task-proposal");
  await expect(proposal).toBeVisible({ timeout: 15_000 });
  await expect(proposal.locator("del")).toHaveText(POSTMORTEM_SELECTION);
  await expect(proposal.locator("ins")).toHaveText(replacement);
  const accepted = waitForSuccessfulMutation(page, "/api/repository-v4/task/accept");
  await proposal.getByRole("button", { name: "Apply change" }).click();
  await accepted;
  await expect(page.getByLabel(/Open revision history\. Revision 2, Saved/)).toBeVisible();
  await expect(page.getByLabel("Document body")).toHaveValue(
    POSTMORTEM_TEMPLATE_BODY.replace(POSTMORTEM_SELECTION, replacement),
  );
  await expect(page.getByText("A newer revision is available")).toHaveCount(0);

  await page.getByRole("tab", { name: /^History/ }).click();
  await page.locator('[data-testid="revision-card"][data-revision="1"] button').click();
  const restored = waitForSuccessfulMutation(page, "/api/repository-v4/revision/restore");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Restore r1" }).click();
  await restored;
  await expect(page.getByLabel(/Open revision history\. Revision 3, Saved/)).toBeVisible();
  await expect(page.getByLabel("Document body")).toHaveValue(POSTMORTEM_TEMPLATE_BODY);
  await expect(page.getByText("A newer revision is available")).toHaveCount(0);
});

test("a Direct task commits only its selected passage without a Ratiflow approval step", async ({
  page,
}) => {
  await launchTemplate(page, "POSTMORTEM");
  await selectVisibleBodyText(page, POSTMORTEM_SELECTION);
  await page.getByTestId("selection-actions").getByRole("button", { name: "Create task" }).click();

  const composer = page.getByRole("dialog", {
    name: "Delegate work with explicit authority",
  });
  await composer.getByLabel("Task title").fill("Commit verified recovery timing");
  await composer.getByLabel("Task instruction").fill(
    "Verify the incident interval and replace only the assigned passage.",
  );
  await composer.getByRole("radio", { name: /^Can edit directly/ }).check();
  const taskCreated = waitForSuccessfulMutation(page, "/api/repository-v4/task/create");
  await composer.getByRole("button", { name: "Create task" }).click();
  await taskCreated;

  const task = await waitForTask(
    page,
    (candidate) => candidate.title === "Commit verified recovery timing",
  );
  expect(task.mode).toBe("DIRECT");
  const replacement = "The incident began at 10:32 UTC and service recovered at 11:04 UTC.";
  await submitAgentResult(page, task, replacement, "COMMITTED");

  await expect(page.getByLabel("Document body")).toHaveValue(
    POSTMORTEM_TEMPLATE_BODY.replace(POSTMORTEM_SELECTION, replacement),
  );
  await expect(page.getByLabel(/Open revision history\. Revision 2, Saved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply change" })).toHaveCount(0);

  await page.getByRole("tab", { name: /^History/ }).click();
  await page.locator('[data-testid="revision-card"][data-revision="2"] button').click();
  const detail = page.getByTestId("revision-detail");
  const provenance = page.getByTestId("revision-provenance");
  await expect(detail).toContainText("Direct agent commit");
  await expect(provenance).toContainText("WebMCP");
  await expect(provenance).toContainText("Authority granted by");
  await expect(provenance).toContainText("No separate approval");
});

test("a visible passage can start a review-required task and an anchored human discussion", async ({
  page,
}) => {
  await launchTemplate(page, "POSTMORTEM");
  await selectVisibleBodyText(page, POSTMORTEM_SELECTION);

  await page.getByTestId("selection-actions").getByRole("button", { name: "Create task" }).click();
  const taskComposer = page.getByRole("dialog", {
    name: "Delegate work with explicit authority",
  });
  const commentOnly = taskComposer.getByRole("radio", { name: /^Comment only/ });
  const reviewRequired = taskComposer.getByRole("radio", { name: /^Review required/ });
  const direct = taskComposer.getByRole("radio", { name: /^Can edit directly/ });
  await expect(commentOnly).not.toBeChecked();
  await expect(reviewRequired).toBeChecked();
  await expect(direct).not.toBeChecked();
  await taskComposer.getByLabel("Task instruction").fill(
    "Check the incident summary against the available evidence and propose a precise correction.",
  );
  const taskCreated = waitForSuccessfulMutation(page, "/api/repository-v4/task/create");
  await taskComposer.getByRole("button", { name: "Create task" }).click();
  await taskCreated;
  await expect(page.getByTestId("thread-detail")).toContainText("Review required");

  await expect(page.getByTestId("selection-actions")).toBeVisible();
  await page.getByTestId("selection-actions").getByRole("button", { name: "Comment" }).click();
  const commentComposer = page.getByRole("dialog", {
    name: "Start a document discussion",
  });
  await expect(commentComposer.getByTestId("comment-target-preview")).toContainText(
    POSTMORTEM_SELECTION,
  );
  const comment = "Should this summary include the customer-visible recovery time?";
  await commentComposer.getByLabel("Document comment").fill(comment);
  const threadCreated = waitForSuccessfulMutation(page, "/api/repository-v4/thread/create");
  await commentComposer.getByRole("button", { name: "Comment", exact: true }).click();
  await threadCreated;

  const discussion = page.getByTestId("thread-detail");
  await expect(discussion).toContainText(POSTMORTEM_SELECTION);
  await expect(discussion.getByTestId("thread-message")).toContainText(comment);
  await discussion.getByRole("button", { name: "All threads" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("comment-thread-card")).toHaveCount(1);
});

test("explicit human revision save survives reload and the editor works without WebMCP", async ({
  page,
}) => {
  await launchTemplate(page, "PRODUCT_DOCUMENT");
  expect(await page.evaluate(() => ({
    documentModelContext: "modelContext" in document,
    navigatorModelContext: "modelContext" in navigator,
  }))).toEqual({ documentModelContext: false, navigatorModelContext: false });
  await expect(page.getByTestId("agent-connection-status")).toContainText(
    "Human collaboration still works",
  );

  const title = "Checkout recovery requirements";
  const body = "## Problem\n\nCheckout recovery has no agreed customer-facing success threshold.";
  const changeSummary = "Clarify checkout recovery criteria.";
  await page.getByLabel("Document title").fill(title);
  await page.getByLabel("Document body").fill(body);
  const summary = page.getByLabel("Change summary");
  await expect(summary).toBeEnabled();
  await expect(summary).not.toHaveValue("");
  await summary.fill(changeSummary);

  const saved = waitForSuccessfulRevisionSave(page, { title, body, changeSummary });
  await page.getByTestId("save-revision").click();
  await saved;
  await expect(page.getByLabel(/Open revision history\. Revision 2, Saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(title);
  await expect(page.getByLabel("Document body")).toHaveValue(body);
  await expect(page.getByLabel(/Open revision history\. Revision 2, Saved/)).toBeVisible();
  await expect(page.getByLabel("Document body")).toBeEditable();
});

test("a clean shared URL joins a second human and preserves their draft across remote revisions", async ({
  browser,
  baseURL,
}) => {
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await launchTemplate(first, "PRODUCT_DOCUMENT");
    const shareUrl = first.url();
    await second.goto(shareUrl);
    await expect(second.getByRole("heading", { name: "Join this document" })).toBeVisible();
    await expect(second.getByRole("button", { name: "Join document" })).toBeDisabled();
    await second.getByLabel("Your display name").fill("Nadia Chen");
    await second.getByRole("button", { name: "Join document" }).click();
    await expect(second.getByTestId("repository-workspace")).toBeVisible();

    const firstSession = await readTabSession(first);
    const secondSession = await readTabSession(second);
    expect(secondSession.surface.document.id).toBe(firstSession.surface.document.id);
    expect(secondSession.selfMemberId).not.toBe(firstSession.selfMemberId);
    expect(
      secondSession.surface.members.find((member) => member.memberId === secondSession.selfMemberId)?.displayName,
    ).toBe("Nadia Chen");

    const sharedBody = `${PRODUCT_DOCUMENT_TEMPLATE_BODY}\n\nShared finding from the first collaborator.`;
    await first.getByLabel("Document body").fill(sharedBody);
    await first.getByLabel("Change summary").fill("Share the first collaborator finding.");
    const firstSave = waitForSuccessfulRevisionSave(first, {
      title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
      body: sharedBody,
      changeSummary: "Share the first collaborator finding.",
    });
    await first.getByTestId("save-revision").click();
    await firstSave;
    await expect(second.getByLabel("Document body")).toHaveValue(sharedBody, {
      timeout: 15_000,
    });

    const secondDraft = `${sharedBody}\n\nUnpublished second-collaborator draft.`;
    await second.getByLabel("Document body").fill(secondDraft);
    await second.getByLabel("Change summary").fill("Keep the local draft deliberate.");

    const laterBody = `${sharedBody}\n\nA newer committed constraint.`;
    await first.getByLabel("Document body").fill(laterBody);
    await first.getByLabel("Change summary").fill("Add the committed constraint.");
    const laterSave = waitForSuccessfulRevisionSave(first, {
      title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
      body: laterBody,
      changeSummary: "Add the committed constraint.",
    });
    await first.getByTestId("save-revision").click();
    await laterSave;

    const conflict = second.getByText("A newer revision is available");
    await expect(conflict).toBeVisible({ timeout: 15_000 });
    await expect(second.getByLabel("Document body")).toHaveValue(secondDraft);
    await second.getByRole("button", { name: "Use latest" }).click();
    await expect(second.getByLabel("Document body")).toHaveValue(laterBody);
    await expect(conflict).toHaveCount(0);
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});

test("390px workspace keeps drawer, history, and authority controls usable without overflow", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await launchTemplate(page, "POSTMORTEM");
    await expectNoHorizontalOverflow(page);

    const railToggle = page.getByRole("button", { name: /^Threads and history/ });
    const rail = page.getByRole("complementary", { name: "Threads and history" });
    await expect(rail).toBeHidden();
    await expectMinimumTarget(page.getByRole("button", { name: "New document" }));
    await expectMinimumTarget(page.getByRole("button", { name: "Share" }));
    await expectMinimumTarget(page.getByTestId("save-revision"));
    await expectMinimumTarget(railToggle);

    await railToggle.click();
    await expect(rail).toBeVisible();
    await expect(rail).toBeInViewport();
    await expect(page.getByRole("heading", { name: "Collaboration" })).toBeFocused();
    await expect(page.getByTestId("editor-pane")).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    expect(await rail.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(rail).toBeHidden();
    await expect(railToggle).toBeFocused();
    await expect(page.getByTestId("editor-pane")).not.toHaveAttribute("inert", "");

    await railToggle.click();
    await expect(rail).toBeVisible();
    await expectMinimumTarget(page.getByRole("button", {
      name: "Create whole-document comment task",
    }));
    const threadsTab = page.getByRole("tab", { name: /^Threads/ });
    const historyTab = page.getByRole("tab", { name: /^History/ });
    await expectMinimumTarget(threadsTab);
    await expectMinimumTarget(historyTab);
    await historyTab.click();
    await expect(page.locator('[data-testid="revision-card"][data-revision="1"]')).toBeVisible();
    await page.locator('[data-testid="revision-card"][data-revision="1"] button').click();
    await expect(page.getByTestId("revision-provenance")).toBeVisible();
    await expectMinimumTarget(page.getByText("View complete r1 snapshot"));
    const closeRail = page.getByRole("button", { name: "Close threads and history" });
    await expectMinimumTarget(closeRail);
    await closeRail.click();

    await selectVisibleBodyText(page, POSTMORTEM_SELECTION);
    await page.getByTestId("selection-actions").getByRole("button", { name: "Create task" }).click();
    const composer = page.getByRole("dialog", {
      name: "Delegate work with explicit authority",
    });
    const review = composer.getByRole("radio", { name: /^Review required/ });
    await expect(review).toBeChecked();
    for (const radio of [
      composer.getByRole("radio", { name: /^Comment only/ }),
      review,
      composer.getByRole("radio", { name: /^Can edit directly/ }),
    ]) {
      await expectMinimumTarget(radio.locator(".."));
    }
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});
