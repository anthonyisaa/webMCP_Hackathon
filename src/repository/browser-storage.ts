import {
  REPOSITORY_CREDENTIAL_STORAGE_PREFIX,
  REPOSITORY_LAST_ISSUE_STORAGE_KEY,
  REPOSITORY_PROTOCOL_VERSION,
  REPOSITORY_SESSION_STORAGE_PREFIX,
  type IssueSessionBundle,
  type IssueWorkspaceSurface,
} from "./contracts";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RepositoryBrowserCredentialV1 {
  storageVersion: 1;
  protocolVersion: typeof REPOSITORY_PROTOCOL_VERSION;
  shareToken: string;
  humanSessionToken: string;
  agentSessionToken: string;
  sessionInstanceId: string;
  selfMemberId: string;
  displayName: string;
  expiresAt: string;
}

interface LastIssuePointerV1 {
  storageVersion: 1;
  shareToken: string;
}

export const REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX = "#ratiflow-bootstrap=";

const TOKEN_PATTERN = /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{32,128})$/iu;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isFutureTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && Date.parse(value) > Date.now();
}

function isSurface(value: unknown): value is IssueWorkspaceSurface {
  if (!value || typeof value !== "object") return false;
  const surface = value as Partial<IssueWorkspaceSurface>;
  return surface.document?.protocolVersion === REPOSITORY_PROTOCOL_VERSION
    && typeof surface.document.id === "string"
    && typeof surface.document.title === "string"
    && typeof surface.document.body === "string"
    && Number.isSafeInteger(surface.document.revision)
    && Number.isSafeInteger(surface.document.activityVersion)
    && Array.isArray(surface.members)
    && Array.isArray(surface.presence)
    && Array.isArray(surface.tasks)
    && Array.isArray(surface.threads)
    && Array.isArray(surface.history);
}

function isCredential(
  value: unknown,
  expectedShareToken?: string,
): value is RepositoryBrowserCredentialV1 {
  if (!value || typeof value !== "object") return false;
  const credential = value as Partial<RepositoryBrowserCredentialV1>;
  return hasExactKeys(value, [
    "storageVersion",
    "protocolVersion",
    "shareToken",
    "humanSessionToken",
    "agentSessionToken",
    "sessionInstanceId",
    "selfMemberId",
    "displayName",
    "expiresAt",
  ])
    && credential.storageVersion === 1
    && credential.protocolVersion === REPOSITORY_PROTOCOL_VERSION
    && typeof credential.shareToken === "string"
    && TOKEN_PATTERN.test(credential.shareToken)
    && (!expectedShareToken || credential.shareToken === expectedShareToken)
    && typeof credential.humanSessionToken === "string"
    && TOKEN_PATTERN.test(credential.humanSessionToken)
    && typeof credential.agentSessionToken === "string"
    && TOKEN_PATTERN.test(credential.agentSessionToken)
    && credential.humanSessionToken !== credential.agentSessionToken
    && typeof credential.sessionInstanceId === "string"
    && UUID_PATTERN.test(credential.sessionInstanceId)
    && typeof credential.selfMemberId === "string"
    && UUID_PATTERN.test(credential.selfMemberId)
    && typeof credential.displayName === "string"
    && credential.displayName.trim().length > 0
    && Array.from(credential.displayName).length <= 80
    && isFutureTimestamp(credential.expiresAt);
}

export function isRepositorySessionBundle(
  value: unknown,
  expectedShareToken?: string,
): value is IssueSessionBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<IssueSessionBundle>;
  return bundle.protocolVersion === REPOSITORY_PROTOCOL_VERSION
    && typeof bundle.shareToken === "string"
    && TOKEN_PATTERN.test(bundle.shareToken)
    && (!expectedShareToken || bundle.shareToken === expectedShareToken)
    && typeof bundle.humanSessionToken === "string"
    && TOKEN_PATTERN.test(bundle.humanSessionToken)
    && typeof bundle.agentSessionToken === "string"
    && TOKEN_PATTERN.test(bundle.agentSessionToken)
    && bundle.humanSessionToken !== bundle.agentSessionToken
    && typeof bundle.sessionInstanceId === "string"
    && UUID_PATTERN.test(bundle.sessionInstanceId)
    && typeof bundle.selfMemberId === "string"
    && UUID_PATTERN.test(bundle.selfMemberId)
    && isFutureTimestamp(bundle.expiresAt)
    && isSurface(bundle.surface);
}

function credentialKey(shareToken: string): string {
  return `${REPOSITORY_CREDENTIAL_STORAGE_PREFIX}${shareToken}`;
}

function sessionKey(shareToken: string): string {
  return `${REPOSITORY_SESSION_STORAGE_PREFIX}${shareToken}`;
}

function parse(storage: BrowserStorage, key: string): unknown {
  const raw = storage.getItem(key);
  return raw ? JSON.parse(raw) as unknown : null;
}

export function credentialFromRepositorySession(
  bundle: IssueSessionBundle,
): RepositoryBrowserCredentialV1 | null {
  const member = bundle.surface.members.find(
    ({ memberId }) => memberId === bundle.selfMemberId,
  );
  if (!member) return null;
  return {
    storageVersion: 1,
    protocolVersion: REPOSITORY_PROTOCOL_VERSION,
    shareToken: bundle.shareToken,
    humanSessionToken: bundle.humanSessionToken,
    agentSessionToken: bundle.agentSessionToken,
    sessionInstanceId: bundle.sessionInstanceId,
    selfMemberId: bundle.selfMemberId,
    displayName: member.displayName,
    expiresAt: bundle.expiresAt,
  };
}

export function sessionFromRepositoryCredential(
  credential: RepositoryBrowserCredentialV1,
  surface: IssueWorkspaceSurface,
): IssueSessionBundle {
  return {
    protocolVersion: REPOSITORY_PROTOCOL_VERSION,
    shareToken: credential.shareToken,
    humanSessionToken: credential.humanSessionToken,
    agentSessionToken: credential.agentSessionToken,
    sessionInstanceId: credential.sessionInstanceId,
    selfMemberId: credential.selfMemberId,
    expiresAt: credential.expiresAt,
    surface,
  };
}

export function readRepositoryCredential(
  storage: BrowserStorage,
  shareToken: string,
): RepositoryBrowserCredentialV1 | null {
  const key = credentialKey(shareToken);
  try {
    const value = parse(storage, key);
    if (isCredential(value, shareToken)) return value;
    if (value !== null) storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Browser continuity is best effort; server authorization remains authoritative.
    }
  }
  return null;
}

export function readLastRepositoryShareToken(storage: BrowserStorage): string | null {
  try {
    const value = parse(storage, REPOSITORY_LAST_ISSUE_STORAGE_KEY);
    if (value && typeof value === "object"
      && hasExactKeys(value, ["storageVersion", "shareToken"])) {
      const pointer = value as Partial<LastIssuePointerV1>;
      if (pointer.storageVersion === 1
        && typeof pointer.shareToken === "string"
        && TOKEN_PATTERN.test(pointer.shareToken)) {
        return pointer.shareToken;
      }
    }
    if (value !== null) storage.removeItem(REPOSITORY_LAST_ISSUE_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(REPOSITORY_LAST_ISSUE_STORAGE_KEY);
    } catch {
      // Browser continuity is best effort.
    }
  }
  return null;
}

export function writeRepositoryCredential(
  storage: BrowserStorage,
  bundle: IssueSessionBundle,
): boolean {
  const credential = credentialFromRepositorySession(bundle);
  if (!credential) return false;
  const pointer: LastIssuePointerV1 = {
    storageVersion: 1,
    shareToken: credential.shareToken,
  };
  try {
    storage.setItem(credentialKey(bundle.shareToken), JSON.stringify(credential));
    storage.setItem(REPOSITORY_LAST_ISSUE_STORAGE_KEY, JSON.stringify(pointer));
    return true;
  } catch {
    return false;
  }
}

export function removeRepositoryCredential(
  storage: BrowserStorage,
  shareToken?: string,
): void {
  if (!shareToken) return;
  try {
    storage.removeItem(credentialKey(shareToken));
    if (readLastRepositoryShareToken(storage) === shareToken) {
      storage.removeItem(REPOSITORY_LAST_ISSUE_STORAGE_KEY);
    }
  } catch {
    // Best-effort bearer cleanup only.
  }
}

export function readRepositoryTabSession(
  storage: BrowserStorage,
  shareToken: string,
): IssueSessionBundle | null {
  const key = sessionKey(shareToken);
  try {
    const value = parse(storage, key);
    if (isRepositorySessionBundle(value, shareToken)) return value;
    if (value !== null) storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Best-effort bearer cleanup only.
    }
  }
  return null;
}

export function writeRepositoryTabSession(
  storage: BrowserStorage,
  bundle: IssueSessionBundle,
): boolean {
  try {
    storage.setItem(sessionKey(bundle.shareToken), JSON.stringify(bundle));
    return true;
  } catch {
    return false;
  }
}

export function removeRepositoryTabSession(
  storage: BrowserStorage,
  shareToken?: string,
): void {
  if (!shareToken) return;
  try {
    storage.removeItem(sessionKey(shareToken));
  } catch {
    // Best-effort bearer cleanup only.
  }
}

export function decodeRepositoryBootstrap(
  hash: string,
  expectedShareToken?: string,
): IssueSessionBundle | null {
  if (!hash.startsWith(REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX)) return null;
  const encoded = hash.slice(REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
  try {
    const base64 = encoded.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRepositorySessionBundle(parsed, expectedShareToken) ? parsed : null;
  } catch {
    return null;
  }
}
