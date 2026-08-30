import { expect, test } from "@playwright/test";

type ToolResult = {
  ok: boolean;
  code?: string;
  currentWorkspaceRevision?: number;
};

test("rebinds native tool callbacks when the demo is reset in place", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      execute: (input: unknown) => Promise<unknown>;
    };
    const active = new Map<string, RegisteredTool>();
    const history = new Map<string, RegisteredTool[]>();
    const modelContext = {
      registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
        active.set(tool.name, tool);
        history.set(tool.name, [...(history.get(tool.name) ?? []), tool]);
        options?.signal?.addEventListener("abort", () => {
          if (active.get(tool.name) === tool) active.delete(tool.name);
        });
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, "__ratiflowWebMCPTest", {
      configurable: true,
      value: {
        historyCount: (name: string) => history.get(name)?.length ?? 0,
        invoke: (name: string, input: unknown) => active.get(name)?.execute(input),
        invokeHistory: (name: string, index: number, input: unknown) =>
          history.get(name)?.[index]?.execute(input),
        names: () => [...active.keys()],
      },
    });
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Launch deterministic workspace" }).click();
    await expect(page.locator(".revision-block")).toContainText("rev 7");
    await expect.poll(() => page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: { names: () => string[] };
      }).__ratiflowWebMCPTest;
      return harness.names();
    })).toEqual(expect.arrayContaining(["inspect_decision", "recommend_option"]));

    const firstAgentSession = await page.evaluate(() =>
      sessionStorage.getItem("ratiflow.agent-session"),
    );
    const firstInspectIndex = await page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: { historyCount: (name: string) => number };
      }).__ratiflowWebMCPTest;
      return harness.historyCount("inspect_decision") - 1;
    });
    const mutation = await page.evaluate(async () => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: {
          invoke: (name: string, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowWebMCPTest;
      return harness.invoke("recommend_option", {
        expectedWorkspaceRevision: 7,
        contextEpoch: 1,
        requestId: crypto.randomUUID(),
        rationale: "Move the isolated pre-reset run to a distinguishable revision.",
        payload: { optionId: "opt_csv_beta_oct15" },
      });
    }) as ToolResult;
    expect(mutation).toMatchObject({ ok: true, currentWorkspaceRevision: 8 });
    await expect(page.locator(".revision-block")).toContainText("rev 8");

    await page.getByRole("button", { name: "Reset workspace" }).click();
    await expect(page.locator(".revision-block")).toContainText("rev 7");
    await expect.poll(() => page.evaluate(() => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: { historyCount: (name: string) => number };
      }).__ratiflowWebMCPTest;
      return harness.historyCount("inspect_decision");
    })).toBeGreaterThan(firstInspectIndex + 1);

    const secondAgentSession = await page.evaluate(() =>
      sessionStorage.getItem("ratiflow.agent-session"),
    );
    expect(secondAgentSession).toBeTruthy();
    expect(secondAgentSession).not.toBe(firstAgentSession);

    const freshInspection = await page.evaluate(async () => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: {
          invoke: (name: string, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowWebMCPTest;
      return harness.invoke("inspect_decision", {});
    }) as ToolResult;
    expect(freshInspection).toMatchObject({ ok: true, currentWorkspaceRevision: 7 });

    const staleInspection = await page.evaluate(async (index) => {
      const harness = (window as unknown as {
        __ratiflowWebMCPTest: {
          invokeHistory: (name: string, index: number, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowWebMCPTest;
      return harness.invokeHistory("inspect_decision", index, {});
    }, firstInspectIndex) as ToolResult;
    expect(staleInspection).toMatchObject({ ok: false, code: "STALE_PAGE_CONTEXT" });
  } finally {
    await context.close();
  }
});
