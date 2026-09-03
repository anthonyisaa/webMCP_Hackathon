import { expect, test } from "@playwright/test";

const DIRECT_SLIDES = [
  "slide-01", "slide-02", "slide-03", "slide-04", "slide-05", "slide-06",
  "slide-07", "slide-08", "slide-09", "slide-10", "slide-11", "slide-12",
] as const;
const CRITICAL_STORY_SLIDES = ["slide-05", "slide-07", "slide-10", "slide-11", "slide-12"] as const;

test("deck preserves direct hashes and keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const slideId of DIRECT_SLIDES) {
    await page.goto(`/deck#${slideId}`);
    await expect(page.locator(`#${slideId}`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${slideId}`);
  }

  await page.goto("/deck#slide-05");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#slide-06")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.locator("#slide-01")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.locator("#slide-12")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the live demo picker/u })).toHaveAttribute("href", "/");
});

test("critical WebMCP story slides remain contained and truthful on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/deck#slide-01");
  const visibleAndAccessibleCopy = await page.locator("main").evaluate((deck) => {
    const ariaCopy = [...deck.querySelectorAll("*")].flatMap((element) =>
      ["aria-label", "aria-description"].map((name) => element.getAttribute(name) ?? ""),
    );
    return [deck.textContent ?? "", ...ariaCopy].join(" ");
  });
  expect(visibleAndAccessibleCopy).not.toMatch(/\bjudge(?:s)?\b|judging|criteria|criterion|rubric/iu);
  await expect(page.locator('[class*="darkSlide"]')).toHaveCount(0);
  const slideCanvases = await page
    .locator('[aria-roledescription="slide"]')
    .evaluateAll((slides) => slides.map((slide) => {
      const style = window.getComputedStyle(slide);
      return `${style.backgroundColor}|${style.backgroundImage}`;
    }));
  expect(slideCanvases).toHaveLength(12);
  expect(new Set(slideCanvases).size).toBe(1);

  for (const slideId of CRITICAL_STORY_SLIDES) {
    await page.goto(`/deck#${slideId}`);
    const slide = page.locator(`#${slideId}`);
    await expect(slide).toBeVisible();
    const contained = await slide.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight;
    });
    expect(contained).toBe(true);
  }

  await page.goto("/deck#slide-05");
  await expect(page.getByRole("heading", { name: "Three bot archetypes. Dynamic access per assignment." })).toBeVisible();
  await expect(page.locator("#slide-05")).toContainText("SCOPE & CONTROL");
  await expect(page.locator("#slide-05")).toContainText("BOT EXPERTISE · DESCRIPTIVE");
  await expect(page.locator("#slide-05")).toContainText("ASSIGNMENT ACCESS · EXPLICIT GRANT");
  await expect(page.locator("#slide-05")).toContainText("WEBMCP · EXPOSES / INVOKES TOOLS");
  await expect(page.locator("#slide-05")).toContainText("RATIFLOW SERVER · ENFORCES ACCESS");
  await expect(page.locator("#slide-05")).toContainText("@Code + Metrics");
  await expect(page.locator("#slide-05")).toContainText("@Data + Metrics");
  await expect(page.locator("#slide-05")).toContainText("same catalog · 6 tools");
  await expect(page.locator("#slide-05")).toContainText("@Code + Repository");

  await page.goto("/deck#slide-07");
  await expect(page.locator("#slide-07")).toContainText("same @Code identity receiving Repository then Editorial grants");
  await expect(page.locator("#slide-07")).toContainText("r6 · Code");
  await expect(page.locator("#slide-07")).toContainText("r7 · Code");
  await expect(page.locator("#slide-07")).toContainText("Editorial access · facts preserved");

  await page.goto("/deck#slide-10");
  await expect(page.locator("#slide-10")).toContainText("getTools()");
  await expect(page.locator("#slide-10")).toContainText("executeTool()");
  await expect(page.locator("#slide-10")).toContainText("server capability grant");
  await expect(page.locator("#slide-10")).toContainText("server-checked revision");

  await page.goto("/deck#slide-11");
  await expect(page.locator("#slide-11")).toContainText("PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP");
  await expect(page.getByRole("link", { name: "resources #151" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/issues/151");
  await expect(page.getByRole("link", { name: "progress #196" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/issues/196");
  await expect(page.getByRole("link", { name: "service workers" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/blob/main/docs/service-workers.md");

  await page.goto("/deck#slide-12");
  await expect(page.getByRole("heading", { name: "Try Ratiflow live." })).toBeVisible();
  await expect(page.locator("#slide-12")).toContainText("POSTMORTEM · @CODE");
  await expect(page.locator("#slide-12")).toContainText("PRODUCT · @DATA");
  await expect(page.locator("#slide-12")).toContainText("History, evidence, and Restore");

  const deckCopy = await page.locator("main").innerText();
  expect(deckCopy).not.toMatch(/role[- /]scoped|role catalog|specialist catalog/iu);
  expect(deckCopy).not.toMatch(/WebMCP (?:grants?|enforces?|authenticates?)/iu);
});

test("critical WebMCP story slides remain viewport-contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const slideId of CRITICAL_STORY_SLIDES) {
    await page.goto(`/deck#${slideId}`);
    await expect(page.locator(`#${slideId}`)).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  }

  await page.goto("/deck#slide-10");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#slide-10").getByText(/Sources: OpenAI Site Tools/u)).toBeVisible();
  for (const link of await page.locator("#slide-10 a").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.goto("/deck#slide-11");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#slide-11").getByText(/Official discussion: current draft/u)).toBeVisible();
  for (const link of await page.locator("#slide-11 a").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  for (const [from, to] of [["slide-05", "slide-06"], ["slide-11", "slide-12"]] as const) {
    await page.goto(`/deck#${from}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(page.locator(`#${to}`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const headingTop = await page.locator(`#${to} h1, #${to} h2`).evaluate(
      (heading) => heading.getBoundingClientRect().top,
    );
    expect(headingTop).toBeGreaterThanOrEqual(0);
  }

  for (const button of await page.getByRole("navigation", { name: "Presentation controls" }).getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
