import type { DocumentActivitySignalPort } from "../document/contracts";
import { ActivitySignalHub } from "./activity-signal-hub";

const CURSOR_PREFIX = "document-v3:";

function activityCursor(activityVersion: number): string {
  return `${CURSOR_PREFIX}${activityVersion}`;
}

export function documentWorkspaceAbortError(
  signal?: AbortSignal,
  fallback = "Document activity wait cancelled",
): DOMException {
  if (signal?.reason instanceof DOMException && signal.reason.name === "AbortError") {
    return signal.reason;
  }
  return new DOMException(
    typeof signal?.reason === "string" ? signal.reason : fallback,
    "AbortError",
  );
}

/** Page-local monotonic activity fan-out for the v3 document workspace. */
export class DocumentWorkspaceActivitySignal implements DocumentActivitySignalPort {
  #latestActivityVersion: number;
  readonly #hub: ActivitySignalHub;
  #closed = false;

  constructor(initialActivityVersion = 0) {
    this.#latestActivityVersion = initialActivityVersion;
    this.#hub = new ActivitySignalHub(activityCursor(initialActivityVersion));
  }

  get latestActivityVersion(): number {
    return this.#latestActivityVersion;
  }

  observe(activityVersion: number): void {
    if (this.#closed || activityVersion <= this.#latestActivityVersion) return;
    this.#latestActivityVersion = activityVersion;
    this.#hub.observe(activityCursor(activityVersion));
  }

  waitForChange(
    afterActivityVersion: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<number | null> {
    return this.#hub
      .waitForChange(activityCursor(afterActivityVersion), timeoutMs, signal)
      .then((cursor) => cursor === null ? null : this.#latestActivityVersion);
  }

  close(reason = "Document activity signal closed"): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#hub.close(reason);
  }
}
