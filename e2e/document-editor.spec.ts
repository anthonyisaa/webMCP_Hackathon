import { expect, test, type Page } from "@playwright/test";

import { DOCUMENT_AGENT_REQUEST } from "../src/document/contracts";

const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

async function selectBodyRange(page: Page, start: number, end: number): Promise<void> {
  await page.getByLabel("Note body").evaluate(
    (element: HTMLTextAreaElement, range) => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
      element.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
}

async function addCustomAnnotation(
  page: Page,
  start: number,
  end: number,
  instruction: string,
): Promise<void> {
  await selectBodyRange(page, start, end);
  await page.getByLabel("Note body").press(shortcut);
  const composer = page.getByLabel("Custom instruction");
  await expect(composer).toBeFocused();
  await composer.fill(instruction);
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(composer).toHaveValue("");
}

test("pageless editor preserves native menus and keeps an ordered annotation queue", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  try {
    await page.goto("/document");
    await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
    const title = page.getByLabel("Note title");
    const body = page.getByLabel("Note body");
    const rail = page.getByRole("complementary", { name: "Agent annotations" });
    await expect(title).toBeEditable();
    await expect(body).toBeEditable();
    await expect(rail).toBeVisible();
    await expect(page.getByTestId("writing-surface")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".launch-card")).toHaveCount(0);

    await title.fill("A note anyone can shape");
    await body.fill("Draft launch note for the team with one final thought.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await selectBodyRange(page, 6, 17);
    await expect(page.getByTestId("annotation-target-preview")).toContainText("Selection");
    await expect(page.getByTestId("annotation-target-preview")).toContainText("launch note");

    const nativeContextMenuPrevented = await body.evaluate((element) => {
      const defaultAllowed = element.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
      );
      return !defaultAllowed;
    });
    expect(nativeContextMenuPrevented).toBe(false);
    await expect(page.getByRole("menu", { name: "Agent actions" })).toHaveCount(0);

    await page.getByRole("button", { name: "Turn into an outline" }).click();
    await expect(body).toBeFocused();
    expect(
      await body.evaluate((element) => {
        const control = element as HTMLTextAreaElement;
        return [control.selectionStart, control.selectionEnd];
      }),
    ).toEqual([6, 17]);

    await addCustomAnnotation(page, 26, 30, "Make this noun warmer and more collective.");
    await expect(body).toBeFocused();
    const cards = page.getByTestId("pending-annotation-list").getByTestId("annotation-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Turn into an outline");
    await expect(cards.nth(1)).toContainText("Make this noun warmer");

    await page.reload();
    await expect(title).toHaveValue("A note anyone can shape");
    await expect(body).toHaveValue("Draft launch note for the team with one final thought.");
    await expect(page.getByTestId("pending-annotation-list").getByTestId("annotation-card"))
      .toHaveCount(2);

    await expect(page.getByTestId("agent-handoff")).toContainText(
      "Copies a prompt only. It does not send or notify ChatGPT.",
    );
    await page.getByRole("button", { name: "Ask ChatGPT" }).click();
    await expect(page.getByText("Prompt copied — paste/send in ChatGPT", { exact: true }))
      .toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DOCUMENT_AGENT_REQUEST);

    await page.getByLabel("Document stage").selectOption("RESEARCHING");
    await expect(page.getByLabel("Document stage")).toHaveValue("RESEARCHING");
    const preparation = page.getByTestId("annotation-card").filter({ hasText: "Prepare for research" });
    await expect(preparation).toBeVisible();
    await expect(page.getByRole("status")).toContainText("was added to the queue");
  } finally {
    await context.close();
  }
});

test("mobile annotation drawer is non-modal, keyboard reachable, and overflow-safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/document");
  await expect(page).toHaveURL(/\/document\//);

  const body = page.getByLabel("Note body");
  const toggle = page.getByRole("button", { name: /Annotations/ });
  const rail = page.getByRole("complementary", { name: "Agent annotations" });
  await expect(body).toBeEditable();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(rail).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await toggle.click();
  await expect(rail).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent annotations" })).toBeFocused();
  await page.getByRole("heading", { name: "Agent annotations" }).press("Escape");
  await expect(rail).toBeHidden();
  await expect(toggle).toBeFocused();

  await body.fill("A small-screen note for annotation.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await selectBodyRange(page, 2, 14);
  await body.press(shortcut);
  const composer = page.getByLabel("Custom instruction");
  await expect(rail).toBeVisible();
  await expect(composer).toBeFocused();
  await composer.fill("Tighten this phrase.");
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(rail).toBeVisible();
  await expect(body).toBeFocused();
  await expect(page.getByTestId("pending-annotation-list").getByTestId("annotation-card"))
    .toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const closeBox = await page.getByRole("button", { name: "Close agent annotations" }).boundingBox();
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
});

test("a legacy v1 session migrates credentials without losing annotation ownership", async ({
  page,
}) => {
  await page.goto("/document");
  await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
  const shareToken = page.url().split("/").at(-1);
  if (!shareToken) throw new Error("The document share token was not created.");

  const body = page.getByLabel("Note body");
  await body.fill("A live note with an owned request.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await addCustomAnnotation(page, 2, 11, "Keep this owned request controllable.");
  const ownedCard = page.getByTestId("annotation-card").filter({
    hasText: "Keep this owned request controllable.",
  });
  await expect(ownedCard).toBeVisible();

  const originalCredentials = await page.evaluate((token) => {
    const v2Key = `ratiflow.document.session.v2:${token}`;
    const raw = sessionStorage.getItem(v2Key);
    if (!raw) throw new Error("The live v2 session bundle was not stored.");
    const bundle = JSON.parse(raw) as {
      shareToken: string;
      humanSessionToken: string;
      agentSessionToken: string;
      sessionInstanceId: string;
      selfMemberId: string;
      expiresAt: string;
      surface: {
        document: unknown;
        presence: unknown[];
        annotations: Array<{ annotationId: string }>;
        undoAgentEdit: unknown;
      };
    };
    const annotation = bundle.surface.annotations[0];
    if (!annotation) throw new Error("The owned annotation was not in the stored surface.");
    sessionStorage.setItem(
      `ratiflow.document.session.v1:${token}`,
      JSON.stringify({
        ...bundle,
        surface: {
          document: bundle.surface.document,
          presence: bundle.surface.presence,
          pendingAction: { actionId: annotation.annotationId, status: "PENDING" },
          undoAgentEdit: bundle.surface.undoAgentEdit,
        },
      }),
    );
    sessionStorage.removeItem(v2Key);
    return {
      selfMemberId: bundle.selfMemberId,
      agentSessionToken: bundle.agentSessionToken,
      annotationId: annotation.annotationId,
    };
  }, shareToken);

  await page.reload();
  await expect(body).toBeEditable();
  const migratedCard = page.getByTestId("annotation-card").filter({
    hasText: "Keep this owned request controllable.",
  });
  await expect(migratedCard).toBeVisible();

  const migrated = await page.evaluate((token) => {
    const v1Key = `ratiflow.document.session.v1:${token}`;
    const v2Key = `ratiflow.document.session.v2:${token}`;
    const raw = sessionStorage.getItem(v2Key);
    if (!raw) throw new Error("The migrated v2 session bundle was not written.");
    const bundle = JSON.parse(raw) as {
      selfMemberId: string;
      agentSessionToken: string;
      surface: { annotations: unknown[] };
    };
    return {
      legacyRemoved: sessionStorage.getItem(v1Key) === null,
      selfMemberId: bundle.selfMemberId,
      agentSessionToken: bundle.agentSessionToken,
      annotationsAreV2: Array.isArray(bundle.surface.annotations),
    };
  }, shareToken);
  expect(migrated).toEqual({
    legacyRemoved: true,
    selfMemberId: originalCredentials.selfMemberId,
    agentSessionToken: originalCredentials.agentSessionToken,
    annotationsAreV2: true,
  });

  const listed = await page.evaluate(async (agentSessionToken) => {
    const response = await fetch("/api/document/action", {
      headers: { Authorization: `Bearer ${agentSessionToken}` },
      cache: "no-store",
    });
    return response.json() as Promise<{
      ok: boolean;
      data?: Array<{ annotationId: string }>;
    }>;
  }, migrated.agentSessionToken);
  expect(listed).toMatchObject({
    ok: true,
    data: [{ annotationId: originalCredentials.annotationId }],
  });

  await migratedCard.getByRole("button", { name: /Cancel/ }).click();
  await expect(page.getByTestId("annotation-history-list")).toContainText(
    "Keep this owned request controllable.",
  );
});

test("title limits count Unicode code points rather than UTF-16 units", async ({ page }) => {
  await page.goto("/document");
  await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
  const title = page.getByLabel("Note title");
  const accepted = "🧠".repeat(160);
  await title.fill(`${accepted}🧠`);
  await expect(title).toHaveValue(accepted);
  const storedTitle = await title.inputValue();
  expect(Array.from(storedTitle)).toHaveLength(160);
  expect(storedTitle).toHaveLength(320);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue(accepted);
});

test("invalid shared links recover with a new-note action", async ({ page }) => {
  await page.goto("/document/not-a-valid-share-token");
  await expect(page.getByRole("heading", { name: "This note is no longer available" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "New note" })).toBeVisible();
});
