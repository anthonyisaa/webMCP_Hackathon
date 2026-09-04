import { expect, test, type Page } from "@playwright/test";

import {
  REPOSITORY_TOOL_NAMES,
  type ConnectIssueAgentToolResult,
  type InspectIssueToolResult,
  type ListMyIssueTasksToolResult,
  type ReadCollaborationContextToolResult,
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
  return page.evaluate(async ({ toolName, toolInput }) => {
    const context = document.modelContext;
    if (!context?.getTools || !context.executeTool) {
      throw new Error(
        "The standard document.modelContext execution surface is unavailable.",
      );
    }
    const tool = (await context.getTools()).find(
      (candidate) => candidate.name === toolName,
    );
    if (!tool) throw new Error(`Native tool ${toolName} was not discovered.`);
    const nativeInput = typeof tool.inputSchema === "string"
      ? JSON.stringify(toolInput)
      : toolInput;
    const raw = await context.executeTool(tool, nativeInput);
    let parsed: unknown = raw;
    if (typeof parsed === "string") parsed = JSON.parse(parsed) as unknown;
    if (
      typeof parsed !== "object"
      || parsed === null
      || !("content" in parsed)
      || !("structuredContent" in parsed)
    ) {
      return {
        envelopeObserved: false,
        contentText: null,
        structuredContent: parsed as T,
      };
    }
    const envelope = parsed as { content: unknown; structuredContent: T };
    const contentText = Array.isArray(envelope.content)
      ? envelope.content.find((entry): entry is { type: "text"; text: string } =>
          typeof entry === "object"
          && entry !== null
          && (entry as { type?: unknown }).type === "text"
          && typeof (entry as { text?: unknown }).text === "string")?.text ?? null
      : null;
    return {
      envelopeObserved: true,
      contentText,
      structuredContent: envelope.structuredContent,
    };
  }, { toolName: name, toolInput: input });
}

function expectNativeEnvelope<T>(invocation: NativeInvocation<T>): T {
  expect(invocation.envelopeObserved).toBe(true);
  expect(invocation.contentText).not.toBeNull();
  expect(JSON.parse(invocation.contentText ?? "null")).toEqual(
    invocation.structuredContent,
  );
  return invocation.structuredContent;
}

test("native v4.4 discovers the eight-tool idle catalog, shows company-scoped bot NUX, connects Contextbot, and reads Postmortem context", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.getByLabel("What should collaborators call you?").fill("Quinn Patel");
  await page.getByRole("button", { name: "Open live postmortem" }).click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/u);
  await expect(page.getByRole("heading", {
    level: 1,
    name: "INC-482 · Checkout outage postmortem",
  })).toBeVisible();

  await expect.poll(async () => (await discoverNativeTools(page)).supported, {
    message:
      "Native v4.4 idle-surface evidence requires a supported client with the standard document.modelContext surface; ordinary Chromium is not native evidence.",
  }).toBe(true);
  const discovery = await discoverNativeTools(page);
  expect(discovery.hasGetTools).toBe(true);
  expect([...discovery.tools].sort()).toEqual([...REPOSITORY_TOOL_NAMES].sort());
  await expect(page.getByRole("heading", {
    name: "Highlight text. @ a bot. Watch the change.",
  })).toBeVisible();
  await expect(page.getByText(
    "The selection bounds the edit. @Code's company profile supplies its website tools automatically.",
  )).toBeVisible();
  const managedDirectory = page.getByTestId("managed-agent-directory");
  await expect(page.getByText(/3 managed bots · company-configured access/u)).toBeVisible();
  await expect(managedDirectory.getByText("@Code", { exact: true }).locator(".."))
    .toContainText("Software analysis expertise · Repository tools");
  await expect(managedDirectory.getByText("@Data", { exact: true }).locator(".."))
    .toContainText("Data analysis expertise · Metrics tools");
  await expect(managedDirectory.getByText("@General", { exact: true }).locator(".."))
    .toContainText("Generalist expertise · Editorial tools");
  await expect(managedDirectory.getByText("Company-set", { exact: true })).toHaveCount(3);
  await expect(page.getByLabel("Website access for this run")).toHaveCount(0);

  if (discovery.hasExecuteTool) {
    const connected = expectNativeEnvelope(
      await invokeNativeTool<ConnectIssueAgentToolResult>(
        page,
        "connect_agent",
        { name: "Contextbot" },
      ),
    );
    expect(connected).toMatchObject({
      ok: true,
      profile: {
        name: "Contextbot",
        identitySource: "SELF_DECLARED",
        member: { displayName: "Quinn Patel" },
        accessCount: 1,
      },
      revision: 5,
      activityVersion: 11,
    });
    await expect(page.getByRole("button", {
      name: /3 managed agents ready/u,
    })).toBeVisible();
    await expect(page.getByText("Advanced: Contextbot connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close agent setup" }).click();

    const inspected = expectNativeEnvelope(
      await invokeNativeTool<InspectIssueToolResult>(
        page,
        "inspect_document",
        {},
      ),
    );
    expect(inspected).toMatchObject({
      ok: true,
      document: {
        protocolVersion: 4,
        revision: 5,
        activityVersion: 11,
        title: "INC-482 · Checkout outage postmortem",
      },
      currentRevision: 5,
      currentActivityVersion: 11,
      agents: expect.arrayContaining([
        expect.objectContaining({
          name: "Contextbot",
          member: expect.objectContaining({ displayName: "Quinn Patel" }),
        }),
      ]),
      tasks: expect.any(Array),
    });

    const history = expectNativeEnvelope(
      await invokeNativeTool<ReadIssueHistoryToolResult>(
        page,
        "read_document_history",
        { limit: 10 },
      ),
    );
    expect(history).toMatchObject({
      ok: true,
      currentRevision: 5,
      currentActivityVersion: 11,
      hasMoreOlder: false,
    });
    if (history.ok) {
      expect(history.revisions.map(({ revision }) => revision)).toEqual([
        5,
        4,
        3,
        2,
        1,
      ]);
    }

    const collaboration = expectNativeEnvelope(
      await invokeNativeTool<ReadCollaborationContextToolResult>(
        page,
        "read_collaboration_context",
        { limit: 5 },
      ),
    );
    expect(collaboration).toMatchObject({
      ok: true,
      currentRevision: 5,
      currentActivityVersion: 11,
      hasMoreOlder: true,
      nextBeforeActivityVersion: 7,
      agents: expect.arrayContaining([
        expect.objectContaining({ name: "Contextbot", accessCount: 1 }),
      ]),
    });
    if (collaboration.ok) {
      expect(collaboration.events.map(({ activityVersion }) => activityVersion)).toEqual([
        11,
        10,
        9,
        8,
        7,
      ]);
    }

    const tasks = expectNativeEnvelope(
      await invokeNativeTool<ListMyIssueTasksToolResult>(
        page,
        "list_my_tasks",
        { includeResolved: true },
      ),
    );
    expect(tasks).toEqual({
      ok: true,
      revision: 5,
      activityVersion: 11,
      tasks: [],
    });
  } else {
    test.info().annotations.push({
      type: "pending",
      description:
        "This supported client discovered the current v4.4 idle compatibility catalog but did not expose optional page-side executeTool; connected invocation still needs a dated supported-client capture.",
    });
  }

  expect(pageErrors).toEqual([]);

  await page.goto("/new");
  await expect.poll(async () => {
    const names = (await discoverNativeTools(page)).tools;
    return names.filter((name) =>
      REPOSITORY_TOOL_NAMES.includes(
        name as (typeof REPOSITORY_TOOL_NAMES)[number],
      ));
  }).toEqual([]);
  expect(pageErrors).toEqual([]);
});
