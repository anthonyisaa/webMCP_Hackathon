"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type {
  DocumentSurfaceV3,
  DocumentV3ServicePort,
} from "../../document/contracts";
import { detectModelContext } from "../../webmcp/detect";
import { DocumentWorkspaceActivitySignal } from "../../webmcp/document-workspace-activity-signal";
import {
  DocumentWorkspaceWebMCPRegistrationManager,
  emptyDocumentWorkspaceRegistrationDiff,
  makeDocumentWorkspaceRegistrationContextKey,
} from "../../webmcp/document-workspace-registration";
import type {
  DocumentWorkspaceWebMCPBridgeStatus,
  DocumentWorkspaceWebMCPRuntimeDependencies,
  MutableDocumentWorkspaceWebMCPRuntimeRef,
} from "../../webmcp/document-workspace-types";

export interface DocumentWorkspaceWebMCPBridgeProps {
  surface: DocumentSurfaceV3;
  sessionInstanceId: string;
  agentSessionToken: string;
  selfMemberId: string;
  service: DocumentV3ServicePort;
  onStatusChange?: (status: DocumentWorkspaceWebMCPBridgeStatus) => void;
  onAuthoritativeSurface?: (surface: DocumentSurfaceV3) => void;
  onToolExecutionChange?: (
    tool: "submit_work_proposal" | "wait_for_my_work" | null,
  ) => void;
}

function createPageSessionId(identityKey: string): string {
  // The identity is intentionally part of this resource's lifetime even though
  // the generated bearer value contains no identity material.
  void identityKey;
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("A cryptographic page session ID is required for document WebMCP.");
  }
  return globalThis.crypto.randomUUID();
}

/** Browser-only, UI-free v3 document workspace registration boundary. */
export function DocumentWorkspaceWebMCPBridge({
  surface,
  sessionInstanceId,
  agentSessionToken,
  selfMemberId,
  service,
  onStatusChange,
  onAuthoritativeSurface,
  onToolExecutionChange,
}: DocumentWorkspaceWebMCPBridgeProps) {
  const identityKey = JSON.stringify([
    surface.document.id,
    surface.document.protocolVersion,
    sessionInstanceId,
    agentSessionToken,
    selfMemberId,
  ]);
  const pageSessionId = useMemo(
    () => createPageSessionId(identityKey),
    [identityKey],
  );
  const latest = useRef({
    surface,
    sessionInstanceId,
    pageSessionId,
    agentSessionToken,
    selfMemberId,
  }) as MutableDocumentWorkspaceWebMCPRuntimeRef;
  const managerRef =
    useRef<DocumentWorkspaceWebMCPRegistrationManager | null>(null);
  const activitySignalRef = useRef<DocumentWorkspaceActivitySignal | null>(null);
  const namespaceRef =
    useRef<DocumentWorkspaceWebMCPBridgeStatus["namespace"]>("unsupported");
  const statusCallbackRef = useRef(onStatusChange);
  const authoritativeCallbackRef = useRef(onAuthoritativeSurface);
  const executionCallbackRef = useRef(onToolExecutionChange);

  const hasAssignedPendingWork = surface.workOrders.some(
    (order) =>
      order.status === "PENDING" && order.assignedToMemberId === selfMemberId,
  );
  const registrationSurfaceKey = JSON.stringify([
    surface.document.id,
    surface.document.protocolVersion,
    hasAssignedPendingWork,
  ]);

  useLayoutEffect(() => {
    latest.current = {
      surface,
      sessionInstanceId,
      pageSessionId,
      agentSessionToken,
      selfMemberId,
    };
    activitySignalRef.current?.observe(surface.document.activityVersion);
    statusCallbackRef.current = onStatusChange;
    authoritativeCallbackRef.current = onAuthoritativeSurface;
    executionCallbackRef.current = onToolExecutionChange;
  });

  useEffect(() => {
    // Effect-scoped resources survive React Strict Mode's development replay: the
    // replayed setup gets a fresh, open signal after the prior setup closes its own.
    const activitySignal = new DocumentWorkspaceActivitySignal(
      latest.current.surface.document.activityVersion,
    );
    const activeWaitKeys = new Set<string>();
    activitySignalRef.current = activitySignal;
    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;
    if (!detected.context) {
      statusCallbackRef.current?.({
        namespace: "unsupported",
        supported: false,
        registeredTools: [],
        lastDiff: emptyDocumentWorkspaceRegistrationDiff(),
      });
      return () => {
        if (activitySignalRef.current === activitySignal) {
          activitySignalRef.current = null;
        }
        activitySignal.close("Document workspace session changed");
        activeWaitKeys.clear();
      };
    }

    const dependencies: DocumentWorkspaceWebMCPRuntimeDependencies = {
      latest,
      service,
      activitySignal,
      activeWaitKeys,
      onAuthoritativeSurface: (nextSurface) => {
        authoritativeCallbackRef.current?.(nextSurface);
        const manager = managerRef.current;
        if (!manager) return;
        const current = latest.current;
        const key = makeDocumentWorkspaceRegistrationContextKey(
          current.surface.document.id,
          current.surface.document.protocolVersion,
          current.sessionInstanceId,
          current.pageSessionId,
          current.agentSessionToken,
          current.selfMemberId,
        );
        void manager.reconcile(nextSurface, current.selfMemberId, key).then(
          (lastDiff) => {
            statusCallbackRef.current?.({
              namespace: namespaceRef.current,
              supported: true,
              registeredTools: manager.registeredTools,
              lastDiff,
            });
          },
          (error: unknown) => {
            statusCallbackRef.current?.({
              namespace: namespaceRef.current,
              supported: true,
              registeredTools: manager.registeredTools,
              lastDiff: emptyDocumentWorkspaceRegistrationDiff(),
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      },
      onToolExecutionChange: (tool) => executionCallbackRef.current?.(tool),
    };
    const manager = new DocumentWorkspaceWebMCPRegistrationManager(
      detected.context,
      dependencies,
    );
    managerRef.current = manager;
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: emptyDocumentWorkspaceRegistrationDiff(),
    });

    return () => {
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      if (activitySignalRef.current === activitySignal) {
        activitySignalRef.current = null;
      }
      activitySignal.close("Document workspace session changed");
      activeWaitKeys.clear();
      executionCallbackRef.current?.(null);
    };
  }, [identityKey, service]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const current = latest.current;
    const key = makeDocumentWorkspaceRegistrationContextKey(
      current.surface.document.id,
      current.surface.document.protocolVersion,
      current.sessionInstanceId,
      current.pageSessionId,
      current.agentSessionToken,
      current.selfMemberId,
    );
    let superseded = false;
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
        statusCallbackRef.current?.({
          namespace: namespaceRef.current,
          supported: true,
          registeredTools: manager.registeredTools,
          lastDiff: emptyDocumentWorkspaceRegistrationDiff(),
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      superseded = true;
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

export type { DocumentWorkspaceWebMCPBridgeStatus } from "../../webmcp/document-workspace-types";
