import { describe, expect, it } from "vitest";

import {
  DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY,
  DOCUMENT_WORKSPACE_CREDENTIAL_STORAGE_PREFIX,
  DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY,
  type DocumentSessionBundleV3,
} from "./contracts";
import {
  readDocumentWorkspaceBrowserProfile,
  readDocumentWorkspaceCredential,
  readLastDocumentShareToken,
  removeDocumentWorkspaceCredential,
  sessionFromDocumentWorkspaceCredential,
  writeDocumentWorkspaceCredential,
} from "./document-workspace-browser-storage";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function bundle(expiresAt = "2099-09-01T00:00:00.000Z"): DocumentSessionBundleV3 {
  return {
    protocolVersion: 3,
    shareToken: "share-one",
    humanSessionToken: "human-one",
    agentSessionToken: "agent-one",
    sessionInstanceId: "session-one",
    selfMemberId: "member-one",
    expiresAt,
    surface: {
      document: {
        id: "document-one",
        protocolVersion: 3,
        title: "Private draft",
        body: "Do not persist this body outside the tab.",
        revision: 1,
        activityVersion: 1,
        updatedAt: "2026-09-01T00:00:00.000Z",
        lastEditor: null,
      },
      presence: [
        {
          memberId: "member-one",
          displayName: "Maya Chen",
          color: "#7357d9",
          state: "VIEWING",
          field: null,
          isTyping: false,
          selectionStart: null,
          selectionEnd: null,
          observedRevision: 1,
          lastSeenAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      workOrders: [],
      memory: [],
    },
  };
}

describe("document workspace browser continuity", () => {
  it("stores only the scoped credential, profile, and versioned last-note pointer", () => {
    const storage = new MemoryStorage();
    expect(writeDocumentWorkspaceCredential(storage, bundle())).toBe(true);

    const serialized = [...storage.values.values()].join("\n");
    expect(serialized).not.toContain("Private draft");
    expect(serialized).not.toContain("Do not persist this body");
    expect(serialized).not.toContain("surface");
    expect(serialized).not.toContain("workOrders");
    expect(serialized).not.toContain("memory");

    expect(readLastDocumentShareToken(storage)).toBe("share-one");
    expect(readDocumentWorkspaceBrowserProfile(storage)).toEqual({
      storageVersion: 1,
      displayName: "Maya Chen",
    });
    expect(readDocumentWorkspaceCredential(storage, "share-one")).toMatchObject({
      storageVersion: 1,
      protocolVersion: 3,
      shareToken: "share-one",
      selfMemberId: "member-one",
      displayName: "Maya Chen",
    });
  });

  it("reconstructs a tab bundle only after an authoritative surface fetch", () => {
    const storage = new MemoryStorage();
    const original = bundle();
    writeDocumentWorkspaceCredential(storage, original);
    const credential = readDocumentWorkspaceCredential(storage, original.shareToken);
    expect(credential).not.toBeNull();
    const restored = sessionFromDocumentWorkspaceCredential(
      credential!,
      { ...original.surface, document: { ...original.surface.document, revision: 2 } },
    );
    expect(restored.selfMemberId).toBe(original.selfMemberId);
    expect(restored.humanSessionToken).toBe(original.humanSessionToken);
    expect(restored.surface.document.revision).toBe(2);
  });

  it("clears malformed or expired credentials without deleting the saved profile", () => {
    const storage = new MemoryStorage();
    writeDocumentWorkspaceCredential(storage, bundle("2000-09-01T00:00:00.000Z"));
    const key = `${DOCUMENT_WORKSPACE_CREDENTIAL_STORAGE_PREFIX}share-one`;
    expect(readDocumentWorkspaceCredential(storage, "share-one")).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(
      key,
      JSON.stringify({ storageVersion: 1, shareToken: "share-one", surface: {} }),
    );
    expect(readDocumentWorkspaceCredential(storage, "share-one")).toBeNull();
    expect(readDocumentWorkspaceBrowserProfile(storage)?.displayName).toBe("Maya Chen");
  });

  it("removes a rejected credential and matching pointer but keeps browser identity", () => {
    const storage = new MemoryStorage();
    writeDocumentWorkspaceCredential(storage, bundle());
    removeDocumentWorkspaceCredential(storage, "share-one");
    expect(storage.getItem(`${DOCUMENT_WORKSPACE_CREDENTIAL_STORAGE_PREFIX}share-one`)).toBeNull();
    expect(storage.getItem(DOCUMENT_WORKSPACE_LAST_NOTE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DOCUMENT_WORKSPACE_BROWSER_PROFILE_STORAGE_KEY)).not.toBeNull();
  });

  it("falls back cleanly when browser storage rejects writes", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      removeItem: () => undefined,
    };
    expect(writeDocumentWorkspaceCredential(storage, bundle())).toBe(false);
    expect(readLastDocumentShareToken(storage)).toBeNull();
  });
});
