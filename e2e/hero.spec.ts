import { expect, test } from "@playwright/test";

test.describe("hero two-person path", () => {
  test("runs the two-window collision, agent recovery, and human ratification path", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

    const context = await browser.newContext({ baseURL });
    const mayaPage = await context.newPage();
    const pageErrors: string[] = [];
    mayaPage.on("pageerror", (error) => pageErrors.push(`Maya: ${error.message}`));

    try {
      await mayaPage.goto("/");
      await mayaPage.getByRole("button", { name: "Launch deterministic workspace" }).click();
      await expect(mayaPage.locator(".revision-block")).toContainText("rev 7");
      await expect(mayaPage.getByText("18 engineer-days", { exact: true })).toBeVisible();

      await mayaPage.getByRole("radio", { name: /^Full CSV export/ }).click();
      await expect(mayaPage.locator(".capability-field")).toContainText("epoch 2");
      await expect(mayaPage.locator(".tool-list code")).toContainText([
        "inspect_decision",
        "inspect_selected_option",
      ]);

      const jordanPagePromise = context.waitForEvent("page");
      await mayaPage.getByRole("button", { name: /Open Jordan window/ }).click();
      const jordanPage = await jordanPagePromise;
      await expect(
        mayaPage.getByText("Jordan’s attributed workspace opened in a separate window.", {
          exact: true,
        }),
      ).toBeVisible();
      jordanPage.on("pageerror", (error) => pageErrors.push(`Jordan: ${error.message}`));
      await expect(jordanPage.getByText("Jordan Lee · Engineering Lead", { exact: true }).first()).toBeVisible();
      await expect.poll(() => jordanPage.url()).not.toContain("#");

      await jordanPage.getByRole("button", { name: "Apply 18 → 14 capacity change" }).click();
      await expect(jordanPage.locator(".revision-block")).toContainText("rev 8");
      await expect(mayaPage.locator(".revision-block")).toContainText("rev 8");
      await expect(mayaPage.locator(".revision-block")).toContainText("Contested");
      await expect(mayaPage.locator(".tool-list code", { hasText: "prepare_decision" })).toHaveCount(0);

      await mayaPage.getByRole("button", { name: /Submit stale rev-7 evidence/ }).click();
      await expect(mayaPage.getByText("Agent basis was rejected by the server.", { exact: true })).toBeVisible();
      await expect(mayaPage.locator(".stale-card")).toContainText("STALE_WORK_STATE");

      await mayaPage.getByRole("button", { name: /Recommend O2/ }).click();
      await expect(mayaPage.locator(".revision-block")).toContainText("rev 9");
      await expect(mayaPage.locator(".capability-field")).toContainText("epoch 3");
      await expect(mayaPage.locator(".tool-list code", { hasText: "prepare_decision" })).toHaveCount(1);

      await mayaPage.getByRole("button", { name: /Prepare review/ }).click();
      await expect(mayaPage.locator(".revision-block")).toContainText("rev 10");
      await expect(mayaPage.getByText("Ratify the prepared decision", { exact: true })).toBeVisible();
      await mayaPage.getByRole("button", { name: /Ratify as Maya Chen/ }).click();
      await expect(mayaPage.locator(".revision-block")).toContainText("rev 11");
      await expect(mayaPage.locator(".revision-block")).toContainText("Committed");
      await expect(mayaPage.locator(".followup-card")).toContainText("READY");

      await mayaPage.getByRole("button", { name: /Select follow-up/ }).click();
      await expect(mayaPage.locator(".capability-field")).toContainText("inspect_followup");
      await expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
