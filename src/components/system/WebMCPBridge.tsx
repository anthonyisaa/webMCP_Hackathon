"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  AgentEngagementMode,
  AgentRegistryProjection,
  AgentToolRegistryPort,
  CompiledCapabilities,
  MemberRole,
  RatiflowServicePort,
  WorkspaceView,
} from "../../contracts/index";
import {
  ActivitySignalHub,
  AgentToolRegistry,
  LiveWebMCPRegistrationManager,
  detectModelContext,
  makeRegistrationContextKey,
  registeredToolNames,
  type BrowserEngagementUpdate,
  type MutableWebMCPRuntimeRef,
  type RegistrationDiff,
  type WebMCPBridgeStatus,
  type WebMCPRegistrationMode,
} from "../../webmcp";

export interface WebMCPBridgeProps {
  /** The exact compiled object also rendered by the page's Capability Field. */
  compiled: CompiledCapabilities;
  workspace: WorkspaceView;
  memberRole: MemberRole;
  memberSessionInstanceId: string;
  /** The fixed agent's opaque membership token; never exposed in tool input/results. */
  sessionToken: string;
  /** Optional caller-owned cryptographically random page UUID. */
  pageSessionId?: string;
  service: RatiflowServicePort;
  registrationMode?: WebMCPRegistrationMode;
  onStatusChange?: (status: WebMCPBridgeStatus) => void;
  onEngagementModeChange?: (mode: AgentEngagementMode) => void;
  onPageSessionChange?: (pageSessionId: string) => void;
  onRegistryReady?: (registry: AgentToolRegistryPort | null) => void;
  onAuthoritativeSnapshot?: (
    workspace: WorkspaceView,
    compiled: CompiledCapabilities,
  ) => void;
}

const EMPTY_DIFF: RegistrationDiff = {
  added: [],
  removed: [],
  retained: [],
  reRegistered: [],
};

const LIVE_LEASE_MS = 45_000;
const INVOKED_LEASE_MS = 120_000;

function freshPageSessionId(fallback: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallback;
}

/**
 * Owns the browser projection over one caller-neutral registry. It renders no UI;
 * status callbacks expose the adapter's actual registrations without reconstruction.
 */
export function WebMCPBridge({
  compiled,
  workspace,
  memberRole,
  memberSessionInstanceId,
  sessionToken,
  pageSessionId,
  service,
  registrationMode = "dynamic",
  onStatusChange,
  onEngagementModeChange,
  onPageSessionChange,
  onRegistryReady,
  onAuthoritativeSnapshot,
}: WebMCPBridgeProps) {
  const initialPageSessionId = pageSessionId ?? memberSessionInstanceId;
  const engagementKey = JSON.stringify([memberSessionInstanceId, pageSessionId]);
  const [engagementState, setEngagementState] = useState<{
    key: string;
    mode: AgentEngagementMode;
  }>({ key: engagementKey, mode: "FRESH" });
  const engagementMode =
    engagementState.key === engagementKey ? engagementState.mode : "FRESH";
  const latest = useRef({
    compiled,
    workspace,
    memberRole,
    memberSessionInstanceId,
    sessionToken,
    pageSessionId: initialPageSessionId,
  }) as MutableWebMCPRuntimeRef;
  const activePageSessionIdRef = useRef(initialPageSessionId);
  const engagementRef = useRef<AgentEngagementMode>("FRESH");
  const leaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const managerRef = useRef<LiveWebMCPRegistrationManager | null>(null);
  const registryRef = useRef<AgentToolRegistry | null>(null);
  const namespaceRef = useRef<WebMCPBridgeStatus["namespace"]>("unsupported");
  const statusCallbackRef = useRef(onStatusChange);
  const engagementCallbackRef = useRef(onEngagementModeChange);
  const pageSessionCallbackRef = useRef(onPageSessionChange);
  const registryCallbackRef = useRef(onRegistryReady);
  const authoritativeCallbackRef = useRef(onAuthoritativeSnapshot);

  useLayoutEffect(() => {
    latest.current = {
      compiled,
      workspace,
      memberRole,
      memberSessionInstanceId,
      sessionToken,
      pageSessionId: activePageSessionIdRef.current,
    };
    statusCallbackRef.current = onStatusChange;
    engagementCallbackRef.current = onEngagementModeChange;
    pageSessionCallbackRef.current = onPageSessionChange;
    registryCallbackRef.current = onRegistryReady;
    authoritativeCallbackRef.current = onAuthoritativeSnapshot;
  });

  const clearLeaseTimer = useCallback(() => {
    if (leaseTimerRef.current !== null) clearTimeout(leaseTimerRef.current);
    leaseTimerRef.current = null;
  }, []);

  const rotatePageSession = useCallback(() => {
    const next = freshPageSessionId(memberSessionInstanceId);
    activePageSessionIdRef.current = next;
    latest.current = { ...latest.current, pageSessionId: next };
    pageSessionCallbackRef.current?.(next);
  }, [memberSessionInstanceId]);

  const publishEngagement = useCallback((mode: AgentEngagementMode) => {
    engagementRef.current = mode;
    setEngagementState({ key: engagementKey, mode });
    engagementCallbackRef.current?.(mode);
  }, [engagementKey]);

  const armInvokedExpiry = useCallback(() => {
    clearLeaseTimer();
    leaseTimerRef.current = setTimeout(() => {
      rotatePageSession();
      publishEngagement("FRESH");
    }, INVOKED_LEASE_MS);
  }, [clearLeaseTimer, publishEngagement, rotatePageSession]);

  const applyEngagementUpdate = useCallback(
    (update: BrowserEngagementUpdate) => {
      if (update.rotatePageSession) rotatePageSession();
      publishEngagement(update.mode);
      clearLeaseTimer();
      if (!update.renew) return;
      if (update.mode === "LIVE") {
        leaseTimerRef.current = setTimeout(() => {
          publishEngagement("INVOKED");
          armInvokedExpiry();
        }, LIVE_LEASE_MS);
      } else if (update.mode === "INVOKED") {
        armInvokedExpiry();
      }
    },
    [armInvokedExpiry, clearLeaseTimer, publishEngagement, rotatePageSession],
  );

  useEffect(() => {
    const next = pageSessionId ?? freshPageSessionId(memberSessionInstanceId);
    activePageSessionIdRef.current = next;
    latest.current = { ...latest.current, pageSessionId: next };
    engagementRef.current = "FRESH";
    clearLeaseTimer();
    engagementCallbackRef.current?.("FRESH");
    pageSessionCallbackRef.current?.(next);
  }, [clearLeaseTimer, memberSessionInstanceId, pageSessionId]);

  useEffect(() => {
    const hub = new ActivitySignalHub(
      latest.current.workspace.collaboration?.cursor ?? null,
    );
    let unsubscribe: () => void = () => undefined;
    try {
      // Subscribe before any native registration so catch-up/check/park cannot
      // miss an event occurring during registration.
      unsubscribe = service.subscribe(sessionToken, (notice) => {
        if (typeof notice.activityCursor === "string") {
          hub.observe(notice.activityCursor);
        }
      });
    } catch {
      // Catch-up remains authoritative if this transport cannot open. A wait will
      // resolve by timeout until the bridge is reset or the transport reconnects.
    }

    const registry = new AgentToolRegistry({
      latest,
      service,
      activityHub: hub,
      bypassClientAvailabilityGate: registrationMode === "static-superset",
      onBrowserEngagementUpdate: applyEngagementUpdate,
      onAuthoritativeSnapshot: (nextWorkspace, nextCompiled) => {
        authoritativeCallbackRef.current?.(nextWorkspace, nextCompiled);
      },
    });
    registryRef.current = registry;
    registryCallbackRef.current?.(registry);

    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;
    if (!detected.context) {
      statusCallbackRef.current?.({
        namespace: "unsupported",
        supported: false,
        registeredTools: [],
        lastDiff: EMPTY_DIFF,
        engagementMode: engagementRef.current,
      });
      return () => {
        registryCallbackRef.current?.(null);
        registryRef.current = null;
        unsubscribe();
        hub.close("WebMCP bridge disposed");
      };
    }

    const manager = new LiveWebMCPRegistrationManager(
      detected.context,
      registry,
      latest,
    );
    managerRef.current = manager;
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: EMPTY_DIFF,
      engagementMode: engagementRef.current,
    });

    return () => {
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      registryCallbackRef.current?.(null);
      if (registryRef.current === registry) registryRef.current = null;
      unsubscribe();
      hub.close("WebMCP bridge disposed");
    };
  }, [applyEngagementUpdate, registrationMode, service, sessionToken]);

  useEffect(() => {
    const manager = managerRef.current;
    const registry = registryRef.current;
    if (!manager || !registry) return;

    const registrationCompiled = {
      ...compiled,
      availableTools: registeredToolNames(registrationMode, compiled),
    };
    const projection: AgentRegistryProjection = {
      caller: "BROWSER_AGENT",
      engagementMode,
      decisionCapabilities: registrationCompiled,
    };
    const sessionContextKey = JSON.stringify([memberSessionInstanceId]);
    const decisionContextKey = makeRegistrationContextKey(
      memberSessionInstanceId,
      compiled.contextEpoch,
    );
    let superseded = false;

    void manager
      .reconcile(projection, sessionContextKey, decisionContextKey)
      .then(
        (lastDiff) => {
          if (superseded) return;
          statusCallbackRef.current?.({
            namespace: namespaceRef.current,
            supported: true,
            registeredTools: manager.registeredTools,
            lastDiff,
            engagementMode,
          });
        },
        (error: unknown) => {
          if (superseded) return;
          statusCallbackRef.current?.({
            namespace: namespaceRef.current,
            supported: true,
            registeredTools: manager.registeredTools,
            lastDiff: EMPTY_DIFF,
            engagementMode,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );

    return () => {
      superseded = true;
    };
  }, [
    compiled.contextEpoch,
    compiled.signature,
    compiled,
    engagementMode,
    memberSessionInstanceId,
    registrationMode,
  ]);

  useEffect(() => clearLeaseTimer, [clearLeaseTimer]);

  return null;
}
