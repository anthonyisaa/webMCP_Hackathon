"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import type {
  CompiledCapabilities,
  MemberRole,
  RatiflowServicePort,
  WorkspaceView,
} from "../../contracts/index";
import {
  WebMCPRegistrationManager,
  detectModelContext,
  makeRegistrationContextKey,
  type MutableWebMCPRuntimeRef,
  type RegistrationDiff,
  type WebMCPBridgeStatus,
} from "../../webmcp";

export interface WebMCPBridgeProps {
  /** The exact compiled object also rendered by the page's Capability Field. */
  compiled: CompiledCapabilities;
  workspace: WorkspaceView;
  memberRole: MemberRole;
  memberSessionInstanceId: string;
  sessionToken: string;
  service: RatiflowServicePort;
  onStatusChange?: (status: WebMCPBridgeStatus) => void;
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

/**
 * Imperatively mirrors one page-owned CompiledCapabilities object into native WebMCP.
 * It intentionally renders no UI and remains safe when neither namespace is present.
 */
export function WebMCPBridge({
  compiled,
  workspace,
  memberRole,
  memberSessionInstanceId,
  sessionToken,
  service,
  onStatusChange,
  onAuthoritativeSnapshot,
}: WebMCPBridgeProps) {
  const latest = useRef({
    compiled,
    workspace,
    memberRole,
    memberSessionInstanceId,
    sessionToken,
  }) as MutableWebMCPRuntimeRef;
  const managerRef = useRef<WebMCPRegistrationManager | null>(null);
  const namespaceRef = useRef<WebMCPBridgeStatus["namespace"]>("unsupported");
  const statusCallbackRef = useRef(onStatusChange);
  const authoritativeCallbackRef = useRef(onAuthoritativeSnapshot);

  useLayoutEffect(() => {
    latest.current = {
      compiled,
      workspace,
      memberRole,
      memberSessionInstanceId,
      sessionToken,
    };
    statusCallbackRef.current = onStatusChange;
    authoritativeCallbackRef.current = onAuthoritativeSnapshot;
  });

  useEffect(() => {
    const detected = detectModelContext();
    namespaceRef.current = detected.namespace;

    if (!detected.context) {
      statusCallbackRef.current?.({
        namespace: "unsupported",
        supported: false,
        registeredTools: [],
        lastDiff: EMPTY_DIFF,
      });
      return;
    }

    const manager = new WebMCPRegistrationManager(detected.context, {
      latest,
      service,
      onAuthoritativeSnapshot: (nextWorkspace, nextCompiled) => {
        authoritativeCallbackRef.current?.(nextWorkspace, nextCompiled);
        const key = makeRegistrationContextKey(
          latest.current.memberSessionInstanceId,
          nextCompiled.contextEpoch,
        );
        void managerRef.current?.reconcile(nextCompiled, key).then(
          (lastDiff) => {
            statusCallbackRef.current?.({
              namespace: namespaceRef.current,
              supported: true,
              registeredTools: managerRef.current?.registeredTools ?? [],
              lastDiff,
            });
          },
          (error: unknown) => {
            statusCallbackRef.current?.({
              namespace: namespaceRef.current,
              supported: true,
              registeredTools: managerRef.current?.registeredTools ?? [],
              lastDiff: EMPTY_DIFF,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      },
    });
    managerRef.current = manager;
    statusCallbackRef.current?.({
      namespace: detected.namespace,
      supported: true,
      registeredTools: [],
      lastDiff: EMPTY_DIFF,
    });

    return () => {
      manager.dispose();
      if (managerRef.current === manager) managerRef.current = null;
    };
  }, [service]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    const current = latest.current;
    const registrationContextKey = makeRegistrationContextKey(
      current.memberSessionInstanceId,
      current.compiled.contextEpoch,
    );
    let superseded = false;

    void manager.reconcile(current.compiled, registrationContextKey).then(
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
          lastDiff: EMPTY_DIFF,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );

    return () => {
      superseded = true;
    };
  }, [compiled.signature, compiled.contextEpoch, memberSessionInstanceId]);

  return null;
}
