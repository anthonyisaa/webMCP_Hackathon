import { expect, test } from "@playwright/test";

const DIRECT_SLIDES = ["slide-01", "slide-06", "slide-11", "slide-12"] as const;

test("deck preserves direct hashes and keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const slideId of DIRECT_SLIDES) {
    await page.goto(`/deck#${slideId}`);
    await expect(page.locator(`#${slideId}`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${slideId}`);
  }

  await page.goto("/deck#slide-06");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#slide-07")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.locator("#slide-01")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.locator("#slide-12")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the live demo picker/u })).toHaveAttribute("href", "/");
});

test("deck remains viewport-contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/deck#slide-06");
  await expect(page.locator("#slide-06")).toBeVisible();
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#slide-06").getByText(/Sources: OpenAI Site Tools/u)).toBeVisible();
  for (const button of await page.getByRole("navigation", { name: "Presentation controls" }).getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
