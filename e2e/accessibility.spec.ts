import { expect, test } from "@playwright/test";

test("390px mobile smoke remains usable and keyboard reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/decision-demo");
  const launch = page.getByRole("button", { name: "Launch deterministic workspace" });
  await expect(launch).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await launch.focus();
  await expect(launch).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Address the agent where the decision lives." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const option = page.getByRole("radio", { name: /^Full CSV export/ });
  await option.focus();
  await expect(option).toBeFocused();
});
