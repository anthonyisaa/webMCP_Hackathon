import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type ProbeCheck = { id: string; status: string };
type ProbeEvidence = {
  schemaVersion: 2;
  overall: "PASSED" | "FAILED";
  evidenceClass: "UNCLASSIFIED_PAGE_OBSERVATION";
  namespace: string;
  observedInputEncoding: "NOT_OBSERVED" | "OBJECT" | "JSON_STRING_COMPAT";
  cancellationTransport:
    | "NATIVE_CALLBACK_SIGNAL"
    | "APPLICATION_PROPAGATED"
    | "UNAVAILABLE";
  generation: number;
  relayPhysicalName: string;
  initialCatalog: string[];
  relayCatalog: string[];
  finalCatalog: string[];
  toolchangeEvents: number;
  callbackDispatches: number;
  authorizedEchoes: number;
  cancellationObservedByCallback: number;
  checks: ProbeCheck[];
};

const EXPECTED_CHECKS = [
  "standard_document_model_context",
  "initial_idle_catalog",
  "toolchange_to_relay",
  "get_tools_relay_descriptor",
  "unarmed_native_denied",
  "armed_execute_tool",
  "one_shot_replay_denied",
  "execution_cancellation",
  "toolchange_to_idle",
  "stale_descriptor_rejected",
  "idle_catalog_restored",
];

async function installWebMCPAdapter(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    type ToolDefinition = {
      name: string;
      title?: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      execute: (
        input: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ) => Promise<unknown>;
    };
    type Descriptor = {
      name: string;
      title?: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      origin: string;
      window: Window;
    };
    type Registration = { tool: ToolDefinition; descriptor: Descriptor };

    const events = new EventTarget();
    const active = new Map<string, Registration>();
    const registrationByDescriptor = new WeakMap<object, Registration>();
    const announceChange = () => queueMicrotask(() => {
      events.dispatchEvent(new Event("toolchange"));
    });
    const throwIfAborted = (signal?: AbortSignal) => {
      if (!signal?.aborted) return;
      throw signal.reason ?? new DOMException("Execution cancelled", "AbortError");
    };

    const modelContext = {
      registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }) {
        throwIfAborted(options?.signal);
        if (active.has(tool.name)) {
          throw new DOMException(`Tool ${tool.name} is already registered.`, "InvalidStateError");
        }
        const descriptor = Object.freeze({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: structuredClone(tool.inputSchema ?? {}),
          annotations: tool.annotations ? { ...tool.annotations } : undefined,
          origin: window.location.origin,
          window,
        });
        const registration = { tool, descriptor };
        active.set(tool.name, registration);
        registrationByDescriptor.set(descriptor, registration);
        options?.signal?.addEventListener("abort", () => {
          if (active.get(tool.name) !== registration) return;
          active.delete(tool.name);
          announceChange();
        }, { once: true });
        announceChange();
      },
      async getTools() {
        return [...active.values()].map(({ descriptor }) => descriptor);
      },
      async executeTool(
        descriptor: Descriptor,
        input: Record<string, unknown> = {},
        options?: { signal?: AbortSignal },
      ) {
        throwIfAborted(options?.signal);
        const registration = registrationByDescriptor.get(descriptor);
        if (!registration || active.get(registration.tool.name) !== registration) {
          throw new DOMException("The RegisteredTool is no longer active.", "UnknownError");
        }
        const callbackController = new AbortController();
        let removeCallerAbort = () => {};
        const callerCancellation = options?.signal
          ? new Promise<never>((_resolve, reject) => {
              const callerSignal = options.signal as AbortSignal;
              const onAbort = () => {
                const reason = callerSignal.reason
                  ?? new DOMException("Execution cancelled", "AbortError");
                reject(reason);
                queueMicrotask(() => callbackController.abort(reason));
              };
              callerSignal.addEventListener("abort", onAbort, { once: true });
              removeCallerAbort = () => callerSignal.removeEventListener("abort", onAbort);
            })
          : null;
        try {
          const callbackResult = Promise.resolve(
            registration.tool.execute(input, { signal: callbackController.signal }),
          );
          const result = callerCancellation
            ? await Promise.race([callbackResult, callerCancellation])
            : await callbackResult;
          const serialized = JSON.stringify(result);
          if (serialized === undefined) throw new TypeError("Tool result is not JSON serializable.");
          return serialized;
        } finally {
          removeCallerAbort();
        }
      },
      addEventListener(type: "toolchange", listener: EventListener) {
        events.addEventListener(type, listener);
      },
      removeEventListener(type: "toolchange", listener: EventListener) {
        events.removeEventListener(type, listener);
      },
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
  });
}

async function readEvidence(page: Page): Promise<ProbeEvidence> {
  const text = await page.getByTestId("probe-evidence").textContent();
  if (!text) throw new Error("Probe evidence was empty.");
  return JSON.parse(text) as ProbeEvidence;
}

function expectPassingEvidence(evidence: ProbeEvidence): void {
  expect(evidence.overall).toBe("PASSED");
  expect(evidence.schemaVersion).toBe(2);
  expect(evidence.evidenceClass).toBe("UNCLASSIFIED_PAGE_OBSERVATION");
  expect(evidence.namespace).toBe("document.modelContext");
  expect(evidence.observedInputEncoding).toBe("OBJECT");
  expect(evidence.cancellationTransport).toBe("NATIVE_CALLBACK_SIGNAL");
  expect(evidence.initialCatalog).toEqual(["ratiflow_probe_idle"]);
  expect(evidence.relayCatalog).toEqual([evidence.relayPhysicalName]);
  expect(evidence.relayPhysicalName).toMatch(/^ratiflow_probe_relay_g_[a-f0-9]{32}$/u);
  expect(evidence.finalCatalog).toEqual(["ratiflow_probe_idle"]);
  expect(evidence.toolchangeEvents).toBeGreaterThanOrEqual(5);
  expect(evidence.callbackDispatches).toBe(4);
  expect(evidence.authorizedEchoes).toBe(1);
  expect(evidence.cancellationObservedByCallback).toBe(1);
  expect(evidence.checks.map(({ id }) => id)).toEqual(EXPECTED_CHECKS);
  expect(evidence.checks.every(({ status }) => status === "PASSED")).toBe(true);
}

test("adapter-only: proves idle → Relay → idle consumer lifecycle without claiming native evidence", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  test.info().annotations.push({
    type: "evidence-boundary",
    description: "A deterministic page adapter is installed; this test is not native WebMCP evidence.",
  });
  const context = await browser.newContext({ baseURL });
  await installWebMCPAdapter(context);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/webmcp-probe");
    await expect(page.getByTestId("probe-phase")).toHaveText("IDLE");
    await expect(page.getByTestId("probe-outcome")).toHaveText("NOT RUN");
    await expect(page.getByTestId("probe-catalog")).toContainText("ratiflow_probe_idle");
    await expect(
      page.getByText("Only an external harness can classify this observation as adapter or native evidence."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Run idle → Relay → idle proof" }).click();
    await expect(page.getByTestId("probe-outcome")).toHaveText("PASSED", { timeout: 15_000 });
    await expect(page.getByTestId("probe-phase")).toHaveText("IDLE");
    const first = await readEvidence(page);
    expectPassingEvidence(first);

    await page.getByRole("button", { name: "Run proof again" }).click();
    await expect(page.getByTestId("probe-outcome")).toHaveText("PASSED", { timeout: 15_000 });
    const second = await readEvidence(page);
    expectPassingEvidence(second);
    expect(second.generation).toBe(first.generation + 1);
    expect(second.relayPhysicalName).not.toBe(first.relayPhysicalName);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
