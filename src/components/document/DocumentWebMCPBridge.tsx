"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type {
  DocumentServicePort,
  DocumentSurface,
} from "../../document/contracts";
import { detectModelContext } from "../../webmcp/detect";
import {
  DocumentWebMCPRegistrationManager,
  emptyDocumentRegistrationDiff,
  makeDocumentRegistrationContextKey,
} from "../../webmcp/document-registration";
import type {
  DocumentWebMCPBridgeStatus,
  DocumentWebMCPRuntimeDependencies,
  DocumentWebMCPToolName,
  MutableDocumentWebMCPRuntimeRef,
} from "../../webmcp/document-types";

export interface DocumentWebMCPBridgeProps {
  surface: DocumentSurface;
  sessionInstanceId: string;
  agentSessionToken: string;
  selfMemberId: string;
  service: DocumentServicePort;
  onStatusChange?: (status: DocumentWebMCPBridgeStatus) => void;
  onAuthoritativeSurface?: (surface: DocumentSurface) => void;
  onToolExecutionChange?: (tool: "apply_agent_annotation" | null) => void;
}

/**
 * Mirrors the page-owned shared-document surface into a separate native WebMCP catalog.
 * It renders no UI and remains inert when neither modelContext namespace is present.
 */
export function DocumentWebMCPBridge({
  surface,
  sessionInstanceId,
  agentSessionToken,
  selfMemberId,
  service,
  onStatusChange,
  onAuthoritativeSurface,
  onToolExecutionChange,
}: DocumentWebMCPBridgeProps) {
  const latest = useRef({
    surface,
    sessionInstanceId,
    agentSessionToken,
    selfMemberId,
  }) as MutableDocumentWebMCPRuntimeRef;
  const managerRef = useRef<DocumentWebMCPRegistrationManager | null>(null);
  const namespaceRef = useRef<DocumentWebMCPBridgeStatus["namespace"]>("unsupported");
  const statusCallbackRef = useRef(onStatusChange);
  const authoritativeCallbackRef = useRef(onAuthoritativeSurface);
  const executionCallbackRef = useRef(onToolExecutionChange);
  const activeApplyExecutionsRef = useRef(0);
  const hasOwnedPendingAnnotation = surface.annotations.some(
    (annotation) =>
      annotation.status === "PENDING" && annotation.createdBy.memberId === selfMemberId,
  );
  const registrationSurfaceKey = useMemo(
    () => JSON.stringify([surface.document.id, hasOwnedPendingAnnotation]),
    [hasOwnedPendingAnnotation, surface.document.id],
  );

  useLayoutEffect(() => {
    latest.current = { surface, sessionInstanceId, agentSessionToken, selfMemberId };
    statusCallbackRef.current = onStatusChange;
    authoritativeCallbackRef.current = onAuthoritativeSurface;
    executionCallbackRef.current = onToolExecutionChange;
  });

  useEffect(() => {
    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;
    if (!detected.context) {
      statusCallbackRef.current?.({
        namespace: "unsupported",
        supported: false,
        registeredTools: [],
        lastDiff: emptyDocumentRegistrationDiff(),
      });
      return;
    }

    const dependencies: DocumentWebMCPRuntimeDependencies = {
      latest,
      service,
      onAuthoritativeSurface: (nextSurface) => {
        authoritativeCallbackRef.current?.(nextSurface);
        const manager = managerRef.current;
        if (!manager) return;
        const current = latest.current;
        const key = makeDocumentRegistrationContextKey(
          current.surface.document.id,
          current.sessionInstanceId,
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
              lastDiff: emptyDocumentRegistrationDiff(),
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      },
      onToolExecutionChange: (tool: DocumentWebMCPToolName | null) => {
        if (tool === "apply_agent_annotation") {
          activeApplyExecutionsRef.current += 1;
          if (activeApplyExecutionsRef.current === 1) {
            executionCallbackRef.current?.("apply_agent_annotation");
          }
          return;
        }
        activeApplyExecutionsRef.current = Math.max(
          0,
          activeApplyExecutionsRef.current - 1,
        );
        if (activeApplyExecutionsRef.current === 0) executionCallbackRef.current?.(null);
      },
    };
    const manager = new DocumentWebMCPRegistrationManager(detected.context, dependencies);
    managerRef.current = manager;
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: emptyDocumentRegistrationDiff(),
    });

    return () => {
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      activeApplyExecutionsRef.current = 0;
      executionCallbackRef.current?.(null);
    };
  }, [service]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const current = latest.current;
    const key = makeDocumentRegistrationContextKey(
      current.surface.document.id,
      current.sessionInstanceId,
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
          lastDiff: emptyDocumentRegistrationDiff(),
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      superseded = true;
    };
  }, [
    agentSessionToken,
    registrationSurfaceKey,
    selfMemberId,
    service,
    sessionInstanceId,
  ]);

  return null;
}

export type { DocumentWebMCPBridgeStatus } from "../../webmcp/document-types";
