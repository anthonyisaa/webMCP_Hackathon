import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { test } from "vitest";

import { LocalRepositoryService } from "@/domain/repository-service";
import type { IssueSessionBundle, RepositoryResult } from "./contracts";
import {
  REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX,
  decodeRepositoryBootstrap,
  readLastRepositoryShareToken,
  readRepositoryCredential,
  readRepositoryTabSession,
  removeRepositoryCredential,
  removeRepositoryTabSession,
  writeRepositoryCredential,
  writeRepositoryTabSession,
} from "./browser-storage";

class MemoryStorage {
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

function success<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.code}: ${result.message}`);
}

async function issueSession(): Promise<IssueSessionBundle> {
  return success(await new LocalRepositoryService().launch({
    kind: "POSTMORTEM",
    displayName: "Priya Shah",
  }));
}

test("stores credential-only continuity separately from the tab surface", async () => {
  const persistent = new MemoryStorage();
  const tab = new MemoryStorage();
  const bundle = await issueSession();

  assert.equal(writeRepositoryCredential(persistent, bundle), true);
  assert.equal(writeRepositoryTabSession(tab, bundle), true);
  const credential = readRepositoryCredential(persistent, bundle.shareToken);
  assert.equal(credential?.displayName, "Priya Shah");
  assert.equal("surface" in (credential ?? {}), false);
  assert.equal(readLastRepositoryShareToken(persistent), bundle.shareToken);
  assert.deepEqual(readRepositoryTabSession(tab, bundle.shareToken), bundle);

  removeRepositoryTabSession(tab, bundle.shareToken);
  removeRepositoryCredential(persistent, bundle.shareToken);
  assert.equal(readRepositoryTabSession(tab, bundle.shareToken), null);
  assert.equal(readRepositoryCredential(persistent, bundle.shareToken), null);
  assert.equal(readLastRepositoryShareToken(persistent), null);
});

test("decodes only a valid matching bootstrap bundle", async () => {
  const bundle = await issueSession();
  const encoded = Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url");
  const hash = `${REPOSITORY_BOOTSTRAP_FRAGMENT_PREFIX}${encoded}`;

  assert.deepEqual(decodeRepositoryBootstrap(hash, bundle.shareToken), bundle);
  assert.equal(decodeRepositoryBootstrap(hash, "x".repeat(64)), null);
  assert.equal(decodeRepositoryBootstrap("#ratiflow-bootstrap=%%%"), null);
});

test("discards malformed stored state instead of trusting it", async () => {
  const storage = new MemoryStorage();
  const bundle = await issueSession();
  storage.setItem(`ratiflow.issue.credential.v1:${bundle.shareToken}`, "not-json");
  storage.setItem("ratiflow.issue.last.v1", JSON.stringify({ shareToken: bundle.shareToken }));

  assert.equal(readRepositoryCredential(storage, bundle.shareToken), null);
  assert.equal(readLastRepositoryShareToken(storage), null);
});
