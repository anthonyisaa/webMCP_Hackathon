import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { DOCUMENT_AGENT_REQUEST } from "../src/document/contracts";

test.setTimeout(60_000);

type DocumentToolResult = {
  ok: boolean;
  code?: string;
  document?: {
    body: string;
    stage: string;
    revision: number;
  };
  annotation?: {
    annotationId: string;
    status: string;
  };
  change?: {
    fromRevision: number;
    toRevision: number;
    annotationId: string;
  };
  undoAvailable?: boolean;
};

type AgentAnnotation = {
  annotationId: string;
  instruction: string;
  targetField: string;
  targetKind: string;
  selectedText: string;
  anchorRevision: number;
  status: string;
};

type AnnotationListResult = {
  ok: boolean;
  code?: string;
  annotations?: AgentAnnotation[];
};

async function registeredToolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const harness = (window as unknown as {
      __ratiflowDocumentWebMCPTest: { names: () => string[] };
    }).__ratiflowDocumentWebMCPTest;
    return harness.names();
  });
}

async function toolRegistrationCount(page: Page, name: string): Promise<number> {
  return page.evaluate((toolName) => {
    const harness = (window as unknown as {
      __ratiflowDocumentWebMCPTest: { registrationCount: (name: string) => number };
    }).__ratiflowDocumentWebMCPTest;
    return harness.registrationCount(toolName);
  }, name);
}

async function invokeTool<T>(page: Page, name: string, input: unknown): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const harness = (window as unknown as {
        __ratiflowDocumentWebMCPTest: {
          invoke: (name: string, input: unknown) => Promise<unknown>;
        };
      }).__ratiflowDocumentWebMCPTest;
      return harness.invoke(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  ) as Promise<T>;
}

async function selectBodyRange(
  page: Page,
  start: number,
  end: number,
): Promise<void> {
  await page.getByLabel("Note body").evaluate(
    (element: HTMLTextAreaElement, range) => {
      element.focus();
      element.setSelectionRange(range.start, range.end);
      element.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
}

async function addCustomAnnotation(
  page: Page,
  start: number,
  end: number,
  instruction: string,
): Promise<void> {
  await selectBodyRange(page, start, end);
  await page.getByLabel("Note body").press("Control+K");
  const composer = page.getByLabel("Custom instruction");
  await expect(composer).toBeFocused();
  await composer.fill(instruction);
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(composer).toHaveValue("");
}

async function installWebMCPHarness(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      execute: (
        input: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<unknown>;
    };
    const active = new Map<string, RegisteredTool>();
    const registrationCounts = new Map<string, number>();
    let clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          clipboardText = value;
        },
        readText: async () => clipboardText,
      },
    });
    const modelContext = {
      registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }) {
        registrationCounts.set(
          tool.name,
          (registrationCounts.get(tool.name) ?? 0) + 1,
        );
        active.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => {
          if (active.get(tool.name) === tool) active.delete(tool.name);
        });
      },
    };
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, "__ratiflowDocumentWebMCPTest", {
      configurable: true,
      value: {
        names: () => [...active.keys()],
        registrationCount: (name: string) => registrationCounts.get(name) ?? 0,
        clipboard: () => clipboardText,
        invoke: (name: string, input: unknown) => {
          const tool = active.get(name);
          if (!tool) throw new Error(`Tool ${name} is not registered.`);
          return tool.execute(input, { signal: new AbortController().signal });
        },
      },
    });
  });
}

test("document WebMCP processes an owned annotation queue and cleans up before decision tools", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

  const context = await browser.newContext({
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await installWebMCPHarness(context);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/document");
    await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
    const body = page.getByLabel("Note body");
    await expect(body).toHaveValue("");

    await expect.poll(() => registeredToolNames(page)).toEqual([
      "inspect_document",
      "list_agent_annotations",
    ]);
    const blank = await invokeTool<DocumentToolResult>(page, "inspect_document", {});
    expect(blank).toMatchObject({
      ok: true,
      document: { body: "", stage: "BRAINSTORMING", revision: 0 },
    });
    expect(
      await invokeTool<AnnotationListResult>(page, "list_agent_annotations", {}),
    ).toEqual({ ok: true, annotations: [] });

    const originalBody = "Draft launch note for the team.";
    await body.fill(originalBody);
    await expect.poll(async () => {
      const result = await invokeTool<DocumentToolResult>(page, "inspect_document", {});
      return result.document?.body;
    }).toBe(originalBody);

    const nativeContextMenuPrevented = await body.evaluate((element) => {
      const defaultAllowed = element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      );
      return !defaultAllowed;
    });
    expect(nativeContextMenuPrevented).toBe(false);
    await expect(page.getByRole("menu", { name: "Agent actions" })).toHaveCount(0);

    await addCustomAnnotation(
      page,
      6,
      17,
      "Rewrite this phrase as a concise release-planning phrase.",
    );
    await addCustomAnnotation(
      page,
      26,
      30,
      "Replace this noun with a warmer collective term.",
    );
    await expect(page.getByTestId("pending-annotation-list").getByTestId("annotation-card"))
      .toHaveCount(2);

    await expect.poll(() => registeredToolNames(page)).toEqual([
      "inspect_document",
      "list_agent_annotations",
      "apply_agent_annotation",
    ]);
    const listed = await invokeTool<AnnotationListResult>(
      page,
      "list_agent_annotations",
      {},
    );
    expect(listed.ok).toBe(true);
    expect(listed.annotations).toHaveLength(2);
    const [first, second] = listed.annotations ?? [];
    if (!first || !second) throw new Error("Both queued annotations were not returned.");
    expect(first).toMatchObject({
      targetField: "BODY",
      targetKind: "SELECTION",
      selectedText: "launch note",
      status: "PENDING",
    });
    expect(second).toMatchObject({
      targetField: "BODY",
      targetKind: "SELECTION",
      selectedText: "team",
      anchorRevision: first.anchorRevision,
      status: "PENDING",
    });

    const invalidStageAttempt = await invokeTool<DocumentToolResult>(
      page,
      "apply_agent_annotation",
      {
        annotationId: first.annotationId,
        expectedRevision: first.anchorRevision,
        requestId: "523e4567-e89b-42d3-a456-426614174000",
        replacementText: "release plan",
        changeSummary: "Clarified the selected phrase.",
        stage: "READY_TO_SHIP",
      },
    );
    expect(invalidStageAttempt).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const appliedFirst = await invokeTool<DocumentToolResult>(
      page,
      "apply_agent_annotation",
      {
        annotationId: first.annotationId,
        expectedRevision: first.anchorRevision,
        requestId: "623e4567-e89b-42d3-a456-426614174000",
        replacementText: "release plan",
        changeSummary: "Clarified the selected phrase.",
      },
    );
    expect(appliedFirst).toMatchObject({
      ok: true,
      document: {
        body: "Draft release plan for the team.",
        stage: "BRAINSTORMING",
        revision: first.anchorRevision + 1,
      },
      annotation: { annotationId: first.annotationId, status: "COMPLETED" },
      change: {
        fromRevision: first.anchorRevision,
        toRevision: first.anchorRevision + 1,
        annotationId: first.annotationId,
      },
      undoAvailable: true,
    });
    await expect(body).toHaveValue("Draft release plan for the team.");
    await expect.poll(() => registeredToolNames(page)).toContain("apply_agent_annotation");

    const afterFirst = await invokeTool<AnnotationListResult>(
      page,
      "list_agent_annotations",
      {},
    );
    expect(afterFirst.annotations).toHaveLength(1);
    const rebasedSecond = afterFirst.annotations?.[0];
    if (!rebasedSecond) throw new Error("The second annotation was not safely rebased.");
    expect(rebasedSecond).toMatchObject({
      annotationId: second.annotationId,
      selectedText: "team",
      anchorRevision: first.anchorRevision + 1,
    });

    const appliedSecond = await invokeTool<DocumentToolResult>(
      page,
      "apply_agent_annotation",
      {
        annotationId: rebasedSecond.annotationId,
        expectedRevision: rebasedSecond.anchorRevision,
        requestId: "723e4567-e89b-42d3-a456-426614174000",
        replacementText: "crew",
        changeSummary: "Used a warmer collective term.",
      },
    );
    expect(appliedSecond).toMatchObject({
      ok: true,
      document: {
        body: "Draft release plan for the crew.",
        revision: rebasedSecond.anchorRevision + 1,
      },
      annotation: { annotationId: second.annotationId, status: "COMPLETED" },
      undoAvailable: true,
    });
    await expect(body).toHaveValue("Draft release plan for the crew.");
    await expect.poll(() => registeredToolNames(page)).toEqual([
      "inspect_document",
      "list_agent_annotations",
    ]);
    expect(
      await invokeTool<AnnotationListResult>(page, "list_agent_annotations", {}),
    ).toEqual({ ok: true, annotations: [] });
    await expect(page.getByTestId("annotation-history-list").getByTestId("annotation-card"))
      .toHaveCount(2);

    await page.getByRole("button", { name: "Ask ChatGPT" }).click();
    await expect(page.getByText("Prompt copied — paste/send in ChatGPT")).toBeVisible();
    expect(
      await page.evaluate(() => {
        const harness = (window as unknown as {
          __ratiflowDocumentWebMCPTest: { clipboard: () => string };
        }).__ratiflowDocumentWebMCPTest;
        return harness.clipboard();
      }),
    ).toBe(DOCUMENT_AGENT_REQUEST);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(body).toHaveValue("Draft release plan for the team.");
    const undone = await invokeTool<DocumentToolResult>(page, "inspect_document", {});
    expect(undone).toMatchObject({
      ok: true,
      document: {
        body: "Draft release plan for the team.",
        revision: (appliedSecond.document?.revision ?? 0) + 1,
      },
    });

    await page.goto("/decision-demo");
    await expect.poll(() => registeredToolNames(page)).toEqual([]);
    await page.getByRole("button", { name: "Launch deterministic workspace" }).click();
    await expect.poll(() => registeredToolNames(page)).toEqual([
      "join_session",
      "catch_up",
    ]);
    expect(await registeredToolNames(page)).not.toEqual(
      expect.arrayContaining([
        "inspect_document",
        "list_agent_annotations",
        "apply_agent_annotation",
      ]),
    );
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("a delayed equal-revision presence response cannot resurrect cancelled work", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");

  const context = await browser.newContext({ baseURL });
  await installWebMCPHarness(context);
  const page = await context.newPage();
  let releaseOldResponse: (() => void) | undefined;

  try {
    await page.goto("/document");
    await expect(page).toHaveURL(/\/document\/[A-Za-z0-9_-]+$/);
    const body = page.getByLabel("Note body");
    await body.fill("Pending annotation race.");
    await expect.poll(async () => {
      const result = await invokeTool<DocumentToolResult>(page, "inspect_document", {});
      return result.document?.body;
    }).toBe("Pending annotation race.");

    await addCustomAnnotation(
      page,
      0,
      7,
      "Replace this phrase without changing the document revision.",
    );
    await expect.poll(() => registeredToolNames(page)).toContain(
      "apply_agent_annotation",
    );
    const initialApplyRegistrations = await toolRegistrationCount(
      page,
      "apply_agent_annotation",
    );

    let markOldResponseCaptured: (() => void) | undefined;
    const oldResponseCaptured = new Promise<void>((resolve) => {
      markOldResponseCaptured = resolve;
    });
    let markOldResponseDelivered: (() => void) | undefined;
    const oldResponseDelivered = new Promise<void>((resolve) => {
      markOldResponseDelivered = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      releaseOldResponse = resolve;
    });
    let intercepted = false;
    let capturedStatus: string | undefined;
    await page.route("**/api/document/presence", async (route) => {
      if (intercepted) {
        await route.continue();
        return;
      }
      intercepted = true;
      const response = await route.fetch();
      const payload = (await response.json()) as {
        data?: { annotations?: Array<{ status?: string }> };
      };
      capturedStatus = payload.data?.annotations?.[0]?.status;
      markOldResponseCaptured?.();
      await releaseGate;
      await route.fulfill({ response });
      markOldResponseDelivered?.();
    });

    await oldResponseCaptured;
    expect(capturedStatus).toBe("PENDING");
    await page
      .getByRole("button", { name: "Cancel Ask agent…", exact: true })
      .click();
    await expect(
      page.getByTestId("pending-annotation-list").getByTestId("annotation-card"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("annotation-history-list").getByTestId("annotation-card"),
    ).toContainText("Cancelled");
    await expect.poll(() => registeredToolNames(page)).toEqual([
      "inspect_document",
      "list_agent_annotations",
    ]);

    releaseOldResponse?.();
    await oldResponseDelivered;
    await expect(
      page.getByTestId("pending-annotation-list").getByTestId("annotation-card"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("annotation-history-list").getByTestId("annotation-card"),
    ).toContainText("Cancelled");
    await expect.poll(() => registeredToolNames(page)).toEqual([
      "inspect_document",
      "list_agent_annotations",
    ]);
    await expect
      .poll(() => toolRegistrationCount(page, "apply_agent_annotation"))
      .toBe(initialApplyRegistrations);
  } finally {
    releaseOldResponse?.();
    await context.close();
  }
});
