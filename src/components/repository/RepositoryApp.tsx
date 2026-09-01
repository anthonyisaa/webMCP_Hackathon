"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  IssueDocumentKind,
  IssueSessionBundle,
  IssueWorkspaceSurface,
  RepositoryFailure,
} from "@/repository/contracts";
import {
  REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX,
  decodeRepositoryBootstrap,
  readLastRepositoryShareToken,
  readRepositoryCredential,
  readRepositoryTabSession,
  removeRepositoryCredential,
  removeRepositoryTabSession,
  sessionFromRepositoryCredential,
  writeRepositoryCredential,
  writeRepositoryTabSession,
} from "@/repository/browser-storage";
import { reconcileIssueSurface } from "@/repository/surface-reconciliation";

import { RepositoryLanding } from "./RepositoryLanding";
import { RepositoryJoin } from "./RepositoryJoin";
import { repositoryHttpService } from "./repository-http-service";
import {
  RepositoryWorkspace,
  repositoryCanReceiveSessionResult,
  repositorySessionIdentity,
} from "./RepositoryWorkspace";

export interface RepositoryAppProps {
  shareToken?: string;
  startNew?: boolean;
}

type InitializationOutcome =
  | { kind: "LANDING"; error?: string }
  | { kind: "JOIN"; shareToken: string }
  | { kind: "READY"; session: IssueSessionBundle; replaceRoute: boolean }
  | { kind: "ERROR"; message: string };

interface BrowserStores {
  persistent: Storage | null;
  tab: Storage | null;
}

function browserStores(): BrowserStores {
  let persistent: Storage | null = null;
  let tab: Storage | null = null;
  try {
    persistent = window.localStorage;
  } catch {
    // The issue stays usable in this component when persistent storage is blocked.
  }
  try {
    tab = window.sessionStorage;
  } catch {
    // The in-memory session remains authoritative for this mounted page.
  }
  return { persistent, tab };
}

function failureMessage(failure: RepositoryFailure): string {
  return failure.message || "The document could not be opened. Please try again.";
}

function isExpiredCredential(failure: RepositoryFailure): boolean {
  return failure.code === "UNAUTHORIZED" || failure.code === "NOT_FOUND";
}

function clearBootstrapFragment(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function persistSession(bundle: IssueSessionBundle): void {
  const stores = browserStores();
  if (stores.tab) writeRepositoryTabSession(stores.tab, bundle);
  if (stores.persistent) writeRepositoryCredential(stores.persistent, bundle);
}

function clearSession(shareToken?: string): void {
  const stores = browserStores();
  if (stores.tab) removeRepositoryTabSession(stores.tab, shareToken);
  if (stores.persistent) removeRepositoryCredential(stores.persistent, shareToken);
}

async function inspectStoredSession(
  session: IssueSessionBundle,
): Promise<IssueSessionBundle | RepositoryFailure> {
  const inspected = await repositoryHttpService.inspect(session.humanSessionToken);
  if (!inspected.ok) return inspected;
  return {
    ...session,
    surface: reconcileIssueSurface(session.surface, inspected.data),
  };
}

async function initializeSharedIssue(
  shareToken: string,
): Promise<InitializationOutcome> {
  const stores = browserStores();
  const hasBootstrap = window.location.hash.startsWith(
    REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX,
  );
  const bootstrap = hasBootstrap
    ? decodeRepositoryBootstrap(window.location.hash, shareToken)
    : null;
  if (hasBootstrap) clearBootstrapFragment();

  if (bootstrap) {
    const resumed = await inspectStoredSession(bootstrap);
    if (!("ok" in resumed)) {
      persistSession(resumed);
      return { kind: "READY", session: resumed, replaceRoute: false };
    }
    if (!isExpiredCredential(resumed)) {
      return { kind: "ERROR", message: failureMessage(resumed) };
    }
  }

  const tabSession = stores.tab
    ? readRepositoryTabSession(stores.tab, shareToken)
    : null;
  if (tabSession) {
    const resumed = await inspectStoredSession(tabSession);
    if (!("ok" in resumed)) {
      persistSession(resumed);
      return { kind: "READY", session: resumed, replaceRoute: false };
    }
    if (!isExpiredCredential(resumed)) {
      return { kind: "ERROR", message: failureMessage(resumed) };
    }
    clearSession(shareToken);
  }

  const credential = stores.persistent
    ? readRepositoryCredential(stores.persistent, shareToken)
    : null;
  if (credential) {
    const inspected = await repositoryHttpService.inspect(
      credential.humanSessionToken,
    );
    if (inspected.ok) {
      const resumed = sessionFromRepositoryCredential(credential, inspected.data);
      persistSession(resumed);
      return { kind: "READY", session: resumed, replaceRoute: false };
    }
    if (!isExpiredCredential(inspected)) {
      return { kind: "ERROR", message: failureMessage(inspected) };
    }
    clearSession(shareToken);
  }

  return { kind: "JOIN", shareToken };
}

async function initializeLanding(): Promise<InitializationOutcome> {
  const stores = browserStores();
  if (!stores.persistent) return { kind: "LANDING" };
  const shareToken = readLastRepositoryShareToken(stores.persistent);
  if (!shareToken) return { kind: "LANDING" };

  const tabSession = stores.tab
    ? readRepositoryTabSession(stores.tab, shareToken)
    : null;
  if (tabSession) {
    const resumed = await inspectStoredSession(tabSession);
    if (!("ok" in resumed)) {
      persistSession(resumed);
      return { kind: "READY", session: resumed, replaceRoute: true };
    }
    if (!isExpiredCredential(resumed)) {
      return { kind: "LANDING", error: failureMessage(resumed) };
    }
    clearSession(shareToken);
  }

  const credential = readRepositoryCredential(stores.persistent, shareToken);
  if (!credential) return { kind: "LANDING" };
  const inspected = await repositoryHttpService.inspect(
    credential.humanSessionToken,
  );
  if (!inspected.ok) {
    if (isExpiredCredential(inspected)) clearSession(shareToken);
    return {
      kind: "LANDING",
      ...(isExpiredCredential(inspected)
        ? {}
        : { error: failureMessage(inspected) }),
    };
  }
  const resumed = sessionFromRepositoryCredential(credential, inspected.data);
  persistSession(resumed);
  return { kind: "READY", session: resumed, replaceRoute: true };
}

function initialize(
  shareToken?: string,
  startNew = false,
): Promise<InitializationOutcome> {
  if (!shareToken && startNew) return Promise.resolve({ kind: "LANDING" });
  return shareToken ? initializeSharedIssue(shareToken) : initializeLanding();
}

export function RepositoryApp({ shareToken, startNew = false }: RepositoryAppProps) {
  const router = useRouter();
  const [session, setSession] = useState<IssueSessionBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingJoinShareToken, setPendingJoinShareToken] = useState<string | null>(null);
  const initializationRef = useRef<{
    key: string;
    promise: Promise<InitializationOutcome>;
  } | null>(null);
  const actionInFlightRef = useRef(false);
  const pendingJoinShareTokenRef = useRef<string | null>(null);
  const activeSessionIdentityRef = useRef<string | null>(null);
  const sessionRef = useRef<IssueSessionBundle | null>(null);

  useEffect(() => {
    const key = shareToken ?? (startNew ? "__new__" : "__landing__");
    if (initializationRef.current?.key !== key) {
      activeSessionIdentityRef.current = null;
      sessionRef.current = null;
      setSession(null);
      pendingJoinShareTokenRef.current = null;
      setPendingJoinShareToken(null);
      setLoading(true);
      setError(null);
      initializationRef.current = {
        key,
        promise: initialize(shareToken, startNew),
      };
    }
    const entry = initializationRef.current;
    let active = true;
    void entry.promise.then(
      (outcome) => {
        if (!active) return;
        setLoading(false);
        if (outcome.kind === "READY") {
          pendingJoinShareTokenRef.current = null;
          setPendingJoinShareToken(null);
          activeSessionIdentityRef.current = repositorySessionIdentity(outcome.session);
          sessionRef.current = outcome.session;
          setError(null);
          setSession(outcome.session);
          if (outcome.replaceRoute) {
            router.replace(`/issue/${outcome.session.shareToken}`);
          }
          return;
        }
        if (outcome.kind === "JOIN") {
          pendingJoinShareTokenRef.current = outcome.shareToken;
          setPendingJoinShareToken(outcome.shareToken);
          activeSessionIdentityRef.current = null;
          sessionRef.current = null;
          setSession(null);
          setError(null);
          return;
        }
        pendingJoinShareTokenRef.current = null;
        setPendingJoinShareToken(null);
        activeSessionIdentityRef.current = null;
        sessionRef.current = null;
        setSession(null);
        setError(outcome.kind === "ERROR" ? outcome.message : outcome.error ?? null);
      },
      (reason: unknown) => {
        if (!active) return;
        setLoading(false);
        pendingJoinShareTokenRef.current = null;
        setPendingJoinShareToken(null);
        activeSessionIdentityRef.current = null;
        sessionRef.current = null;
        setSession(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [router, shareToken, startNew]);

  const activate = useCallback((bundle: IssueSessionBundle) => {
    persistSession(bundle);
    pendingJoinShareTokenRef.current = null;
    setPendingJoinShareToken(null);
    activeSessionIdentityRef.current = repositorySessionIdentity(bundle);
    sessionRef.current = bundle;
    setError(null);
    setSession(bundle);
    router.push(`/issue/${bundle.shareToken}`);
  }, [router]);

  const joinSharedDocument = useCallback(async (displayName: string) => {
    const token = pendingJoinShareTokenRef.current;
    if (!token || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await repositoryHttpService.join({
        shareToken: token,
        displayName,
      });
      if (pendingJoinShareTokenRef.current !== token) return;
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      activate(result.data);
    } catch (reason) {
      if (pendingJoinShareTokenRef.current === token) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [activate]);

  const runLaunch = useCallback(async (
    launch: () => Promise<
      Awaited<ReturnType<typeof repositoryHttpService.launch>>
    >,
  ) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await launch();
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      activate(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, [activate]);

  const createDocument = useCallback((kind: IssueDocumentKind) => {
    void runLaunch(() => repositoryHttpService.launch({ kind }));
  }, [runLaunch]);

  const openExample = useCallback(() => {
    void runLaunch(() => repositoryHttpService.launchExample({}));
  }, [runLaunch]);

  const newDocument = useCallback(() => {
    pendingJoinShareTokenRef.current = null;
    setPendingJoinShareToken(null);
    activeSessionIdentityRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setError(null);
    initializationRef.current = null;
    router.push("/new");
  }, [router]);

  const sessionUnavailable = useCallback((
    expectedIdentity: string,
    expectedShareToken: string,
    message: string,
  ) => {
    if (!repositoryCanReceiveSessionResult(
      activeSessionIdentityRef.current,
      expectedIdentity,
      sessionRef.current,
    )) return;
    activeSessionIdentityRef.current = null;
    sessionRef.current = null;
    clearSession(expectedShareToken);
    pendingJoinShareTokenRef.current = expectedShareToken;
    setPendingJoinShareToken(expectedShareToken);
    setSession(null);
    setError(message);
    setLoading(false);
  }, []);

  const surfaceChanged = useCallback((
    expectedIdentity: string,
    surface: IssueWorkspaceSurface,
  ) => {
    setSession((current) => {
      if (!current || !repositoryCanReceiveSessionResult(
        activeSessionIdentityRef.current,
        expectedIdentity,
        current,
        surface.document.id,
      )) return current;
      const next = {
        ...current,
        surface: reconcileIssueSurface(current.surface, surface),
      };
      sessionRef.current = next;
      persistSession(next);
      return next;
    });
  }, []);

  const sessionIdentity = session ? repositorySessionIdentity(session) : null;
  const sessionShareToken = session?.shareToken ?? null;
  const workspaceSessionUnavailable = useCallback((message: string) => {
    if (!sessionIdentity || !sessionShareToken) return;
    sessionUnavailable(sessionIdentity, sessionShareToken, message);
  }, [sessionIdentity, sessionShareToken, sessionUnavailable]);
  const workspaceSurfaceChanged = useCallback((surface: IssueWorkspaceSurface) => {
    if (!sessionIdentity) return;
    surfaceChanged(sessionIdentity, surface);
  }, [sessionIdentity, surfaceChanged]);

  const shareUrl = useMemo(() => {
    if (!session) return undefined;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/issue/${session.shareToken}`;
  }, [session]);

  if (session) {
    return (
      <RepositoryWorkspace
        key={sessionIdentity!}
        session={session}
        service={repositoryHttpService}
        shareUrl={shareUrl}
        onNewDocument={newDocument}
        onSessionUnavailable={workspaceSessionUnavailable}
        onSurfaceChange={workspaceSurfaceChanged}
      />
    );
  }

  if (pendingJoinShareToken) {
    return (
      <RepositoryJoin
        busy={busy || loading}
        error={error}
        onJoin={(displayName) => void joinSharedDocument(displayName)}
      />
    );
  }

  return (
    <RepositoryLanding
      busy={busy || loading}
      error={error}
      onCreate={createDocument}
      onOpenExample={openExample}
    />
  );
}
