"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Namespace = "document.modelContext" | "navigator.modelContext" | "unsupported";
type ProbePhase =
  | "INITIALIZING"
  | "IDLE"
  | "TRANSITIONING_TO_RELAY"
  | "RELAY"
  | "RESTORING_IDLE"
  | "UNSUPPORTED";
type ProbeOutcome = "NOT_RUN" | "RUNNING" | "PASSED" | "FAILED";
type CheckStatus = "NOT_RUN" | "RUNNING" | "PASSED" | "FAILED";
type ProbeCheckId =
  | "standard_document_model_context"
  | "initial_idle_catalog"
  | "toolchange_to_relay"
  | "get_tools_relay_descriptor"
  | "unarmed_native_denied"
  | "armed_execute_tool"
  | "one_shot_replay_denied"
  | "execution_cancellation"
  | "toolchange_to_idle"
  | "stale_descriptor_rejected"
  | "idle_catalog_restored";

interface LogEntry {
  id: string;
  at: string;
  message: string;
}

interface ProbeCheck {
  id: ProbeCheckId;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface RelayProbeInput extends Record<string, unknown> {
  operation: "echo" | "wait";
  nonce: string;
  milliseconds?: number;
}

interface RelayPermit {
  permitId: string;
  runId: string;
  generation: number;
  toolName: string;
  inputDigest: string;
}

interface ProbeCounters {
  callbackDispatches: number;
  authorizedEchoes: number;
  cancellationObservedByCallback: number;
}

interface ProbeEvidence {
  schemaVersion: 1;
  kind: "RATIFLOW_WEBMCP_RELAY_LIFECYCLE_PROBE";
  evidenceClass: "UNCLASSIFIED_PAGE_OBSERVATION";
  overall: "PASSED" | "FAILED";
  namespace: Namespace;
  standardInputEncoding: "OBJECT";
  startedAt: string;
  completedAt: string;
  runId: string;
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
  error?: string;
}

const IDLE_TOOL_NAME = "ratiflow_probe_idle";
const PROBE_TOOL_PREFIX = "ratiflow_probe_";
const POLL_TIMEOUT_MS = 4_000;

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const relaySchema = {
  type: "object",
  properties: {
    operation: { type: "string", enum: ["echo", "wait"] },
    nonce: { type: "string", minLength: 1, maxLength: 128 },
    milliseconds: { type: "integer", minimum: 100, maximum: 5_000 },
  },
  required: ["operation", "nonce"],
  additionalProperties: false,
} as const;

const checkDefinitions: ReadonlyArray<Pick<ProbeCheck, "id" | "label">> = [
  {
    id: "standard_document_model_context",
    label: "Standard document.modelContext consumer surface",
  },
  { id: "initial_idle_catalog", label: "Initial idle catalog discovered" },
  { id: "toolchange_to_relay", label: "toolchange announced Relay transition" },
  {
    id: "get_tools_relay_descriptor",
    label: "getTools returned the run-scoped Relay descriptor",
  },
  {
    id: "unarmed_native_denied",
    label: "Unarmed executeTool call denied before an effect",
  },
  {
    id: "armed_execute_tool",
    label: "Armed executeTool call succeeded exactly once",
  },
  {
    id: "one_shot_replay_denied",
    label: "Consumed permit could not be replayed",
  },
  {
    id: "execution_cancellation",
    label: "Cancellation reached the page callback",
  },
  { id: "toolchange_to_idle", label: "toolchange announced idle restoration" },
  {
    id: "stale_descriptor_rejected",
    label: "Removed generation descriptor was rejected before dispatch",
  },
  { id: "idle_catalog_restored", label: "Exact idle catalog restored" },
];

function makeChecks(): ProbeCheck[] {
  return checkDefinitions.map(({ id, label }) => ({
    id,
    label,
    status: "NOT_RUN",
    detail: "Not run yet.",
  }));
}

function detectNamespace(): Namespace {
  if (typeof document !== "undefined" && document.modelContext) {
    return "document.modelContext";
  }
  if (typeof navigator !== "undefined" && navigator.modelContext) {
    return "navigator.modelContext";
  }
  return "unsupported";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function waitForDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForAbortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? abortError("Tool execution cancelled"));
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal.reason ?? abortError("Tool execution cancelled"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function sortedNames(tools: WebMCPRegisteredTool[]): string[] {
  return tools.map((tool) => tool.name).sort();
}

async function readProbeTools(context: WebMCPModelContext): Promise<WebMCPRegisteredTool[]> {
  if (!context.getTools) throw new Error("document.modelContext.getTools is unavailable.");
  const tools = await context.getTools();
  if (!Array.isArray(tools)) throw new Error("getTools() did not return an array.");

  const probeTools = tools.filter((tool) => tool.name.startsWith(PROBE_TOOL_PREFIX));
  for (const tool of probeTools) {
    if (tool.origin !== window.location.origin) {
      throw new Error(`Probe descriptor ${tool.name} came from ${tool.origin}.`);
    }
    if (tool.window !== window) {
      throw new Error(`Probe descriptor ${tool.name} did not belong to the top-level window.`);
    }
  }
  return probeTools.sort((left, right) => left.name.localeCompare(right.name));
}

async function waitForCatalog(
  context: WebMCPModelContext,
  expectedNames: string[],
): Promise<WebMCPRegisteredTool[]> {
  const expected = [...expectedNames].sort();
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  let latest: WebMCPRegisteredTool[] = [];
  do {
    latest = await readProbeTools(context);
    if (JSON.stringify(sortedNames(latest)) === JSON.stringify(expected)) return latest;
    await waitForDelay(25);
  } while (performance.now() < deadline);
  throw new Error(
    `Timed out waiting for probe catalog [${expected.join(", ")}]; saw [${sortedNames(latest).join(", ")}].`,
  );
}

async function waitForToolchangeAfter(
  counter: React.MutableRefObject<number>,
  baseline: number,
): Promise<number> {
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  do {
    if (counter.current > baseline) return counter.current;
    await waitForDelay(25);
  } while (performance.now() < deadline);
  throw new Error("Timed out waiting for a toolchange event.");
}

function canonicalRelayInput(input: RelayProbeInput): string {
  return JSON.stringify({
    operation: input.operation,
    nonce: input.nonce,
    ...(input.milliseconds === undefined ? {} : { milliseconds: input.milliseconds }),
  });
}

async function digestRelayInput(input: RelayProbeInput): Promise<string> {
  if (!crypto.subtle) throw new Error("Web Crypto digest support is required.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRelayInput(input)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseRelayInput(input: Record<string, unknown>): RelayProbeInput | null {
  const operation = input.operation;
  const nonce = input.nonce;
  const milliseconds = input.milliseconds;
  if ((operation !== "echo" && operation !== "wait") || typeof nonce !== "string") return null;
  if (nonce.length < 1 || Array.from(nonce).length > 128) return null;
  if (operation === "echo" && milliseconds !== undefined) return null;
  if (
    operation === "wait"
    && (!Number.isInteger(milliseconds) || Number(milliseconds) < 100 || Number(milliseconds) > 5_000)
  ) {
    return null;
  }
  const allowedKeys = operation === "wait"
    ? new Set(["operation", "nonce", "milliseconds"])
    : new Set(["operation", "nonce"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return null;
  return operation === "wait"
    ? { operation, nonce, milliseconds: Number(milliseconds) }
    : { operation, nonce };
}

function decodeNativeResult(raw: string): Record<string, unknown> {
  if (typeof raw !== "string") {
    throw new Error(`executeTool() returned ${typeof raw}; the current standard requires a string.`);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("executeTool() returned JSON that was not an object.");
  }
  return parsed as Record<string, unknown>;
}

function assertRelayDescriptorShape(descriptor: WebMCPRegisteredTool): void {
  if (JSON.stringify(descriptor.inputSchema) !== JSON.stringify(relaySchema)) {
    throw new Error("The Relay descriptor did not expose the registered JSON Schema object.");
  }
  if (
    descriptor.annotations?.readOnlyHint !== true
    || descriptor.annotations.untrustedContentHint !== false
  ) {
    throw new Error("The Relay descriptor did not expose the registered standard annotations.");
  }
}

function makeIdleTool(): WebMCPTool {
  return {
    name: IDLE_TOOL_NAME,
    title: "Read idle probe state",
    description: "Read the inert idle state of the isolated Ratiflow relay lifecycle probe.",
    inputSchema: emptySchema,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    execute: async () => ({ ok: true, mode: "IDLE" }),
  };
}

async function executeAndDecode(
  context: WebMCPModelContext,
  descriptor: WebMCPRegisteredTool,
  input: RelayProbeInput,
  options?: { signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  if (!context.executeTool) throw new Error("document.modelContext.executeTool is unavailable.");
  return decodeNativeResult(await context.executeTool(descriptor, input, options));
}

export function WebMCPProbe() {
  const [phase, setPhase] = useState<ProbePhase>("INITIALIZING");
  const [outcome, setOutcome] = useState<ProbeOutcome>("NOT_RUN");
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  const [registrationState, setRegistrationState] = useState("Checking the standard browser surface…");
  const [lastResult, setLastResult] = useState("Run the proof to produce a sanitized evidence record.");
  const [checks, setChecks] = useState<ProbeCheck[]>(makeChecks);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toolchangeEvents, setToolchangeEvents] = useState(0);
  const idleControllerRef = useRef<AbortController | null>(null);
  const relayControllerRef = useRef<AbortController | null>(null);
  const permitRef = useRef<RelayPermit | null>(null);
  const lifecycleRef = useRef<"IDLE" | "RELAY">("IDLE");
  const toolchangeCountRef = useRef(0);
  const generationRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(false);
  const countersRef = useRef<ProbeCounters>({
    callbackDispatches: 0,
    authorizedEchoes: 0,
    cancellationObservedByCallback: 0,
  });
  const waitStartedResolverRef = useRef<(() => void) | null>(null);
  const namespace = useSyncExternalStore(
    () => () => undefined,
    detectNamespace,
    () => "unsupported" as const,
  );

  const addLog = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setLogs((current) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), message },
      ...current,
    ].slice(0, 16));
  }, []);

  const showCatalog = useCallback(async (context: WebMCPModelContext) => {
    const tools = await readProbeTools(context);
    const names = sortedNames(tools);
    if (mountedRef.current) setRegisteredTools(names);
    return tools;
  }, []);

  const registerIdle = useCallback(async (context: WebMCPModelContext) => {
    idleControllerRef.current?.abort(abortError("Idle registration replaced"));
    const controller = new AbortController();
    idleControllerRef.current = controller;
    lifecycleRef.current = "IDLE";
    await context.registerTool(makeIdleTool(), { signal: controller.signal });
    if (controller.signal.aborted) throw abortError("Idle registration was superseded");
    const tools = await waitForCatalog(context, [IDLE_TOOL_NAME]);
    if (mountedRef.current) setRegisteredTools(sortedNames(tools));
    return tools;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    const context = document.modelContext;

    if (
      !context
      || typeof context.getTools !== "function"
      || typeof context.executeTool !== "function"
      || typeof context.addEventListener !== "function"
      || typeof context.removeEventListener !== "function"
    ) {
      queueMicrotask(() => {
        if (disposed) return;
        setPhase("UNSUPPORTED");
        setRegistrationState(
          namespace === "navigator.modelContext"
            ? "Only navigator.modelContext was found. It is a compatibility observation, not a C0 pass."
            : "The complete document.modelContext consumer surface is unavailable.",
        );
      });
      return () => {
        disposed = true;
        mountedRef.current = false;
      };
    }

    const removeToolchangeListener = context.removeEventListener.bind(context);
    const onToolchange = () => {
      toolchangeCountRef.current += 1;
      if (!disposed) setToolchangeEvents(toolchangeCountRef.current);
      addLog(`toolchange #${toolchangeCountRef.current} observed.`);
    };
    context.addEventListener("toolchange", onToolchange);

    void registerIdle(context).then(
      () => {
        if (disposed) return;
        setPhase("IDLE");
        setRegistrationState("Idle catalog is ready. The Relay remains unarmed.");
        addLog("Exact idle probe catalog discovered through getTools().");
      },
      (error: unknown) => {
        if (disposed) return;
        setPhase("UNSUPPORTED");
        setRegistrationState(`Idle registration failed: ${errorMessage(error)}`);
        addLog(`Idle registration failed: ${errorMessage(error)}`);
      },
    );

    return () => {
      disposed = true;
      mountedRef.current = false;
      runningRef.current = false;
      permitRef.current = null;
      waitStartedResolverRef.current = null;
      relayControllerRef.current?.abort(abortError("Probe unmounted"));
      relayControllerRef.current = null;
      idleControllerRef.current?.abort(abortError("Probe unmounted"));
      idleControllerRef.current = null;
      removeToolchangeListener("toolchange", onToolchange);
    };
  }, [addLog, namespace, registerIdle]);

  const refreshTools = useCallback(async () => {
    const context = document.modelContext;
    if (!context?.getTools) {
      setRegistrationState("document.modelContext.getTools() is unavailable.");
      return;
    }
    try {
      const tools = await showCatalog(context);
      addLog(`getTools() returned [${sortedNames(tools).join(", ")}].`);
    } catch (error) {
      addLog(`getTools() failed: ${errorMessage(error)}`);
    }
  }, [addLog, showCatalog]);

  const runRelayProof = useCallback(async () => {
    if (runningRef.current) return;
    const context = document.modelContext;
    if (
      !context
      || !context.getTools
      || !context.executeTool
      || !context.addEventListener
      || !context.removeEventListener
    ) {
      setPhase("UNSUPPORTED");
      setRegistrationState("The complete standard document.modelContext consumer surface is unavailable.");
      return;
    }

    runningRef.current = true;
    setOutcome("RUNNING");
    setRegistrationState("Running the idle → Relay → idle proof…");
    countersRef.current = {
      callbackDispatches: 0,
      authorizedEchoes: 0,
      cancellationObservedByCallback: 0,
    };
    permitRef.current = null;
    const runChecks = makeChecks();
    const mark = (id: ProbeCheckId, status: CheckStatus, detail: string) => {
      const check = runChecks.find((candidate) => candidate.id === id);
      if (!check) throw new Error(`Unknown probe check ${id}.`);
      check.status = status;
      check.detail = detail;
      if (mountedRef.current) setChecks(runChecks.map((candidate) => ({ ...candidate })));
    };
    setChecks(runChecks);

    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID().replaceAll("-", "");
    const generation = ++generationRef.current;
    const relayPhysicalName = `ratiflow_probe_relay_g_${runId}`;
    let initialCatalog: string[] = [];
    let relayCatalog: string[] = [];
    let finalCatalog: string[] = [];
    let relayDescriptor: WebMCPRegisteredTool | null = null;
    let relayController: AbortController | null = null;
    let relayRemoved = false;
    let failure: unknown = null;

    const armPermit = async (input: RelayProbeInput): Promise<RelayPermit> => {
      const inputDigest = await digestRelayInput(input);
      if (!mountedRef.current) throw abortError("Probe unmounted while arming a permit");
      const permit: RelayPermit = {
        permitId: crypto.randomUUID(),
        runId,
        generation,
        toolName: relayPhysicalName,
        inputDigest,
      };
      permitRef.current = permit;
      return permit;
    };

    try {
      mark("standard_document_model_context", "RUNNING", "Checking required consumer methods.");
      mark(
        "standard_document_model_context",
        "PASSED",
        "document.modelContext exposes getTools(), executeTool(), and toolchange listeners.",
      );

      mark("initial_idle_catalog", "RUNNING", "Reading the initial catalog.");
      initialCatalog = sortedNames(await waitForCatalog(context, [IDLE_TOOL_NAME]));
      mark("initial_idle_catalog", "PASSED", `[${initialCatalog.join(", ")}]`);

      setPhase("TRANSITIONING_TO_RELAY");
      addLog(`Entering Relay generation ${generation}.`);
      mark("toolchange_to_relay", "RUNNING", "Removing idle and registering Relay.");
      const idleRemovalEventBaseline = toolchangeCountRef.current;
      idleControllerRef.current?.abort(abortError("Entering Relay mode"));
      idleControllerRef.current = null;
      await waitForCatalog(context, []);
      await waitForToolchangeAfter(toolchangeCountRef, idleRemovalEventBaseline);
      if (!mountedRef.current) throw abortError("Probe unmounted during the Relay transition");

      relayController = new AbortController();
      relayControllerRef.current = relayController;
      lifecycleRef.current = "RELAY";
      setPhase("RELAY");
      const relayRegistrationEventBaseline = toolchangeCountRef.current;
      await context.registerTool(
        {
          name: relayPhysicalName,
          title: "Run isolated Relay lifecycle check",
          description:
            "Exercise a run-scoped, one-shot-permitted Ratiflow Relay callback without repository or network side effects.",
          inputSchema: relaySchema,
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute: async (rawInput, options) => {
            countersRef.current.callbackDispatches += 1;
            const input = parseRelayInput(rawInput);
            if (!input) {
              return { ok: false, code: "INVALID_INPUT" };
            }
            const inputDigest = await digestRelayInput(input);
            const permit = permitRef.current;
            if (
              lifecycleRef.current !== "RELAY"
              || relayController?.signal.aborted
              || !permit
              || permit.runId !== runId
              || permit.generation !== generation
              || permit.toolName !== relayPhysicalName
              || permit.inputDigest !== inputDigest
            ) {
              return {
                ok: false,
                code: "RELAY_EXECUTION_NOT_ARMED",
                generation,
              };
            }

            // The authorization is consumed before any effect or await.
            permitRef.current = null;
            if (input.operation === "echo") {
              countersRef.current.authorizedEchoes += 1;
              return {
                ok: true,
                operation: "echo",
                nonce: input.nonce,
                generation,
                authorizedEchoes: countersRef.current.authorizedEchoes,
              };
            }

            const signal = options?.signal;
            if (!signal) {
              return { ok: false, code: "CANCELLATION_SIGNAL_UNAVAILABLE", generation };
            }
            waitStartedResolverRef.current?.();
            waitStartedResolverRef.current = null;
            try {
              await waitForAbortableDelay(input.milliseconds ?? 5_000, signal);
              return { ok: true, operation: "wait", generation };
            } catch (error) {
              if (signal.aborted) countersRef.current.cancellationObservedByCallback += 1;
              throw error;
            }
          },
        },
        { signal: relayController.signal },
      );
      if (relayController.signal.aborted) throw abortError("Relay registration was superseded");
      const relayTools = await waitForCatalog(context, [relayPhysicalName]);
      await waitForToolchangeAfter(toolchangeCountRef, relayRegistrationEventBaseline);
      relayCatalog = sortedNames(relayTools);
      mark(
        "toolchange_to_relay",
        "PASSED",
        `Observed removal and registration events; count is ${toolchangeCountRef.current}.`,
      );

      mark("get_tools_relay_descriptor", "RUNNING", "Resolving the exact discovered descriptor.");
      relayDescriptor = relayTools.find((tool) => tool.name === relayPhysicalName) ?? null;
      if (!relayDescriptor) throw new Error("The Relay descriptor was not returned by getTools().");
      assertRelayDescriptorShape(relayDescriptor);
      mark(
        "get_tools_relay_descriptor",
        "PASSED",
        `${relayDescriptor.name} from ${relayDescriptor.origin}, with the registered schema and standard annotations.`,
      );
      if (mountedRef.current) setRegisteredTools(relayCatalog);

      const echoInput: RelayProbeInput = {
        operation: "echo",
        nonce: `echo-${runId}`,
      };
      mark("unarmed_native_denied", "RUNNING", "Calling the discovered descriptor without a permit.");
      const effectsBeforeUnarmed = countersRef.current.authorizedEchoes;
      const unarmed = await executeAndDecode(context, relayDescriptor, echoInput);
      if (
        unarmed.code !== "RELAY_EXECUTION_NOT_ARMED"
        || countersRef.current.authorizedEchoes !== effectsBeforeUnarmed
      ) {
        throw new Error("The unarmed call was not denied before an effect.");
      }
      mark(
        "unarmed_native_denied",
        "PASSED",
        "executeTool reached the page callback and returned RELAY_EXECUTION_NOT_ARMED with zero effects.",
      );

      mark("armed_execute_tool", "RUNNING", "Arming one exact input digest.");
      const permit = await armPermit(echoInput);
      const armed = await executeAndDecode(context, relayDescriptor, echoInput);
      if (
        armed.ok !== true
        || armed.nonce !== echoInput.nonce
        || armed.authorizedEchoes !== 1
        || countersRef.current.authorizedEchoes !== 1
        || permitRef.current !== null
      ) {
        throw new Error("The armed executeTool call did not consume one permit for one effect.");
      }
      mark(
        "armed_execute_tool",
        "PASSED",
        `Permit ${permit.permitId} authorized one call through ${relayDescriptor.name}.`,
      );

      mark("one_shot_replay_denied", "RUNNING", "Replaying the consumed permit input.");
      const replay = await executeAndDecode(context, relayDescriptor, echoInput);
      if (replay.code !== "RELAY_EXECUTION_NOT_ARMED" || countersRef.current.authorizedEchoes !== 1) {
        throw new Error("The consumed permit authorized a replay.");
      }
      mark(
        "one_shot_replay_denied",
        "PASSED",
        "A second executeTool call was denied and the effect count remained one.",
      );

      mark("execution_cancellation", "RUNNING", "Dispatching a permitted cancellable callback.");
      const waitInput: RelayProbeInput = {
        operation: "wait",
        nonce: `wait-${runId}`,
        milliseconds: 5_000,
      };
      await armPermit(waitInput);
      const cancellationController = new AbortController();
      let resolveWaitStarted: (() => void) | null = null;
      const waitStarted = new Promise<void>((resolve) => {
        resolveWaitStarted = resolve;
      });
      waitStartedResolverRef.current = resolveWaitStarted;
      const pendingWait = executeAndDecode(
        context,
        relayDescriptor,
        waitInput,
        { signal: cancellationController.signal },
      );
      await Promise.race([
        waitStarted,
        waitForDelay(POLL_TIMEOUT_MS).then(() => {
          throw new Error("The cancellable callback did not start.");
        }),
      ]);
      cancellationController.abort(abortError("C0 cancellation probe"));
      let cancellationError: unknown = null;
      try {
        await pendingWait;
      } catch (error) {
        cancellationError = error;
      }
      if (!(cancellationError instanceof DOMException) || cancellationError.name !== "AbortError") {
        throw new Error(
          `Cancellation did not reject executeTool with AbortError: ${errorMessage(cancellationError)}.`,
        );
      }
      const cancellationObservationDeadline = performance.now() + POLL_TIMEOUT_MS;
      while (
        countersRef.current.cancellationObservedByCallback !== 1
        && performance.now() < cancellationObservationDeadline
      ) {
        await waitForDelay(10);
      }
      if (countersRef.current.cancellationObservedByCallback !== 1) {
        throw new Error("executeTool rejected, but cancellation never reached the page callback.");
      }
      mark(
        "execution_cancellation",
        "PASSED",
        "The callback observed the execution signal and executeTool rejected with AbortError.",
      );

      setPhase("RESTORING_IDLE");
      lifecycleRef.current = "IDLE";
      permitRef.current = null;
      mark("toolchange_to_idle", "RUNNING", "Removing the Relay generation.");
      const relayRemovalEventBaseline = toolchangeCountRef.current;
      const dispatchesBeforeStaleCall = countersRef.current.callbackDispatches;
      relayController.abort(abortError("Relay proof completed"));
      relayControllerRef.current = null;
      relayRemoved = true;
      await waitForCatalog(context, []);
      await waitForToolchangeAfter(toolchangeCountRef, relayRemovalEventBaseline);

      mark("stale_descriptor_rejected", "RUNNING", "Calling the cached removed descriptor.");
      let staleError: unknown = null;
      try {
        await executeAndDecode(context, relayDescriptor, echoInput);
      } catch (error) {
        staleError = error;
      }
      if (staleError === null || countersRef.current.callbackDispatches !== dispatchesBeforeStaleCall) {
        throw new Error(
          `The stale descriptor was not rejected before callback dispatch: ${errorMessage(staleError)}.`,
        );
      }
      const staleErrorName = staleError instanceof Error ? staleError.name : typeof staleError;
      mark(
        "stale_descriptor_rejected",
        "PASSED",
        `executeTool rejected the removed generation with ${staleErrorName} and did not dispatch its callback.`,
      );

      if (!mountedRef.current) throw abortError("Probe unmounted before idle restoration");
      const idleRegistrationEventBaseline = toolchangeCountRef.current;
      const idleTools = await registerIdle(context);
      await waitForToolchangeAfter(toolchangeCountRef, idleRegistrationEventBaseline);
      finalCatalog = sortedNames(idleTools);
      mark(
        "toolchange_to_idle",
        "PASSED",
        `Observed Relay removal and idle registration events; count is ${toolchangeCountRef.current}.`,
      );
      mark("idle_catalog_restored", "PASSED", `[${finalCatalog.join(", ")}]`);
      setPhase("IDLE");
      setOutcome("PASSED");
      setRegistrationState("PASS · the exact idle catalog was restored and the Relay is unarmed.");
      addLog("Idle → Relay → idle proof passed.");
    } catch (error) {
      failure = error;
      const runningCheck = runChecks.find((check) => check.status === "RUNNING");
      if (runningCheck) {
        runningCheck.status = "FAILED";
        runningCheck.detail = errorMessage(error);
        if (mountedRef.current) setChecks(runChecks.map((check) => ({ ...check })));
      }
      if (mountedRef.current) {
        setOutcome("FAILED");
        setRegistrationState(`FAIL · ${errorMessage(error)}`);
      }
      addLog(`Relay proof failed: ${errorMessage(error)}`);
    } finally {
      permitRef.current = null;
      waitStartedResolverRef.current = null;
      lifecycleRef.current = "IDLE";
      if (!relayRemoved) {
        relayController?.abort(abortError("Relay proof stopped"));
        if (relayControllerRef.current === relayController) relayControllerRef.current = null;
      }

      if (mountedRef.current) {
        try {
          const currentCatalog = sortedNames(await readProbeTools(context));
          if (!mountedRef.current) {
            runningRef.current = false;
            return;
          }
          if (JSON.stringify(currentCatalog) !== JSON.stringify([IDLE_TOOL_NAME])) {
            finalCatalog = sortedNames(await registerIdle(context));
          } else {
            finalCatalog = currentCatalog;
            setRegisteredTools(finalCatalog);
          }
          setPhase("IDLE");
        } catch (restoreError) {
          if (!failure) failure = restoreError;
          if (!mountedRef.current) {
            runningRef.current = false;
            return;
          }
          setPhase("UNSUPPORTED");
          setOutcome("FAILED");
          setRegistrationState(`FAIL · idle restoration failed: ${errorMessage(restoreError)}`);
          const restoreCheck = runChecks.find((check) => check.id === "idle_catalog_restored");
          if (restoreCheck) {
            restoreCheck.status = "FAILED";
            restoreCheck.detail = errorMessage(restoreError);
            setChecks(runChecks.map((check) => ({ ...check })));
          }
        }
      }

      const evidence: ProbeEvidence = {
        schemaVersion: 1,
        kind: "RATIFLOW_WEBMCP_RELAY_LIFECYCLE_PROBE",
        evidenceClass: "UNCLASSIFIED_PAGE_OBSERVATION",
        overall: failure ? "FAILED" : "PASSED",
        namespace: "document.modelContext",
        standardInputEncoding: "OBJECT",
        startedAt,
        completedAt: new Date().toISOString(),
        runId,
        generation,
        relayPhysicalName,
        initialCatalog,
        relayCatalog,
        finalCatalog,
        toolchangeEvents: toolchangeCountRef.current,
        callbackDispatches: countersRef.current.callbackDispatches,
        authorizedEchoes: countersRef.current.authorizedEchoes,
        cancellationObservedByCallback:
          countersRef.current.cancellationObservedByCallback,
        checks: runChecks.map((check) => ({ ...check })),
        ...(failure ? { error: errorMessage(failure) } : {}),
      };
      if (mountedRef.current) setLastResult(JSON.stringify(evidence, null, 2));
      runningRef.current = false;
    }
  }, [addLog, registerIdle]);

  const supported = namespace === "document.modelContext" && phase !== "UNSUPPORTED";
  const running = outcome === "RUNNING";

  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-8 text-[#171817] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-[#dfded8] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d8d7d1] bg-white px-3 py-1 font-mono text-[11px] tracking-[0.12em] text-[#686a66] uppercase">
              <span className={`h-1.5 w-1.5 rounded-full ${supported ? "bg-[#137b5c]" : "bg-[#c77811]"}`} />
              C0 consumer lifecycle probe
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Prove the page can become the Relay—and safely stop.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#686a66]">
              One action swaps an inert idle catalog for a run-scoped tool, exercises the exact discovered descriptor, then restores idle without touching repository data or a model API.
            </p>
          </div>
          <div className="rounded-xl border border-[#dfded8] bg-white px-4 py-3 text-right">
            <div className="font-mono text-[10px] tracking-[0.12em] text-[#81837f] uppercase">Detected surface</div>
            <div className="mt-1 font-mono text-sm font-medium">{namespace}</div>
            <div data-testid="probe-phase" className="mt-1 font-mono text-[10px] text-[#81837f]">{phase}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 py-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <article className="min-w-0 rounded-2xl border border-[#dfded8] bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] tracking-[0.14em] text-[#81837f] uppercase">Lifecycle result</div>
                <h2 data-testid="probe-outcome" className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{outcome.replace("_", " ")}</h2>
              </div>
              <button
                type="button"
                onClick={() => void runRelayProof()}
                disabled={!supported || phase !== "IDLE" || running}
                className="rounded-xl bg-[#255bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1749dc] disabled:cursor-not-allowed disabled:bg-[#a9aaa6]"
              >
                {running ? "Running proof…" : outcome === "NOT_RUN" ? "Run idle → Relay → idle proof" : "Run proof again"}
              </button>
            </div>
            <p data-testid="probe-status" className="mt-4 rounded-xl border border-[#dfded8] bg-[#fafaf8] px-4 py-3 text-sm leading-6 text-[#686a66]">
              {registrationState}
            </p>

            <div className="mt-5 rounded-2xl border border-[#bed0ff] bg-[#f4f7ff] p-5 shadow-[inset_0_0_0_1px_rgba(37,91,255,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.14em] text-[#255bff] uppercase">getTools catalog</div>
                  <div className="mt-1 text-xs text-[#686a66]">Observed, never optimistically inferred</div>
                </div>
                <div className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-[#255bff]">{registeredTools.length} tools</div>
              </div>
              <div data-testid="probe-catalog" className="mt-4 grid gap-2">
                {registeredTools.length > 0 ? registeredTools.map((tool) => (
                  <div key={tool} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#dce5ff] bg-white px-4 py-3 font-mono text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#255bff]" />
                    <span className="min-w-0 break-all">{tool}</span>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-[#c8c7c1] px-4 py-8 text-center text-sm text-[#686a66]">
                    {supported ? "Catalog transition in progress…" : "A supported top-level WebMCP surface is required."}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void refreshTools()}
                disabled={!supported || running}
                className="rounded-xl border border-[#d8d7d1] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#f7f7f4] disabled:opacity-50"
              >
                Refresh discovery
              </button>
              <span className="font-mono text-[10px] text-[#81837f]">toolchange events: {toolchangeEvents}</span>
            </div>

            <div className="mt-5 rounded-xl bg-[#171817] p-4 text-[#f7f7f4]">
              <div className="font-mono text-[10px] tracking-[0.14em] text-[#a9aaa6] uppercase">Sanitized probe evidence</div>
              <pre data-testid="probe-evidence" className="mt-3 max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6">{lastResult}</pre>
            </div>
          </article>

          <aside className="min-w-0 rounded-2xl border border-[#dfded8] bg-white p-6">
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#81837f] uppercase">Protocol checks</div>
            <ol className="mt-5 space-y-3">
              {checks.map((check) => (
                <li key={check.id} data-testid={`probe-check-${check.id}`} className="rounded-xl border border-[#e6e5df] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium leading-5">{check.label}</span>
                    <strong className={`font-mono text-[10px] ${check.status === "PASSED" ? "text-[#137b5c]" : check.status === "FAILED" ? "text-[#a24b12]" : "text-[#81837f]"}`}>
                      {check.status}
                    </strong>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#81837f]">{check.detail}</p>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-[#dfded8] pt-5">
              <div className="font-mono text-[10px] tracking-[0.14em] text-[#81837f] uppercase">Recent events</div>
              <ol className="mt-4 space-y-3">
                {logs.length > 0 ? logs.map((entry) => (
                  <li key={entry.id} className="border-l border-[#d8d7d1] pl-4">
                    <div className="font-mono text-[10px] text-[#9a9b97]">{entry.at}</div>
                    <div className="mt-1 break-words text-sm leading-5">{entry.message}</div>
                  </li>
                )) : (
                  <li className="text-sm text-[#81837f]">No lifecycle events yet.</li>
                )}
              </ol>
            </div>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#dfded8] pt-5 text-xs text-[#81837f] sm:flex-row sm:items-center sm:justify-between">
          <span>Ratiflow · isolated C0 measurement surface</span>
          <span className="break-words font-mono">Only an external harness can classify this observation as adapter or native evidence.</span>
        </footer>
      </div>
    </main>
  );
}
