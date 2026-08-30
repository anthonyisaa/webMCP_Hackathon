import { expect, test } from "@playwright/test";

type NativeDiscovery = {
  supported: boolean;
  tools: string[];
  hasExecuteTool: boolean;
};

async function discoverNativeTools(page: import("@playwright/test").Page): Promise<NativeDiscovery> {
  return page.evaluate(() => {
    const context = (document as Document & {
      modelContext?: {
        getTools?: () => unknown;
        executeTool?: (...args: unknown[]) => unknown;
      };
    }).modelContext;
    if (!context) return { supported: false, tools: [], hasExecuteTool: false };
    const tools = typeof context.getTools === "function" ? context.getTools() : [];
    return {
      supported: true,
      tools: Array.isArray(tools)
        ? tools.map((tool) => (tool as { name?: string }).name).filter((name): name is string => Boolean(name))
        : [],
      hasExecuteTool: typeof context.executeTool === "function",
    };
  });
}

test.describe("native WebMCP surface (N01–N11)", () => {
  test("discovers the live catalog and exposes structured invocation", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto("/");
    await page.getByRole("button", { name: "Launch deterministic workspace" }).click();
    await expect(page.getByText("Northstar CSV launch scope")).toBeVisible();

    await expect.poll(async () => (await discoverNativeTools(page)).supported, {
      message: "N01 requires document.modelContext on the deployed page",
    }).toBe(true);
    const discovery = await discoverNativeTools(page);
    expect(discovery.supported, "N01 requires document.modelContext on the deployed page").toBe(true);
    expect(discovery.tools).toEqual(expect.arrayContaining(["inspect_decision", "recommend_option", "add_evidence", "why_not"]));

    if (discovery.hasExecuteTool) {
      const result = await page.evaluate(async () => {
        const context = (document as Document & { modelContext?: { executeTool?: (name: string, input: unknown) => Promise<unknown> } }).modelContext;
        return context?.executeTool?.("inspect_decision", {});
      });
      expect(result).toEqual(expect.objectContaining({ ok: true }));
      expect(result).toEqual(expect.objectContaining({ currentWorkspaceRevision: expect.any(Number), contextEpoch: expect.any(Number), currentCapabilities: expect.any(Object) }));
    } else {
      test.info().annotations.push({ type: "pending", description: "Native client does not expose optional executeTool; invocation requires the official Inspector/client capture." });
    }

    await page.getByRole("radio", { name: /^Full CSV export/ }).click();
    await expect.poll(async () => (await discoverNativeTools(page)).tools).toEqual(
      expect.arrayContaining(["inspect_selected_option", "challenge_option"]),
    );
    const afterSelection = (await discoverNativeTools(page)).tools;
    expect(afterSelection).toEqual(expect.arrayContaining(["inspect_selected_option", "challenge_option"]));
    expect(afterSelection).not.toContain("ratify_decision");
    expect(consoleErrors, "N11: no uncaught page errors").toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "N11: no horizontal overflow").toBe(true);
  });
});
