"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type ProbeMode = "collect" | "review";
type Namespace = "document.modelContext" | "navigator.modelContext" | "unsupported";

interface LogEntry {
  id: string;
  at: string;
  message: string;
}

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

function detectModelContext(): { context?: WebMCPModelContext; namespace: Namespace } {
  if (document.modelContext) {
    return { context: document.modelContext, namespace: "document.modelContext" };
  }

  if (navigator.modelContext) {
    return { context: navigator.modelContext, namespace: "navigator.modelContext" };
  }

  return { namespace: "unsupported" };
}

function waitForAbortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason ?? new DOMException("Tool execution cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

export function WebMCPProbe() {
  const [mode, setMode] = useState<ProbeMode>("collect");
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  const [registrationState, setRegistrationState] = useState("Checking browser support…");
  const [discoveryEvidence, setDiscoveryEvidence] = useState("Page registration ledger");
  const [lastResult, setLastResult] = useState("No tool has been executed in-page yet.");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const baseControllerRef = useRef<AbortController | null>(null);
  const modeControllerRef = useRef<AbortController | null>(null);
  const modeRef = useRef<ProbeMode>(mode);
  const namespace = useSyncExternalStore(
    () => () => undefined,
    () => detectModelContext().namespace,
    () => "unsupported" as const,
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const addLog = useCallback((message: string) => {
    setLogs((current) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), message },
      ...current,
    ].slice(0, 12));
  }, []);

  const refreshTools = useCallback(async () => {
    const { context } = detectModelContext();
    if (!context) {
      setRegisteredTools([]);
      return;
    }

    if (!context.getTools) {
      setDiscoveryEvidence("Client discovery must be verified externally");
      addLog("This surface does not expose getTools() to page code.");
      return;
    }

    const getTools = context.getTools.bind(context);

    try {
      const tools = await getTools();
      const probeTools = tools.map((tool) => tool.name).filter((name) => name.startsWith("ratiflow_probe_"));
      setRegisteredTools(probeTools);
      setDiscoveryEvidence("Verified through in-page getTools()");
    } catch (error) {
      addLog(`getTools failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addLog]);

  useEffect(() => {
    const detected = detectModelContext();

    if (!detected.context) {
      queueMicrotask(() => {
        setRegistrationState("WebMCP is unavailable in this browser context.");
        addLog("No modelContext namespace detected.");
      });
      return;
    }

    const context = detected.context;
    const controller = new AbortController();
    baseControllerRef.current = controller;
    let disposed = false;

    const onToolChange = () => {
      addLog("toolchange observed.");
      void refreshTools();
    };

    context.addEventListener?.("toolchange", onToolChange);

    async function registerBaseTools() {
      try {
        await Promise.all([
          context.registerTool(
            {
              name: "ratiflow_probe_read_context",
              title: "Read probe context",
              description: "Read the current Ratiflow WebMCP validation state. This has no side effects.",
              inputSchema: emptySchema,
              annotations: { readOnlyHint: true, untrustedContentHint: false },
              execute: async () => ({
                ok: true,
                probe: "ratiflow-webmcp",
                mode: modeRef.current,
                namespace: detected.namespace,
                location: window.location.origin,
                returnedAt: new Date().toISOString(),
              }),
            },
            { signal: controller.signal },
          ),
          context.registerTool(
            {
              name: "ratiflow_probe_wait",
              title: "Run cancellable probe",
              description: "Wait for up to five seconds to verify that WebMCP execution cancellation reaches page code.",
              inputSchema: {
                type: "object",
                properties: {
                  milliseconds: {
                    type: "integer",
                    minimum: 100,
                    maximum: 5000,
                    description: "Delay duration between 100 and 5000 milliseconds.",
                  },
                },
                required: ["milliseconds"],
                additionalProperties: false,
              },
              annotations: { readOnlyHint: true, untrustedContentHint: false },
              execute: async (input, options) => {
                const milliseconds = Number(input.milliseconds);
                if (!Number.isInteger(milliseconds) || milliseconds < 100 || milliseconds > 5000) {
                  return { ok: false, code: "INVALID_INPUT", allowedRange: [100, 5000] };
                }
                const signal = options?.signal;
                if (!signal) {
                  addLog("Wait callback arrived without an execution cancellation signal.");
                  return {
                    ok: false,
                    code: "CANCELLATION_SIGNAL_UNAVAILABLE",
                    message: "This client did not supply an execution cancellation signal to page code.",
                  };
                }
                try {
                  await waitForAbortableDelay(milliseconds, signal);
                  return { ok: true, waitedMilliseconds: milliseconds };
                } catch (error) {
                  if (signal.aborted) addLog("Wait callback observed execution cancellation.");
                  throw error;
                }
              },
            },
            { signal: controller.signal },
          ),
        ]);

        if (!disposed) {
          setRegistrationState("Base probe tools registered.");
          addLog(`Base tools registered through ${detected.namespace}.`);
          setRegisteredTools((current) => Array.from(new Set([
            ...current,
            "ratiflow_probe_read_context",
            "ratiflow_probe_wait",
          ])).sort());
          await refreshTools();
        }
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          setRegistrationState(`Registration failed: ${message}`);
          addLog(`Base registration failed: ${message}`);
        }
      }
    }

    void registerBaseTools();

    return () => {
      disposed = true;
      context.removeEventListener?.("toolchange", onToolChange);
      controller.abort("Probe unmounted");
      baseControllerRef.current = null;
    };
  }, [addLog, refreshTools]);

  useEffect(() => {
    const detected = detectModelContext();
    if (!detected.context) return;
    const context: WebMCPModelContext = detected.context;

    modeControllerRef.current?.abort("Probe mode changed");
    const controller = new AbortController();
    modeControllerRef.current = controller;
    const toolName = mode === "collect" ? "ratiflow_probe_add_signal" : "ratiflow_probe_prepare_summary";
    let disposed = false;

    async function registerModeTool() {
      try {
        await context.registerTool(
          {
            name: toolName,
            title: mode === "collect" ? "Add validation signal" : "Prepare validation summary",
            description:
              mode === "collect"
                ? "Add a labeled observation while the validation probe is collecting evidence. This changes probe state."
                : "Prepare a read-only summary after the probe enters review mode.",
            inputSchema:
              mode === "collect"
                ? {
                    type: "object",
                    properties: {
                      observation: { type: "string", minLength: 1, maxLength: 160 },
                    },
                    required: ["observation"],
                    additionalProperties: false,
                  }
                : emptySchema,
            annotations: {
              readOnlyHint: mode === "review",
              untrustedContentHint: mode === "collect",
            },
            execute: async (input) => {
              if (mode === "collect") {
                const observation = typeof input.observation === "string" ? input.observation.trim() : "";
                if (!observation || observation.length > 160) {
                  return { ok: false, code: "INVALID_INPUT", message: "Observation must be 1–160 characters." };
                }
                addLog(`Agent observation: ${observation}`);
                return { ok: true, accepted: observation, nextAction: "Continue validation or ask the user to enter review mode." };
              }

              return {
                ok: true,
                summary: "The page replaced a collect-only tool with a review-only tool using AbortSignal.",
                registeredByPage: [
                  "ratiflow_probe_read_context",
                  "ratiflow_probe_wait",
                  toolName,
                ],
              };
            },
          },
          { signal: controller.signal },
        );
        if (disposed) return;
        addLog(`${toolName} registered.`);
        setRegisteredTools((current) => Array.from(new Set([
          ...current.filter((name) => name !== "ratiflow_probe_add_signal" && name !== "ratiflow_probe_prepare_summary"),
          toolName,
        ])).sort());
        await refreshTools();
      } catch (error) {
        if (!disposed && !controller.signal.aborted) {
          addLog(`${toolName} registration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    void registerModeTool();

    return () => {
      disposed = true;
      controller.abort("Probe mode changed");
      if (modeControllerRef.current === controller) modeControllerRef.current = null;
    };
  }, [addLog, mode, refreshTools]);

  const runReadTool = useCallback(async () => {
    const { context } = detectModelContext();
    if (!context) {
      setLastResult("WebMCP is unavailable; there is no in-page tool to execute.");
      return;
    }

    if (!context.getTools || !context.executeTool) {
      setLastResult("This surface registers tools for its agent but does not expose in-page getTools()/executeTool(). Verify discovery from the agent client.");
      addLog("In-page discovery/execution APIs are unavailable on this surface.");
      return;
    }

    const getTools = context.getTools.bind(context);
    const executeTool = context.executeTool.bind(context);

    try {
      const tools = await getTools();
      const tool = tools.find((candidate) => candidate.name === "ratiflow_probe_read_context");
      if (!tool) {
        setLastResult("The registered read tool was not returned by getTools().");
        return;
      }
      const result = await executeTool(tool, {});
      setLastResult(result);
      addLog("Read tool executed through getTools → executeTool.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastResult(`Execution failed: ${message}`);
      addLog(`In-page execution failed: ${message}`);
    }
  }, [addLog]);

  const runCancellationProbe = useCallback(async () => {
    const { context } = detectModelContext();
    if (!context?.getTools || !context.executeTool) {
      setLastResult("This surface does not expose in-page getTools()/executeTool(); cancellation needs an external client check.");
      return;
    }

    const getTools = context.getTools.bind(context);
    const executeTool = context.executeTool.bind(context);
    const controller = new AbortController();
    const startedAt = performance.now();

    try {
      const tools = await getTools();
      const tool = tools.find((candidate) => candidate.name === "ratiflow_probe_wait");
      if (!tool) {
        setLastResult("The registered wait tool was not returned by getTools().");
        return;
      }

      window.setTimeout(() => controller.abort("Probe cancellation"), 100);
      const result = await executeTool(tool, { milliseconds: 5000 }, { signal: controller.signal });
      setLastResult(result);
      addLog(
        result.includes("CANCELLATION_SIGNAL_UNAVAILABLE")
          ? "Cancellation probe confirmed this client omits the callback signal."
          : "Cancellation probe returned without rejecting; inspect the result before claiming support.",
      );
    } catch (error) {
      const elapsedMilliseconds = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);
      setLastResult(JSON.stringify({ ok: true, cancelled: true, elapsedMilliseconds, clientError: message }));
      addLog(`executeTool rejected after cancellation in ${elapsedMilliseconds}ms.`);
    }
  }, [addLog]);

  const toggleMode = () => {
    setMode((current) => (current === "collect" ? "review" : "collect"));
  };

  const supported = namespace !== "unsupported";

  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-8 text-[#171817] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#dfded8] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d8d7d1] bg-white px-3 py-1 font-mono text-[11px] tracking-[0.12em] text-[#686a66] uppercase">
              <span className={`h-1.5 w-1.5 rounded-full ${supported ? "bg-[#137b5c]" : "bg-[#c77811]"}`} />
              Native validation probe
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">The page decides what the agent can do.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#686a66]">
              Ratiflow is validating the live WebMCP lifecycle before product work begins. Toggle the page state and watch the actual tool surface change.
            </p>
          </div>
          <div className="rounded-xl border border-[#dfded8] bg-white px-4 py-3 text-right">
            <div className="font-mono text-[10px] tracking-[0.12em] text-[#81837f] uppercase">Detected surface</div>
            <div className="mt-1 font-mono text-sm font-medium">{namespace}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 py-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <article className="min-w-0 rounded-2xl border border-[#dfded8] bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] tracking-[0.14em] text-[#81837f] uppercase">Page state</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{mode === "collect" ? "Collect evidence" : "Review evidence"}</h2>
              </div>
              <button
                type="button"
                onClick={toggleMode}
                disabled={!supported}
                className="rounded-xl bg-[#255bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1749dc] disabled:cursor-not-allowed disabled:bg-[#a9aaa6]"
              >
                Switch to {mode === "collect" ? "review" : "collect"}
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-[#bed0ff] bg-[#f4f7ff] p-5 shadow-[inset_0_0_0_1px_rgba(37,91,255,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.14em] text-[#255bff] uppercase">Capability field</div>
                  <div className="mt-1 text-xs text-[#686a66]">{discoveryEvidence}</div>
                </div>
                <div className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-[#255bff]">{registeredTools.length} tools</div>
              </div>
              <div className="mt-4 grid gap-2">
                {registeredTools.length > 0 ? registeredTools.map((tool) => (
                  <div key={tool} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#dce5ff] bg-white px-4 py-3 font-mono text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#255bff]" />
                    <span className="min-w-0 break-all">{tool}</span>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#c8c7c1] px-4 py-8 text-center text-sm text-[#686a66]">
                    {supported ? "Waiting for registrations…" : "Enable a supported WebMCP surface to run the probe."}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => void refreshTools()} disabled={!supported} className="rounded-xl border border-[#d8d7d1] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#f7f7f4] disabled:opacity-50">
                Refresh discovery
              </button>
              <button type="button" onClick={() => void runReadTool()} disabled={!supported} className="rounded-xl border border-[#d8d7d1] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#f7f7f4] disabled:opacity-50">
                Execute read tool
              </button>
              <button type="button" onClick={() => void runCancellationProbe()} disabled={!supported} className="rounded-xl border border-[#d8d7d1] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#f7f7f4] disabled:opacity-50">
                Test cancellation
              </button>
            </div>

            <div className="mt-5 rounded-xl bg-[#171817] p-4 text-[#f7f7f4]">
              <div className="font-mono text-[10px] tracking-[0.14em] text-[#a9aaa6] uppercase">Last in-page result</div>
              <pre className="mt-3 max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6">{lastResult}</pre>
            </div>
          </article>

          <aside className="min-w-0 rounded-2xl border border-[#dfded8] bg-white p-6">
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#81837f] uppercase">Lifecycle evidence</div>
            <p className="mt-2 text-sm leading-6 text-[#686a66]">{registrationState}</p>
            <ol className="mt-5 space-y-3">
              {logs.length > 0 ? logs.map((entry) => (
                <li key={entry.id} className="border-l border-[#d8d7d1] pl-4">
                  <div className="font-mono text-[10px] text-[#9a9b97]">{entry.at}</div>
                  <div className="mt-1 break-words text-sm leading-5">{entry.message}</div>
                </li>
              )) : (
                <li className="text-sm text-[#81837f]">No lifecycle events yet.</li>
              )}
            </ol>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#dfded8] pt-5 text-xs text-[#81837f] sm:flex-row sm:items-center sm:justify-between">
          <span>Ratiflow · WebMCP Challenge validation</span>
          <span className="break-words font-mono">document.modelContext → live page state → registered tools</span>
        </footer>
      </div>
    </main>
  );
}
