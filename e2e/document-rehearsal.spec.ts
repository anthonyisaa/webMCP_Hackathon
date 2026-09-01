import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

// Adapter rehearsal only. This is deliberately not native WebMCP evidence.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(90_000);

const RESET_TOKEN = process.env.RATIFLOW_EVAL_RESET_TOKEN;
if (!RESET_TOKEN) {
  throw new Error(
    "RATIFLOW_EVAL_RESET_TOKEN is required for the guarded adapter rehearsal.",
  );
}

const HERO_DOCUMENT_ID = "00000000-0000-4000-8000-000000000301";
const HERO_MAYA_ID = "00000000-0000-4000-8000-000000000311";
const HERO_JORDAN_ID = "00000000-0000-4000-8000-000000000312";
const HERO_WORK_ORDER_ID = "00000000-0000-4000-8000-000000000321";
const HERO_EVENT_IDS = [
  "00000000-0000-4000-8000-000000000331",
  "00000000-0000-4000-8000-000000000332",
  "00000000-0000-4000-8000-000000000333",
  "00000000-0000-4000-8000-000000000334",
] as const;
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

const ALL_V3_TOOLS = [
  "inspect_document",
  "read_document_memory",
  "list_my_work",
  "wait_for_my_work",
  "submit_work_proposal",
] as const;

interface ResetOutcome {
  shareToken: string;
  mayaBootstrapPath: string;
  jordanBootstrapPath: string;
  expiresAt: string;
  revision: number;
  activityVersion: number;
}

interface InspectResult {
  ok: boolean;
  document?: {
    id: string;
    title: string;
    body: string;
    revision: number;
    activityVersion: number;
  };
}

interface WorkOrderResult {
  workOrderId: string;
  status: string;
  source: string;
  intent: string;
  instruction: string;
  creatorMemberId: string;
  assignedToMemberId: string;
  anchor: {
    field: string;
    rangeStart: number;
    rangeEnd: number;
    selectedText: string;
    createdRevision: number;
    anchorRevision: number;
  };
}

interface WorkResult {
  ok: boolean;
  code?: string;
  outcome?: string;
  workOrders?: WorkOrderResult[];
  revision?: number;
  activityVersion?: number;
}

interface MemoryEventResult {
  eventId: string;
  activityVersion: number;
  kind: string;
  baseRevision: number;
  resultRevision: number;
  workOrderId: string | null;
  rationale: string | null;
  changeSummary: string | null;
  diffs: Array<{
    field: string;
    rangeStart: number;
    rangeEnd: number;
    beforeExcerpt: string;
    afterExcerpt: string;
  }>;
}

interface MemoryResult {
  ok: boolean;
  events?: MemoryEventResult[];
  hasMoreOlder?: boolean;
  latestActivityVersion?: number;
  revision?: number;
}

interface ProposalResult {
  ok: boolean;
  workOrder?: { workOrderId: string; status: string };
  document?: {
    id: string;
    title: string;
    body: string;
    revision: number;
    activityVersion: number;
  };
  event?: {
    eventId: string;
    activityVersion: number;
    kind: string;
    baseRevision: number;
    resultRevision: number;
    workOrderId: string | null;
    changeSummary: string | null;
  };
}

interface AdapterState {
  active: string[];
  retired: string[];
  pendingOperations: string[];
  registrations: Array<{ name: string; fragmentWasPresent: boolean }>;
}

interface PageDiagnostics {
  consoleErrors: number;
  pageErrors: number;
  requestFailures: number;
  errorResponses: Array<{ route: string; status: number }>;
}

function requireSecretSafe(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isResetEnvelope(value: unknown): value is { ok: true; data: ResetOutcome } {
  if (!value || typeof value !== "object") return false;
  const envelope = value as { ok?: unknown; data?: unknown };
  if (envelope.ok !== true || !envelope.data || typeof envelope.data !== "object") {
    return false;
  }
  const data = envelope.data as Partial<ResetOutcome>;
  return (
    typeof data.shareToken === "string" &&
    typeof data.mayaBootstrapPath === "string" &&
    typeof data.jordanBootstrapPath === "string" &&
    typeof data.expiresAt === "string" &&
    typeof data.revision === "number" &&
    typeof data.activityVersion === "number"
  );
}

function validateBootstrapPath(path: string, shareToken: string): void {
  const prefix = `/document/${shareToken}#ratiflow-bootstrap=`;
  requireSecretSafe(path.startsWith(prefix), "Reset returned a malformed bootstrap path.");
  const encoded = path.slice(prefix.length);
  requireSecretSafe(
    encoded.length > 0 && /^[A-Za-z0-9_-]+$/.test(encoded),
    "Reset returned a malformed bootstrap fragment.",
  );
}

async function resetHero(request: APIRequestContext): Promise<ResetOutcome> {
  const response = await request.post("/api/document-v3/eval/reset", {
    headers: { Authorization: `Bearer ${RESET_TOKEN}` },
  });
  requireSecretSafe(
    response.status() === 201,
    `The guarded hero reset returned HTTP ${response.status()}.`,
  );
  const payload: unknown = await response.json();
  requireSecretSafe(isResetEnvelope(payload), "The guarded hero reset returned an invalid shape.");
  const outcome = payload.data;
  expect(outcome.revision).toBe(1);
  expect(outcome.activityVersion).toBe(1);
  requireSecretSafe(
    Number.isFinite(Date.parse(outcome.expiresAt)) && Date.parse(outcome.expiresAt) > Date.now(),
    "The guarded hero reset returned an invalid expiry.",
  );
  validateBootstrapPath(outcome.mayaBootstrapPath, outcome.shareToken);
  validateBootstrapPath(outcome.jordanBootstrapPath, outcome.shareToken);
  requireSecretSafe(
    outcome.mayaBootstrapPath !== outcome.jordanBootstrapPath,
    "Maya and Jordan must receive distinct bootstrap credentials.",
  );
  return outcome;
}

async function installAdapterRehearsal(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      execute: (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
    };

    const active = new Map<string, RegisteredTool>();
    type OperationSettlement =
      | { status: "fulfilled"; value: unknown }
      | { status: "rejected"; error: unknown };

    const pending = new Map<string, Promise<OperationSettlement>>();
    const retired: string[] = [];
    const registrations: Array<{ name: string; fragmentWasPresent: boolean }> = [];
    const unwrap = (value: unknown): unknown => {
      if (value && typeof value === "object" && "structuredContent" in value) {
        return (value as { structuredContent: unknown }).structuredContent;
      }
      return value;
    };
    const invoke = async (
      name: string,
      input: unknown,
      signal = new AbortController().signal,
    ): Promise<unknown> => {
      const tool = active.get(name);
      if (!tool) throw new Error(`Adapter rehearsal tool ${name} is not registered.`);
      return unwrap(await tool.execute(input, { signal }));
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
          registrations.push({
            name: tool.name,
            fragmentWasPresent: window.location.hash.length > 0,
          });
          active.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => {
              if (active.get(tool.name) === tool) active.delete(tool.name);
              retired.push(tool.name);
            },
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, "__ratiflowDocumentRehearsal", {
      configurable: true,
      value: {
        state: (): AdapterState => ({
          active: [...active.keys()],
          retired: [...retired],
          pendingOperations: [...pending.keys()],
          registrations: registrations.map((entry) => ({ ...entry })),
        }),
        invoke,
        start(id: string, name: string, input: unknown) {
          if (pending.has(id)) throw new Error(`Adapter operation ${id} already exists.`);
          const controller = new AbortController();
          pending.set(
            id,
            invoke(name, input, controller.signal).then<
              OperationSettlement,
              OperationSettlement
            >(
              (value) => ({ status: "fulfilled", value }),
              (error: unknown) => ({ status: "rejected", error }),
            ),
          );
        },
        async finish(id: string) {
          const operation = pending.get(id);
          if (!operation) throw new Error(`Adapter operation ${id} does not exist.`);
          try {
            const settlement = await operation;
            if (settlement.status === "rejected") throw settlement.error;
            return settlement.value;
          } finally {
            pending.delete(id);
          }
        },
      },
    });
  });
}

function observePage(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleErrors: 0,
    pageErrors: 0,
    requestFailures: 0,
    errorResponses: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors += 1;
  });
  page.on("pageerror", () => {
    diagnostics.pageErrors += 1;
  });
  page.on("requestfailed", () => {
    diagnostics.requestFailures += 1;
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    const route = url.pathname.startsWith("/document/")
      ? "/document/[share]"
      : url.pathname;
    diagnostics.errorResponses.push({ route, status: response.status() });
  });
  return diagnostics;
}

async function openBootstrapPage(page: Page, bootstrapPath: string): Promise<void> {
  try {
    await page.goto(bootstrapPath);
    await page.waitForFunction(
      () =>
        window.location.hash === "" &&
        document.querySelector<HTMLTextAreaElement>("#workspace-document-body")
          ?.disabled === false,
    );
  } catch {
    throw new Error("The protected bootstrap page did not become ready.");
  }
  const safeLocation = await page.evaluate(() => ({
    fragmentAbsent: window.location.hash === "",
    isDocumentRoute: /^\/document\/[A-Za-z0-9_-]+$/.test(window.location.pathname),
  }));
  expect(safeLocation).toEqual({ fragmentAbsent: true, isDocumentRoute: true });
}

async function adapterState(page: Page): Promise<AdapterState> {
  return page.evaluate(() =>
    (window as typeof window & {
      __ratiflowDocumentRehearsal: { state: () => AdapterState };
    }).__ratiflowDocumentRehearsal.state(),
  );
}

async function invokeTool<T>(page: Page, name: string, input: unknown): Promise<T> {
  return page.evaluate(
    ({ toolName, toolInput }) =>
      (window as typeof window & {
        __ratiflowDocumentRehearsal: {
          invoke: (registeredName: string, registeredInput: unknown) => Promise<unknown>;
        };
      }).__ratiflowDocumentRehearsal.invoke(toolName, toolInput),
    { toolName: name, toolInput: input },
  ) as Promise<T>;
}

async function startTool(
  page: Page,
  operationId: string,
  name: string,
  input: unknown,
): Promise<void> {
  await page.evaluate(
    ({ id, toolName, toolInput }) => {
      (window as typeof window & {
        __ratiflowDocumentRehearsal: {
          start: (operation: string, registeredName: string, registeredInput: unknown) => void;
        };
      }).__ratiflowDocumentRehearsal.start(id, toolName, toolInput);
    },
    { id: operationId, toolName: name, toolInput: input },
  );
}

async function finishTool<T>(page: Page, operationId: string): Promise<T> {
  return page.evaluate(
    (id) =>
      (window as typeof window & {
        __ratiflowDocumentRehearsal: {
          finish: (operation: string) => Promise<unknown>;
        };
      }).__ratiflowDocumentRehearsal.finish(id),
    operationId,
  ) as Promise<T>;
}

async function finishToolErrorName(page: Page, operationId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const rehearsal = (window as typeof window & {
      __ratiflowDocumentRehearsal: {
        finish: (operation: string) => Promise<unknown>;
      };
    }).__ratiflowDocumentRehearsal;
    try {
      await rehearsal.finish(id);
      return "NO_ERROR";
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        typeof error.name === "string"
      ) {
        return error.name;
      }
      return "UnknownError";
    }
  }, operationId);
}

async function navigateWithAppRouter(page: Page, pathname: string): Promise<void> {
  await page.evaluate((nextPathname) => {
    const appRouter = (window as typeof window & {
      next?: { router?: { push?: (href: string) => void } };
    }).next?.router;
    if (!appRouter?.push) throw new Error("The Next app router is unavailable.");
    appRouter.push(nextPathname);
  }, pathname);
  await page.waitForURL((url) => url.pathname === pathname);
}

async function storedMemberId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((candidate) =>
      candidate.startsWith("ratiflow.document.session.v3:"),
    );
    if (!key) throw new Error("The v3 session was not installed.");
    const bundle = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
      selfMemberId?: string;
    } | null;
    if (!bundle?.selfMemberId) throw new Error("The paired member ID is absent.");
    return bundle.selfMemberId;
  });
}

async function expectAdapterRegisteredAfterScrub(page: Page): Promise<void> {
  await expect
    .poll(async () => (await adapterState(page)).active)
    .toEqual([...ALL_V3_TOOLS]);
  const state = await adapterState(page);
  const v3Registrations = state.registrations.filter((entry) =>
    (ALL_V3_TOOLS as readonly string[]).includes(entry.name),
  );
  expect(v3Registrations.map((entry) => entry.name)).toEqual([...ALL_V3_TOOLS]);
  expect(v3Registrations.every((entry) => !entry.fragmentWasPresent)).toBe(true);
}

async function expectStableAdapterCatalog(page: Page): Promise<void> {
  await expect
    .poll(async () => (await adapterState(page)).active)
    .toEqual([...ALL_V3_TOOLS]);
}

async function selectHeroSentenceWithKeyboard(page: Page): Promise<void> {
  const body = page.getByLabel("Note body");
  await body.focus();
  // Establish only the caret. Every selected code point is added by real keyboard input.
  await body.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0));
  for (let index = 0; index < 16; index += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.down("Shift");
  for (let index = 16; index < 71; index += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  const selection = await body.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
    text: element.value.slice(element.selectionStart, element.selectionEnd),
  }));
  expect(selection).toEqual({ start: 16, end: 71, text: HERO_SELECTION });
}

async function openRewriteWithRealRightClick(page: Page): Promise<void> {
  const body = page.getByLabel("Note body");
  // The selected sentence is the third rendered line. A locator-level secondary
  // click emits the genuine pointerdown/contextmenu pair while keeping the click
  // inside that selection instead of collapsing it onto the preceding blank line.
  await body.click({ button: "right", position: { x: 48, y: 55 } });
  await expect
    .poll(() =>
      body.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    )
    .toEqual([16, 71]);
  await page.getByRole("menuitem", { name: /Rewrite/ }).click();
  await expect(page.getByTestId("work-target-preview")).toContainText(HERO_SELECTION);
}

async function clickWithRealPointer(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("The decision control did not have a pointer target.");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const ownsPoint = await target.evaluate((element, position) => {
    const hit = document.elementFromPoint(position.x, position.y);
    return hit === element || element.contains(hit);
  }, point);
  expect(ownsPoint).toBe(true);
  await page.mouse.click(point.x, point.y);
}

function expectNoPageErrors(diagnostics: PageDiagnostics[]): void {
  expect(
    diagnostics.map(({ consoleErrors, pageErrors, requestFailures, errorResponses }) => ({
      consoleErrors,
      pageErrors,
      requestFailures,
      errorResponses,
    })),
  ).toEqual(
    diagnostics.map(() => ({
      consoleErrors: 0,
      pageErrors: 0,
      requestFailures: 0,
      errorResponses: [],
    })),
  );
}

test.describe("adapter rehearsal (not native WebMCP evidence)", () => {
  test("replays the frozen two-human hero and fresh-agent anti-loop proof", async ({
    browser,
    request,
  }) => {
    const reset = await resetHero(request);
    let mayaContext: BrowserContext | undefined;
    let jordanContext: BrowserContext | undefined;
    let freshMayaContext: BrowserContext | undefined;
    const diagnostics: PageDiagnostics[] = [];

    try {
      mayaContext = await browser.newContext();
      jordanContext = await browser.newContext();
      await installAdapterRehearsal(mayaContext);
      await installAdapterRehearsal(jordanContext);
      const maya = await mayaContext.newPage();
      const jordan = await jordanContext.newPage();
      diagnostics.push(observePage(maya), observePage(jordan));

      await Promise.all([
        openBootstrapPage(maya, reset.mayaBootstrapPath),
        openBootstrapPage(jordan, reset.jordanBootstrapPath),
      ]);
      expect(await storedMemberId(maya)).toBe(HERO_MAYA_ID);
      expect(await storedMemberId(jordan)).toBe(HERO_JORDAN_ID);
      await Promise.all([
        expectAdapterRegisteredAfterScrub(maya),
        expectAdapterRegisteredAfterScrub(jordan),
      ]);
      await expect(jordan.getByLabel(/other (person|people) here/)).toHaveAttribute(
        "aria-label",
        "1 other person here",
      );

      const initial = await invokeTool<InspectResult>(maya, "inspect_document", {});
      expect(initial).toMatchObject({
        ok: true,
        document: {
          id: HERO_DOCUMENT_ID,
          title: HERO_TITLE,
          body: HERO_BODY,
          revision: 1,
          activityVersion: 1,
        },
      });
      const seedMemory = await invokeTool<MemoryResult>(
        maya,
        "read_document_memory",
        { limit: 20 },
      );
      expect(seedMemory).toMatchObject({
        ok: true,
        hasMoreOlder: false,
        latestActivityVersion: 1,
        revision: 1,
      });
      expect(seedMemory.events?.map((event) => [
        event.eventId,
        event.activityVersion,
        event.kind,
        event.baseRevision,
        event.resultRevision,
      ])).toEqual([[HERO_EVENT_IDS[0], 1, "DOCUMENT_EDITED", 0, 1]]);
      expect(await invokeTool<WorkResult>(maya, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 1,
        activityVersion: 1,
      });
      expect(await invokeTool<WorkResult>(jordan, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 1,
        activityVersion: 1,
      });

      // The agent is already waiting before Jordan creates or changes any work.
      await startTool(maya, "canonical-wait", "wait_for_my_work", {
        afterActivityVersion: 1,
        afterRevision: 1,
        timeoutSeconds: 20,
      });

      await selectHeroSentenceWithKeyboard(jordan);
      await openRewriteWithRealRightClick(jordan);
      await jordan.getByLabel("Work instruction").fill(HERO_INSTRUCTION);
      await jordan.getByLabel("Assignee").selectOption(HERO_MAYA_ID);
      await jordan.getByRole("button", { name: "Assign work" }).click();

      const waited = await finishTool<WorkResult>(maya, "canonical-wait");
      expect(waited).toMatchObject({
        ok: true,
        outcome: "WORK_AVAILABLE",
        revision: 1,
        activityVersion: 2,
        workOrders: [
          {
            workOrderId: HERO_WORK_ORDER_ID,
            status: "PENDING",
            source: "CONTEXT_MENU",
            intent: "REWRITE",
            instruction: HERO_INSTRUCTION,
            creatorMemberId: HERO_JORDAN_ID,
            assignedToMemberId: HERO_MAYA_ID,
            anchor: {
              field: "BODY",
              rangeStart: 16,
              rangeEnd: 71,
              selectedText: HERO_SELECTION,
              createdRevision: 1,
              anchorRevision: 1,
            },
          },
        ],
      });
      expect(await invokeTool<WorkResult>(jordan, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 1,
        activityVersion: 2,
      });
      await Promise.all([
        expectStableAdapterCatalog(jordan),
        expectStableAdapterCatalog(maya),
      ]);

      const memoryBeforeProposal = await invokeTool<MemoryResult>(
        maya,
        "read_document_memory",
        { limit: 20 },
      );
      expect(memoryBeforeProposal).toMatchObject({
        ok: true,
        latestActivityVersion: 2,
        revision: 1,
      });
      expect(memoryBeforeProposal.events?.map((event) => [
        event.eventId,
        event.activityVersion,
        event.kind,
        event.workOrderId,
      ])).toEqual([
        [HERO_EVENT_IDS[0], 1, "DOCUMENT_EDITED", null],
        [HERO_EVENT_IDS[1], 2, "WORK_CREATED", HERO_WORK_ORDER_ID],
      ]);
      const listed = await invokeTool<WorkResult>(maya, "list_my_work", {});
      expect(listed).toMatchObject({
        ok: true,
        revision: 1,
        activityVersion: 2,
        workOrders: [{ workOrderId: HERO_WORK_ORDER_ID, status: "PENDING" }],
      });

      const proposal = await invokeTool<ProposalResult>(
        maya,
        "submit_work_proposal",
        {
          workOrderId: HERO_WORK_ORDER_ID,
          expectedRevision: 1,
          replacementText: HERO_REPLACEMENT,
          changeSummary: HERO_SUMMARY,
        },
      );
      expect(proposal).toMatchObject({
        ok: true,
        workOrder: { workOrderId: HERO_WORK_ORDER_ID, status: "PROPOSED" },
        document: {
          id: HERO_DOCUMENT_ID,
          title: HERO_TITLE,
          body: HERO_BODY,
          revision: 1,
          activityVersion: 3,
        },
        event: {
          eventId: HERO_EVENT_IDS[2],
          activityVersion: 3,
          kind: "PROPOSAL_SUBMITTED",
          baseRevision: 1,
          resultRevision: 1,
          workOrderId: HERO_WORK_ORDER_ID,
          changeSummary: HERO_SUMMARY,
        },
      });
      await expect(maya.getByLabel("Note body")).toHaveValue(HERO_BODY);
      await expect(jordan.getByLabel("Note body")).toHaveValue(HERO_BODY);
      expect(await invokeTool<InspectResult>(maya, "inspect_document", {})).toMatchObject({
        ok: true,
        document: { body: HERO_BODY, revision: 1, activityVersion: 3 },
      });
      expect(await invokeTool<WorkResult>(jordan, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 1,
        activityVersion: 3,
      });
      await expectStableAdapterCatalog(jordan);

      const jordanCard = jordan.getByTestId("work-order-card");
      await expect(jordanCard).toContainText(HERO_REPLACEMENT);
      await expect(jordanCard).toContainText("Asked");
      await expect(jordanCard).toContainText("Proposed");
      await jordanCard.getByText("Details", { exact: true }).click();
      await jordanCard.getByLabel(/Decision note/).fill(HERO_RATIONALE);
      await clickWithRealPointer(
        jordan,
        jordanCard.getByRole("button", { name: "Accept" }),
      );
      await expect(jordan.getByLabel("Note body")).toHaveValue(FINAL_BODY);
      await expect(maya.getByLabel("Note body")).toHaveValue(FINAL_BODY);
      expect(await invokeTool<WorkResult>(jordan, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 2,
        activityVersion: 4,
      });
      await expectStableAdapterCatalog(jordan);

      // Adapter preflight only: route teardown aborts the live page-local wait. The
      // callback settles only after its finally block releases the active wait key.
      await startTool(maya, "teardown-wait", "wait_for_my_work", {
        afterActivityVersion: 4,
        afterRevision: 2,
        timeoutSeconds: 20,
      });
      await expect
        .poll(async () => (await adapterState(maya)).pendingOperations)
        .toEqual(["teardown-wait"]);
      expect(await invokeTool<WorkResult>(maya, "wait_for_my_work", {
        afterActivityVersion: 4,
        afterRevision: 2,
        timeoutSeconds: 20,
      })).toMatchObject({ ok: false, code: "WAIT_ALREADY_ACTIVE" });
      await navigateWithAppRouter(maya, "/decision-demo");
      await expect(maya.getByRole("button", { name: "Launch deterministic workspace" }))
        .toBeVisible();
      await expect.poll(async () => (await adapterState(maya)).active).toEqual([]);
      expect(await finishToolErrorName(maya, "teardown-wait")).toBe("AbortError");
      expect(await adapterState(maya)).toMatchObject({
        active: [],
        pendingOperations: [],
      });

      await mayaContext.close();
      mayaContext = undefined;
      freshMayaContext = await browser.newContext();
      await installAdapterRehearsal(freshMayaContext);
      const freshMaya = await freshMayaContext.newPage();
      diagnostics.push(observePage(freshMaya));
      await openBootstrapPage(freshMaya, reset.mayaBootstrapPath);
      expect(await storedMemberId(freshMaya)).toBe(HERO_MAYA_ID);
      await expectAdapterRegisteredAfterScrub(freshMaya);

      const finalDocument = await invokeTool<InspectResult>(
        freshMaya,
        "inspect_document",
        {},
      );
      expect(finalDocument).toMatchObject({
        ok: true,
        document: {
          id: HERO_DOCUMENT_ID,
          title: HERO_TITLE,
          body: FINAL_BODY,
          revision: 2,
          activityVersion: 4,
        },
      });
      const freshMemory = await invokeTool<MemoryResult>(
        freshMaya,
        "read_document_memory",
        { limit: 20 },
      );
      expect(freshMemory).toMatchObject({
        ok: true,
        hasMoreOlder: false,
        latestActivityVersion: 4,
        revision: 2,
      });
      expect(freshMemory.events?.map((event) => [
        event.eventId,
        event.activityVersion,
        event.kind,
        event.baseRevision,
        event.resultRevision,
      ])).toEqual([
        [HERO_EVENT_IDS[0], 1, "DOCUMENT_EDITED", 0, 1],
        [HERO_EVENT_IDS[1], 2, "WORK_CREATED", 1, 1],
        [HERO_EVENT_IDS[2], 3, "PROPOSAL_SUBMITTED", 1, 1],
        [HERO_EVENT_IDS[3], 4, "PROPOSAL_ACCEPTED", 1, 2],
      ]);
      const accepted = freshMemory.events?.find(
        (event) => event.eventId === HERO_EVENT_IDS[3],
      );
      expect(accepted).toMatchObject({
        rationale: HERO_RATIONALE,
        changeSummary: HERO_SUMMARY,
        workOrderId: HERO_WORK_ORDER_ID,
        diffs: [
          {
            field: "BODY",
            rangeStart: 16,
            rangeEnd: 71,
            beforeExcerpt: HERO_SELECTION,
            afterExcerpt: HERO_REPLACEMENT,
          },
        ],
      });
      expect(finalDocument.document?.body).not.toContain("eight export days");
      expect(accepted?.rationale).toContain("requires eight export days");
      expect(await invokeTool<WorkResult>(freshMaya, "list_my_work", {})).toMatchObject({
        ok: true,
        workOrders: [],
        revision: 2,
        activityVersion: 4,
      });

      await freshMaya.goto("/decision-demo");
      await expect
        .poll(async () =>
          (await adapterState(freshMaya)).active.filter((name) =>
            (ALL_V3_TOOLS as readonly string[]).includes(name),
          ),
        )
        .toEqual([]);
      expectNoPageErrors(diagnostics);
    } finally {
      await Promise.allSettled([
        mayaContext?.close(),
        jordanContext?.close(),
        freshMayaContext?.close(),
      ]);
    }
  });
});
