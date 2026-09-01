import { expect, test, type Page } from "@playwright/test";

import {
  REPOSITORY_TOOL_NAMES,
  type InspectIssueToolResult,
  type ListMyIssueTasksToolResult,
  type ReadIssueHistoryToolResult,
} from "../src/repository/contracts";

type NativeDiscovery = {
  supported: boolean;
  hasGetTools: boolean;
  hasExecuteTool: boolean;
  tools: string[];
};

type NativeInvocation<T> = {
  envelopeObserved: boolean;
  contentText: string | null;
  structuredContent: T;
};

async function discoverNativeTools(page: Page): Promise<NativeDiscovery> {
  return page.evaluate(async () => {
    const context = document.modelContext;
    if (!context) return { supported: false, hasGetTools: false, hasExecuteTool: false, tools: [] };
    const hasGetTools = typeof context.getTools === "function";
    const tools = hasGetTools ? await context.getTools!() : [];
    return {
      supported: true,
      hasGetTools,
      hasExecuteTool: typeof context.executeTool === "function",
      tools: Array.isArray(tools)
        ? tools.map((tool) => tool.name).filter((name): name is string => typeof name === "string")
        : [],
    };
  });
}

async function invokeNativeTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<NativeInvocation<T>> {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const context = document.modelContext;
    if (!context?.getTools || !context.executeTool) {
      throw new Error("The standard document.modelContext execution surface is unavailable.");
    }
    const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
    if (!tool) throw new Error(`Native tool ${toolName} was not discovered.`);
    const raw = await context.executeTool(tool, toolInput);
    let parsed: unknown = raw;
    if (typeof parsed === "string") parsed = JSON.parse(parsed) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("content" in parsed) || !("structuredContent" in parsed)) {
      return { envelopeObserved: false, contentText: null, structuredContent: parsed as T };
    }
    const envelope = parsed as { content: unknown; structuredContent: T };
    const contentText = Array.isArray(envelope.content)
      ? envelope.content.find((entry): entry is { type: "text"; text: string } =>
          typeof entry === "object" && entry !== null
          && (entry as { type?: unknown }).type === "text"
          && typeof (entry as { text?: unknown }).text === "string")?.text ?? null
      : null;
    return { envelopeObserved: true, contentText, structuredContent: envelope.structuredContent };
  }, { toolName: name, toolInput: input });
}

function expectNativeEnvelope<T>(invocation: NativeInvocation<T>): T {
  expect(invocation.envelopeObserved).toBe(true);
  expect(invocation.contentText).not.toBeNull();
  expect(JSON.parse(invocation.contentText ?? "null")).toEqual(invocation.structuredContent);
  return invocation.structuredContent;
}

test("native v4 precondition discovers exactly six repository tools and reads immutable history", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Open incident example" }).click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/);
  await expect(page.getByLabel("Document title")).toHaveValue("INC-482 · Checkout outage postmortem");

  await expect.poll(async () => (await discoverNativeTools(page)).supported, {
    message: "Native v4 evidence requires the standard document.modelContext surface.",
  }).toBe(true);
  const discovery = await discoverNativeTools(page);
  expect(discovery.hasGetTools).toBe(true);
  expect([...discovery.tools].sort()).toEqual([...REPOSITORY_TOOL_NAMES].sort());

  if (discovery.hasExecuteTool) {
    const inspected = expectNativeEnvelope(await invokeNativeTool<InspectIssueToolResult>(
      page,
      "inspect_document",
      {},
    ));
    expect(inspected).toMatchObject({
      ok: true,
      document: { protocolVersion: 4, revision: 4, activityVersion: 10 },
      currentRevision: 4,
      currentActivityVersion: 10,
      tasks: expect.any(Array),
    });

    const history = expectNativeEnvelope(await invokeNativeTool<ReadIssueHistoryToolResult>(
      page,
      "read_document_history",
      { limit: 10 },
    ));
    expect(history).toMatchObject({ ok: true, currentRevision: 4, revisions: expect.any(Array) });
    if (history.ok) expect(history.revisions.map((revision) => revision.revision)).toEqual([4, 3, 2, 1]);

    const tasks = expectNativeEnvelope(await invokeNativeTool<ListMyIssueTasksToolResult>(
      page,
      "list_my_tasks",
      { includeResolved: true },
    ));
    expect(tasks).toMatchObject({ ok: true, revision: 4, activityVersion: 10, tasks: expect.any(Array) });
  }

  expect(pageErrors).toEqual([]);
});
