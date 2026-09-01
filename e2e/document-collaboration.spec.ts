import { expect, test, type Page } from "@playwright/test";

const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

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

async function selfMemberId(page: Page): Promise<string> {
  const readMemberId = () => page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((candidate) =>
      candidate.startsWith("ratiflow.document.session.v3:"),
    );
    if (!key) return null;
    const bundle = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
      selfMemberId?: string;
    } | null;
    return bundle?.selfMemberId ?? null;
  });
  await expect.poll(readMemberId, { timeout: 10_000 }).not.toBeNull();
  const memberId = await readMemberId();
  if (!memberId) throw new Error("The v3 member identity was absent.");
  return memberId;
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

test("two isolated humans edit, see presence, and retain creator-only work control", async ({
  browser,
  baseURL,
}) => {
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await first.goto("/");
    await expect(first).toHaveURL(/\/document\//);
    const sharedUrl = first.url();
    const firstId = await selfMemberId(first);
    expect(new URL(sharedUrl).hash).toBe("");

    const reopened = await firstContext.newPage();
    await reopened.goto("/");
    await expect(reopened).toHaveURL(sharedUrl);
    expect(await selfMemberId(reopened)).toBe(firstId);
    const persistedBrowserValues = await reopened.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("ratiflow.document."))
        .map((key) => localStorage.getItem(key) ?? "")
        .join("\n"),
    );
    expect(persistedBrowserValues).not.toContain("surface");
    expect(persistedBrowserValues).not.toContain("workOrders");
    expect(persistedBrowserValues).not.toContain("memory");
    await reopened.close();

    const malformedLinkTab = await firstContext.newPage();
    await malformedLinkTab.goto(`${sharedUrl}#ratiflow-bootstrap=malformed`);
    await expect(malformedLinkTab).toHaveURL(sharedUrl);
    await expect(malformedLinkTab.getByLabel("Note body")).toBeEditable();
    expect(await selfMemberId(malformedLinkTab)).toBe(firstId);
    await malformedLinkTab.close();

    await second.goto(sharedUrl);
    await expect(second.getByLabel("Note body")).toBeEditable();
    const secondId = await selfMemberId(second);

    await expect(first.getByLabel(/other (person|people) here/)).toHaveAttribute(
      "aria-label",
      "1 other person here",
      { timeout: 8_000 },
    );
    await expect(second.getByLabel(/other (person|people) here/)).toHaveAttribute(
      "aria-label",
      "1 other person here",
      { timeout: 8_000 },
    );

    const bodyText = "One shared recommendation with an exact decision target.";
    const sharedSave = waitForDocumentSave(first, { title: "", body: bodyText });
    await first.getByLabel("Note body").fill(bodyText);
    await sharedSave;
    await expect(second.getByLabel("Note body")).toHaveValue(bodyText, { timeout: 8_000 });

    await selectBodyRange(first, 4, 25);
    await first.keyboard.press(shortcut);
    await first.getByLabel("Work instruction").fill(
      "Turn this into a concrete recommendation without changing the underlying constraint.",
    );
    await expect(first.getByLabel("Assignee").locator(`option[value="${secondId}"]`)).toHaveCount(1);
    await first.getByLabel("Assignee").selectOption(secondId);
    await first.getByRole("button", { name: "Assign work" }).click();

    const firstCard = first.getByTestId("work-order-card");
    const secondCard = second.getByTestId("work-order-card");
    await expect(firstCard).toContainText("Turn this into a concrete recommendation");
    await expect(secondCard).toContainText("Turn this into a concrete recommendation", {
      timeout: 8_000,
    });
    await expect(firstCard.getByRole("button", { name: "Cancel work" })).toHaveCount(1);
    await expect(secondCard.getByRole("button", { name: "Cancel work" })).toHaveCount(0);
    await expect(secondCard.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await expect(first.getByLabel("Note body")).toHaveValue(bodyText);

    await firstCard.getByRole("button", { name: "Cancel work" }).click();
    await expect(first.getByTestId("work-order-card")).toHaveCount(0);
    await expect(second.getByTestId("work-order-card")).toHaveCount(0, { timeout: 8_000 });
    await first.getByRole("tab", { name: "Memory" }).click();
    await second.getByRole("tab", { name: "Memory" }).click();
    await expect(first.getByTestId("memory-list")).toContainText("Work cancelled");
    await expect(second.getByTestId("memory-list")).toContainText("Work cancelled", {
      timeout: 8_000,
    });
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("a delayed local save preserves the dirty draft and offers explicit conflict choices", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45_000);
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  let releaseSave: (() => void) | undefined;

  try {
    await first.goto("/");
    await expect(first).toHaveURL(/\/document\//);
    await second.goto(first.url());
    await expect(first.getByLabel(/other (person|people) here/)).toHaveAttribute(
      "aria-label",
      "1 other person here",
      { timeout: 8_000 },
    );

    const baselineSave = waitForDocumentSave(first, {
      title: "",
      body: "Shared baseline.",
    });
    await first.getByLabel("Note body").fill("Shared baseline.");
    await baselineSave;
    await expect(second.getByLabel("Note body")).toHaveValue("Shared baseline.", {
      timeout: 8_000,
    });

    let markSaveStarted: (() => void) | undefined;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    let markSaveFinished: (() => void) | undefined;
    const saveFinished = new Promise<void>((resolve) => {
      markSaveFinished = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let intercepted = false;
    await first.route("**/api/document-v3/save", async (route) => {
      if (intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      markSaveStarted?.();
      await saveGate;
      const response = await route.fetch();
      await route.fulfill({ response });
      markSaveFinished?.();
    });

    await first.getByLabel("Note body").fill("My unsaved version.");
    await saveStarted;
    const collaboratorSave = waitForDocumentSave(second, {
      title: "",
      body: "The collaborator version.",
    });
    await second.getByLabel("Note body").fill("The collaborator version.");
    await collaboratorSave;
    await expect(first.getByRole("complementary", { name: "Work and memory" })).toBeVisible();
    await expect(first.getByText("A newer version is available")).toBeVisible({
      timeout: 10_000,
    });
    await expect(first.getByLabel("Note body")).toHaveValue("My unsaved version.");

    releaseSave?.();
    await saveFinished;
    await first.getByRole("button", { name: "Use latest" }).click();
    await expect(first.getByLabel("Note body")).toHaveValue("The collaborator version.");
    await expect(first.getByText("Using the latest shared version.")).toBeVisible();
  } finally {
    releaseSave?.();
    await firstContext.close();
    await secondContext.close();
  }
});
