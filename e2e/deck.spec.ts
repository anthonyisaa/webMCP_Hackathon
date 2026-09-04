import { expect, test } from "@playwright/test";

const DIRECT_SLIDES = [
  "slide-01", "slide-02", "slide-03", "slide-04", "slide-05", "slide-06",
  "slide-07", "slide-08", "slide-09", "slide-10", "slide-11",
] as const;
const CRITICAL_STORY_SLIDES = ["slide-02", "slide-03", "slide-04", "slide-05", "slide-07", "slide-09", "slide-10", "slide-11"] as const;

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
  await expect(page.locator("#slide-11")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the live Ratiflow app/u })).toHaveAttribute("href", "/");
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
  expect(slideCanvases).toHaveLength(11);
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
  await expect(page.getByRole("heading", { name: "The history is shared. Access is company policy." })).toBeVisible();
  await expect(page.locator("#slide-05")).toContainText("SCOPE & CONTROL");
  await expect(page.locator("#slide-05")).toContainText("DOCUMENT HISTORY · SHARED");
  await expect(page.locator("#slide-05")).toContainText("COMPANY ACCESS · FIXED BY MANAGED BOT");
  await expect(page.locator("#slide-05")).toContainText("WEBMCP · EXPOSES / INVOKES TOOLS");
  await expect(page.locator("#slide-05")).toContainText("RATIFLOW SERVER · ENFORCES ACCESS");
  await expect(page.locator("#slide-05")).toContainText("Full document history + provenance");
  await expect(page.locator("#slide-05")).toContainText("Hard-coded for this demo");
  await expect(page.locator("#slide-05")).toContainText("@Code");
  await expect(page.locator("#slide-05")).toContainText("Repository · 7 tools");

  await page.goto("/deck#slide-07");
  await expect(page.locator("#slide-07")).toContainText("History keeps the asker, agent, runtime, evidence, revision lineage, and restore point attached to the document");
  await expect(page.locator("#slide-07")).toContainText("r4 · Builder");
  await expect(page.locator("#slide-07")).toContainText("r5 · Builder");
  await expect(page.locator("#slide-07")).toContainText("r6 · Code");
  await expect(page.locator("#slide-07")).toContainText("ASKER · AGENT · EVIDENCE · RESTORE");

  await page.goto("/deck#slide-09");
  await expect(page.locator("#slide-09")).toContainText("getTools()");
  await expect(page.locator("#slide-09")).toContainText("executeTool()");
  await expect(page.locator("#slide-09")).toContainText("company policy + grant");
  await expect(page.locator("#slide-09")).toContainText("agent API");
  await expect(page.locator("#slide-09")).not.toContainText("Luna Responses");

  await page.goto("/deck#slide-10");
  await expect(page.locator("#slide-10")).toContainText("PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP");
  await expect(page.locator("#slide-10").getByText(/10× ASK · 0[12]/u)).toHaveCount(2);
  await expect(page.locator("#slide-10")).toContainText("Tell agents when relevant information changes.");
  await expect(page.locator("#slide-10")).toContainText("Let approved tasks finish after the page closes.");
  await expect(page.locator("#slide-10").getByText("Use case", { exact: true })).toHaveCount(2);
  await expect(page.locator("#slide-10").getByText("Engineering", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "resources #151" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/issues/151");
  await expect(page.getByRole("link", { name: "progress #196" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/issues/196");
  await expect(page.getByRole("link", { name: "service workers" })).toHaveAttribute("href", "https://github.com/webmachinelearning/webmcp/blob/main/docs/service-workers.md");

  await page.goto("/deck#slide-11");
  await expect(page.getByRole("heading", { name: "Try Ratiflow live." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the live Ratiflow app →" })).toHaveAttribute("href", "/");
  await expect(page.locator("#slide-11 article")).toHaveCount(0);

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

  await page.goto("/deck#slide-02");
  const [previewLabelBox, documentTypeBox] = await Promise.all([
    page.locator("#slide-02 [class*='previewLabel']").boundingBox(),
    page.locator("#slide-02 [class*='documentType']").boundingBox(),
  ]);
  expect(previewLabelBox).not.toBeNull();
  expect(documentTypeBox).not.toBeNull();
  expect(previewLabelBox!.y + previewLabelBox!.height).toBeLessThanOrEqual(documentTypeBox!.y);

  await page.goto("/deck#slide-09");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#slide-09").getByText(/Sources: OpenAI Site Tools/u)).toBeVisible();
  for (const link of await page.locator("#slide-09 a").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.goto("/deck#slide-10");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#slide-10").getByText(/Official discussion: current draft/u)).toBeVisible();
  for (const link of await page.locator("#slide-10 a").all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  for (const [from, to] of [["slide-05", "slide-06"], ["slide-10", "slide-11"]] as const) {
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
