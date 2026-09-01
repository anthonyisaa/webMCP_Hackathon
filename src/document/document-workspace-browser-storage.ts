import {
  DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH,
  DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY,
  DOCUMENT_WORKSPACE_CREDENTIAL_STORAGE_PREFIX,
  DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY,
  DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
  type DocumentSessionBundleV3,
  type DocumentSurfaceV3,
  type DocumentWorkspaceBrowserProfileV1,
  type DocumentWorkspaceCredentialV1,
} from "./contracts";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface LastDocumentPointerV1 {
  storageVersion: 1;
  shareToken: string;
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonblankString(value: unknown, maximum?: number): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return maximum === undefined || Array.from(value).length <= maximum;
}

function isFutureTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}

function credentialKey(shareToken: string): string {
  return `${DOCUMENT_WORKSPACE_CREDENTIAL_STORAGE_PREFIX}${shareToken}`;
}

function hasCredentialShape(
  value: unknown,
  expectedShareToken?: string,
): value is DocumentWorkspaceCredentialV1 {
  if (!value || typeof value !== "object") return false;
  const credential = value as Partial<DocumentWorkspaceCredentialV1>;
  return (
    hasExactKeys(value, [
      "storageVersion",
      "protocolVersion",
      "shareToken",
      "humanSessionToken",
      "agentSessionToken",
      "sessionInstanceId",
      "selfMemberId",
      "displayName",
      "expiresAt",
    ]) &&
    credential.storageVersion === 1 &&
    credential.protocolVersion === DOCUMENT_WORKSPACE_PROTOCOL_VERSION &&
    isNonblankString(credential.shareToken, 256) &&
    (!expectedShareToken || credential.shareToken === expectedShareToken) &&
    isNonblankString(credential.humanSessionToken) &&
    isNonblankString(credential.agentSessionToken) &&
    credential.humanSessionToken !== credential.agentSessionToken &&
    isNonblankString(credential.sessionInstanceId) &&
    isNonblankString(credential.selfMemberId) &&
    isNonblankString(credential.displayName, DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH) &&
    isFutureTimestamp(credential.expiresAt)
  );
}

function hasProfileShape(value: unknown): value is DocumentWorkspaceBrowserProfileV1 {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<DocumentWorkspaceBrowserProfileV1>;
  return (
    hasExactKeys(value, ["storageVersion", "displayName"]) &&
    profile.storageVersion === 1 &&
    isNonblankString(profile.displayName, DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH)
  );
}

function parseStoredValue(storage: BrowserStorage, key: string): unknown {
  const raw = storage.getItem(key);
  return raw ? (JSON.parse(raw) as unknown) : null;
}

export function readDocumentWorkspaceBrowserProfile(
  storage: BrowserStorage,
): DocumentWorkspaceBrowserProfileV1 | null {
  try {
    const value = parseStoredValue(storage, DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY);
    if (hasProfileShape(value)) return value;
    if (value !== null) storage.removeItem(DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY);
    } catch {
      // Browser continuity is best effort; the tab session remains authoritative.
    }
  }
  return null;
}

export function readDocumentWorkspaceCredential(
  storage: BrowserStorage,
  shareToken: string,
): DocumentWorkspaceCredentialV1 | null {
  const key = credentialKey(shareToken);
  try {
    const value = parseStoredValue(storage, key);
    if (hasCredentialShape(value, shareToken)) return value;
    if (value !== null) storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Browser continuity is best effort; the tab session remains authoritative.
    }
  }
  return null;
}

export function readLastDocumentShareToken(storage: BrowserStorage): string | null {
  try {
    const value = parseStoredValue(storage, DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY);
    if (
      value &&
      typeof value === "object" &&
      hasExactKeys(value, ["storageVersion", "shareToken"]) &&
      (value as Partial<LastDocumentPointerV1>).storageVersion === 1 &&
      isNonblankString((value as Partial<LastDocumentPointerV1>).shareToken, 256)
    ) {
      return (value as LastDocumentPointerV1).shareToken;
    }
    if (value !== null) storage.removeItem(DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY);
    } catch {
      // Browser continuity is best effort; the tab session remains authoritative.
    }
  }
  return null;
}

export function credentialFromDocumentSession(
  bundle: DocumentSessionBundleV3,
  fallbackDisplayName?: string,
): DocumentWorkspaceCredentialV1 | null {
  const displayName =
    bundle.surface.presence.find((person) => person.memberId === bundle.selfMemberId)?.displayName ??
    fallbackDisplayName;
  if (!isNonblankString(displayName, DOCUMENT_MEMBER_DISPLAY_NAME_MAX_LENGTH)) return null;
  return {
    storageVersion: 1,
    protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
    shareToken: bundle.shareToken,
    humanSessionToken: bundle.humanSessionToken,
    agentSessionToken: bundle.agentSessionToken,
    sessionInstanceId: bundle.sessionInstanceId,
    selfMemberId: bundle.selfMemberId,
    displayName,
    expiresAt: bundle.expiresAt,
  };
}

export function sessionFromDocumentWorkspaceCredential(
  credential: DocumentWorkspaceCredentialV1,
  surface: DocumentSurfaceV3,
): DocumentSessionBundleV3 {
  return {
    protocolVersion: DOCUMENT_WORKSPACE_PROTOCOL_VERSION,
    shareToken: credential.shareToken,
    humanSessionToken: credential.humanSessionToken,
    agentSessionToken: credential.agentSessionToken,
    sessionInstanceId: credential.sessionInstanceId,
    selfMemberId: credential.selfMemberId,
    expiresAt: credential.expiresAt,
    surface,
  };
}

export function writeDocumentWorkspaceCredential(
  storage: BrowserStorage,
  bundle: DocumentSessionBundleV3,
  fallbackDisplayName?: string,
): boolean {
  const credential = credentialFromDocumentSession(bundle, fallbackDisplayName);
  if (!credential) return false;
  const profile: DocumentWorkspaceBrowserProfileV1 = {
    storageVersion: 1,
    displayName: credential.displayName,
  };
  const pointer: LastDocumentPointerV1 = {
    storageVersion: 1,
    shareToken: credential.shareToken,
  };
  try {
    storage.setItem(credentialKey(credential.shareToken), JSON.stringify(credential));
    storage.setItem(DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    storage.setItem(DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY, JSON.stringify(pointer));
    return true;
  } catch {
    return false;
  }
}

export function removeDocumentWorkspaceCredential(
  storage: BrowserStorage,
  shareToken?: string,
): void {
  if (!shareToken) return;
  try {
    storage.removeItem(credentialKey(shareToken));
    if (readLastDocumentShareToken(storage) === shareToken) {
      storage.removeItem(DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY);
    }
  } catch {
    // Browser continuity is best effort; authorization still lives on the server.
  }
}
