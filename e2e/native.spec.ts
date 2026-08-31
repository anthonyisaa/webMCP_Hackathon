import { expect, test, type Page } from "@playwright/test";

type NativeRegisteredTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: string;
};

type NativeDiscovery = {
  supported: boolean;
  tools: string[];
  hasExecuteTool: boolean;
};

type NativeToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
};

async function discoverNativeTools(page: Page): Promise<NativeDiscovery> {
  return page.evaluate(async () => {
    const context = (document as Document & {
      modelContext?: {
        getTools?: () => Promise<Array<{ name?: string }>>;
        executeTool?: (...args: unknown[]) => Promise<string>;
      };
    }).modelContext;
    if (!context || typeof context.getTools !== "function") {
      return { supported: false, tools: [], hasExecuteTool: false };
    }
    const tools = await context.getTools();
    return {
      supported: true,
      tools: tools
        .map((tool) => tool.name)
        .filter((name): name is string => Boolean(name)),
      hasExecuteTool: typeof context.executeTool === "function",
    };
  });
}

async function executeNativeTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<NativeToolResult> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const context = (document as Document & {
        modelContext?: {
          getTools?: () => Promise<NativeRegisteredTool[]>;
          executeTool?: (
            tool: NativeRegisteredTool,
            input?: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => Promise<string>;
        };
      }).modelContext;
      if (
        !context ||
        typeof context.getTools !== "function" ||
        typeof context.executeTool !== "function"
      ) {
        throw new Error("Native document.modelContext execution is unavailable");
      }
      const tool = (await context.getTools()).find(
        (candidate) => candidate.name === toolName,
      );
      if (!tool) throw new Error(`Native tool ${toolName} is not registered`);
      const serialized = await context.executeTool(tool, toolInput);
      return JSON.parse(serialized) as NativeToolResult;
    },
    { toolName: name, toolInput: input },
  );
}

test.describe("native WebMCP surface (N01–N11)", () => {
  test("discovers, joins, and exposes the live collaboration catalog", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto("/decision-demo");
    await page.getByRole("button", { name: "Launch deterministic workspace" }).click();
    await expect(page.getByText("Northstar CSV launch scope")).toBeVisible();

    await expect.poll(async () => (await discoverNativeTools(page)).supported, {
      message: "N01 requires document.modelContext on the deployed page",
    }).toBe(true);
    const fresh = await discoverNativeTools(page);
    expect(fresh.tools).toEqual(["join_session", "catch_up"]);
    expect(fresh.hasExecuteTool, "Current WebMCP requires executeTool").toBe(true);

    const joined = await executeNativeTool(page, "join_session");
    expect(joined).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ type: "text", text: expect.any(String) }),
        ]),
        structuredContent: expect.objectContaining({
          ok: true,
          data: expect.objectContaining({ sessionOpen: true }),
        }),
      }),
    );

    await expect.poll(async () => (await discoverNativeTools(page)).tools).toEqual(
      expect.arrayContaining([
        "wait_for_activity",
        "catch_up",
        "leave_session",
        "get_state_brief",
        "get_thread",
        "get_inbox",
        "claim_agent_task",
        "resolve_task",
        "post_comment",
        "request_human_input",
        "inspect_decision",
      ]),
    );

    const stateBrief = await executeNativeTool(page, "get_state_brief");
    expect(stateBrief.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        cursor: expect.any(String),
        data: expect.any(Object),
      }),
    );

    await page.getByRole("radio", { name: /^Full CSV export/ }).click();
    await expect.poll(async () => (await discoverNativeTools(page)).tools).toEqual(
      expect.arrayContaining(["inspect_selected_option", "challenge_option"]),
    );
    const afterSelection = (await discoverNativeTools(page)).tools;
    expect(afterSelection).not.toContain("ratify_decision");
    expect(consoleErrors, "N11: no uncaught page errors").toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      "N11: no horizontal overflow",
    ).toBe(true);
  });
});
