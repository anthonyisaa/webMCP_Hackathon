import { expect, test, type Page } from "@playwright/test";

const shortcut = process.platform === "darwin" ? "Meta+K" : "Control+K";

async function addCustomAnnotation(
  page: Page,
  instruction: string,
  start: number,
  end: number,
): Promise<void> {
  const body = page.getByLabel("Note body");
  await body.evaluate(
    (element: HTMLTextAreaElement, range) => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
      element.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
  await body.press(shortcut);
  await page.getByLabel("Custom instruction").fill(instruction);
  await page.getByRole("button", { name: "Add to queue" }).click();
}

test("collaborators share the ordered queue but can cancel only their own annotations", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await first.goto("/document");
    await expect(first).toHaveURL(/\/document\//);
    const sharedUrl = first.url();
    await second.goto(sharedUrl);

    await expect(first.getByLabel(/other people here/)).toHaveAttribute(
      "aria-label",
      "1 other people here",
    );
    await first.getByLabel("Note body").fill("One shared sentence with two useful targets.");
    await expect(first.getByText("Saved", { exact: true })).toBeVisible();
    await expect(second.getByLabel("Note body")).toHaveValue(
      "One shared sentence with two useful targets.",
    );

    await addCustomAnnotation(first, "First collaborator request", 4, 19);
    const firstRequestOnFirst = first.getByTestId("annotation-card").filter({
      hasText: "First collaborator request",
    });
    const firstRequestOnSecond = second.getByTestId("annotation-card").filter({
      hasText: "First collaborator request",
    });
    await expect(firstRequestOnFirst).toBeVisible();
    await expect(firstRequestOnSecond).toBeVisible({ timeout: 6_000 });
    await expect(firstRequestOnFirst.getByRole("button", { name: /Cancel/ })).toHaveCount(1);
    await expect(firstRequestOnSecond.getByRole("button", { name: /Cancel/ })).toHaveCount(0);

    await addCustomAnnotation(second, "Second collaborator request", 29, 35);
    const secondRequestOnFirst = first.getByTestId("annotation-card").filter({
      hasText: "Second collaborator request",
    });
    const secondRequestOnSecond = second.getByTestId("annotation-card").filter({
      hasText: "Second collaborator request",
    });
    await expect(secondRequestOnSecond).toBeVisible();
    await expect(secondRequestOnFirst).toBeVisible({ timeout: 6_000 });
    await expect(secondRequestOnSecond.getByRole("button", { name: /Cancel/ })).toHaveCount(1);
    await expect(secondRequestOnFirst.getByRole("button", { name: /Cancel/ })).toHaveCount(0);

    await firstRequestOnFirst.getByRole("button", { name: /Cancel/ }).click();
    await expect(first.getByTestId("annotation-history-list")).toContainText(
      "First collaborator request",
    );
    await expect(first.getByTestId("pending-annotation-list")).toContainText(
      "Second collaborator request",
    );
    await expect(second.getByTestId("annotation-history-list")).toContainText(
      "First collaborator request",
      { timeout: 6_000 },
    );
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("a dirty collaborator gets explicit conflict choices instead of a silent overwrite", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await first.goto("/document");
    await expect(first).toHaveURL(/\/document\//);
    await second.goto(first.url());
    await first.getByLabel("Note body").fill("Shared baseline.");
    await expect(first.getByText("Saved", { exact: true })).toBeVisible();
    await expect(second.getByLabel("Note body")).toHaveValue("Shared baseline.");

    let releaseSave: (() => void) | undefined;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let intercepted = false;
    await first.route("**/api/document", async (route) => {
      if (route.request().method() !== "PUT" || intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      await saveGate;
      await route.continue();
    });

    await first.getByLabel("Note body").fill("My unsaved version.");
    await second.getByLabel("Note body").fill("The collaborator version.");
    await expect(second.getByText("Saved", { exact: true })).toBeVisible();
    await expect(first.getByText("A newer version is available")).toBeVisible({ timeout: 6_000 });
    releaseSave?.();

    await first.getByRole("button", { name: "Use latest" }).click();
    await expect(first.getByLabel("Note body")).toHaveValue("The collaborator version.");
    await expect(first.getByText("Using the latest shared version.")).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
