import { expect, test, type Page, type Request } from "@playwright/test";

const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";
const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";

interface ContextMenuObservation {
  defaultPrevented: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface KeyboardObservation {
  defaultPrevented: boolean;
  key: string;
  shiftKey: boolean;
}

interface PresenceObservation {
  payload: {
    state: unknown;
    field: unknown;
    isTyping: unknown;
    selectionStart: unknown;
    selectionEnd: unknown;
  };
  status?: number;
}

async function selectBodyRange(page: Page, start: number, end: number): Promise<void> {
  const body = page.getByLabel("Note body");
  await body.evaluate(
    (element: HTMLTextAreaElement, range) => {
      element.focus();
      element.setSelectionRange(range.start, Math.max(range.start, range.end - 1));
    },
    { start, end },
  );
  if (end > start) await page.keyboard.press("Shift+ArrowRight");
}

function waitForSuccessfulSave(
  page: Page,
  expected: { title: string; body: string },
) {
  return page.waitForResponse(
    (response) => {
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
    },
  );
}

async function selectAllBodyWithKeyboard(page: Page): Promise<void> {
  const body = page.getByLabel("Note body");
  await body.focus();
  await page.keyboard.press(selectAllShortcut);
  const valueLength = await body.evaluate((element: HTMLTextAreaElement) => element.value.length);
  await expect
    .poll(() =>
      body.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    )
    .toEqual([0, valueLength]);
}

async function armContextMenuObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observedWindow = window as typeof window & {
      __ratiflowContextMenuObservation?: ContextMenuObservation | null;
    };
    observedWindow.__ratiflowContextMenuObservation = null;
    document.addEventListener(
      "contextmenu",
      (event) => {
        window.setTimeout(() => {
          observedWindow.__ratiflowContextMenuObservation = {
            defaultPrevented: event.defaultPrevented,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
          };
        }, 0);
      },
      { once: true },
    );
  });
}

async function readContextMenuObservation(page: Page): Promise<ContextMenuObservation> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & {
          __ratiflowContextMenuObservation?: ContextMenuObservation | null;
        }).__ratiflowContextMenuObservation ?? null,
      ),
    )
    .not.toBeNull();
  return page.evaluate(() =>
    (window as typeof window & {
      __ratiflowContextMenuObservation?: ContextMenuObservation;
    }).__ratiflowContextMenuObservation as ContextMenuObservation,
  );
}

async function armKeyboardObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observedWindow = window as typeof window & {
      __ratiflowKeyboardObservation?: KeyboardObservation | null;
    };
    observedWindow.__ratiflowKeyboardObservation = null;
    const observeF10 = (event: KeyboardEvent) => {
      if (event.key !== "F10") return;
      document.removeEventListener("keydown", observeF10);
      window.setTimeout(() => {
        observedWindow.__ratiflowKeyboardObservation = {
          defaultPrevented: event.defaultPrevented,
          key: event.key,
          shiftKey: event.shiftKey,
        };
      }, 0);
    };
    document.addEventListener("keydown", observeF10);
  });
}

async function readKeyboardObservation(page: Page): Promise<KeyboardObservation> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & {
          __ratiflowKeyboardObservation?: KeyboardObservation | null;
        }).__ratiflowKeyboardObservation ?? null,
      ),
    )
    .not.toBeNull();
  return page.evaluate(() =>
    (window as typeof window & {
      __ratiflowKeyboardObservation?: KeyboardObservation;
    }).__ratiflowKeyboardObservation as KeyboardObservation,
  );
}

async function mismatchedPointerContextPrevented(page: Page): Promise<boolean> {
  return page.getByLabel("Note body").evaluate(
    (element: HTMLTextAreaElement) => {
      element.focus();
      element.setSelectionRange(0, 13);
      element.dispatchEvent(new Event("select", { bubbles: true }));
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 2,
          pointerId: 41,
        }),
      );
      const contextEvent = new PointerEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        pointerId: 99,
      });
      element.dispatchEvent(contextEvent);
      return contextEvent.defaultPrevented;
    },
  );
}

test("v3 note is calm without WebMCP and owns only an exact pointer-origin menu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);

  const title = page.getByLabel("Note title");
  const body = page.getByLabel("Note body");
  const rail = page.getByRole("complementary", { name: "Work and memory" });
  await expect(title).toBeEditable();
  await expect(body).toBeEditable();
  await expect(rail).toBeVisible();
  await expect(page.getByTestId("writing-surface")).toHaveCSS("box-shadow", "none");
  await expect(page.getByLabel("Document stage")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Hold Shift for spelling menu", { exact: false })).toBeVisible();
  expect(await title.evaluate((element: HTMLInputElement) => element.spellcheck)).toBe(true);
  expect(await body.evaluate((element: HTMLTextAreaElement) => element.spellcheck)).toBe(true);
  expect((await page.locator("header").first().boundingBox())?.height).toBe(52);
  expect(
    await page.evaluate(() => ({
      documentModelContext: "modelContext" in document,
      navigatorModelContext: "modelContext" in navigator,
    })),
  ).toEqual({ documentModelContext: false, navigatorModelContext: false });
  await expect(page.getByTestId("page-capability-state")).toHaveCount(0);

  const firstSave = waitForSuccessfulSave(page, {
    title: "A decision note",
    body: "Launch timing needs a clear recommendation for the team.",
  });
  await title.fill("A decision note");
  await body.fill("Launch timing needs a clear recommendation for the team.");
  await firstSave;
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("A decision note");
  await expect(body).toHaveValue("Launch timing needs a clear recommendation for the team.");

  const menu = page.getByRole("menu", { name: "Agent actions" });

  for (const { modifier, observationKey } of [
    { modifier: "Shift" as const, observationKey: "shiftKey" as const },
    { modifier: "Alt" as const, observationKey: "altKey" as const },
    { modifier: "Control" as const, observationKey: "ctrlKey" as const },
    { modifier: "Meta" as const, observationKey: "metaKey" as const },
  ]) {
    await selectAllBodyWithKeyboard(page);
    await armContextMenuObservation(page);
    await body.click({ button: "right", modifiers: [modifier], position: { x: 20, y: 20 } });
    const observation = await readContextMenuObservation(page);
    expect(observation.defaultPrevented).toBe(false);
    expect(observation[observationKey]).toBe(true);
    await expect(menu).toHaveCount(0);
  }

  await selectAllBodyWithKeyboard(page);
  await armKeyboardObservation(page);
  await page.keyboard.press("Shift+F10");
  expect(await readKeyboardObservation(page)).toMatchObject({
    defaultPrevented: false,
    key: "F10",
    shiftKey: true,
  });
  await expect(menu).toHaveCount(0);

  await body.focus();
  await page.keyboard.press("ArrowRight");
  await armContextMenuObservation(page);
  await body.click({ button: "right", position: { x: 20, y: 20 } });
  expect((await readContextMenuObservation(page)).defaultPrevented).toBe(false);
  await expect(menu).toHaveCount(0);

  await armContextMenuObservation(page);
  await page
    .getByText("Hold Shift for spelling menu", { exact: false })
    .click({ button: "right" });
  expect((await readContextMenuObservation(page)).defaultPrevented).toBe(false);
  await expect(menu).toHaveCount(0);

  expect(await mismatchedPointerContextPrevented(page)).toBe(false);

  await selectAllBodyWithKeyboard(page);
  await expect(page.getByTestId("ask-agent-selection")).toBeVisible();
  await armContextMenuObservation(page);
  await body.click({ button: "right", position: { x: 20, y: 20 } });
  expect((await readContextMenuObservation(page)).defaultPrevented).toBe(true);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await menu.getByRole("menuitem", { name: /Rewrite/ }).click();
  await expect(page.getByTestId("work-target-preview")).toContainText(
    "Launch timing needs a clear recommendation",
  );
  await expect(page.getByLabel("Work intent")).toHaveValue("REWRITE");
  await expect(page.getByLabel("Work instruction")).toHaveValue(
    "Rewrite the selected text for clarity while preserving its meaning and factual qualifications.",
  );
  await expect(page.getByTestId("work-order-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Close assignment composer" }).click();
  await expect(body).toBeFocused();

  await selectBodyRange(page, 14, 19);
  await page.keyboard.press(shortcut);
  const instruction = page.getByLabel("Work instruction");
  await expect(instruction).toBeFocused();
  await expect(page.getByLabel("Work intent")).toHaveValue("CUSTOM");
  await expect(page.getByTestId("work-target-preview")).toContainText("needs");
  await instruction.fill("Make this phrase more decisive.");
  await expect(page.getByLabel("Assignee").locator("option")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Assign work" }).click();
  const card = page.getByTestId("work-order-card");
  await expect(card).toContainText("Make this phrase more decisive.");
  await expect(body).toHaveValue("Launch timing needs a clear recommendation for the team.");
  await card.getByRole("button", { name: "Cancel work" }).click();
  await expect(card).toContainText("Cancelled");
});

test("390px Work and Memory drawer is reachable, overflow-safe, and restores selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/document\//);

  const body = page.getByLabel("Note body");
  const rail = page.getByRole("complementary", { name: "Work and memory" });
  const toggle = page.getByRole("button", { name: /Work and memory/ });
  await expect(body).toBeEditable();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(rail).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(rail).toBeVisible();
  const railHeading = page.getByRole("heading", { name: "Collaboration" });
  await expect(railHeading).toBeFocused();
  const closeRail = page.getByRole("button", { name: "Close work and memory" });
  const closeRailBox = await closeRail.boundingBox();
  expect(closeRailBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeRailBox?.height).toBeGreaterThanOrEqual(44);
  await railHeading.press("Escape");
  await expect(rail).toBeHidden();
  await expect(toggle).toBeFocused();

  const narrowSave = waitForSuccessfulSave(page, {
    title: "",
    body: "A narrow-screen collaboration note.",
  });
  await body.fill("A narrow-screen collaboration note.");
  await narrowSave;
  await selectBodyRange(page, 2, 15);
  await page.keyboard.press(shortcut);
  const instruction = page.getByLabel("Work instruction");
  await expect(instruction).toBeFocused();
  const composerClose = page.getByRole("button", { name: "Close assignment composer" });
  await expect
    .poll(async () => (await composerClose.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await composerClose.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(body).toBeFocused();
  expect(
    await body.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([2, 15]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("composer blur keeps presence heartbeats valid and the assignee actionable", async ({
  page,
}) => {
  const postComposerRequests = new Map<Request, PresenceObservation>();
  const postComposerHeartbeats: PresenceObservation[] = [];
  const postComposerFailures: string[] = [];
  let observePostComposer = false;
  page.on("request", (request) => {
    if (
      !observePostComposer ||
      !request.url().endsWith("/api/document-v3/presence")
    ) {
      return;
    }
    const payload = request.postDataJSON() as PresenceObservation["payload"];
    postComposerRequests.set(request, { payload });
  });
  page.on("response", (response) => {
    const observation = postComposerRequests.get(response.request());
    if (!observation) return;
    observation.status = response.status();
    postComposerHeartbeats.push(observation);
  });
  page.on("requestfailed", (request) => {
    if (!postComposerRequests.has(request)) return;
    postComposerFailures.push(request.failure()?.errorText ?? "unknown failure");
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/document\//);
  const body = page.getByLabel("Note body");
  const presenceSave = waitForSuccessfulSave(page, {
    title: "",
    body: "Presence remains valid while a person writes an instruction.",
  });
  await body.fill("Presence remains valid while a person writes an instruction.");
  await presenceSave;
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await selectBodyRange(page, 0, 8);
  const askAgent = page.getByTestId("ask-agent-selection");
  await expect(askAgent).toBeVisible();
  await askAgent.click();
  const instruction = page.getByLabel("Work instruction");
  await expect(instruction).toBeFocused();
  observePostComposer = true;
  await instruction.fill("Make this opening more specific.");
  await expect
    .poll(() => postComposerHeartbeats.length, { timeout: 8_000 })
    .toBeGreaterThan(0);
  expect(postComposerHeartbeats.length).toBeGreaterThan(0);
  for (const heartbeat of postComposerHeartbeats) {
    expect(heartbeat).toMatchObject({
      payload: {
        state: "VIEWING",
        field: null,
        isTyping: false,
        selectionStart: null,
        selectionEnd: null,
      },
      status: 200,
    });
  }
  expect(postComposerFailures).toEqual([]);
  await expect(page.getByLabel("Assignee")).toBeEnabled();
  await expect(page.getByLabel("Assignee").locator("option")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign work" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("invalid shared links recover without exposing an editor session", async ({ page }) => {
  await page.goto("/document/not-a-valid-share-token");
  await expect(
    page.getByRole("heading", { name: "This note is no longer available" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "New note" })).toBeVisible();
  await expect(page.getByTestId("writing-surface")).toHaveCount(0);
});
