import { expect, test, type Page } from "@playwright/test";

import {
  DOCUMENT_WORKSPACE_TOOL_NAMES,
  type InspectDocumentV3ToolResult,
  type ListMyWorkToolResult,
  type ReadDocumentMemoryToolResult,
  type WaitForMyWorkToolResult,
} from "../src/document/contracts";

const NORTHSTAR_TITLE = "Northstar CSV launch memo";
const NORTHSTAR_BODY = `Recommendation

Launch CSV export as generally available on October 15.

Context

Northstar Health's $180,000 renewal needs usable CSV export by November 1. The team has 14 engineer-days after the incident rotation: reliability needs 10, leaving 4 for export.

Open question

Can a single-tenant beta meet Northstar's need while general availability moves to November 1?`;

const SORTED_DOCUMENT_TOOL_NAMES = [...DOCUMENT_WORKSPACE_TOOL_NAMES].sort();

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
    if (!context) {
      return {
        supported: false,
        hasGetTools: false,
        hasExecuteTool: false,
        tools: [],
      };
    }

    const hasGetTools = typeof context.getTools === "function";
    const tools = hasGetTools ? await context.getTools!() : [];
    return {
      supported: true,
      hasGetTools,
      hasExecuteTool: typeof context.executeTool === "function",
      tools: Array.isArray(tools)
        ? tools
            .map((tool) => tool.name)
            .filter((name): name is string => typeof name === "string")
        : [],
    };
  });
}

async function invokeNativeTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<NativeInvocation<T>> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const context = document.modelContext;
      if (!context?.getTools || !context.executeTool) {
        throw new Error(
          "The standard document.modelContext execution surface is unavailable.",
        );
      }

      const tools = await context.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Native tool ${toolName} was not discovered.`);

      const nativeInput = typeof tool.inputSchema === "string"
        ? JSON.stringify(toolInput)
        : toolInput;
      const raw = await context.executeTool(tool, nativeInput);
      let parsed: unknown = raw;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed) as unknown;
        } catch {
          throw new Error(`Native tool ${toolName} returned non-JSON text.`);
        }
      }

      const isEnvelope =
        typeof parsed === "object" &&
        parsed !== null &&
        "content" in parsed &&
        "structuredContent" in parsed;
      if (!isEnvelope) {
        return {
          envelopeObserved: false,
          contentText: null,
          structuredContent: parsed as T,
        };
      }

      const envelope = parsed as {
        content: unknown;
        structuredContent: T;
      };
      const contentText = Array.isArray(envelope.content)
        ? envelope.content.find(
            (entry): entry is { type: "text"; text: string } =>
              typeof entry === "object" &&
              entry !== null &&
              (entry as { type?: unknown }).type === "text" &&
              typeof (entry as { text?: unknown }).text === "string",
          )?.text ?? null
        : null;
      return {
        envelopeObserved: true,
        contentText,
        structuredContent: envelope.structuredContent,
      };
    },
    { toolName: name, toolInput: input },
  );
}

function expectNativeEnvelope<T>(invocation: NativeInvocation<T>): T {
  expect(
    invocation.envelopeObserved,
    "Native execution must preserve the page's {content, structuredContent} result envelope.",
  ).toBe(true);
  expect(invocation.contentText).not.toBeNull();
  expect(JSON.parse(invocation.contentText ?? "null")).toEqual(
    invocation.structuredContent,
  );
  return invocation.structuredContent;
}

function waitForNorthstarSave(page: Page) {
  return page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/document-v3/save") ||
      response.request().method() !== "POST" ||
      !response.ok()
    ) {
      return false;
    }
    try {
      const input = response.request().postDataJSON() as {
        title?: unknown;
        body?: unknown;
      };
      return input.title === NORTHSTAR_TITLE && input.body === NORTHSTAR_BODY;
    } catch {
      return false;
    }
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe("deployed v3 native WebMCP smoke precondition", () => {
  test("discovers the Northstar document catalog and invokes it when the client exposes execution", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
    const documentUrl = new URL(page.url());
    expect(documentUrl.pathname).toMatch(/^\/document\/[A-Za-z0-9_-]+$/);
    expect(documentUrl.search).toBe("");
    expect(documentUrl.hash).toBe("");

    const title = page.getByLabel("Note title");
    const body = page.getByLabel("Note body");
    await expect(title).toBeEditable();
    await expect(body).toBeEditable();
    const saved = waitForNorthstarSave(page);
    await title.fill(NORTHSTAR_TITLE);
    await body.fill(NORTHSTAR_BODY);
    await saved;
    await expect(title).toHaveValue(NORTHSTAR_TITLE);
    await expect(body).toHaveValue(NORTHSTAR_BODY);

    await expect
      .poll(async () => (await discoverNativeTools(page)).supported, {
        message:
          "Native smoke precondition requires the standard document.modelContext on the deployed top-level document.",
      })
      .toBe(true);
    const discovery = await discoverNativeTools(page);
    expect(discovery.supported).toBe(true);
    expect(
      discovery.hasGetTools,
      "Native smoke precondition requires document.modelContext.getTools for discovery.",
    ).toBe(true);
    expect([...discovery.tools].sort()).toEqual(SORTED_DOCUMENT_TOOL_NAMES);

    if (discovery.hasExecuteTool) {
      const inspect = expectNativeEnvelope(
        await invokeNativeTool<InspectDocumentV3ToolResult>(
          page,
          "inspect_document",
          {},
        ),
      );
      expect(inspect).toMatchObject({
        ok: true,
        document: {
          protocolVersion: 3,
          title: NORTHSTAR_TITLE,
          body: NORTHSTAR_BODY,
          revision: expect.any(Number),
          activityVersion: expect.any(Number),
        },
        collaborators: expect.any(Array),
      });
      if (!inspect.ok) throw new Error("inspect_document did not succeed.");
      expect(Number.isInteger(inspect.document.revision)).toBe(true);
      expect(Number.isInteger(inspect.document.activityVersion)).toBe(true);
      expect(inspect.document.revision).toBeGreaterThanOrEqual(1);
      expect(inspect.document.activityVersion).toBeGreaterThanOrEqual(1);

      const memory = expectNativeEnvelope(
        await invokeNativeTool<ReadDocumentMemoryToolResult>(
          page,
          "read_document_memory",
          { limit: 20 },
        ),
      );
      expect(memory).toMatchObject({
        ok: true,
        events: expect.any(Array),
        hasMoreOlder: expect.any(Boolean),
        revision: inspect.document.revision,
        latestActivityVersion: inspect.document.activityVersion,
      });
      if (!memory.ok) throw new Error("read_document_memory did not succeed.");
      expect(memory.events.length).toBeGreaterThanOrEqual(1);
      expect(
        memory.events.every((event, index, events) =>
          index === 0
            ? true
            : events[index - 1]!.activityVersion <= event.activityVersion,
        ),
      ).toBe(true);

      const listed = expectNativeEnvelope(
        await invokeNativeTool<ListMyWorkToolResult>(page, "list_my_work", {}),
      );
      expect(listed).toEqual({
        ok: true,
        workOrders: [],
        revision: inspect.document.revision,
        activityVersion: inspect.document.activityVersion,
      });

      const waited = expectNativeEnvelope(
        await invokeNativeTool<WaitForMyWorkToolResult>(
          page,
          "wait_for_my_work",
          {
            afterActivityVersion: inspect.document.activityVersion,
            afterRevision: inspect.document.revision,
            timeoutSeconds: 1,
          },
        ),
      );
      expect(waited).toEqual({
        ok: true,
        outcome: "TIMEOUT",
        workOrders: [],
        revision: inspect.document.revision,
        activityVersion: inspect.document.activityVersion,
      });
    } else {
      test.info().annotations.push({
        type: "pending",
        description:
          "The native client discovered the v3 catalog but did not expose optional page-side executeTool; inspect, memory, list, and wait invocation still require a dated supported-agent capture.",
      });
    }

    expect(pageErrors).toEqual([]);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await page.goto("/decision-demo");
    await expect
      .poll(async () => {
        const names = (await discoverNativeTools(page)).tools;
        return names.filter((name) =>
          DOCUMENT_WORKSPACE_TOOL_NAMES.includes(
            name as (typeof DOCUMENT_WORKSPACE_TOOL_NAMES)[number],
          ),
        );
      })
      .toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});
