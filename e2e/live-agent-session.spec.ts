import { expect, test, type Page } from "@playwright/test";

type CoordinationResult<T = Record<string, unknown>> =
  | { ok: true; cursor: string; data: T }
  | { ok: false; code: string; message: string };

type NativeEnvelope<T = unknown> = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
};

declare global {
  interface Window {
    __ratiflowLiveTest: {
      names: () => string[];
      invoke: (name: string, input: unknown) => Promise<unknown>;
      start: (key: string, name: string, input: unknown) => void;
      take: (key: string) => Promise<unknown>;
      invokeAndAbort: (
        name: string,
        input: unknown,
        delayMs: number,
      ) => Promise<{ errorName: string; message: string }>;
    };
  }
}

async function installWebMCPHarness(page: Page) {
  await page.addInitScript(() => {
    type RegisteredTool = {
      name: string;
      execute: (
        input: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<unknown>;
    };

    const active = new Map<string, RegisteredTool>();
    const pending = new Map<string, Promise<unknown>>();
    const modelContext = {
      registerTool(
        tool: RegisteredTool,
        options?: { signal?: AbortSignal },
      ) {
        active.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => {
            if (active.get(tool.name) === tool) active.delete(tool.name);
          },
          { once: true },
        );
      },
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, "__ratiflowLiveTest", {
      configurable: true,
      value: {
        names: () => [...active.keys()],
        invoke: (name: string, input: unknown) => {
          const tool = active.get(name);
          if (!tool) throw new Error(`Tool ${name} is not registered.`);
          return tool.execute(input);
        },
        start: (key: string, name: string, input: unknown) => {
          const tool = active.get(name);
          if (!tool) throw new Error(`Tool ${name} is not registered.`);
          pending.set(key, tool.execute(input));
        },
        take: async (key: string) => {
          const invocation = pending.get(key);
          if (!invocation) throw new Error(`Invocation ${key} was not started.`);
          try {
            return await invocation;
          } finally {
            pending.delete(key);
          }
        },
        invokeAndAbort: async (
          name: string,
          input: unknown,
          delayMs: number,
        ) => {
          const tool = active.get(name);
          if (!tool) throw new Error(`Tool ${name} is not registered.`);
          const controller = new AbortController();
          const invocation = tool.execute(input, { signal: controller.signal });
          window.setTimeout(
            () => controller.abort(new DOMException("Test cancelled", "AbortError")),
            delayMs,
          );
          try {
            await invocation;
            return { errorName: "NO_ERROR", message: "Invocation resolved." };
          } catch (error) {
            return {
              errorName:
                error instanceof DOMException || error instanceof Error
                  ? error.name
                  : "UnknownError",
              message: error instanceof Error ? error.message : String(error),
            };
          }
        },
      },
    });
  });
}

async function registeredNames(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ratiflowLiveTest.names());
}

async function invoke<T>(
  page: Page,
  name: string,
  input: unknown,
): Promise<T> {
  const envelope = (await page.evaluate(
    ({ toolName, toolInput }) =>
      window.__ratiflowLiveTest.invoke(toolName, toolInput),
    { toolName: name, toolInput: input },
  )) as NativeEnvelope<T>;
  expect(envelope.content).toEqual([
    { type: "text", text: JSON.stringify(envelope.structuredContent) },
  ]);
  return envelope.structuredContent;
}

test.describe("live human-agent loop", () => {
  test("joins, wakes on addressed work, claims once, asks a person, catches up, and leaves", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installWebMCPHarness(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Launch deterministic workspace" })
      .click();
    await expect(page.locator(".revision-block")).toContainText("rev 7");

    await expect.poll(() => registeredNames(page)).toEqual([
      "join_session",
      "catch_up",
    ]);

    const joined = await invoke<
      CoordinationResult<{
        sessionOpen: boolean;
        inbox: Array<{ id: string }>;
      }>
    >(page, "join_session", {});
    expect(joined).toMatchObject({
      ok: true,
      data: { sessionOpen: true, inbox: [] },
    });
    if (!joined.ok) throw new Error(joined.message);

    await expect.poll(() => registeredNames(page)).toEqual(
      expect.arrayContaining([
        "wait_for_activity",
        "leave_session",
        "get_state_brief",
        "get_inbox",
        "claim_agent_task",
        "post_comment",
        "request_human_input",
        "inspect_decision",
      ]),
    );
    await expect(page.locator(".agent-presence")).toContainText("live");

    const waitStartedAt = Date.now();
    await page.evaluate(
      ({ cursor }) =>
        window.__ratiflowLiveTest.start("task-arrival", "wait_for_activity", {
          cursor,
          timeoutSeconds: 5,
        }),
      { cursor: joined.cursor },
    );

    await page.getByRole("radio", { name: /^Northstar beta/ }).click();
    await page
      .getByLabel("Task for Ratiflow Agent")
      .fill("Check this option’s delivery risks, then ask me to confirm the tolerance.");
    await page.getByRole("button", { name: "Add to agent inbox" }).click();

    const wokeEnvelope = (await page.evaluate(() =>
      window.__ratiflowLiveTest.take("task-arrival"),
    )) as NativeEnvelope<
      CoordinationResult<{
        events: Array<{ type: string; taskId?: string }>;
        inbox: Array<{ id: string; status: string }>;
      }>
    >;
    expect(wokeEnvelope.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(wokeEnvelope.structuredContent),
      },
    ]);
    const woke = wokeEnvelope.structuredContent;
    const deliveryMs = Date.now() - waitStartedAt;
    expect(deliveryMs).toBeLessThan(2_000);
    expect(woke).toMatchObject({ ok: true });
    if (!woke.ok) throw new Error(woke.message);
    expect(woke.data.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "TASK_CREATED" })]),
    );
    const task = woke.data.inbox.find((candidate) => candidate.status === "OPEN");
    expect(task).toBeDefined();
    if (!task) throw new Error("The addressed task was not returned to the wait.");

    const claim = await invoke<
      CoordinationResult<{ task: { id: string; status: string } }>
    >(page, "claim_agent_task", {
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    expect(claim).toMatchObject({
      ok: true,
      data: { task: { id: task.id, status: "CLAIMED" } },
    });

    const duplicateClaim = await invoke<CoordinationResult>(
      page,
      "claim_agent_task",
      { taskId: task.id, requestId: crypto.randomUUID() },
    );
    expect(duplicateClaim).toMatchObject({ ok: true });
    const claimHistory = await invoke<
      CoordinationResult<{ events: Array<{ type: string; taskId?: string }> }>
    >(page, "catch_up", { sinceCursor: woke.cursor });
    expect(claimHistory).toMatchObject({ ok: true });
    if (!claimHistory.ok) throw new Error(claimHistory.message);
    expect(
      claimHistory.data.events.filter(
        (event) => event.type === "TASK_CLAIMED" && event.taskId === task.id,
      ),
    ).toHaveLength(1);

    const comment = await invoke<
      CoordinationResult<{ comment: { body: string; via: string } }>
    >(page, "post_comment", {
      target: { kind: "OPTION", id: "opt_csv_beta_oct15" },
      body: "The beta contains delivery risk by deferring GA hardening, but it fits the reduced 14-day capacity.",
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    expect(comment).toMatchObject({
      ok: true,
      data: { comment: { via: "BROWSER_AGENT" } },
    });
    await expect(page.locator(".agent-thread")).toContainText("via ChatGPT");

    const question = await invoke<
      CoordinationResult<{ question: { id: string }; task: { status: string } }>
    >(page, "request_human_input", {
      question: "Can Northstar accept an invite-only beta before GA?",
      target: { kind: "OPTION", id: "opt_csv_beta_oct15" },
      taskId: task.id,
      requestId: crypto.randomUUID(),
    });
    expect(question).toMatchObject({
      ok: true,
      data: { task: { status: "WAITING_HUMAN" } },
    });
    if (!question.ok) throw new Error(question.message);

    await expect(
      page.locator(".agent-question-card").getByText(
        "Can Northstar accept an invite-only beta before GA?",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByLabel("Answer Ratiflow Agent")
      .fill("Yes—if the beta is usable on October 15 and GA follows November 1.");
    await page.getByRole("button", { name: "Share answer" }).click();
    await expect(
      page.getByText(
        "Your answer is now shared state; the next agent wait or catch-up can read it.",
        { exact: true },
      ),
    ).toBeVisible();

    const caughtUp = await invoke<
      CoordinationResult<{
        events: Array<{ type: string; questionId?: string }>;
        inbox: Array<{ id: string; status: string }>;
      }>
    >(page, "catch_up", { sinceCursor: question.cursor });
    expect(caughtUp).toMatchObject({ ok: true });
    if (!caughtUp.ok) throw new Error(caughtUp.message);
    expect(caughtUp.data.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "HUMAN_INPUT_ANSWERED",
          questionId: question.data.question.id,
        }),
      ]),
    );
    expect(caughtUp.data.inbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: task.id, status: "OPEN" }),
      ]),
    );

    const secondClaim = await invoke<CoordinationResult>(
      page,
      "claim_agent_task",
      { taskId: task.id, requestId: crypto.randomUUID() },
    );
    expect(secondClaim).toMatchObject({ ok: true });
    const resolved = await invoke<CoordinationResult>(page, "resolve_task", {
      taskId: task.id,
      requestId: crypto.randomUUID(),
      outcome: "Reviewed beta delivery risk and confirmed the customer’s tolerance.",
      resultLink: "/#workspace",
    });
    expect(resolved).toMatchObject({
      ok: true,
      data: { task: { id: task.id, status: "DONE" } },
    });
    if (!resolved.ok) throw new Error(resolved.message);
    await expect(page.locator(".agent-inbox")).toContainText("done");

    const cancelled = await page.evaluate(
      ({ cursor }) =>
        window.__ratiflowLiveTest.invokeAndAbort(
          "wait_for_activity",
          { cursor, timeoutSeconds: 5 },
          30,
        ),
      { cursor: resolved.cursor },
    );
    expect(cancelled).toMatchObject({ errorName: "AbortError" });

    const left = await invoke<CoordinationResult<{ sessionOpen: boolean }>>(
      page,
      "leave_session",
      {},
    );
    expect(left).toMatchObject({ ok: true, data: { sessionOpen: false } });
    await expect.poll(() => registeredNames(page)).toEqual([
      "join_session",
      "catch_up",
    ]);
    await expect(page.locator(".agent-presence")).toContainText("away");
  });

  test("does not let an older equal-revision inspect erase fresh agent activity", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await installWebMCPHarness(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Launch deterministic workspace" })
      .click();
    await expect.poll(() => registeredNames(page)).toEqual([
      "join_session",
      "catch_up",
    ]);
    const joined = await invoke<CoordinationResult>(page, "join_session", {});
    expect(joined).toMatchObject({ ok: true });
    await page.getByRole("radio", { name: /^Northstar beta/ }).click();

    let releaseStale: () => void = () => {};
    const staleCanFinish = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    let markStaleCaptured: () => void = () => {};
    const staleCaptured = new Promise<void>((resolve) => {
      markStaleCaptured = resolve;
    });
    let intercepted = false;

    await page.route("**/api/workspace", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.pathname !== "/api/workspace" ||
        request.method() !== "GET" ||
        intercepted
      ) {
        await route.continue();
        return;
      }

      intercepted = true;
      const staleResponse = await route.fetch();
      markStaleCaptured();
      await staleCanFinish;
      await route.fulfill({ response: staleResponse });
    });

    try {
      await staleCaptured;
      const body =
        "Fresh agent activity must survive an older equal-revision refresh.";
      const comment = await invoke<CoordinationResult>(page, "post_comment", {
        target: { kind: "OPTION", id: "opt_csv_beta_oct15" },
        body,
        requestId: crypto.randomUUID(),
      });
      expect(comment).toMatchObject({ ok: true });

      await expect(page.locator(".agent-thread")).toContainText(body);
      releaseStale();
      await page.waitForTimeout(300);
      await expect(page.locator(".agent-thread")).toContainText(body);
    } finally {
      releaseStale();
      await page.unroute("**/api/workspace");
    }
  });

  test("keeps the decision room contained and usable on a 390px viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Launch deterministic workspace" })
      .click();
    await expect(page.getByRole("heading", { name: "Address the agent where the decision lives." })).toBeVisible();
    await expect(page.getByLabel("Task for Ratiflow Agent")).toBeEditable();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
