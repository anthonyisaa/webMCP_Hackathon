import { ActivitySignalHub } from "./activity-signal-hub";
import type { RepositoryActivitySignalPort } from "./repository-types";

const CURSOR_PREFIX = "repository-v4:";

function activityCursor(activityVersion: number): `${typeof CURSOR_PREFIX}${number}` {
  return `${CURSOR_PREFIX}${activityVersion}`;
}

export function repositoryAbortError(
  signal?: AbortSignal,
  fallback = "Repository activity wait cancelled",
): DOMException {
  if (signal?.reason instanceof DOMException && signal.reason.name === "AbortError") {
    return signal.reason;
  }
  return new DOMException(
    typeof signal?.reason === "string" ? signal.reason : fallback,
    "AbortError",
  );
}

/** Page-local monotonic activity fan-out for a mounted v4 issue. */
export class RepositoryActivitySignal implements RepositoryActivitySignalPort {
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

  close(reason = "Repository activity signal closed"): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#hub.close(reason);
  }
}
