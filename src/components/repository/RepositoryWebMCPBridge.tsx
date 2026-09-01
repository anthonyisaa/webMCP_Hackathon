"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type {
  IssueWorkspaceSurface,
  RepositoryBrowserClientPort,
} from "../../repository/contracts";
import { reconcileIssueSurface } from "../../repository/surface-reconciliation";
import { detectModelContext } from "../../webmcp/detect";
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
  onToolExecutionChange?: (
    tool: "wait_for_my_tasks" | "comment_on_task" | "submit_task_result" | null,
  ) => void;
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
  onToolExecutionChange,
}: RepositoryWebMCPBridgeProps) {
  const identityKey = JSON.stringify([
    surface.document.id,
    surface.document.protocolVersion,
    sessionInstanceId,
    agentSessionToken,
    selfMemberId,
  ]);
  const pageSessionId = useMemo(() => createPageSessionId(identityKey), [identityKey]);
  const latest = useRef({
    surface,
    sessionInstanceId,
    pageSessionId,
    agentSessionToken,
    selfMemberId,
  }) as MutableRepositoryWebMCPRuntimeRef;
  const managerRef = useRef<RepositoryWebMCPRegistrationManager | null>(null);
  const activitySignalRef = useRef<RepositoryActivitySignal | null>(null);
  const namespaceRef = useRef<RepositoryWebMCPBridgeStatus["namespace"]>("unsupported");
  const unsupportedIdentityRef = useRef<string | null>(null);
  const statusCallbackRef = useRef(onStatusChange);
  const authoritativeCallbackRef = useRef(onAuthoritativeSurface);
  const executionCallbackRef = useRef(onToolExecutionChange);

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
    executionCallbackRef.current = onToolExecutionChange;

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
    const activitySignal = new RepositoryActivitySignal(
      latest.current.surface.document.activityVersion,
    );
    const activeWaitKeys = new Set<string>();
    activitySignalRef.current = activitySignal;
    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;
    if (!detected.context) {
      return () => {
        if (activitySignalRef.current === activitySignal) {
          activitySignalRef.current = null;
        }
        activitySignal.close("Repository session changed");
        activeWaitKeys.clear();
      };
    }

    const dependencies: RepositoryWebMCPRuntimeDependencies = {
      latest,
      service,
      activitySignal,
      activeWaitKeys,
      onAuthoritativeSurface: (nextSurface) => {
        authoritativeCallbackRef.current?.(nextSurface);
      },
      onToolExecutionChange: (tool) => executionCallbackRef.current?.(tool),
    };
    const manager = new RepositoryWebMCPRegistrationManager(
      detected.context,
      dependencies,
    );
    managerRef.current = manager;
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: emptyRepositoryRegistrationDiff(),
    });

    return () => {
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      if (activitySignalRef.current === activitySignal) {
        activitySignalRef.current = null;
      }
      activitySignal.close("Repository session changed");
      activeWaitKeys.clear();
      executionCallbackRef.current?.(null);
    };
  }, [identityKey, service]);

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
