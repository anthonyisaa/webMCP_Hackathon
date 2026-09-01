import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

test.setTimeout(90_000);

const HERO_TITLE = "Northstar CSV launch memo";
const HERO_BODY = `Recommendation

Launch CSV export as generally available on October 15.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?`;
const HERO_SELECTION = "Launch CSV export as generally available on October 15.";
const HERO_INSTRUCTION =
  "Rewrite this recommendation to fit the 14-day capacity and protect the Northstar renewal. Keep both launch dates explicit.";
const HERO_REPLACEMENT =
  "Launch an invite-only, single-tenant Northstar beta on October 15, then make CSV export generally available on November 1.";
const HERO_SUMMARY =
  "Replace October 15 GA with a single-tenant beta, then move general availability to November 1.";
const HERO_RATIONALE =
  "Accepted because the beta uses the four export days left after reliability and still meets Northstar's November 1 deadline. Full GA on October 15 was rejected because it requires eight export days.";
const FINAL_BODY = HERO_BODY.replace(HERO_SELECTION, HERO_REPLACEMENT);

const DOCUMENT_TOOLS = [
  "inspect_document",
  "read_document_memory",
  "list_my_work",
  "wait_for_my_work",
  "submit_work_proposal",
];

type InspectResult = {
  ok: boolean;
  code?: string;
  document?: {
    id: string;
    title: string;
    body: string;
    revision: number;
    activityVersion: number;
  };
};

type PendingWork = {
  workOrderId: string;
  status: "PENDING";
  instruction: string;
  anchor: { selectedText: string; rangeStart: number; rangeEnd: number };
  assignedToMemberId: string;
};

type WorkResult = {
  ok: boolean;
  outcome?: "WORK_AVAILABLE" | "DOCUMENT_CHANGED" | "TIMEOUT";
  workOrders?: PendingWork[];
  revision?: number;
  activityVersion?: number;
};

type MemoryResult = {
  ok: boolean;
  events?: Array<{
    kind: string;
    activityVersion: number;
    rationale: string | null;
    changeSummary: string | null;
    diffs: Array<{ beforeExcerpt: string; afterExcerpt: string }>;
  }>;
  hasMoreOlder?: boolean;
  latestActivityVersion?: number;
  revision?: number;
};

type ProposalResult = {
  ok: boolean;
  workOrder?: { workOrderId: string; status: string };
  document?: { body: string; revision: number; activityVersion: number };
  event?: { kind: string; changeSummary: string | null };
};

async function installWebMCPHarness(
  context: BrowserContext,
  failedRegistrationAttempts = 0,
): Promise<void> {
  await context.addInitScript(({ failedRegistrationAttempts: initialFailures }) => {
    type RegisteredTool = {
      name: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      execute: (
        input: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<unknown>;
    };

    const active = new Map<string, RegisteredTool>();
    const pending = new Map<string, Promise<unknown>>();
    let remainingRegistrationFailures = initialFailures;
    let registrationAttempts = 0;
    let registrationFailures = 0;
    const unwrap = (value: unknown): unknown => {
      if (value && typeof value === "object" && "structuredContent" in value) {
        return (value as { structuredContent: unknown }).structuredContent;
      }
      return value;
    };
    const invoke = async (name: string, input: unknown): Promise<unknown> => {
      const tool = active.get(name);
      if (!tool) throw new Error(`Tool ${name} is not registered.`);
      return unwrap(
        await tool.execute(input, { signal: new AbortController().signal }),
      );
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
          registrationAttempts += 1;
          if (remainingRegistrationFailures > 0) {
            remainingRegistrationFailures -= 1;
            registrationFailures += 1;
            throw new Error("Synthetic transient registration failure.");
          }
          active.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => {
              if (active.get(tool.name) === tool) active.delete(tool.name);
            },
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, "__ratiflowDocumentV3Harness", {
      configurable: true,
      value: {
        names: () => [...active.keys()],
        registrationStats: () => ({
          attempts: registrationAttempts,
          failures: registrationFailures,
        }),
        invoke,
        start(id: string, name: string, input: unknown) {
          if (pending.has(id)) throw new Error(`Pending tool ${id} already exists.`);
          pending.set(id, invoke(name, input));
        },
        async finish(id: string) {
          const operation = pending.get(id);
          if (!operation) throw new Error(`Pending tool ${id} does not exist.`);
          try {
            return await operation;
          } finally {
            pending.delete(id);
          }
        },
      },
    });
  }, { failedRegistrationAttempts });
}

async function registeredToolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const harness = (window as unknown as {
      __ratiflowDocumentV3Harness: { names: () => string[] };
    }).__ratiflowDocumentV3Harness;
    return harness.names();
  });
}

async function registrationStats(page: Page): Promise<{
  attempts: number;
  failures: number;
}> {
  return page.evaluate(() => {
    const harness = (window as unknown as {
      __ratiflowDocumentV3Harness: {
        registrationStats: () => { attempts: number; failures: number };
      };
    }).__ratiflowDocumentV3Harness;
    return harness.registrationStats();
  });
}

async function invokeTool<T>(page: Page, name: string, input: unknown): Promise<T> {
  return page.evaluate(
    ({ toolName, toolInput }) => {
      const harness = (window as unknown as {
        __ratiflowDocumentV3Harness: {
          invoke: (name: string, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowDocumentV3Harness;
      return harness.invoke(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  ) as Promise<T>;
}

async function startTool(
  page: Page,
  id: string,
  name: string,
  input: unknown,
): Promise<void> {
  await page.evaluate(
    ({ operationId, toolName, toolInput }) => {
      const harness = (window as unknown as {
        __ratiflowDocumentV3Harness: {
          start: (id: string, name: string, input: unknown) => void;
        };
      }).__ratiflowDocumentV3Harness;
      harness.start(operationId, toolName, toolInput);
    },
    { operationId: id, toolName: name, toolInput: input },
  );
}

async function finishTool<T>(page: Page, id: string): Promise<T> {
  return page.evaluate((operationId) => {
    const harness = (window as unknown as {
      __ratiflowDocumentV3Harness: {
        finish: (id: string) => Promise<unknown>;
      };
    }).__ratiflowDocumentV3Harness;
    return harness.finish(operationId);
  }, id) as Promise<T>;
}

async function selfMemberId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((candidate) =>
      candidate.startsWith("ratiflow.document.session.v3:"),
    );
    if (!key) throw new Error("The v3 document session was not stored.");
    const bundle = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
      selfMemberId?: string;
    } | null;
    if (!bundle?.selfMemberId) throw new Error("The self member ID was absent.");
    return bundle.selfMemberId;
  });
}

function waitForDocumentSave(
  page: Page,
  expected: { title: string; body: string },
) {
  return page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/document-v3/save") ||
      response.request().method() !== "POST" ||
      !response.ok()
    ) {
      return false;
    }
    try {
      const payload = response.request().postDataJSON() as {
        title?: unknown;
        body?: unknown;
      };
      return payload.title === expected.title && payload.body === expected.body;
    } catch {
      return false;
    }
  });
}

async function openRewriteMenu(page: Page): Promise<void> {
  const prevented = await page.getByLabel("Note body").evaluate(
    (element: HTMLTextAreaElement) => {
      element.focus();
      element.setSelectionRange(16, 71);
      element.dispatchEvent(new Event("select", { bubbles: true }));
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 2,
          pointerId: 73,
        }),
      );
      const event = new PointerEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        pointerId: 73,
        clientX: 280,
        clientY: 260,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    },
  );
  expect(prevented).toBe(true);
  await page.getByRole("menuitem", { name: /Rewrite/ }).click();
}

async function clickWithRealPointer(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("The pointer target did not have a rendered box.");
  const point = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  const targetOwnsPoint = await target.evaluate(
    (element, clickPoint) => {
      const hit = document.elementFromPoint(clickPoint.x, clickPoint.y);
      return hit === element || element.contains(hit);
    },
    point,
  );
  expect(targetOwnsPoint).toBe(true);
  await page.mouse.click(point.x, point.y);
}

async function openMemoryRail(page: Page): Promise<void> {
  const memoryTab = page.getByRole("tab", { name: "Memory" });
  if (!(await memoryTab.isVisible())) {
    await page.getByRole("button", { name: /Work and memory/ }).click();
  }
  await memoryTab.click();
}

test("one click opens a completed example whose fresh paired agent recovers the anti-loop decision", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  const context = await browser.newContext({ baseURL });
  await installWebMCPHarness(context);
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByTestId("agent-inbox")).toContainText("Agent tools ready");
    const blankUrl = page.url();
    await page.getByRole("button", { name: "Open completed example" }).click();
    await expect(page).not.toHaveURL(blankUrl, { timeout: 20_000 });
    await expect(page.getByLabel("Note title")).toHaveValue(HERO_TITLE);
    await expect(page.getByLabel("Note body")).toHaveValue(FINAL_BODY);
    await expect(page.getByTestId("memory-list")).toContainText(HERO_RATIONALE);
    await expect(page.getByRole("status")).toContainText(
      "Ask your agent what decision this memo should not repeat",
    );
    await expect.poll(() => registeredToolNames(page)).toEqual(DOCUMENT_TOOLS);

    const freshMemory = await invokeTool<MemoryResult>(page, "read_document_memory", {
      limit: 20,
    });
    expect(freshMemory).toMatchObject({
      ok: true,
      latestActivityVersion: 4,
      revision: 2,
    });
    expect(freshMemory.events?.map((event) => event.kind)).toEqual([
      "DOCUMENT_EDITED",
      "WORK_CREATED",
      "PROPOSAL_SUBMITTED",
      "PROPOSAL_ACCEPTED",
    ]);
    expect(freshMemory.events?.at(-1)?.rationale).toBe(HERO_RATIONALE);
  } finally {
    await context.close();
  }
});

test("agent catalog recovers from a transient registration failure", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  const context = await browser.newContext({ baseURL });
  await installWebMCPHarness(context, 1);
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByTestId("agent-inbox")).toContainText("Agent tools ready", {
      timeout: 5_000,
    });
    await expect.poll(() => registeredToolNames(page)).toEqual(DOCUMENT_TOOLS);
    await expect.poll(() => registrationStats(page)).toEqual({
      attempts: DOCUMENT_TOOLS.length + 1,
      failures: 1,
    });
  } finally {
    await context.close();
  }
});

for (const pointerViewport of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "390px", width: 390, height: 844 },
] as const) {
  test(`paired WebMCP proposes without mutation; creator decides with a real pointer (${pointerViewport.name})`, async ({
    browser,
    baseURL,
  }) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  const viewport = { width: pointerViewport.width, height: pointerViewport.height };
  const mayaContext = await browser.newContext({ baseURL, viewport });
  const jordanContext = await browser.newContext({ baseURL, viewport });
  await installWebMCPHarness(mayaContext);
  const maya = await mayaContext.newPage();
  const jordan = await jordanContext.newPage();
  const pageErrors: string[] = [];
  maya.on("pageerror", (error) => pageErrors.push(error.message));
  jordan.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await maya.goto("/");
    await expect(maya).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
    expect(new URL(maya.url()).hash).toBe("");
    const mayaId = await selfMemberId(maya);
    await expect.poll(() => registeredToolNames(maya)).toEqual(DOCUMENT_TOOLS);
    await expect(maya.getByTestId("agent-inbox")).toContainText("Agent tools ready");
    await jordan.goto(maya.url());
    await expect(jordan.getByLabel(/other (person|people) here/)).toHaveAttribute(
      "aria-label",
      "1 other person here",
      { timeout: 8_000 },
    );

    const heroSave = waitForDocumentSave(jordan, {
      title: HERO_TITLE,
      body: HERO_BODY,
    });
    await jordan.getByLabel("Note title").fill(HERO_TITLE);
    await jordan.getByLabel("Note body").fill(HERO_BODY);
    await heroSave;
    await expect(maya.getByLabel("Note body")).toHaveValue(HERO_BODY, { timeout: 8_000 });

    const initial = await invokeTool<InspectResult>(maya, "inspect_document", {});
    expect(initial).toMatchObject({
      ok: true,
      document: {
        title: HERO_TITLE,
        body: HERO_BODY,
        revision: 1,
        activityVersion: 1,
      },
    });
    await startTool(maya, "hero-wait", "wait_for_my_work", {
      afterActivityVersion: 1,
      afterRevision: 1,
      timeoutSeconds: 20,
    });
    await expect(maya.getByTestId("agent-inbox")).toContainText(
      "Your paired agent is listening on this page",
    );

    await openRewriteMenu(jordan);
    await expect(jordan.getByTestId("work-target-preview")).toContainText(HERO_SELECTION);
    await jordan.getByLabel("Work instruction").fill(HERO_INSTRUCTION);
    await expect(jordan.getByLabel("Assignee").locator(`option[value="${mayaId}"]`)).toHaveCount(1);
    await jordan.getByLabel("Assignee").selectOption(mayaId);
    await jordan.getByRole("button", { name: "Assign work" }).click();

    const waited = await finishTool<WorkResult>(maya, "hero-wait");
    expect(waited).toMatchObject({
      ok: true,
      outcome: "WORK_AVAILABLE",
      revision: 1,
      activityVersion: 2,
      workOrders: [
        {
          status: "PENDING",
          instruction: HERO_INSTRUCTION,
          assignedToMemberId: mayaId,
          anchor: { selectedText: HERO_SELECTION, rangeStart: 16, rangeEnd: 71 },
        },
      ],
    });
    const workOrder = waited.workOrders?.[0];
    if (!workOrder) throw new Error("The assigned work did not resolve the pending wait.");
    await expect.poll(() => registeredToolNames(maya)).toEqual(DOCUMENT_TOOLS);
    await expect(maya.getByTestId("agent-inbox")).toContainText(
      "Work waiting — ask your agent to check",
    );

    const memoryBeforeProposal = await invokeTool<MemoryResult>(
      maya,
      "read_document_memory",
      { limit: 20 },
    );
    expect(memoryBeforeProposal.events?.map((event) => event.kind)).toEqual([
      "DOCUMENT_EDITED",
      "WORK_CREATED",
    ]);
    const listed = await invokeTool<WorkResult>(maya, "list_my_work", {});
    expect(listed.workOrders?.map((order) => order.workOrderId)).toEqual([
      workOrder.workOrderId,
    ]);

    const proposal = await invokeTool<ProposalResult>(maya, "submit_work_proposal", {
      workOrderId: workOrder.workOrderId,
      expectedRevision: 1,
      replacementText: HERO_REPLACEMENT,
      changeSummary: HERO_SUMMARY,
    });
    expect(proposal).toMatchObject({
      ok: true,
      workOrder: { workOrderId: workOrder.workOrderId, status: "PROPOSED" },
      document: { body: HERO_BODY, revision: 1, activityVersion: 3 },
      event: { kind: "PROPOSAL_SUBMITTED", changeSummary: HERO_SUMMARY },
    });
    await expect(maya.getByLabel("Note body")).toHaveValue(HERO_BODY);
    await expect.poll(() => registeredToolNames(maya)).toEqual(DOCUMENT_TOOLS);
    await expect(maya.getByTestId("agent-inbox")).toContainText("Agent tools ready");

    const jordanCard = jordan.getByTestId("work-order-card");
    await expect(jordanCard).toContainText(HERO_REPLACEMENT, { timeout: 8_000 });
    await expect(jordanCard).toContainText("Asked");
    await expect(jordanCard).toContainText("Proposed");
    await expect(jordan.getByLabel("Note body")).toHaveValue(HERO_BODY);
    await expect(maya.getByTestId("work-order-card").getByRole("button", { name: "Accept" }))
      .toHaveCount(0);
    await expect(jordanCard.getByRole("button", { name: "Accept" })).toBeEnabled();
    if (pointerViewport.name === "desktop") {
      await jordanCard.getByText("Details", { exact: true }).click();
      await jordanCard.getByLabel(/Decision note/).fill(HERO_RATIONALE);
    }
    await expect(
      jordan.getByRole("status").filter({ hasText: "Work assigned" }),
    ).toBeVisible();
    await clickWithRealPointer(
      jordan,
      jordanCard.getByRole("button", { name: "Accept" }),
    );

    await expect(jordan.getByLabel("Note body")).toHaveValue(FINAL_BODY);
    await expect(maya.getByLabel("Note body")).toHaveValue(FINAL_BODY, { timeout: 8_000 });
    await openMemoryRail(jordan);
    if (pointerViewport.name === "desktop") {
      await expect(jordan.getByTestId("memory-list")).toContainText(HERO_RATIONALE);
    }
    await openMemoryRail(maya);
    if (pointerViewport.name === "desktop") {
      await expect(maya.getByTestId("memory-list")).toContainText(HERO_RATIONALE, {
        timeout: 8_000,
      });
    }
    const accepted = await invokeTool<InspectResult>(maya, "inspect_document", {});
    expect(accepted).toMatchObject({
      ok: true,
      document: { body: FINAL_BODY, revision: 2, activityVersion: 4 },
    });

    await maya.reload();
    expect(new URL(maya.url()).hash).toBe("");
    await expect.poll(() => registeredToolNames(maya)).toEqual(DOCUMENT_TOOLS);
    const freshMemory = await invokeTool<MemoryResult>(maya, "read_document_memory", {
      limit: 20,
    });
    expect(freshMemory).toMatchObject({
      ok: true,
      hasMoreOlder: false,
      latestActivityVersion: 4,
      revision: 2,
    });
    expect(freshMemory.events?.map((event) => event.kind)).toEqual([
      "DOCUMENT_EDITED",
      "WORK_CREATED",
      "PROPOSAL_SUBMITTED",
      "PROPOSAL_ACCEPTED",
    ]);
    const acceptedEvent = freshMemory.events?.find(
      (event) => event.kind === "PROPOSAL_ACCEPTED",
    );
    expect(acceptedEvent).toMatchObject({
      activityVersion: 4,
      rationale: pointerViewport.name === "desktop" ? HERO_RATIONALE : null,
      changeSummary: HERO_SUMMARY,
      diffs: [{ beforeExcerpt: HERO_SELECTION, afterExcerpt: HERO_REPLACEMENT }],
    });
    expect(FINAL_BODY).not.toContain("eight export days");
    if (pointerViewport.name === "desktop") {
      expect(acceptedEvent?.rationale).toContain("eight export days");
    } else {
      expect(acceptedEvent?.rationale).toBeNull();
    }
    expect(await invokeTool<WorkResult>(maya, "list_my_work", {})).toMatchObject({
      ok: true,
      workOrders: [],
      revision: 2,
      activityVersion: 4,
    });

    await maya.goto("/decision-demo");
    await expect.poll(() => registeredToolNames(maya)).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await mayaContext.close();
    await jordanContext.close();
  }
  });
}
