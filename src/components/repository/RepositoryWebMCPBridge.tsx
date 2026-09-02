"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type {
  RelayBrowserClientPort,
  RelayWorkspaceState,
} from "../../agent-relay/contracts";
import {
  RelayBrowserRuntime,
  RelayHttpClient,
  createDOMRelayBrowserEnvironment,
  unavailableRelayStatus,
  type RelayBrowserRuntimeStatus,
} from "../../agent-relay/browser";
import type {
  IssueAgentProfile,
  IssueWorkspaceSurface,
  RepositoryBrowserClientPort,
} from "../../repository/contracts";
import { reconcileIssueSurface } from "../../repository/surface-reconciliation";
import {
  asStandardWebMCPConsumer,
  detectModelContext,
} from "../../webmcp/detect";
import { RepositoryActivitySignal } from "../../webmcp/repository-activity-signal";
import {
  emptyRepositoryRegistrationDiff,
  makeRepositoryRegistrationContextKey,
  RepositoryWebMCPRegistrationManager,
} from "../../webmcp/repository-registration";
import type {
  MutableRepositoryWebMCPRuntimeRef,
  RepositoryWebMCPBridgeStatus,
  RepositoryWebMCPRuntimeDependencies,
} from "../../webmcp/repository-types";

export interface RepositoryWebMCPBridgeProps {
  surface: IssueWorkspaceSurface;
  sessionInstanceId: string;
  agentSessionToken: string;
  selfMemberId: string;
  service: RepositoryBrowserClientPort;
  onStatusChange?: (status: RepositoryWebMCPBridgeStatus) => void;
  onAuthoritativeSurface?: (surface: IssueWorkspaceSurface) => void;
  onAgentConnectionChange?: (profile: IssueAgentProfile | null) => void;
  onToolExecutionChange?: (
    tool: "wait_for_my_tasks" | "comment_on_task" | "submit_task_result" | null,
  ) => void;
  /** Human session authority for the application-owned managed Relay sidecar. */
  relaySessionToken?: string;
  /** Optional injected client for tests or an alternate checked same-origin adapter. */
  relayClient?: RelayBrowserClientPort;
  /** Increment after a managed mention or explicit Retry to wake dispatch immediately. */
  relayWakeSignal?: number;
  /** Increment only after a human confirms the bounded second attempt. */
  relayRetrySignal?: number;
  onRelayStateChange?: (state: RelayWorkspaceState | null) => void;
  onRelayRuntimeStatus?: (status: RelayBrowserRuntimeStatus) => void;
}

function createPageSessionId(identityKey: string): string {
  void identityKey;
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("A cryptographic page session ID is required for repository WebMCP.");
  }
  return globalThis.crypto.randomUUID();
}

/** Browser-only, UI-free registration boundary for one mounted v4 issue page. */
export function RepositoryWebMCPBridge({
  surface,
  sessionInstanceId,
  agentSessionToken,
  selfMemberId,
  service,
  onStatusChange,
  onAuthoritativeSurface,
  onAgentConnectionChange,
  onToolExecutionChange,
  relaySessionToken,
  relayClient,
  relayWakeSignal = 0,
  relayRetrySignal = 0,
  onRelayStateChange,
  onRelayRuntimeStatus,
}: RepositoryWebMCPBridgeProps) {
  const identityKey = JSON.stringify([
    surface.document.id,
    surface.document.protocolVersion,
    sessionInstanceId,
    agentSessionToken,
    selfMemberId,
    relaySessionToken ?? null,
  ]);
  const pageSessionId = useMemo(() => createPageSessionId(identityKey), [identityKey]);
  const latest = useRef({
    surface,
    sessionInstanceId,
    pageSessionId,
    agentSessionToken,
    selfMemberId,
  }) as MutableRepositoryWebMCPRuntimeRef;
  const connectionRef = useRef<IssueAgentProfile | null>(null);
  const managerRef = useRef<RepositoryWebMCPRegistrationManager | null>(null);
  const relayRuntimeRef = useRef<RelayBrowserRuntime | null>(null);
  const relayClientRef = useRef<RelayBrowserClientPort | null>(null);
  const relayStateReadControllerRef = useRef<AbortController | null>(null);
  const activitySignalRef = useRef<RepositoryActivitySignal | null>(null);
  const namespaceRef = useRef<RepositoryWebMCPBridgeStatus["namespace"]>("unsupported");
  const unsupportedIdentityRef = useRef<string | null>(null);
  const statusCallbackRef = useRef(onStatusChange);
  const authoritativeCallbackRef = useRef(onAuthoritativeSurface);
  const connectionCallbackRef = useRef(onAgentConnectionChange);
  const executionCallbackRef = useRef(onToolExecutionChange);
  const relayStateCallbackRef = useRef(onRelayStateChange);
  const relayStatusCallbackRef = useRef(onRelayRuntimeStatus);
  const previousRelayRetrySignalRef = useRef(relayRetrySignal);

  const registrationSurfaceKey = JSON.stringify([
    surface.document.id,
    surface.document.protocolVersion,
  ]);

  useLayoutEffect(() => {
    const previousSurface = latest.current.surface;
    const sameDocument =
      previousSurface.document.id === surface.document.id
      && previousSurface.document.protocolVersion
        === surface.document.protocolVersion;
    const reconciledSurface = sameDocument
      ? reconcileIssueSurface(previousSurface, surface)
      : surface;
    latest.current = {
      surface: reconciledSurface,
      sessionInstanceId,
      pageSessionId,
      agentSessionToken,
      selfMemberId,
    };
    activitySignalRef.current?.observe(
      reconciledSurface.document.activityVersion,
    );
    statusCallbackRef.current = onStatusChange;
    authoritativeCallbackRef.current = onAuthoritativeSurface;
    connectionCallbackRef.current = onAgentConnectionChange;
    executionCallbackRef.current = onToolExecutionChange;
    relayStateCallbackRef.current = onRelayStateChange;
    relayStatusCallbackRef.current = onRelayRuntimeStatus;

    // Report the ordinary-browser state before paint. React may defer passive effects
    // while navigation settles, but the human UI must never imply that absent tools are
    // still connecting indefinitely.
    const detected = detectModelContext();
    if (!detected.context && unsupportedIdentityRef.current !== identityKey) {
      unsupportedIdentityRef.current = identityKey;
      namespaceRef.current = "unsupported";
      statusCallbackRef.current?.({
        namespace: "unsupported",
        supported: false,
        registeredTools: [],
        lastDiff: emptyRepositoryRegistrationDiff(),
      });
    }
  });

  useEffect(() => {
    connectionRef.current = null;
    connectionCallbackRef.current?.(null);
    const activitySignal = new RepositoryActivitySignal(
      latest.current.surface.document.activityVersion,
    );
    const activeWaitKeys = new Set<string>();
    activitySignalRef.current = activitySignal;
    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;
    const activeRelayClient = relayClient ?? (relaySessionToken
      ? new RelayHttpClient({
          humanSessionToken: relaySessionToken,
          origin: window.location.origin,
        })
      : null);
    relayClientRef.current = activeRelayClient;
    const consumerContext = asStandardWebMCPConsumer(detected);
    if (!detected.context) {
      if (!activeRelayClient) relayStateCallbackRef.current?.(null);
      relayStatusCallbackRef.current?.(unavailableRelayStatus());
      return () => {
        relayStateReadControllerRef.current?.abort("Repository session changed");
        relayStateReadControllerRef.current = null;
        if (relayClientRef.current === activeRelayClient) relayClientRef.current = null;
        connectionRef.current = null;
        connectionCallbackRef.current?.(null);
        if (activitySignalRef.current === activitySignal) {
          activitySignalRef.current = null;
        }
        activitySignal.close("Repository session changed");
        activeWaitKeys.clear();
      };
    }

    const dependencies: RepositoryWebMCPRuntimeDependencies = {
      latest,
      connection: connectionRef,
      service,
      activitySignal,
      activeWaitKeys,
      onAuthoritativeSurface: (nextSurface) => {
        authoritativeCallbackRef.current?.(nextSurface);
      },
      onAgentConnectionChange: (profile) => {
        connectionCallbackRef.current?.(profile);
      },
      onToolExecutionChange: (tool) => executionCallbackRef.current?.(tool),
    };
    const manager = new RepositoryWebMCPRegistrationManager(
      detected.context,
      dependencies,
    );
    managerRef.current = manager;
    let relayRuntime: RelayBrowserRuntime | null = null;
    if (activeRelayClient && consumerContext) {
      try {
        relayRuntime = new RelayBrowserRuntime({
          context: consumerContext,
          client: activeRelayClient,
          pageSessionId,
          environment: createDOMRelayBrowserEnvironment(),
          idleCatalog: {
            withdraw: async (reason) => {
              const lastDiff = await manager.suspend(reason);
              statusCallbackRef.current?.({
                namespace: namespaceRef.current,
                supported: true,
                registeredTools: manager.registeredTools,
                lastDiff,
              });
              return lastDiff;
            },
            restore: async () => {
              manager.resume();
              const current = latest.current;
              const key = makeRepositoryRegistrationContextKey(
                current.surface.document.id,
                current.surface.document.protocolVersion,
                current.sessionInstanceId,
                current.pageSessionId,
                current.agentSessionToken,
                current.selfMemberId,
              );
              const lastDiff = await manager.reconcile(
                current.surface,
                current.selfMemberId,
                key,
              );
              statusCallbackRef.current?.({
                namespace: namespaceRef.current,
                supported: true,
                registeredTools: manager.registeredTools,
                lastDiff,
              });
              return lastDiff;
            },
          },
          onStateChange: (state) => relayStateCallbackRef.current?.(state),
          onStatusChange: (status) => relayStatusCallbackRef.current?.(status),
        });
        relayRuntimeRef.current = relayRuntime;
        relayRuntime.start();
      } catch {
        relayStatusCallbackRef.current?.(unavailableRelayStatus());
      }
    } else {
      if (!activeRelayClient) relayStateCallbackRef.current?.(null);
      relayStatusCallbackRef.current?.(unavailableRelayStatus());
    }
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: emptyRepositoryRegistrationDiff(),
    });

    return () => {
      relayStateReadControllerRef.current?.abort("Repository session changed");
      relayStateReadControllerRef.current = null;
      if (relayClientRef.current === activeRelayClient) relayClientRef.current = null;
      void relayRuntime?.dispose();
      if (relayRuntimeRef.current === relayRuntime) relayRuntimeRef.current = null;
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      if (activitySignalRef.current === activitySignal) {
        activitySignalRef.current = null;
      }
      activitySignal.close("Repository session changed");
      activeWaitKeys.clear();
      executionCallbackRef.current?.(null);
    };
  }, [identityKey, pageSessionId, relayClient, relaySessionToken, service]);

  useEffect(() => {
    const runtime = relayRuntimeRef.current;
    if (runtime) {
      runtime.wake();
      return;
    }
    const client = relayClientRef.current;
    if (!client) return;
    relayStateReadControllerRef.current?.abort("Relay state refresh superseded");
    const controller = new AbortController();
    relayStateReadControllerRef.current = controller;
    void client.readState(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted && result.ok) {
          relayStateCallbackRef.current?.(result.data);
        }
      },
      () => undefined,
    );
    return () => {
      controller.abort("Relay state refresh superseded");
      if (relayStateReadControllerRef.current === controller) {
        relayStateReadControllerRef.current = null;
      }
    };
  }, [
    identityKey,
    relayClient,
    relayWakeSignal,
    surface.document.activityVersion,
  ]);

  useEffect(() => {
    if (previousRelayRetrySignalRef.current === relayRetrySignal) return;
    previousRelayRetrySignalRef.current = relayRetrySignal;
    const runtime = relayRuntimeRef.current;
    if (runtime) {
      runtime.retry();
      return;
    }
    const client = relayClientRef.current;
    if (!client) return;
    relayStateReadControllerRef.current?.abort("Relay retry state refresh superseded");
    const controller = new AbortController();
    relayStateReadControllerRef.current = controller;
    void client.readState(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted && result.ok) relayStateCallbackRef.current?.(result.data);
      },
      () => undefined,
    );
    return () => {
      controller.abort("Relay retry state refresh superseded");
      if (relayStateReadControllerRef.current === controller) relayStateReadControllerRef.current = null;
    };
  }, [identityKey, relayRetrySignal]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    let superseded = false;
    let retryTimer: number | null = null;
    let failedAttempts = 0;
    const maximumAttempts = 3;

    const reconcile = () => {
      const current = latest.current;
      const key = makeRepositoryRegistrationContextKey(
        current.surface.document.id,
        current.surface.document.protocolVersion,
        current.sessionInstanceId,
        current.pageSessionId,
        current.agentSessionToken,
        current.selfMemberId,
      );
      void manager.reconcile(current.surface, current.selfMemberId, key).then(
        (lastDiff) => {
          if (superseded) return;
          statusCallbackRef.current?.({
            namespace: namespaceRef.current,
            supported: true,
            registeredTools: manager.registeredTools,
            lastDiff,
          });
        },
        (error: unknown) => {
          if (superseded) return;
          failedAttempts += 1;
          statusCallbackRef.current?.({
            namespace: namespaceRef.current,
            supported: true,
            registeredTools: manager.registeredTools,
            lastDiff: emptyRepositoryRegistrationDiff(),
            error: error instanceof Error ? error.message : String(error),
          });
          if (failedAttempts < maximumAttempts) {
            retryTimer = window.setTimeout(reconcile, 500 * 2 ** (failedAttempts - 1));
          }
        },
      );
    };

    reconcile();
    return () => {
      superseded = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    agentSessionToken,
    pageSessionId,
    registrationSurfaceKey,
    selfMemberId,
    service,
    sessionInstanceId,
  ]);

  return null;
}

export type { RepositoryWebMCPBridgeStatus } from "../../webmcp/repository-types";
