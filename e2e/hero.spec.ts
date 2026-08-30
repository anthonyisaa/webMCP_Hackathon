import { expect, test } from "@playwright/test";

test.describe("hero two-person path", () => {
  test("runs the single-window synthetic Jordan fallback through the authorized collaborator mutation", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

    const context = await browser.newContext({ baseURL });
    const mayaPage = await context.newPage();
    try {
      await mayaPage.goto("/");
      await mayaPage.getByRole("button", { name: "Launch deterministic workspace" }).click();
      await mayaPage.getByRole("radio", { name: /^Full CSV export/ }).click();

      await mayaPage.getByRole("button", { name: "Apply Jordan capacity change · synthetic rehearsal" }).click();

      await expect(mayaPage.locator(".revision-block")).toContainText("rev 8");
      await expect(mayaPage.locator(".revision-block")).toContainText("Contested");
      await expect(mayaPage.getByText("14 engineer-days", { exact: true })).toBeVisible();
      await expect(mayaPage.locator(".provenance-ribbon")).toContainText("Jordan Lee");
      await expect(mayaPage.locator(".provenance-ribbon")).toContainText("ordinary UI");
      await expect(mayaPage.getByText("Synthetic Jordan rehearsal applied the authorized 18 → 14 capacity change at revision 8.", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

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

      await mayaPage.evaluate(() => {
        const open = window.open;
        window.open = (...args) => {
          const target = String(args[0] ?? "");
          const jordanToken = sessionStorage.getItem("ratiflow.jordan-session");
          document.documentElement.dataset.jordanNavigation = target;
          document.documentElement.dataset.jordanTokenInNavigation = String(Boolean(jordanToken && target.includes(jordanToken)));
          return open.apply(window, args);
        };
      });

      const jordanPagePromise = context.waitForEvent("page");
      await mayaPage.getByRole("button", { name: /Open Jordan window/ }).click();
      const jordanPage = await jordanPagePromise;
      await expect(mayaPage.locator("html")).toHaveAttribute("data-jordan-navigation", /#member=jordan$/);
      await expect(mayaPage.locator("html")).toHaveAttribute("data-jordan-token-in-navigation", "false");
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

  test("fails closed when a Jordan join marker has no inherited session", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

    const context = await browser.newContext({ baseURL });
    const jordanPage = await context.newPage();
    try {
      await jordanPage.goto("/#member=jordan");
      await expect(jordanPage.getByRole("heading", { name: "Jordan’s workspace link is no longer valid." })).toBeVisible();
      await expect.poll(() => jordanPage.url()).not.toContain("#");
    } finally {
      await context.close();
    }
  });

  test("cannot switch a launched Maya tab to Jordan with the public join marker", async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

    const context = await browser.newContext({ baseURL });
    const mayaPage = await context.newPage();
    try {
      await mayaPage.goto("/");
      await mayaPage.getByRole("button", { name: "Launch deterministic workspace" }).click();
      await expect(mayaPage.locator(".person-chip")).toContainText("Maya Chen · Product Lead");

      await mayaPage.goto("/#member=jordan");
      await mayaPage.reload();

      await expect(mayaPage.getByRole("heading", { name: "Jordan’s workspace link is no longer valid." })).toBeVisible();
      await expect(mayaPage.getByText("Jordan Lee · Engineering Lead", { exact: true })).toHaveCount(0);
      await expect.poll(() => mayaPage.url()).not.toContain("#");
      await expect.poll(() => mayaPage.evaluate(() => ({
        activeMember: sessionStorage.getItem("ratiflow.active-member"),
        hasAgentSession: Boolean(sessionStorage.getItem("ratiflow.agent-session")),
        hasJordanSession: Boolean(sessionStorage.getItem("ratiflow.jordan-session")),
        hasMayaSession: Boolean(sessionStorage.getItem("ratiflow.maya-session")),
      }))).toEqual({
        activeMember: "MAYA",
        hasAgentSession: true,
        hasJordanSession: true,
        hasMayaSession: true,
      });
    } finally {
      await context.close();
    }
  });
});
