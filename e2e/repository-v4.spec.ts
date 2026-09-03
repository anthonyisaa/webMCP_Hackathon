import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  MANAGED_AGENT_MODEL,
  MANAGED_AGENT_RUNTIME,
  MANAGED_AGENT_TOOL_CATALOGS,
  RELAY_BOUNDS,
  type ManagedAgentDirectoryEntry,
  type RelayRun,
  type RelayTraceEvent,
  type RelayWorkspaceState,
} from "../src/agent-relay/contracts";
import {
  POSTMORTEM_TEMPLATE_BODY,
  POSTMORTEM_TEMPLATE_TITLE,
  PRODUCT_DOCUMENT_TEMPLATE_BODY,
  PRODUCT_DOCUMENT_TEMPLATE_TITLE,
  REPOSITORY_TOOL_NAMES,
  REPOSITORY_SESSION_STORAGE_PREFIX,
  type IssueAgentProfile,
  type IssueDocumentKind,
  type IssueSessionBundle,
  type IssueTask,
} from "../src/repository/contracts";

const PERSON_NAME = "Quinn Patel";
const POSTMORTEM_SELECTION =
  "Describe what happened, when it started, and when service recovered.";
const MANAGED_CODE_PROFILE_ID = "00000000-0000-4000-8000-000000004202";
const MANAGED_RELAY_RUN_ID = "00000000-0000-4000-8000-000000004212";
const MANAGED_RELAY_TASK_ID = "00000000-0000-4000-8000-000000004222";
const MANAGED_RELAY_THREAD_ID = "00000000-0000-4000-8000-000000004232";
const MANAGED_RELAY_COMMENT_ID = "00000000-0000-4000-8000-000000004242";
const MANAGED_RELAY_TIMESTAMP = "2026-09-03T09:00:00.000Z";

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
      "Summary",
      "Impact",
      "Timeline",
      "Root cause",
      "Detection and response",
      "Contributing factors",
      "Corrective actions",
      "Learnings",
    ],
  },
  {
    kind: "PRODUCT_DOCUMENT",
    title: PRODUCT_DOCUMENT_TEMPLATE_TITLE,
    body: PRODUCT_DOCUMENT_TEMPLATE_BODY,
    sections: [
      "Problem",
      "Users and need",
      "Goals",
      "Non-goals",
      "Requirements",
      "Decisions",
      "Risks",
      "Success metrics",
      "Open questions",
    ],
  },
];

function managedAgent(
  specialty: ManagedAgentDirectoryEntry["specialty"],
  profileId: string,
  principalId: string,
): ManagedAgentDirectoryEntry {
  const displayName = specialty === "DATA"
    ? "Data"
    : specialty === "CODE"
      ? "Code"
      : "General";
  return {
    kind: "AGENT",
    profileId,
    principal: {
      memberId: principalId,
      displayName: `${displayName} · managed agent`,
    },
    handle: displayName.toLocaleLowerCase(),
    displayName,
    scope: specialty === "DATA" ? "COMPANY" : specialty === "CODE" ? "TEAM" : "PERSONAL",
    readiness: "READY",
    identitySource: "DEMO_DIRECTORY",
    specialty,
    runtime: MANAGED_AGENT_RUNTIME,
    logicalToolNames: [...MANAGED_AGENT_TOOL_CATALOGS[specialty]],
    syntheticSourceLabels: [`Synthetic demo data · ${specialty.toLocaleLowerCase()} smoke fixture`],
  };
}

const MANAGED_DIRECTORY = [
  managedAgent(
    "DATA",
    "00000000-0000-4000-8000-000000004201",
    "00000000-0000-4000-8000-000000004301",
  ),
  managedAgent(
    "CODE",
    MANAGED_CODE_PROFILE_ID,
    "00000000-0000-4000-8000-000000004302",
  ),
  managedAgent(
    "GENERAL",
    "00000000-0000-4000-8000-000000004203",
    "00000000-0000-4000-8000-000000004303",
  ),
] as const satisfies readonly ManagedAgentDirectoryEntry[];

const MANAGED_QUEUED_RUN: RelayRun = {
  runId: MANAGED_RELAY_RUN_ID,
  taskId: MANAGED_RELAY_TASK_ID,
  profileId: MANAGED_CODE_PROFILE_ID,
  specialty: "CODE",
  runtime: MANAGED_AGENT_RUNTIME,
  model: MANAGED_AGENT_MODEL,
  status: "QUEUED",
  attemptCount: 0,
  maxAttempts: RELAY_BOUNDS.maxAttemptsPerRun,
  terminalReason: null,
  createdAt: MANAGED_RELAY_TIMESTAMP,
  updatedAt: MANAGED_RELAY_TIMESTAMP,
  completedAt: null,
};

const MANAGED_QUEUED_TRACE: RelayTraceEvent = {
  relayEventId: "00000000-0000-4000-8000-000000004252",
  relayEventVersion: 1,
  documentId: "00000000-0000-4000-8000-000000004262",
  runId: MANAGED_RELAY_RUN_ID,
  attemptId: null,
  kind: "RUN_QUEUED",
  logicalToolName: null,
  physicalToolName: null,
  manifestDigest: null,
  argumentsDigest: null,
  resultDigest: null,
  detail: {},
  createdAt: MANAGED_RELAY_TIMESTAMP,
};

function managedRelayState(queued: boolean): RelayWorkspaceState {
  return {
    directory: [...MANAGED_DIRECTORY],
    runs: queued ? [MANAGED_QUEUED_RUN] : [],
    activeAttempt: null,
    trace: queued ? [MANAGED_QUEUED_TRACE] : [],
    currentRelayEventVersion: queued ? 1 : 0,
    webMcpRequired: true,
    recoveryHeartbeatMs: RELAY_BOUNDS.recoveryHeartbeatMs,
  };
}

async function nameLanding(page: Page, name = PERSON_NAME): Promise<void> {
  await expect(page.getByLabel("What should collaborators call you?")).toBeVisible();
  await page.getByLabel("What should collaborators call you?").fill(name);
}

async function launchTemplate(
  page: Page,
  kind: IssueDocumentKind,
  name = PERSON_NAME,
): Promise<void> {
  await page.goto("/");
  await nameLanding(page, name);
  await page.getByText("Prefer a blank document?", { exact: true }).click();
  const label = kind === "POSTMORTEM"
    ? "Blank postmortem"
    : "Blank product document";
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/u);
  await expect(page.getByTestId("repository-workspace")).toBeVisible();
}

async function launchExample(
  page: Page,
  kind: IssueDocumentKind,
  name = PERSON_NAME,
): Promise<void> {
  await page.goto("/");
  await nameLanding(page, name);
  const card = page.getByTestId("template-picker").locator(
    `[data-document-kind="${kind}"]`,
  );
  await expect(card).toBeEnabled();
  await card.click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/u);
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

async function connectCurrentAgent(
  page: Page,
  name: string,
): Promise<IssueAgentProfile> {
  const response = await page.evaluate(async ({ prefix, agentName }) => {
    const key = Object.keys(window.sessionStorage).find((candidate) =>
      candidate.startsWith(prefix));
    const raw = key ? window.sessionStorage.getItem(key) : null;
    if (!raw) throw new Error("Repository tab session was unavailable.");
    const bundle = JSON.parse(raw) as IssueSessionBundle;
    const result = await fetch("/api/repository-v4/agent/connect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.agentSessionToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "X-Ratiflow-Page-Session": bundle.sessionInstanceId,
      },
      body: JSON.stringify({ name: agentName }),
    });
    return {
      status: result.status,
      body: await result.json() as {
        ok: boolean;
        data?: { profile?: IssueAgentProfile };
      },
    };
  }, { prefix: REPOSITORY_SESSION_STORAGE_PREFIX, agentName: name });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    ok: true,
    data: { profile: { name, identitySource: "SELF_DECLARED" } },
  });
  const profile = response.body.data?.profile;
  if (!profile) throw new Error("Connected agent profile was absent.");
  return profile;
}

async function waitForTask(
  page: Page,
  predicate: (task: IssueTask) => boolean,
): Promise<IssueTask> {
  await expect.poll(async () => {
    const bundle = await readTabSession(page);
    return bundle.surface.tasks.some(predicate);
  }).toBe(true);
  const task = (await readTabSession(page)).surface.tasks.find(predicate);
  if (!task) throw new Error("Created task was absent from the persisted surface.");
  return task;
}

async function submitAgentResult(
  page: Page,
  task: IssueTask,
  input: { resultSummary: string; replacementText: string; evidenceRefs: string[] },
): Promise<void> {
  const response = await page.evaluate(async ({ prefix, taskId, basedOnRevision, result }) => {
    const key = Object.keys(window.sessionStorage).find((candidate) =>
      candidate.startsWith(prefix));
    const raw = key ? window.sessionStorage.getItem(key) : null;
    if (!raw) throw new Error("Repository tab session was unavailable to the agent call.");
    const bundle = JSON.parse(raw) as IssueSessionBundle;
    const submitted = await fetch("/api/repository-v4/agent/result", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.agentSessionToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "X-Ratiflow-Page-Session": bundle.sessionInstanceId,
      },
      body: JSON.stringify({ taskId, basedOnRevision, ...result }),
    });
    return { status: submitted.status, body: await submitted.json() as unknown };
  }, {
    prefix: REPOSITORY_SESSION_STORAGE_PREFIX,
    taskId: task.taskId,
    basedOnRevision: task.anchor.anchorRevision,
    result: input,
  });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ ok: true, data: { outcome: "COMMITTED" } });
}

async function selectRenderedText(page: Page, selectedText: string): Promise<void> {
  const rendered = page.getByTestId("rendered-document-body");
  await expect(rendered).toBeVisible();
  await rendered.evaluate((root, target) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.textContent ?? "";
      const start = value.indexOf(target);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + target.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        (node.parentElement ?? root).dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
        return;
      }
      node = walker.nextNode();
    }
    throw new Error(`Rendered document text was absent: ${target}`);
  }, selectedText);
  const composer = page.getByTestId("selection-comment-composer");
  await expect(composer).toBeVisible();
  await expect(composer.locator("blockquote")).toHaveText(selectedText);
}

function waitForSuccessfulMutation(page: Page, path: string) {
  return page.waitForResponse((response) =>
    response.url().endsWith(path)
    && response.request().method() === "POST"
    && response.ok());
}

async function openCommentsRail(page: Page): Promise<Locator> {
  const rail = page.getByRole("complementary", {
    name: "Comments, history, and relay",
  });
  if (!(await rail.isVisible())) {
    await page.getByRole("button", { name: /^Comments(?: \d+)?$/u }).first().click();
  }
  await expect(rail).toBeVisible();
  return rail;
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

test("v4.2 landing gates its two blank templates on a human name and renders both Markdown documents", async ({
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
      await expect(picker.locator('[data-document-kind="POSTMORTEM"]')).toBeDisabled();
      await expect(picker.locator('[data-document-kind="PRODUCT_DOCUMENT"]')).toBeDisabled();
      await page.getByText("Prefer a blank document?", { exact: true }).click();
      await expect(page.getByRole("button", {
        name: "Blank postmortem",
        exact: true,
      })).toBeDisabled();

      await nameLanding(page);
      const blankLabel = template.kind === "POSTMORTEM"
        ? "Blank postmortem"
        : "Blank product document";
      await page.getByRole("button", { name: blankLabel, exact: true }).click();
      await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/u);

      const bundle = await readTabSession(page);
      expect(bundle.surface.document).toMatchObject({
        kind: template.kind,
        title: template.title,
        body: template.body,
        revision: 1,
      });
      await expect(page.getByRole("heading", { level: 1, name: template.title })).toBeVisible();
      const rendered = page.getByTestId("rendered-document-body");
      for (const section of template.sections) {
        await expect(rendered.getByRole("heading", {
          name: section,
          exact: true,
        })).toBeVisible();
      }
      await expect(rendered.getByText(/^## /u)).toHaveCount(0);
      await expect(page.getByLabel("Markdown source")).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test("v4.2 Advanced BYOA guides one page-scoped agent from a named prompt to a truthful connected state", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      execute: (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
    };
    const active = new Map<string, RegisteredTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
          active.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => {
            if (active.get(tool.name) === tool) active.delete(tool.name);
          }, { once: true });
        },
      },
    });
    Object.defineProperty(window, "__ratiflowRepositorySetupHarness", {
      configurable: true,
      value: {
        names: () => [...active.keys()],
        invoke: (name: string, input: unknown) => active.get(name)?.execute(
          input,
          { signal: new AbortController().signal },
        ),
      },
    });
  });
  const page = await context.newPage();

  try {
    await launchTemplate(page, "POSTMORTEM");
    await expect(page.getByRole("heading", {
      name: "Select a passage. Mention a specialist. Watch the proof.",
    })).toBeVisible();
    await page.getByText("Advanced: bring your own agent", { exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowRepositorySetupHarness: { names: () => string[] };
      }).__ratiflowRepositorySetupHarness;
      return harness.names();
    })).toHaveLength(8);

    await page.getByLabel("Agent name").fill("Contextbot");
    await expect(page.getByText(/Connect to this Ratiflow document as "Contextbot"/u)).toBeVisible();
    await page.getByRole("button", { name: "Copy agent prompt" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
      'Connect to this Ratiflow document as "Contextbot".',
    );

    const connected = await page.evaluate(async () => {
      const harness = (window as unknown as {
        __ratiflowRepositorySetupHarness: {
          invoke: (name: string, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowRepositorySetupHarness;
      return harness.invoke("connect_agent", { name: "Contextbot" });
    }) as { structuredContent: { ok: boolean; profile: IssueAgentProfile } };
    expect(connected.structuredContent).toMatchObject({
      ok: true,
      profile: {
        name: "Contextbot",
        member: { displayName: PERSON_NAME },
      },
    });

    await expect(page.getByText("Advanced: Contextbot connected", {
      exact: true,
    })).toBeVisible();
    await expect(page.getByText("Connected for this page · owned by Quinn Patel")).toBeVisible();
    await page.getByRole("button", { name: "Close agent setup" }).click();
    const status = page.getByRole("button", { name: /Open agent guide\.$/u });
    await expect(status).toBeVisible();
    await status.click();
    await expect(page.getByRole("heading", {
      name: "Select a passage. Mention a specialist. Watch the proof.",
    })).toBeVisible();
    await page.getByText("Advanced: Contextbot connected", { exact: true }).click();
    await expect(page.getByText("Connected for this page · owned by Quinn Patel")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("v4.2 Home and /new always show setup while the issue URL resumes its document", async ({ page }) => {
  await launchExample(page, "POSTMORTEM");
  const issueUrl = page.url();

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByLabel("What should collaborators call you?")).toBeVisible();
  await expect(page.getByText("Your specialist directory")).toBeVisible();

  await page.goto(issueUrl);
  await expect(page.getByRole("heading", {
    level: 1,
    name: "INC-482 · Checkout outage postmortem",
  })).toBeVisible();

  await page.getByRole("button", { name: "New document" }).click();
  await expect(page).toHaveURL(/\/new$/u);
  await expect(page.getByTestId("template-picker")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/new$/u);

  await page.getByRole("link", { name: "Ratiflow home" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByLabel("What should collaborators call you?")).toBeVisible();
});

test("v4.2 advisory presence is single-flight, contains a non-JSON 500, and resumes", async ({ page }) => {
  test.setTimeout(25_000);
  let presenceRequests = 0;
  let successfulPresenceResponses = 0;
  let releaseFirstPresence: () => void = () => undefined;
  const firstPresenceGate = new Promise<void>((resolve) => {
    releaseFirstPresence = resolve;
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().endsWith("/api/repository-v4/presence") && response.ok()) {
      successfulPresenceResponses += 1;
    }
  });
  await launchExample(page, "POSTMORTEM");
  await page.route("**/api/repository-v4/presence", async (route) => {
    presenceRequests += 1;
    if (presenceRequests === 1) {
      await firstPresenceGate;
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Synthetic transient presence failure.",
      });
      return;
    }
    await route.continue();
  });

  await expect.poll(() => presenceRequests, { timeout: 7_000 }).toBe(1);
  await page.waitForTimeout(5_500);
  expect(presenceRequests).toBe(1);

  releaseFirstPresence();
  await expect.poll(() => presenceRequests, { timeout: 7_000 }).toBeGreaterThan(1);
  await expect.poll(() => successfulPresenceResponses, { timeout: 7_000 }).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("v4.2 completed Postmortem exposes r5/av11 rendered evidence, agent diffs, Restore, comments, and history", async ({ page }) => {
  await launchExample(page, "POSTMORTEM");
  const bundle = await readTabSession(page);
  expect(bundle.surface.document).toMatchObject({ revision: 5, activityVersion: 11 });
  expect(bundle.surface.tasks.map(({ taskKey }) => taskKey).sort()).toEqual([
    "TASK-1",
    "TASK-2",
    "TASK-3",
    "TASK-4",
  ]);

  await expect(page.getByRole("heading", {
    level: 1,
    name: "INC-482 · Checkout outage postmortem",
  })).toBeVisible();
  await expect(page.getByRole("button", {
    name: "Open revision history. Revision 5",
  })).toBeVisible();
  const rendered = page.getByTestId("rendered-document-body");
  await expect(rendered.getByRole("table").first()).toContainText("28,417");
  await expect(rendered.getByRole("img", {
    name: "Checkout outcomes during INC-482",
  })).toBeVisible();
  await expect(rendered.locator('input[type="checkbox"]')).toHaveCount(3);
  await expect(rendered.locator('input[type="checkbox"]:enabled')).toHaveCount(0);
  await expect(rendered.getByText("## Impact", { exact: true })).toHaveCount(0);

  const rail = await openCommentsRail(page);
  const agentCards = rail.locator('article[data-kind="agent"]');
  await expect(agentCards).toHaveCount(4);
  const impact = agentCards.filter({ hasText: "TASK-1" });
  await expect(impact).toContainText("Completed");
  await expect(impact.locator("del")).toContainText("Investigation in progress.");
  await expect(impact.locator("ins")).toContainText("28,417 checkout attempts");
  await expect(impact).toContainText("impact.csv");
  await expect(impact.getByRole("button", {
    name: "Restore before this change",
  })).toBeVisible();

  const humanDiscussion = rail.locator('article[data-kind="human"]').filter({
    hasText: "Provider throttling happened first",
  });
  await expect(humanDiscussion).toContainText("Closed");
  await expect(humanDiscussion).toContainText("Closed by Priya Shah");

  await rail.getByRole("tab", { name: /^History/u }).click();
  await expect(rail.getByTestId("revision-card")).toHaveCount(5);
  await rail.locator('[data-testid="revision-card"][data-revision="5"] button').click();
  await expect(rail).toContainText(
    "Clarified trigger versus root cause using Priya's question",
  );
  await expect(rail).toContainText("Builder · Sam Rivera changed the document");
  await expect(rail.getByRole("button", { name: /All history/u })).toBeVisible();
});

test("v4.2 completed Product document exposes r6/av11 analysis, closed discussion, and the r5→r6 Restore", async ({ page }) => {
  await launchExample(page, "PRODUCT_DOCUMENT");
  const bundle = await readTabSession(page);
  expect(bundle.surface.document).toMatchObject({ revision: 6, activityVersion: 11 });
  expect(bundle.surface.history.find(({ revision }) => revision === 5)).toMatchObject({
    changeSummary: "Edited the document.",
  });
  expect(bundle.surface.history.find(({ revision }) => revision === 6)).toMatchObject({
    parentRevision: 5,
    provenance: { authority: "RESTORE", restoredRevision: 4 },
  });

  await expect(page.getByRole("heading", {
    level: 1,
    name: "Northstar · CSV export launch decision",
  })).toBeVisible();
  const rendered = page.getByTestId("rendered-document-body");
  await expect(rendered.getByRole("table").first()).toContainText("Staged invite-only beta");
  await expect(rendered.getByRole("img", {
    name: "Pre-beta engineering-day options",
  })).toBeVisible();
  await expect(rendered).toContainText("full GA on November 1");

  const rail = await openCommentsRail(page);
  const discussion = rail.locator('article[data-kind="human"]').filter({
    hasText: "Does “invite-only beta”",
  });
  await expect(discussion).toContainText("designated design partners");
  await expect(discussion).toContainText("Closed by Elena Ruiz");
  await expect(discussion.getByRole("button", { name: "Close" })).toHaveCount(0);

  await rail.getByRole("tab", { name: /^History/u }).click();
  await expect(rail.getByTestId("revision-card")).toHaveCount(6);
  await expect(rail.locator('[data-testid="revision-card"][data-revision="5"]')).toContainText(
    "Edited the document.",
  );
  const restored = rail.locator('[data-testid="revision-card"][data-revision="6"]');
  await expect(restored).toContainText("Restored the staged design-partner beta");
  await expect(restored).toContainText("Restored r4");
  await restored.getByRole("button").click();
  await expect(rail).toContainText("Jordan Lee restored r4");
  await expect(rail.locator("del")).toContainText("CSV to every customer");
  await expect(rail.locator("ins")).toContainText("invite-only CSV beta");
});

test("v4.2 exact rendered-source selection creates an anchored human comment", async ({ page }) => {
  await launchTemplate(page, "POSTMORTEM");
  await selectRenderedText(page, POSTMORTEM_SELECTION);
  const composer = page.getByTestId("selection-comment-composer");
  const comment = "Should this include the exact customer-visible recovery time?";
  await composer.getByLabel("Comment or @ an agent").fill(comment);
  const created = waitForSuccessfulMutation(page, "/api/repository-v4/thread/create");
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await created;

  const session = await readTabSession(page);
  expect(session.surface.tasks).toEqual([]);
  expect(session.surface.threads).toHaveLength(1);
  const thread = session.surface.threads[0]!;
  expect(thread.taskId).toBeNull();
  expect(thread.anchor).toMatchObject({
    scope: "SELECTION",
    field: "BODY",
    selectedText: POSTMORTEM_SELECTION,
    createdRevision: 1,
  });
  if (thread.anchor.scope !== "SELECTION") throw new Error("Selection anchor was lost.");
  expect(Array.from(session.surface.document.body)
    .slice(thread.anchor.rangeStart, thread.anchor.rangeEnd)
    .join("")).toBe(POSTMORTEM_SELECTION);
  expect(thread.comments[0]).toMatchObject({ body: comment, createdRevision: 1 });

  const rail = await openCommentsRail(page);
  const card = rail.locator('article[data-kind="human"]');
  await expect(card).toContainText(POSTMORTEM_SELECTION);
  await expect(card).toContainText(comment);
  await expect(card.getByRole("button", { name: "Close" })).toBeVisible();
});

test("v4.2 literal @ text stays a human comment until an autocomplete agent is explicitly selected", async ({ page }) => {
  await launchTemplate(page, "POSTMORTEM");
  await connectCurrentAgent(page, "Databot");
  await page.reload();
  await expect(page.getByTestId("repository-workspace")).toBeVisible();

  await selectRenderedText(page, POSTMORTEM_SELECTION);
  const composer = page.getByTestId("selection-comment-composer");
  const literal = "@Databot should a person verify this wording first?";
  await composer.getByLabel("Comment or @ an agent").fill(literal);
  await expect(composer.getByRole("listbox", { name: "Company directory" })).toBeVisible();
  await expect(composer.getByRole("option", { name: /Databot.*Quinn Patel/u })).toBeVisible();
  await expect(composer.getByText(/^Assigned to/u)).toHaveCount(0);

  const created = waitForSuccessfulMutation(page, "/api/repository-v4/thread/create");
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  await created;
  const session = await readTabSession(page);
  expect(session.surface.tasks).toEqual([]);
  expect(session.surface.threads[0]).toMatchObject({ taskId: null });
  expect(session.surface.threads[0]?.comments[0]?.body).toBe(literal);
  const rail = await openCommentsRail(page);
  await expect(rail.locator('article[data-kind="human"]')).toContainText(literal);
});

test("v4.2 guided @Code selection posts canonical profile authority and opens the Flight Recorder without Luna", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      title?: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, boolean>;
      execute: (
        input: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<unknown>;
    };
    type ToolDescriptor = Omit<RegisteredTool, "execute"> & {
      origin: string;
      window: Window;
    };
    const active = new Map<string, RegisteredTool>();
    const listeners = new Set<EventListenerOrEventListenerObject>();
    let toolchangeCount = 0;
    let getToolsCalls = 0;
    let executeToolCalls = 0;
    const dispatchToolchange = () => {
      toolchangeCount += 1;
      const event = new Event("toolchange");
      for (const listener of listeners) {
        if (typeof listener === "function") listener.call(modelContext, event);
        else listener.handleEvent(event);
      }
    };
    const modelContext = {
      registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
        active.set(tool.name, tool);
        dispatchToolchange();
        options?.signal?.addEventListener("abort", () => {
          if (active.get(tool.name) !== tool) return;
          active.delete(tool.name);
          dispatchToolchange();
        }, { once: true });
      },
      async getTools(): Promise<ToolDescriptor[]> {
        getToolsCalls += 1;
        return [...active.values()]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((tool) => {
            const descriptor: ToolDescriptor = {
              name: tool.name,
              description: tool.description,
              origin: window.location.origin,
              window,
            };
            if (tool.title !== undefined) descriptor.title = tool.title;
            if (tool.inputSchema !== undefined) descriptor.inputSchema = tool.inputSchema;
            if (tool.annotations !== undefined) descriptor.annotations = tool.annotations;
            return descriptor;
          });
      },
      async executeTool(
        descriptor: ToolDescriptor,
        input: Record<string, unknown> = {},
        options?: { signal?: AbortSignal },
      ): Promise<string> {
        executeToolCalls += 1;
        const registered = active.get(descriptor.name);
        if (!registered) throw new Error(`Tool is no longer registered: ${descriptor.name}`);
        const output = await registered.execute(input, options);
        return typeof output === "string" ? output : JSON.stringify(output);
      },
      addEventListener(type: "toolchange", listener: EventListenerOrEventListenerObject) {
        if (type === "toolchange") listeners.add(listener);
      },
      removeEventListener(type: "toolchange", listener: EventListenerOrEventListenerObject) {
        if (type === "toolchange") listeners.delete(listener);
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, "__ratiflowFullWebMCPHarness", {
      configurable: true,
      value: {
        snapshot: () => ({
          names: [...active.keys()].sort(),
          toolchangeCount,
          getToolsCalls,
          executeToolCalls,
        }),
        invoke: async (name: string, input: Record<string, unknown>) => {
          const descriptor = (await modelContext.getTools()).find((tool) => tool.name === name);
          if (!descriptor) throw new Error(`Registered descriptor was absent: ${name}`);
          return JSON.parse(await modelContext.executeTool(descriptor, input)) as unknown;
        },
      },
    });
  });
  const page = await context.newPage();
  let mentionQueued = false;
  let claimRequests = 0;
  let relayStepRequests = 0;

  await page.route("**/api/repository-v4/relay/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: managedRelayState(mentionQueued) }),
    });
  });
  await page.route("**/api/repository-v4/relay/claim", async (route) => {
    claimRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          outcome: "NO_WORK",
          retryAfterMs: RELAY_BOUNDS.recoveryHeartbeatMs,
        },
      }),
    });
  });
  await page.route("**/api/repository-v4/relay/step", async (route) => {
    relayStepRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "RELAY_UNAVAILABLE",
        message: "The deterministic browser smoke never dispatches Luna.",
        retryable: false,
      }),
    });
  });
  await page.route("**/api/repository-v4/task/mention", async (route) => {
    mentionQueued = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          outcome: "MANAGED_TASK_QUEUED",
          target: { kind: "AGENT", profileId: MANAGED_CODE_PROFILE_ID },
          threadId: MANAGED_RELAY_THREAD_ID,
          commentId: MANAGED_RELAY_COMMENT_ID,
          taskId: MANAGED_RELAY_TASK_ID,
          runId: MANAGED_RELAY_RUN_ID,
        },
      }),
    });
  });

  try {
    await launchExample(page, "POSTMORTEM");
    await expect.poll(() => page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowFullWebMCPHarness: {
          snapshot: () => { names: string[] };
        };
      }).__ratiflowFullWebMCPHarness;
      return harness.snapshot().names;
    })).toEqual([...REPOSITORY_TOOL_NAMES].sort());

    const consumerResult = await page.evaluate(async () => {
      const harness = (window as unknown as {
        __ratiflowFullWebMCPHarness: {
          invoke: (name: string, input: Record<string, unknown>) => Promise<unknown>;
        };
      }).__ratiflowFullWebMCPHarness;
      return harness.invoke("connect_agent", { name: "Consumer probe" });
    }) as { structuredContent: { ok: boolean } };
    expect(consumerResult.structuredContent.ok).toBe(true);
    const consumerSnapshot = await page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowFullWebMCPHarness: {
          snapshot: () => {
            toolchangeCount: number;
            getToolsCalls: number;
            executeToolCalls: number;
          };
        };
      }).__ratiflowFullWebMCPHarness;
      return harness.snapshot();
    });
    expect(consumerSnapshot).toMatchObject({
      getToolsCalls: 1,
      executeToolCalls: 1,
    });
    expect(consumerSnapshot.toolchangeCount).toBeGreaterThanOrEqual(
      REPOSITORY_TOOL_NAMES.length,
    );

    await page.getByTestId("guided-selection").click();
    const composer = page.getByTestId("selection-comment-composer");
    await expect(composer).toBeVisible();
    await composer.getByLabel("Comment or @ an agent").fill("@");
    const directory = composer.getByRole("listbox", { name: "Company directory" });
    await expect(directory).toBeVisible();
    await directory.getByRole("option", { name: /@Code\b/u }).click();
    const instruction = "@Code verify this failure against the synthetic repository.";
    await composer.getByLabel("Comment or @ an agent").fill(instruction);
    await expect(composer.getByText(/Assigned to @Code · code specialist/u)).toBeVisible();
    const mentionRequestPromise = page.waitForRequest((request) =>
      request.url().endsWith("/api/repository-v4/task/mention")
      && request.method() === "POST");
    await composer.getByRole("button", { name: "Assign & run", exact: true }).click();

    const mentionRequest = await mentionRequestPromise;
    const mentionBody = mentionRequest.postDataJSON() as Record<string, unknown>;
    expect(Object.keys(mentionBody).sort()).toEqual([
      "anchor",
      "comment",
      "expectedRevision",
      "target",
    ]);
    expect(mentionBody).toMatchObject({
      expectedRevision: 5,
      comment: instruction,
      target: { kind: "AGENT", profileId: MANAGED_CODE_PROFILE_ID },
      anchor: {
        scope: "SELECTION",
        field: "BODY",
        rangeStart: 1150,
        rangeEnd: 1603,
      },
    });
    expect(mentionBody).not.toHaveProperty("mentionedAgentName");
    expect(mentionBody).not.toHaveProperty("assignedToMemberId");
    expect(mentionBody.target).not.toHaveProperty("displayName");
    expect(mentionBody.target).not.toHaveProperty("handle");

    const rail = page.getByRole("complementary", {
      name: "Comments, history, and relay",
    });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("tab", { name: /^Relay/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const recorder = rail.getByTestId("relay-flight-recorder");
    await expect(recorder).toBeVisible();
    await expect(recorder.getByRole("heading", {
      name: "The application trace stays with the document.",
    })).toBeVisible();
    await expect(recorder).toContainText("@Code");
    await expect(recorder).toContainText(MANAGED_AGENT_MODEL);
    await expect(recorder.getByRole("list", { name: "Code tool catalog" })).toBeVisible();
    await expect(recorder).toContainText("Mention became durable work");
    await expect(recorder).toContainText("Queued for this open page");
    await expect(page.getByRole("status")).toContainText(
      "@Code queued. This page is starting the relay now.",
    );
    await expect.poll(() => claimRequests).toBeGreaterThan(0);
    expect(relayStepRequests).toBe(0);
  } finally {
    await context.close();
  }
});

test("v4.2 selected @ agent creates Direct TASK-n, commits immediately with rationale/evidence, and can be restored", async ({ page }) => {
  await launchTemplate(page, "POSTMORTEM");
  const profile = await connectCurrentAgent(page, "Databot");
  expect(profile.member.displayName).toBe(PERSON_NAME);
  await page.reload();
  await expect(page.getByTestId("repository-workspace")).toBeVisible();

  await selectRenderedText(page, POSTMORTEM_SELECTION);
  const composer = page.getByTestId("selection-comment-composer");
  await composer.getByLabel("Comment or @ an agent").fill("@");
  const option = composer.getByRole("option", { name: /Databot.*Quinn Patel/u });
  await expect(option).toBeVisible();
  await option.click();
  const prompt = "@Databot replace this with the verified 09:43–10:21 UTC interval.";
  await composer.getByLabel("Comment or @ an agent").fill(prompt);
  await expect(composer.getByText("Assigned to Databot · Quinn Patel")).toBeVisible();
  await expect(composer.getByRole("radio")).toHaveCount(0);
  await expect(composer.getByText(/authority/iu)).toHaveCount(0);

  const assigned = waitForSuccessfulMutation(page, "/api/repository-v4/task/mention");
  await composer.getByRole("button", { name: "Assign" }).click();
  await assigned;
  const task = await waitForTask(page, ({ taskKey }) => taskKey === "TASK-1");
  expect(task).toMatchObject({
    taskKey: "TASK-1",
    mode: "DIRECT",
    status: "OPEN",
    instruction: "replace this with the verified 09:43–10:21 UTC interval.",
    agentLabel: "Databot",
    agentProfileId: profile.profileId,
  });

  const replacement = "Checkout failed from 09:43 to 10:21 UTC and recovered after rollback.";
  const resultSummary = "Used the incident timeline to replace the placeholder with the verified failure and recovery interval.";
  await submitAgentResult(page, task, {
    resultSummary,
    replacementText: replacement,
    evidenceRefs: ["checkout.log"],
  });
  await expect(page.getByRole("button", {
    name: "Open revision history. Revision 2",
  })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rendered-document-body")).toContainText(replacement);
  await expect(page.getByRole("button", { name: /Apply|Approve/u })).toHaveCount(0);

  const rail = await openCommentsRail(page);
  const card = rail.locator('article[data-kind="agent"]').filter({ hasText: "TASK-1" });
  await expect(card).toContainText("Completed");
  await expect(card).toContainText(resultSummary);
  await expect(card.locator("del")).toContainText(POSTMORTEM_SELECTION);
  await expect(card.locator("ins")).toContainText(replacement);
  await expect(card).toContainText("checkout.log");
  const restore = card.getByRole("button", { name: "Restore before this change" });
  await expect(restore).toBeVisible();
  const restored = waitForSuccessfulMutation(page, "/api/repository-v4/revision/restore");
  await restore.click();
  await restored;
  await expect(page.getByRole("button", {
    name: "Open revision history. Revision 3",
  })).toBeVisible();
  await expect(page.getByTestId("rendered-document-body")).toContainText(POSTMORTEM_SELECTION);
});

test("v4.2 quiet Edit saves without public changeSummary and survives reload without WebMCP", async ({ page }) => {
  await launchTemplate(page, "PRODUCT_DOCUMENT");
  expect(await page.evaluate(() => ({
    documentModelContext: "modelContext" in document,
    navigatorModelContext: "modelContext" in navigator,
  }))).toEqual({ documentModelContext: false, navigatorModelContext: false });
  await expect(page.getByRole("button", {
    name: /Open agent guide\.$/u,
  })).toBeVisible();
  await expect(page.getByLabel("Change summary")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const title = "Checkout recovery requirements";
  const body = "## Problem\n\nCheckout recovery needs a **customer-facing** success threshold.\n\n- [ ] Confirm the threshold";
  await page.getByLabel("Document title").fill(title);
  await page.getByLabel("Markdown source").fill(body);
  await expect(page.getByLabel("Change summary")).toHaveCount(0);

  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith("/api/repository-v4/revision/save")
    && request.method() === "POST");
  const saved = waitForSuccessfulMutation(page, "/api/repository-v4/revision/save");
  await page.getByTestId("save-revision").click();
  const request = await requestPromise;
  await saved;
  expect(request.postDataJSON()).toEqual({
    expectedRevision: 1,
    title,
    body,
  });
  await expect(page.getByRole("button", {
    name: "Open revision history. Revision 2",
  })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId("rendered-document-body").getByText("customer-facing")).toBeVisible();
  await expect(page.getByTestId("rendered-document-body").locator('input[type="checkbox"]')).toBeDisabled();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByTestId("rendered-document-body")).toContainText(
    "Checkout recovery needs a customer-facing success threshold.",
  );
  await expect(page.getByLabel("Markdown source")).toHaveCount(0);
});

test("v4.2 clean shared URL joins a named human and preserves their draft across a remote revision", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45_000);
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await launchTemplate(first, "PRODUCT_DOCUMENT", "Jordan Lee");
    await second.goto(first.url());
    await expect(second.getByRole("heading", { name: "Join this document" })).toBeVisible();
    await expect(second.getByRole("button", { name: "Join document" })).toBeDisabled();
    await second.getByLabel("Your display name").fill("Nadia Chen");
    await second.getByRole("button", { name: "Join document" }).click();
    await expect(second.getByTestId("repository-workspace")).toBeVisible();

    const firstSession = await readTabSession(first);
    const secondSession = await readTabSession(second);
    expect(secondSession.surface.document.id).toBe(firstSession.surface.document.id);
    expect(secondSession.selfMemberId).not.toBe(firstSession.selfMemberId);
    expect(secondSession.surface.members.find(({ memberId }) =>
      memberId === secondSession.selfMemberId)?.displayName).toBe("Nadia Chen");

    const sharedBody = `${PRODUCT_DOCUMENT_TEMPLATE_BODY}\n\nShared finding from Jordan.`;
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await first.getByLabel("Markdown source").fill(sharedBody);
    const firstSave = waitForSuccessfulMutation(first, "/api/repository-v4/revision/save");
    await first.getByTestId("save-revision").click();
    await firstSave;
    await expect(second.getByTestId("rendered-document-body")).toContainText(
      "Shared finding from Jordan.",
      { timeout: 15_000 },
    );

    await second.getByRole("button", { name: "Edit", exact: true }).click();
    const secondDraft = `${sharedBody}\n\nUnpublished draft from Nadia.`;
    await second.getByLabel("Markdown source").fill(secondDraft);

    const laterBody = `${sharedBody}\n\nA newer committed constraint.`;
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await first.getByLabel("Markdown source").fill(laterBody);
    const laterSave = waitForSuccessfulMutation(first, "/api/repository-v4/revision/save");
    await first.getByTestId("save-revision").click();
    await laterSave;

    const conflict = second.getByRole("alert").filter({
      hasText: "A newer revision arrived",
    });
    await expect(conflict).toContainText("A newer revision arrived", { timeout: 15_000 });
    await expect(second.getByLabel("Markdown source")).toHaveValue(secondDraft);
    await conflict.getByRole("button", { name: "Use latest" }).click();
    await expect(second.getByTestId("rendered-document-body")).toContainText(
      "A newer committed constraint.",
    );
    await expect(conflict).toHaveCount(0);
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});

test("v4.2 390×844 keeps the rendered document, comment rail, history, and tap targets usable", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await launchTemplate(page, "POSTMORTEM");
    await expectNoHorizontalOverflow(page);
    await expectMinimumTarget(page.getByRole("button", {
      name: "Open revision history. Revision 1",
    }));
    await expectMinimumTarget(page.getByRole("button", { name: "Edit", exact: true }));
    const commentsButton = page.getByRole("button", { name: /^Comments(?: \d+)?$/u }).first();
    await expectMinimumTarget(commentsButton);

    const rail = page.getByRole("complementary", {
      name: "Comments, history, and relay",
    });
    await expect(rail).toBeHidden();
    await commentsButton.click();
    await expect(rail).toBeVisible();
    await expect(rail).toBeInViewport();
    await expectMinimumTarget(rail.getByRole("tab", { name: /^Comments/u }));
    const history = rail.getByRole("tab", { name: /^History/u });
    await expectMinimumTarget(history);
    await history.click();
    await expect(rail.locator('[data-testid="revision-card"][data-revision="1"]')).toBeVisible();
    await expectMinimumTarget(rail.getByRole("button", { name: "Close collaboration rail" }));
    await rail.getByRole("button", { name: "Close collaboration rail" }).click();

    await selectRenderedText(page, POSTMORTEM_SELECTION);
    const composer = page.getByTestId("selection-comment-composer");
    await composer.getByLabel("Comment or @ an agent").fill("Keep this note anchored on mobile.");
    await expectMinimumTarget(composer.getByRole("button", { name: "Comment", exact: true }));
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});
