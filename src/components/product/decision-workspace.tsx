"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compileCapabilities } from "@/capabilities";
import { fixtureWorkspace } from "@/components/product/fixture-service";
import { httpRatiflowService } from "@/components/product/http-service";
import { WebMCPBridge } from "@/components/system/WebMCPBridge";
import type {
  CompiledCapabilities,
  ErrorResult,
  MemberRole,
  MutationReceipt,
  MutationToolName,
  PageSelection,
  ToolResult,
  WorkspaceView,
} from "@/contracts";
import type { WebMCPBridgeStatus } from "@/webmcp/types";
import type { WebMCPRegistrationMode } from "@/webmcp";

type PageMember = "MAYA" | "JORDAN";

interface DemoSessions {
  mayaSessionToken: string;
  jordanSessionToken: string;
  agentSessionToken: string;
}

interface LaunchResponse extends DemoSessions {
  workspace: WorkspaceView;
}

const SESSION_KEYS = {
  activeMember: "ratiflow.active-member",
  maya: "ratiflow.maya-session",
  jordan: "ratiflow.jordan-session",
  agent: "ratiflow.agent-session",
} as const;

const stateLabel: Record<WorkspaceView["decision"]["state"], string> = {
  OPTIONS: "Options",
  CONTESTED: "Contested",
  READY: "Ready",
  REVIEW: "Review",
  COMMITTED: "Committed",
};

const activityTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function storeMayaSessions(sessions: DemoSessions) {
  sessionStorage.setItem(SESSION_KEYS.activeMember, "MAYA");
  sessionStorage.setItem(SESSION_KEYS.maya, sessions.mayaSessionToken);
  sessionStorage.setItem(SESSION_KEYS.jordan, sessions.jordanSessionToken);
  sessionStorage.setItem(SESSION_KEYS.agent, sessions.agentSessionToken);
}

function readMayaSessions(): DemoSessions | null {
  const mayaSessionToken = sessionStorage.getItem(SESSION_KEYS.maya);
  const jordanSessionToken = sessionStorage.getItem(SESSION_KEYS.jordan);
  const agentSessionToken = sessionStorage.getItem(SESSION_KEYS.agent);
  return mayaSessionToken && jordanSessionToken && agentSessionToken
    ? { mayaSessionToken, jordanSessionToken, agentSessionToken }
    : null;
}

export function DecisionWorkspace({
  registrationMode = "dynamic",
}: {
  registrationMode?: WebMCPRegistrationMode;
}) {
  const [member, setMember] = useState<PageMember | null>(null);
  const [invalidJordanJoin, setInvalidJordanJoin] = useState(false);
  const [sessions, setSessions] = useState<DemoSessions | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [authoritativeCompiled, setAuthoritativeCompiled] = useState<CompiledCapabilities | null>(null);
  const [selection, setSelection] = useState<PageSelection>({ kind: "DECISION", id: fixtureWorkspace.decision.id });
  const [contextEpoch, setContextEpoch] = useState(1);
  const [memberSessionInstanceId, setMemberSessionInstanceId] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState<WebMCPBridgeStatus | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastAgentResult, setLastAgentResult] = useState<ToolResult<MutationReceipt> | null>(null);
  const [basisCaptured, setBasisCaptured] = useState(false);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [agentTaskDraft, setAgentTaskDraft] = useState("");
  const [collaborationBusy, setCollaborationBusy] = useState<string | null>(null);
  const previousRecommendationRef = useRef<string | null>(null);
  const workspaceRevisionRef = useRef<number | null>(null);
  const activityCursorRef = useRef<string | null>(null);
  const inspectGenerationRef = useRef(0);

  const acceptWorkspace = useCallback((next: WorkspaceView) => {
    inspectGenerationRef.current += 1;
    workspaceRevisionRef.current = next.revision;
    activityCursorRef.current = next.collaboration.cursor;
    setAuthoritativeCompiled(null);
    setWorkspace((current) => (!current || next.revision >= current.revision ? next : current));
  }, []);

  const acceptAuthoritativeWorkspace = useCallback((next: WorkspaceView, nextCompiled: CompiledCapabilities) => {
    inspectGenerationRef.current += 1;
    workspaceRevisionRef.current = next.revision;
    activityCursorRef.current = next.collaboration.cursor;
    setWorkspace((current) => (!current || next.revision >= current.revision ? next : current));
    setAuthoritativeCompiled(nextCompiled);
  }, []);

  const inspectWorkspace = useCallback(async (sessionToken: string) => {
    const generation = inspectGenerationRef.current + 1;
    inspectGenerationRef.current = generation;
    const next = await httpRatiflowService.inspect(sessionToken);
    if (generation !== inspectGenerationRef.current) return null;
    acceptWorkspace(next);
    return next;
  }, [acceptWorkspace]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setMemberSessionInstanceId(crypto.randomUUID());
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const isJordanJoin = fragment.get("member") === "jordan";

      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }

      if (isJordanJoin) {
        // A same-origin window opened with an opener receives an initial copy of
        // sessionStorage. The fragment is only a non-secret role marker; never
        // accept a membership handle from a URL.
        const opener = window.opener;
        let hasLiveSameOriginOpener = false;
        if (opener && !opener.closed) {
          try {
            hasLiveSameOriginOpener = opener.location.origin === window.location.origin;
          } catch {
            // Cross-origin openers cannot authorize an attributed collaborator tab.
          }
        }
        const inheritedJordanToken = hasLiveSameOriginOpener
          ? sessionStorage.getItem(SESSION_KEYS.jordan)
          : null;
        window.opener = null;
        if (!inheritedJordanToken) {
          setInvalidJordanJoin(true);
          return;
        }
        sessionStorage.setItem(SESSION_KEYS.activeMember, "JORDAN");
        sessionStorage.removeItem(SESSION_KEYS.maya);
        sessionStorage.removeItem(SESSION_KEYS.agent);
        setMember("JORDAN");
        setBusyAction("load");
        void inspectWorkspace(inheritedJordanToken).then(
        (next) => {
          if (!next) return;
          previousRecommendationRef.current = next.decision.selectedOptionId;
          workspaceRevisionRef.current = next.revision;
          activityCursorRef.current = next.collaboration.cursor;
          setWorkspace(next);
          setBusyAction(null);
        },
        (error: unknown) => {
          setPageError(error instanceof Error ? error.message : String(error));
          setBusyAction(null);
        },
        );
        return;
      }

      const activeMember = sessionStorage.getItem(SESSION_KEYS.activeMember);
      const jordanSessionToken = sessionStorage.getItem(SESSION_KEYS.jordan);
      if (activeMember === "JORDAN" && jordanSessionToken) {
        setMember("JORDAN");
        setBusyAction("load");
        void inspectWorkspace(jordanSessionToken).then(
        (next) => {
          if (!next) return;
          previousRecommendationRef.current = next.decision.selectedOptionId;
          workspaceRevisionRef.current = next.revision;
          activityCursorRef.current = next.collaboration.cursor;
          setWorkspace(next);
          setBusyAction(null);
        },
        (error: unknown) => {
          setPageError(error instanceof Error ? error.message : String(error));
          setBusyAction(null);
        },
        );
        return;
      }

      setMember("MAYA");
      const storedSessions = readMayaSessions();
      if (!storedSessions) return;
      setSessions(storedSessions);
      setBusyAction("load");
      void inspectWorkspace(storedSessions.mayaSessionToken).then(
      (next) => {
        if (!next) return;
        previousRecommendationRef.current = next.decision.selectedOptionId;
        workspaceRevisionRef.current = next.revision;
        activityCursorRef.current = next.collaboration.cursor;
        setWorkspace(next);
        setBusyAction(null);
      },
      (error: unknown) => {
        setPageError(error instanceof Error ? error.message : String(error));
        setBusyAction(null);
      },
      );
    });
    return () => {
      disposed = true;
    };
  }, [inspectWorkspace]);

  const activeToken =
    member === "MAYA"
      ? sessions?.mayaSessionToken ?? null
      : member === "JORDAN"
        ? sessionStorage.getItem(SESSION_KEYS.jordan)
        : null;

  useEffect(() => {
    if (!activeToken) return;
    const refresh = () => {
      void inspectWorkspace(activeToken).catch(() => undefined);
    };
    const unsubscribe = httpRatiflowService.subscribe(activeToken, (notice) => {
      const revisionAdvanced = notice.workspaceRevision !== null &&
        (workspaceRevisionRef.current === null || notice.workspaceRevision > workspaceRevisionRef.current);
      if (revisionAdvanced || notice.activityCursor !== activityCursorRef.current) refresh();
    });
    const poll = window.setInterval(refresh, 5_000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [activeToken, inspectWorkspace]);

  useEffect(() => {
    if (!workspace) return;
    const previous = previousRecommendationRef.current;
    const current = workspace.decision.selectedOptionId;
    if (member === "MAYA" && previous && previous !== current && selection.kind === "OPTION" && selection.id === previous) {
      setSelection({ kind: "OPTION", id: current });
      setContextEpoch((epoch) => epoch + 1);
    }
    previousRecommendationRef.current = current;
  }, [member, selection, workspace]);

  const memberRole: MemberRole = member === "JORDAN" ? "ENGINEERING_LEAD" : "PRODUCT_LEAD";
  const derivedCompiled = useMemo<CompiledCapabilities | null>(() => {
    if (!workspace) return null;
    return compileCapabilities({
      state: workspace.decision.state,
      selection,
      memberRole,
      workspaceRevision: workspace.revision,
      contextEpoch,
      readiness: workspace.readiness,
    });
  }, [contextEpoch, memberRole, selection, workspace]);
  const compiled = authoritativeCompiled &&
    workspace &&
    authoritativeCompiled.workspaceRevision === workspace.revision &&
    authoritativeCompiled.contextEpoch === contextEpoch &&
    authoritativeCompiled.selection.kind === selection.kind &&
    authoritativeCompiled.selection.id === selection.id
    ? authoritativeCompiled
    : derivedCompiled;

  const launchOrReset = async () => {
    setBusyAction("reset");
    setPageError(null);
    setActionMessage(null);
      setLastAgentResult(null);
      setRecommendation(null);
      setCustomerMessage(null);
    try {
      const response = await fetch("/api/demo/launch", { method: "POST" });
      const body = (await response.json()) as LaunchResponse & { message?: string };
      if (!response.ok) throw new Error(body.message ?? `Launch failed with status ${response.status}.`);
      const nextSessions: DemoSessions = {
        mayaSessionToken: body.mayaSessionToken,
        jordanSessionToken: body.jordanSessionToken,
        agentSessionToken: body.agentSessionToken,
      };
      storeMayaSessions(nextSessions);
      setMember("MAYA");
      setSessions(nextSessions);
      // A reset can reproduce the same revision, selection, and capability signature.
      // Rotate the page-session identity so retained WebMCP tools are re-registered
      // with callbacks that captured the newly issued membership handle.
      setMemberSessionInstanceId(crypto.randomUUID());
      setWorkspace(body.workspace);
      workspaceRevisionRef.current = body.workspace.revision;
      activityCursorRef.current = body.workspace.collaboration.cursor;
      setAuthoritativeCompiled(null);
      setSelection({ kind: "DECISION", id: body.workspace.decision.id });
      setContextEpoch(1);
      setBasisCaptured(false);
      setBridgeStatus(null);
      previousRecommendationRef.current = body.workspace.decision.selectedOptionId;
      setActionMessage("Deterministic workspace launched at revision 7.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const selectTarget = (next: PageSelection) => {
    if (selection.kind === next.kind && selection.id === next.id) return;
    setSelection(next);
    setContextEpoch((epoch) => epoch + 1);
    if (workspace?.revision === 7 && next.kind === "OPTION" && next.id === "opt_csv_ga_oct15") {
      setBasisCaptured(true);
      setActionMessage("Revision-7, epoch-2 agent basis captured for O1.");
    }
  };

  const openJordanWindow = () => {
    if (!sessions?.jordanSessionToken) return;
    const target = `${window.location.origin}${window.location.pathname}#member=jordan`;
    const opened = window.open(target, "_blank");
    if (opened === null) {
      setActionMessage("The Jordan window was blocked. Allow popups, then try again.");
      return;
    }
    setActionMessage("Jordan’s attributed workspace opened in a separate window.");
  };

  const runAgentMutation = async (
    action: string,
    toolName: MutationToolName,
    expectedWorkspaceRevision: number,
    epoch: number,
    capturedSelection: PageSelection,
    rationale: string,
    payload: Record<string, unknown>,
  ) => {
    if (!sessions?.agentSessionToken || !memberSessionInstanceId) return;
    setBusyAction(action);
    setActionMessage(null);
    try {
      const executionContext = {
        caller: "BROWSER_AGENT" as const,
        pageSessionId: memberSessionInstanceId,
        agentSessionToken: sessions.agentSessionToken,
      };
      const invoked = await httpRatiflowService.catchUpAgentSession(
        executionContext,
        {},
      );
      if (!invoked.ok) {
        setActionMessage(`${invoked.code}: ${invoked.message}`);
        return;
      }
      const result = await httpRatiflowService.mutateFromWebMCP({
        executionContext,
        toolName,
        envelope: { expectedWorkspaceRevision, contextEpoch: epoch, requestId: crypto.randomUUID(), rationale, payload },
        capturedSelection,
        capturedContextEpoch: epoch,
      } as Parameters<typeof httpRatiflowService.mutateFromWebMCP>[0]);
      setLastAgentResult(result);
      if (!result.ok) {
        setActionMessage(`${result.code}: ${result.message}`);
      } else {
        acceptWorkspace(result.data.workspace);
        setActionMessage(`${toolName} wrote authoritative revision ${result.data.resultingRevision}.`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const runStaleAgentWrite = () => runAgentMutation(
    "stale",
    "add_evidence",
    7,
    2,
    { kind: "OPTION", id: "opt_csv_ga_oct15" },
    "Record the full-GA estimate from the revision-7 O1 basis.",
    {
      optionId: "opt_csv_ga_oct15",
      kind: "ENGINEERING_ESTIMATE",
      stance: "SUPPORTS",
      title: "Full GA export estimate",
      detail: "Full GA export requires 8 launch engineer-days.",
      sourceLabel: "Revision-7 agent basis",
      metrics: { engineerDays: 8 },
    },
  );

  const runAgentRecovery = () => {
    if (!workspace) return;
    return runAgentMutation(
      "recover",
      "recommend_option",
      workspace.revision,
      contextEpoch,
      selection,
      "Recover launch scope to the feasible Northstar beta using the seeded beta-effort evidence.",
      { optionId: "opt_csv_beta_oct15" },
    );
  };

  const runAgentPrepare = () => {
    if (!workspace) return;
    return runAgentMutation(
      "prepare",
      "prepare_decision",
      workspace.revision,
      contextEpoch,
      selection,
      "Prepare the feasible Northstar beta decision for Maya’s review.",
      {
        optionId: "opt_csv_beta_oct15",
        recommendation: "Approve the invite-only, single-tenant Northstar beta on Oct 15, followed by GA on Nov 1.",
        risks: ["GA readiness remains open after the Oct 15 beta.", "The customer-launch-brief must be completed after ratification."],
        customerMessageDraft: "Northstar will receive usable CSV export in an invite-only beta on Oct 15, with GA on Nov 1.",
      },
    );
  };

  const ratify = async () => {
    if (!workspace || !sessions?.mayaSessionToken) return;
    const prepared = workspace.preparedDecision;
    if (!prepared) return;
    setBusyAction("ratify");
    setActionMessage(null);
    try {
      const result = await httpRatiflowService.ratifyFromHumanUi(sessions.mayaSessionToken, {
        expectedWorkspaceRevision: workspace.revision,
        requestId: crypto.randomUUID(),
        recommendation: recommendation ?? prepared.recommendation,
        customerMessage: customerMessage ?? prepared.customerMessageDraft,
      });
      if (!result.ok) {
        setActionMessage(`${result.code}: ${result.message}`);
      } else {
        acceptWorkspace(result.data.workspace);
        setActionMessage("Maya ratified the prepared decision in the ordinary UI.");
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const applyJordanCapacityChange = async (source: "human-window" | "synthetic-rehearsal") => {
    const jordanToken = sessionStorage.getItem(SESSION_KEYS.jordan);
    if (!workspace || !jordanToken) return;
    setBusyAction("capacity");
    setActionMessage(null);
    try {
      const result = await httpRatiflowService.setLaunchCapacityFromCollaboratorUi(jordanToken, {
        expectedWorkspaceRevision: workspace.revision,
        requestId: crypto.randomUUID(),
        payload: { launchCapacityEngineerDays: 14, reason: "Four-day incident rotation" },
      });
      if (!result.ok) {
        setActionMessage(`${result.code}: ${result.message}`);
      } else {
        acceptWorkspace(result.data.workspace);
        setActionMessage(source === "synthetic-rehearsal"
          ? "Synthetic Jordan rehearsal applied the authorized 18 → 14 capacity change at revision 8."
          : "Jordan changed capacity from 18 to 14 at authoritative revision 8.");
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const refreshCollaboration = async () => {
    if (!sessions?.mayaSessionToken) return;
    await inspectWorkspace(sessions.mayaSessionToken);
  };

  const createAgentTask = async () => {
    const body = agentTaskDraft.trim();
    if (!sessions?.mayaSessionToken || !body) return;
    setCollaborationBusy("task");
    setActionMessage(null);
    try {
      const result = await httpRatiflowService.createAgentTaskFromHumanUi(
        sessions.mayaSessionToken,
        { kind: "TASK", body, target: selection, requestId: crypto.randomUUID() },
      );
      if (!result.ok) {
        setActionMessage(`${result.code}: ${result.message}`);
      } else {
        setAgentTaskDraft("");
        await refreshCollaboration();
        setActionMessage("Task added to Ratiflow Agent’s inbox. An external agent was not woken or started.");
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCollaborationBusy(null);
    }
  };

  const answerAgentQuestion = async (questionId: string, answer: string) => {
    if (!sessions?.mayaSessionToken || !answer.trim()) return;
    setCollaborationBusy(questionId);
    setActionMessage(null);
    try {
      const result = await httpRatiflowService.answerHumanInputFromHumanUi(
        sessions.mayaSessionToken,
        { questionId, answer: answer.trim(), requestId: crypto.randomUUID() },
      );
      if (!result.ok) setActionMessage(`${result.code}: ${result.message}`);
      else {
        await refreshCollaboration();
        setActionMessage("Your answer is now shared state; the next agent wait or catch-up can read it.");
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCollaborationBusy(null);
    }
  };

  const updateStandingInstructions = async (autoPickup: boolean) => {
    if (!sessions?.mayaSessionToken || !workspace) return;
    setCollaborationBusy("settings");
    setActionMessage(null);
    try {
      const current = workspace.collaboration.standingInstructions;
      const result = await httpRatiflowService.updateStandingInstructionsFromHumanUi(
        sessions.mayaSessionToken,
        {
          autoPickup,
          scopes: current.scopes,
          maxActionsPerHour: current.maxActionsPerHour,
          requestId: crypto.randomUUID(),
        },
      );
      if (!result.ok) setActionMessage(`${result.code}: ${result.message}`);
      else {
        await refreshCollaboration();
        setActionMessage(autoPickup
          ? "Standing instructions are on. Auto pickup remains visibly unavailable until its model and spend gate passes."
          : "Standing instructions are off; queued work requires a browser-agent turn.");
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCollaborationBusy(null);
    }
  };

  if (invalidJordanJoin) {
    return <LaunchWorkspace error={pageError} isJordan launching={false} onLaunch={launchOrReset} />;
  }

  if (member === null || busyAction === "load") return <WorkspaceLoading />;

  if (!workspace || !compiled) {
    return <LaunchWorkspace error={pageError} isJordan={member === "JORDAN"} launching={busyAction === "reset"} onLaunch={launchOrReset} />;
  }

  if (member === "JORDAN") {
    return <JordanWorkspace actionMessage={actionMessage} busy={busyAction === "capacity"} compiled={compiled} onCapacityChange={() => applyJordanCapacityChange("human-window")} workspace={workspace} />;
  }

  const reviewRecommendation = recommendation ?? workspace.preparedDecision?.recommendation ?? "";
  const reviewCustomerMessage = customerMessage ?? workspace.preparedDecision?.customerMessageDraft ?? "";

  return (
    <>
      {sessions?.agentSessionToken && memberSessionInstanceId && (
        <WebMCPBridge
          compiled={compiled}
          workspace={workspace}
          memberRole="PRODUCT_LEAD"
          memberSessionInstanceId={memberSessionInstanceId}
          sessionToken={sessions.agentSessionToken}
          service={httpRatiflowService}
          registrationMode={registrationMode}
          onStatusChange={setBridgeStatus}
          onAuthoritativeSnapshot={acceptAuthoritativeWorkspace}
        />
      )}
      <WorkspaceViewSurface
        actionMessage={actionMessage}
        agentTaskDraft={agentTaskDraft}
        basisCaptured={basisCaptured}
        bridgeStatus={bridgeStatus}
        busyAction={busyAction}
        collaborationBusy={collaborationBusy}
        compiled={compiled}
        customerMessage={reviewCustomerMessage}
        lastAgentResult={lastAgentResult}
        onCustomerMessageChange={setCustomerMessage}
        onAgentTaskDraftChange={setAgentTaskDraft}
        onAnswerAgentQuestion={answerAgentQuestion}
        onCreateAgentTask={createAgentTask}
        onOpenJordan={openJordanWindow}
        onSyntheticJordanCapacityChange={() => applyJordanCapacityChange("synthetic-rehearsal")}
        onPrepare={runAgentPrepare}
        onRatify={ratify}
        onRecommendationChange={setRecommendation}
        onRecover={runAgentRecovery}
        onReset={launchOrReset}
        onSelect={selectTarget}
        onStaleWrite={runStaleAgentWrite}
        onUpdateStandingInstructions={updateStandingInstructions}
        recommendation={reviewRecommendation}
        registrationMode={registrationMode}
        selection={selection}
        workspace={workspace}
      />
    </>
  );
}

function WorkspaceLoading() {
  return (
    <main className="product-shell loading-shell" aria-busy="true">
      <div className="launch-card">
        <span className="wordmark"><span className="wordmark-mark" /> Ratiflow</span>
        <div className="loading-line" />
        <h1>Opening the live decision workspace…</h1>
        <p>The fixture is shown only as a loading reference; no write is implied.</p>
      </div>
    </main>
  );
}

function LaunchWorkspace({ error, isJordan, launching, onLaunch }: { error: string | null; isJordan: boolean; launching: boolean; onLaunch: () => void }) {
  return (
    <main className="product-shell loading-shell">
      <section className="launch-card">
        <span className="wordmark"><span className="wordmark-mark" /> Ratiflow</span>
        <div className="section-kicker">Local deterministic rehearsal</div>
        <h1>{isJordan ? "Jordan’s workspace link is no longer valid." : "Start with one live decision."}</h1>
        <p>{isJordan ? "Ask Maya to open a fresh Jordan window. Joining never resets the shared workspace." : "Launch the frozen Northstar scenario at revision 7. Membership handles stay only in this tab’s session storage."}</p>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {!isJordan && <button className="primary-button" disabled={launching} onClick={onLaunch} type="button">{launching ? "Launching…" : "Launch deterministic workspace"}</button>}
      </section>
    </main>
  );
}

function WorkspaceViewSurface({
  actionMessage,
  agentTaskDraft,
  basisCaptured,
  bridgeStatus,
  busyAction,
  collaborationBusy,
  compiled,
  customerMessage,
  lastAgentResult,
  onAgentTaskDraftChange,
  onAnswerAgentQuestion,
  onCreateAgentTask,
  onCustomerMessageChange,
  onOpenJordan,
  onSyntheticJordanCapacityChange,
  onPrepare,
  onRatify,
  onRecommendationChange,
  onRecover,
  onReset,
  onSelect,
  onStaleWrite,
  onUpdateStandingInstructions,
  recommendation,
  registrationMode,
  selection,
  workspace,
}: {
  actionMessage: string | null;
  agentTaskDraft: string;
  basisCaptured: boolean;
  bridgeStatus: WebMCPBridgeStatus | null;
  busyAction: string | null;
  collaborationBusy: string | null;
  compiled: CompiledCapabilities;
  customerMessage: string;
  lastAgentResult: ToolResult<MutationReceipt> | null;
  onAgentTaskDraftChange: (value: string) => void;
  onAnswerAgentQuestion: (questionId: string, answer: string) => void;
  onCreateAgentTask: () => void;
  onCustomerMessageChange: (value: string) => void;
  onOpenJordan: () => void;
  onSyntheticJordanCapacityChange: () => void;
  onPrepare: () => void;
  onRatify: () => void;
  onRecommendationChange: (value: string) => void;
  onRecover: () => void;
  onReset: () => void;
  onSelect: (selection: PageSelection) => void;
  onStaleWrite: () => void;
  onUpdateStandingInstructions: (autoPickup: boolean) => void;
  recommendation: string;
  registrationMode: WebMCPRegistrationMode;
  selection: PageSelection;
  workspace: WorkspaceView;
}) {
  const state = workspace.decision.state;
  const canSelectOption = state === "OPTIONS" || state === "CONTESTED" || state === "READY";
  const staleError = !lastAgentResult?.ok && lastAgentResult?.code === "STALE_WORK_STATE" ? lastAgentResult : null;

  return (
    <main className="product-shell">
      <Topbar member="MAYA" workspace={workspace} />
      <section className="workspace" id="workspace">
        <DecisionHeading workspace={workspace} />
        {registrationMode === "static-superset" && <div className="system-notice system-notice-supported has-error" role="status"><span className="status-dot status-dot-amber" /><div><b>Eval-only static-superset preview.</b> When WebMCP is supported, all 10 existing tools are registered for comparison; the Capability Field stays dynamic and the server rejects unavailable actions.</div><span className="mono system-notice-tag">ablation</span></div>}
        <WebMCPNotice registrationMode={registrationMode} status={bridgeStatus} />
        <AgentRoomPanel
          busy={collaborationBusy}
          draft={agentTaskDraft}
          onAnswer={onAnswerAgentQuestion}
          onCreateTask={onCreateAgentTask}
          onDraftChange={onAgentTaskDraftChange}
          onToggleAuto={onUpdateStandingInstructions}
          selection={selection}
          workspace={workspace}
        />

        <div className="workspace-grid">
          <section className="main-column" aria-label="Decision options">
            <DecisionContext workspace={workspace} />
            <div className="section-title-row">
              <div><div className="section-kicker">Options</div><h2>Choose the feasible launch path.</h2></div>
              <span className="mono quiet">page selection advances epoch, never workspace revision</span>
            </div>
            <div aria-label="Launch option selection" className="options" role="radiogroup">
              {workspace.options.map((option) => {
                const isPageSelected = selection.kind === "OPTION" && selection.id === option.id;
                const fits = option.totalEngineerDays <= workspace.decision.launchCapacityEngineerDays;
                const isRecommended = option.id === workspace.decision.selectedOptionId;
                const isSelected = state === "COMMITTED" ? isRecommended : isPageSelected;
                return (
                  <button
                    aria-checked={isSelected}
                    className={`option-card ${isSelected ? "is-selected" : ""} ${isRecommended ? "is-recommended" : ""} ${state === "COMMITTED" && isRecommended ? "is-committed" : ""}`}
                    disabled={!canSelectOption}
                    key={option.id}
                    onClick={() => onSelect({ kind: "OPTION", id: option.id })}
                    role="radio"
                    type="button"
                  >
                    <span className="option-radio" aria-hidden="true" />
                    <span className="option-content">
                      <span className="option-topline"><strong>{option.title}</strong>{state === "COMMITTED" && isRecommended ? <em className="commitment-label">Selected for ratification</em> : isRecommended && <em>Domain recommendation</em>}</span>
                      <span className="option-summary">{option.summary}</span>
                      <span className="option-metrics"><span><b>{option.totalEngineerDays}</b> Oct 15 days</span><span><b>{option.postLaunchEngineerDays}</b> post-launch days</span><span className={fits ? "fit" : "no-fit"}>{fits ? "Fits current capacity" : `Exceeds capacity by ${option.totalEngineerDays - workspace.decision.launchCapacityEngineerDays}`}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>

            {staleError && <StaleRecovery error={staleError} />}

            {state === "REVIEW" && workspace.preparedDecision && (
              <article className="panel review-card">
                <div className="review-title"><div><div className="section-kicker">Human review</div><h2>Ratify the prepared decision</h2></div><span className="state-pill state-review">Maya only</span></div>
                <p>The agent prepared {workspace.options.find((option) => option.id === workspace.preparedDecision?.optionId)?.title} at revision {workspace.revision}. Only Maya can commit it through this ordinary UI.</p>
                <label htmlFor="ratification-recommendation">Decision record</label>
                <textarea id="ratification-recommendation" value={recommendation} onChange={(event) => onRecommendationChange(event.target.value)} />
                <label htmlFor="customer-message">Customer message</label>
                <textarea id="customer-message" value={customerMessage} onChange={(event) => onCustomerMessageChange(event.target.value)} />
                <div className="review-actions"><span className="mono">prepared by {workspace.preparedDecision.preparedBy.name} · rev {workspace.revision}</span><button className="primary-button" disabled={busyAction !== null || !recommendation.trim() || !customerMessage.trim()} type="button" onClick={onRatify}>{busyAction === "ratify" ? "Ratifying…" : "Ratify as Maya Chen · human UI"}</button></div>
              </article>
            )}

            {state === "COMMITTED" && workspace.preparedDecision && (
              <>
                <article className="panel commitment-card">
                  <div><div className="section-kicker">Committed decision</div><h2>{workspace.preparedDecision.recommendation}</h2><p>Ratified by {workspace.preparedDecision.ratifiedBy?.name ?? "Maya Chen"} in the ordinary UI at revision {workspace.revision}. {workspace.preparedDecision.customerMessageDraft}</p></div>
                  <span className="state-pill state-committed">ratified</span>
                </article>
                <CommittedHandoff workspace={workspace} />
              </>
            )}

            <RehearsalControls basisCaptured={basisCaptured} busyAction={busyAction} contextEpoch={compiled.contextEpoch} hasStaleResult={Boolean(staleError)} onOpenJordan={onOpenJordan} onPrepare={onPrepare} onRecover={onRecover} onReset={onReset} onStaleWrite={onStaleWrite} onSyntheticJordanCapacityChange={onSyntheticJordanCapacityChange} selection={selection} workspace={workspace} />
            {actionMessage && <div className="action-message" role="status">{actionMessage}</div>}
          </section>

          <aside className="side-column">
            <CapabilityField compiled={compiled} registeredTools={bridgeStatus?.registeredTools ?? []} />
            <EvidenceLedger workspace={workspace} />
            <FollowupCard onSelect={onSelect} selection={selection} workspace={workspace} />
          </aside>
        </div>
        <ProvenanceRibbon workspace={workspace} />
      </section>
    </main>
  );
}

function targetLabel(target: PageSelection, workspace: WorkspaceView) {
  if (target.kind === "DECISION") return "the decision";
  if (target.kind === "FOLLOWUP") return "the customer launch brief";
  return workspace.options.find((option) => option.id === target.id)?.title ?? "the selected option";
}

function activityViaLabel(via: WorkspaceView["collaboration"]["recentActivity"][number]["via"]) {
  if (via === "BROWSER_AGENT") return "ChatGPT";
  if (via === "AUTO_PICKUP") return "auto pickup";
  if (via === "ORDINARY_UI") return "human UI";
  return "system";
}

function activityTypeLabel(type: WorkspaceView["collaboration"]["recentActivity"][number]["type"]) {
  return type.toLowerCase().replaceAll("_", " ");
}

function agentLastSeen(lastSeenAt: string | null) {
  if (!lastSeenAt) return "No agent activity yet";
  return `Last active ${activityTimeFormatter.format(new Date(lastSeenAt))}`;
}

function QuestionAnswerCard({
  busy,
  onAnswer,
  question,
}: {
  busy: boolean;
  onAnswer: (questionId: string, answer: string) => void;
  question: WorkspaceView["collaboration"]["questions"][number];
}) {
  const [answer, setAnswer] = useState("");
  return (
    <article className="agent-question-card">
      <div><span className="agent-via">Human input requested</span><p>{question.question}</p></div>
      <label className="sr-only" htmlFor={`answer-${question.id}`}>Answer Ratiflow Agent</label>
      <div className="agent-answer-row">
        <input
          id={`answer-${question.id}`}
          maxLength={600}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Answer in shared state…"
          value={answer}
        />
        <button className="secondary-button" disabled={busy || !answer.trim()} onClick={() => onAnswer(question.id, answer)} type="button">
          {busy ? "Sharing…" : "Share answer"}
        </button>
      </div>
    </article>
  );
}

function AgentRoomPanel({
  busy,
  draft,
  onAnswer,
  onCreateTask,
  onDraftChange,
  onToggleAuto,
  selection,
  workspace,
}: {
  busy: string | null;
  draft: string;
  onAnswer: (questionId: string, answer: string) => void;
  onCreateTask: () => void;
  onDraftChange: (value: string) => void;
  onToggleAuto: (enabled: boolean) => void;
  selection: PageSelection;
  workspace: WorkspaceView;
}) {
  const collaboration = workspace.collaboration;
  const waiting = collaboration.inbox.filter((task) => task.status === "OPEN");
  const currentThread = collaboration.comments.filter((comment) =>
    comment.target.kind === selection.kind && comment.target.id === selection.id,
  );
  const openQuestions = collaboration.questions.filter((question) => question.status === "OPEN");
  const recentActivity = collaboration.recentActivity.slice(-6).reverse();
  const autoEnabled = collaboration.standingInstructions.autoPickup;

  return (
    <section className="agent-room" aria-labelledby="agent-room-title">
      <div className="agent-room-head">
        <div>
          <div className="section-kicker">Shared agent room</div>
          <h2 id="agent-room-title">Address the agent where the decision lives.</h2>
        </div>
        <div className="agent-presence-stack">
          <span className={`agent-presence state-${collaboration.agent.state.toLowerCase()}`}>
            <i aria-hidden="true" /> {collaboration.agent.state === "LIVE_AUTO" ? "live · auto" : collaboration.agent.state.toLowerCase()}
          </span>
          <small>{agentLastSeen(collaboration.agent.lastSeenAt)}</small>
        </div>
      </div>

      <div className="agent-room-grid">
        <article className="agent-room-cell agent-task-composer">
          <div className="agent-cell-title"><strong>Ask Ratiflow Agent</strong><span>{waiting.length} waiting</span></div>
          <p>Queue work about {targetLabel(selection, workspace)}. This does not wake or start an external model.</p>
          <label className="sr-only" htmlFor="agent-task">Task for Ratiflow Agent</label>
          <textarea
            id="agent-task"
            maxLength={1200}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Example: Check this option’s delivery risks and leave a concise comment."
            value={draft}
          />
          <button className="primary-button" disabled={busy !== null || !draft.trim()} onClick={onCreateTask} type="button">
            {busy === "task" ? "Adding…" : "Add to agent inbox"}
          </button>
        </article>

        <article className="agent-room-cell agent-inbox">
          <div className="agent-cell-title"><strong>Agent inbox</strong><span className="mono">cursor {collaboration.cursor.slice(0, 8)}</span></div>
          {collaboration.inbox.length === 0 ? <p className="agent-empty">No addressed work yet.</p> : (
            <ol>
              {collaboration.inbox.slice(0, 5).map((task) => (
                <li key={task.id}>
                  <span className={`task-status task-${task.status.toLowerCase()}`}>{task.status.replace("_", " ").toLowerCase()}</span>
                  <div><strong>{task.body}</strong><small>{targetLabel(task.target, workspace)} · from {task.createdBy.name}</small></div>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className="agent-room-cell agent-standing">
          <div className="agent-cell-title"><strong>Standing instructions</strong><span>{autoEnabled ? "configured" : "off"}</span></div>
          <p>Optional pickup runs only in this visible page, after its model, spend, and native-loop gate passes.</p>
          <label className="standing-toggle">
            <input
              checked={autoEnabled}
              disabled={busy !== null}
              onChange={(event) => onToggleAuto(event.target.checked)}
              type="checkbox"
            />
            <span aria-hidden="true" />
            Auto-pick up mentions and tasks
          </label>
          <small>Off by default · max {collaboration.standingInstructions.maxActionsPerHour} actions/hour · no background execution</small>
          {autoEnabled && <div className="runner-unavailable" role="status">Runner unavailable until its release gate passes; work stays queued.</div>}
        </article>
      </div>

      {(currentThread.length > 0 || openQuestions.length > 0) && (
        <div className="agent-thread">
          <div className="agent-thread-comments">
            <div className="agent-cell-title"><strong>Agent thread · {targetLabel(selection, workspace)}</strong><span>{currentThread.length}</span></div>
            {currentThread.slice(-4).map((comment) => (
              <article className="agent-comment" key={comment.id}>
                <span className="avatar agent-avatar">RA</span>
                <div><div><strong>{comment.actor.name}</strong><span className="agent-via">via {comment.via === "AUTO_PICKUP" ? "auto pickup" : "ChatGPT"}</span></div><p>{comment.body}</p></div>
              </article>
            ))}
          </div>
          {openQuestions.length > 0 && (
            <div className="agent-questions">
              {openQuestions.map((question) => (
                <QuestionAnswerCard busy={busy === question.id} key={question.id} onAnswer={onAnswer} question={question} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="agent-activity" aria-label="Recent collaboration activity">
        <div className="agent-cell-title"><strong>Recent activity</strong><span>Server event log</span></div>
        <ol>
          {recentActivity.map((event) => (
            <li key={event.id}>
              <i aria-hidden="true" />
              <div>
                <div><strong>{event.actor.name}</strong><span className="agent-via">via {activityViaLabel(event.via)}</span><time dateTime={event.createdAt}>{activityTimeFormatter.format(new Date(event.createdAt))}</time></div>
                <p>{event.summary}</p>
                <small>{activityTypeLabel(event.type)} · {targetLabel(event.target, workspace)}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Topbar({ member, workspace }: { member: PageMember; workspace: WorkspaceView }) {
  const agent = workspace.collaboration.agent;
  return (
    <header className="topbar">
      <a className="wordmark" href="#workspace" aria-label="Ratiflow workspace"><span className="wordmark-mark" /> Ratiflow</a>
      <Link className="document-link" href="/document">New shared note</Link>
      <div className="workspace-identity"><span className="status-dot status-dot-green" /><span>{workspace.name}</span><span className="slash">/</span><span className="mono">{workspace.id}</span></div>
      <div className="people" aria-label="Workspace participants"><span className="person-chip active-person"><b className={`avatar ${member === "MAYA" ? "maya" : "jordan"}`}>{member === "MAYA" ? "MC" : "JL"}</b><span className="person-label">{member === "MAYA" ? "Maya Chen · Product Lead" : "Jordan Lee · Engineering Lead"}</span><span className="person-label-short" aria-hidden="true">{member === "MAYA" ? "Maya · Lead" : "Jordan · Lead"}</span></span><span className={`person-chip agent-person agent-${agent.state.toLowerCase()}`}><b className="avatar agent-avatar">RA</b><span className="person-label">Ratiflow Agent · {agent.state === "LIVE_AUTO" ? "live · auto" : agent.state.toLowerCase()}</span><span className="person-label-short" aria-hidden="true">Agent · {agent.state.toLowerCase()}</span></span></div>
    </header>
  );
}

function DecisionHeading({ workspace }: { workspace: WorkspaceView }) {
  const waiting = workspace.collaboration.inbox.filter((task) => task.status === "OPEN").length;
  return <div className="decision-head"><div><div className="eyebrow">Launch scope decision <span className="mono">{workspace.decision.id}</span></div><h1>{workspace.decision.question}</h1></div><div className="revision-block">{waiting > 0 && <span className="waiting-badge">Waiting on agent · {waiting}</span>}<span className={`state-pill state-${workspace.decision.state.toLowerCase()}`}>{stateLabel[workspace.decision.state]}</span><span className="mono">rev {workspace.revision}</span></div></div>;
}

function DecisionContext({ workspace }: { workspace: WorkspaceView }) {
  return <article className="panel context-panel"><div className="section-kicker">Authoritative decision context</div><div className="context-grid"><div><span>Customer</span><strong>{workspace.customer.name}</strong></div><div><span>Annual renewal</span><strong>{formatCurrency(workspace.customer.annualRenewalUsd)}</strong></div><div><span>Usable export due</span><strong>{formatDate(workspace.customer.usableExportDueDate)}</strong></div><div><span>Launch capacity</span><strong>{workspace.decision.launchCapacityEngineerDays} engineer-days</strong></div></div></article>;
}

function WebMCPNotice({
  registrationMode,
  status,
}: {
  registrationMode: WebMCPRegistrationMode;
  status: WebMCPBridgeStatus | null;
}) {
  if (!status) return <div className="system-notice" role="status"><span className="status-dot status-dot-amber" /><div><b>Checking native WebMCP support…</b> The ordinary human UI remains available.</div><span className="mono system-notice-tag">detecting</span></div>;
  if (!status.supported) return <div className="system-notice" role="status"><span className="status-dot status-dot-amber" /><div><b>WebMCP not detected in this browser.</b> Real human and synthetic rehearsal routes remain available; native agent tools require a supported surface.</div><span className="mono system-notice-tag">fallback UI</span></div>;
  const registrationDetail = registrationMode === "static-superset"
    ? `${status.registeredTools.length} static evaluation tools are registered; the visible Capability Field remains dynamic.`
    : `${status.registeredTools.length} native tools mirror the visible Capability Field.`;
  return <div className={`system-notice system-notice-supported ${status.error ? "has-error" : ""}`} role="status"><span className={`status-dot ${status.error ? "status-dot-amber" : "status-dot-green"}`} /><div><b>{status.error ? "WebMCP registration needs attention." : `WebMCP active via ${status.namespace}.`}</b> {status.error ?? registrationDetail}</div><span className="mono system-notice-tag">native</span></div>;
}

function CapabilityField({ compiled, registeredTools }: { compiled: CompiledCapabilities; registeredTools: string[] }) {
  return (
    <article className="capability-field">
      <div className="capability-heading"><div><div className="section-kicker">Live capability field</div><h2>Actually registered now</h2></div><span className="tool-count mono">{registeredTools.length} tools</span></div>
      <div className="capability-meta"><span className="mono">rev {compiled.workspaceRevision}</span><span className="mono">epoch {compiled.contextEpoch}</span><span className="mono">{compiled.selection.kind.toLowerCase()} scope</span></div>
      {registeredTools.length > 0 ? <div className="tool-list">{registeredTools.map((tool) => <div className="tool" key={tool}><span /><code>{tool}</code></div>)}</div> : <p className="capability-empty">No native tools are registered in this browser. The ordinary UI remains usable.</p>}
      {compiled.unavailableActions.map((action) => <div className={`unavailable ${action.action === "prepare_decision" && compiled.state === "CONTESTED" ? "is-conflict" : ""}`} key={action.action}><span>{action.action === "ratify_decision" ? "Authority boundary" : "Unavailable now"}</span><p><code>{action.action}</code> — {action.unmetPredicates.join(" · ")}</p></div>)}
    </article>
  );
}

function EvidenceLedger({ workspace }: { workspace: WorkspaceView }) {
  const evidenceIds = ["ev_core_reliability", "ev_capacity_r7", "ev_northstar_deadline"];
  const evidence = evidenceIds.map((id) => workspace.evidence.find((item) => item.id === id)).filter((item) => item !== undefined);
  return (
    <article className="panel evidence-panel">
      <div className="section-kicker">Evidence ledger</div><h2>Facts that constrain the choice</h2>
      {evidence.map((item) => {
        const metric = item.id === "ev_capacity_r7" ? `${workspace.decision.launchCapacityEngineerDays}d` : item.metrics?.engineerDays !== undefined ? `${item.metrics.engineerDays}d` : item.metrics?.date ? formatDate(item.metrics.date).replace(", 2026", "") : "fact";
        const detail = item.id === "ev_capacity_r7" && workspace.decision.launchCapacityEngineerDays === 14 ? "14 engineer-days available after Jordan’s four-day incident rotation." : item.detail;
        return <div className="evidence-row" key={item.id}><span className={`evidence-dot ${item.kind === "CUSTOMER_DEADLINE" ? "amber" : "blue"}`} /><div><strong>{item.title}</strong><p>{detail}</p></div><b>{metric}</b></div>;
      })}
    </article>
  );
}

function FollowupCard({ onSelect, selection, workspace }: { onSelect: (selection: PageSelection) => void; selection: PageSelection; workspace: WorkspaceView }) {
  const selected = selection.kind === "FOLLOWUP" && selection.id === workspace.followup.id;
  return (
    <article className={`panel followup-card ${workspace.followup.status === "READY" ? "is-ready" : ""}`}>
      <div className="followup-top"><div><div className="section-kicker">Downstream follow-up</div><h2>{workspace.followup.slug}</h2></div><span className={`followup-status ${workspace.followup.status.toLowerCase()}`}>{workspace.followup.status}</span></div>
      <p>{workspace.followup.status === "READY" ? `${workspace.followup.inheritedContext.join(" · ")} · owner Maya Chen · due ${formatDate(workspace.followup.dueDate)}.` : "Unlocks once Maya ratifies a prepared decision."}</p>
      {workspace.decision.state === "COMMITTED" && <button className="text-button" disabled={selected} onClick={() => onSelect({ kind: "FOLLOWUP", id: workspace.followup.id })} type="button">{selected ? "Follow-up selected" : "Select follow-up · page-local"}</button>}
      {selected && <div className="selection-note"><span className="status-dot status-dot-green" /> Follow-up selected; <span className="mono">inspect_followup</span> is now scoped.</div>}
    </article>
  );
}

function RehearsalControls({ basisCaptured, busyAction, contextEpoch, hasStaleResult, onOpenJordan, onPrepare, onRecover, onReset, onStaleWrite, onSyntheticJordanCapacityChange, selection, workspace }: {
  basisCaptured: boolean;
  busyAction: string | null;
  contextEpoch: number;
  hasStaleResult: boolean;
  onOpenJordan: () => void;
  onPrepare: () => void;
  onRecover: () => void;
  onReset: () => void;
  onStaleWrite: () => void;
  onSyntheticJordanCapacityChange: () => void;
  selection: PageSelection;
  workspace: WorkspaceView;
}) {
  const isBusy = busyAction !== null;
  const canOpenJordan = workspace.revision === 7 && basisCaptured && selection.kind === "OPTION" && selection.id === "opt_csv_ga_oct15" && contextEpoch === 2;
  const canStale = workspace.revision === 8 && workspace.decision.state === "CONTESTED" && basisCaptured;
  const canRecover = canStale && hasStaleResult;
  const canPrepare = workspace.revision === 9 && workspace.decision.state === "READY" && selection.kind === "OPTION" && selection.id === "opt_csv_beta_oct15";
  return (
    <div className="journey-controls" aria-label="Live deterministic rehearsal controls">
      <div><span className="section-kicker">Live rehearsal</span><p>Every action calls an authorized local route; no preview state or timer writes.</p></div>
      <div className="journey-action-row">
        {workspace.revision === 7 && <>
          <button className="secondary-button" disabled={!canOpenJordan || isBusy} onClick={onOpenJordan} type="button">Open Jordan window · human action</button>
          <button className="text-button" disabled={!canOpenJordan || isBusy} onClick={onSyntheticJordanCapacityChange} type="button">Apply Jordan capacity change · synthetic rehearsal</button>
        </>}
        {canStale && !hasStaleResult && <button className="secondary-button" disabled={isBusy} onClick={onStaleWrite} type="button">{busyAction === "stale" ? "Submitting…" : "Submit stale rev-7 evidence · synthetic agent"}</button>}
        {canRecover && <button className="secondary-button" disabled={isBusy} onClick={onRecover} type="button">{busyAction === "recover" ? "Recovering…" : "Recommend O2 · synthetic agent"}</button>}
        {canPrepare && <button className="secondary-button" disabled={isBusy} onClick={onPrepare} type="button">{busyAction === "prepare" ? "Preparing…" : "Prepare review · synthetic agent"}</button>}
        <button className="text-button danger-text" disabled={isBusy} onClick={onReset} type="button">Reset workspace</button>
      </div>
    </div>
  );
}

function StaleRecovery({ error }: { error: ErrorResult }) {
  const jordanChange = error.changes?.find((change) => change.actor.id === "usr_jordan_lee");
  return (
    <article className="stale-card">
      <div className="stale-heading"><div><div className="section-kicker">Stale work recovery</div><h2>Agent basis was rejected by the server.</h2></div><span className="state-pill state-contested">{error.code}</span></div>
      <p><strong>{error.code}</strong> — {error.message} No write was accepted.</p>
      <div className="basis-compare"><div className="old-basis"><span className="mono">agent basis · rev {error.expectedWorkspaceRevision}</span><b>18 engineer-days</b><p>O1 fit exactly: 10 reliability + 8 full GA export.</p></div><div className="new-basis"><span className="mono">{jordanChange?.actor.name ?? "Jordan Lee"} · rev {error.actualWorkspaceRevision}</span><b>14 engineer-days</b><p>{jordanChange?.reason ?? "Four-day incident rotation"}; O1 now exceeds capacity by 4 days.</p></div></div>
      <div className="stale-next"><span className="mono">next action</span>{error.nextAction}</div>
    </article>
  );
}

function CommittedHandoff({ workspace }: { workspace: WorkspaceView }) {
  const prepared = workspace.preparedDecision;
  if (!prepared) return null;
  const preparedOption = workspace.options.find((option) => option.id === prepared.optionId);
  const preparedOptionLabel = preparedOption ? `O${workspace.options.indexOf(preparedOption) + 1} · ${preparedOption.title}` : "the selected option";
  const capacityChange = workspace.provenance.find((event) => event.actor.id === "usr_jordan_lee" && event.origin === "ORDINARY_UI");
  const preparation = workspace.provenance.find((event) => event.actor.id === prepared.preparedBy.id && event.toolName === "prepare_decision");
  const ratification = workspace.provenance.find((event) => event.actor.id === prepared.ratifiedBy?.id && event.reviewStatus === "RATIFIED");

  return (
    <article className="committed-handoff" aria-label="Accountable handoff">
      <div className="section-kicker">Accountable handoff</div>
      <ol>
        {capacityChange && <li><span><b>{capacityChange.actor.name}</b> changed launch capacity <strong>{fixtureWorkspace.decision.launchCapacityEngineerDays} → {workspace.decision.launchCapacityEngineerDays}</strong>.</span></li>}
        {preparation && <li><span><b>{preparation.actor.name}</b> prepared <strong>{preparedOptionLabel}</strong> via WebMCP.</span></li>}
        {ratification && <li><span><b>{ratification.actor.name}</b> ratified it in the ordinary UI.</span></li>}
      </ol>
    </article>
  );
}

function provenanceAction(event: WorkspaceView["provenance"][number]) {
  if (event.toolName) return event.toolName.replaceAll("_", " ");
  if (event.reviewStatus === "RATIFIED") return "ratified decision";
  return "updated workspace";
}

function ProvenanceRibbon({ workspace }: { workspace: WorkspaceView }) {
  return <footer className="provenance-ribbon"><span className="mono">provenance</span><span>Seed fixture</span>{workspace.provenance.map((event) => <span className="provenance-actor" key={event.id}><i /><span><b>{event.actor.name}</b><small>{event.origin === "WEBMCP" ? "WebMCP" : "ordinary UI"} · {provenanceAction(event)} · rev {event.baseRevision} → {event.resultingRevision}</small></span></span>)}<span className="mono provenance-revision">revision 7 → {workspace.revision}</span></footer>;
}

function JordanWorkspace({ actionMessage, busy, compiled, onCapacityChange, workspace }: {
  actionMessage: string | null;
  busy: boolean;
  compiled: CompiledCapabilities;
  onCapacityChange: () => void;
  workspace: WorkspaceView;
}) {
  const canChange = workspace.revision === 7 && workspace.decision.launchCapacityEngineerDays === 18;
  return (
    <main className="product-shell jordan-shell">
      <Topbar member="JORDAN" workspace={workspace} />
      <section className="workspace" id="workspace">
        <div className="member-banner"><span className="avatar jordan">JL</span><div><div className="section-kicker">Attributed collaborator window</div><strong>Jordan Lee · Engineering Lead</strong><p>This tab inherited Jordan’s session storage from the same-origin opener, erased its non-secret join marker, then severed the opener. Joining did not reset the workspace.</p></div></div>
        <DecisionHeading workspace={workspace} />
        <div className="jordan-grid"><DecisionContext workspace={workspace} /><article className="panel capacity-action-card"><div className="section-kicker">Ordinary human UI action</div><h2>Incident rotation changes the feasible scope.</h2><div className="capacity-delta"><div><span>Current</span><b>{workspace.decision.launchCapacityEngineerDays}d</b></div><i>→</i><div><span>After rotation</span><b>14d</b></div></div><p>Reason: <strong>Four-day incident rotation</strong>. This POST is attributed to Jordan and advances the shared workspace exactly once.</p><button className="primary-button" disabled={!canChange || busy} onClick={onCapacityChange} type="button">{busy ? "Applying real update…" : canChange ? "Apply 18 → 14 capacity change" : "Capacity update already applied"}</button>{actionMessage && <div className="action-message" role="status">{actionMessage}</div>}</article></div>
        <article className="panel jordan-status-card"><div><div className="section-kicker">Shared state</div><h2>{stateLabel[workspace.decision.state]} at revision {workspace.revision}</h2></div><div className="capability-meta"><span className="mono">epoch {compiled.contextEpoch}</span><span className="mono">authorized SSE + polling fallback</span></div></article>
      </section>
    </main>
  );
}
