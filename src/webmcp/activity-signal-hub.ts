import type { ActivityCursor } from "../contracts/index";

interface ActivityWaiter {
  afterCursor: ActivityCursor;
  resolve: (cursor: ActivityCursor | null) => void;
  reject: (reason: DOMException) => void;
  cleanup: () => void;
}

function abortError(signal?: AbortSignal): DOMException {
  if (signal?.reason instanceof DOMException && signal.reason.name === "AbortError") {
    return signal.reason;
  }
  return new DOMException(
    typeof signal?.reason === "string" ? signal.reason : "Activity wait cancelled",
    "AbortError",
  );
}

/**
 * Page-local invalidation fan-out. It deliberately compares opaque cursors only for
 * equality: ordering and catch-up authority remain on the service.
 */
export class ActivitySignalHub {
  #latestCursor: ActivityCursor | null;
  readonly #waiters = new Set<ActivityWaiter>();
  #closed = false;

  constructor(initialCursor: ActivityCursor | null = null) {
    this.#latestCursor = initialCursor;
  }

  get latestCursor(): ActivityCursor | null {
    return this.#latestCursor;
  }

  seed(cursor: ActivityCursor): void {
    if (!this.#closed && this.#latestCursor === null) this.#latestCursor = cursor;
  }

  observe(cursor: ActivityCursor): void {
    if (this.#closed || cursor === this.#latestCursor) return;
    this.#latestCursor = cursor;
    for (const waiter of [...this.#waiters]) {
      if (cursor === waiter.afterCursor) continue;
      waiter.cleanup();
      waiter.resolve(cursor);
    }
  }

  waitForChange(
    afterCursor: ActivityCursor,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<ActivityCursor | null> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (this.#closed) return Promise.reject(abortError());
    if (this.#latestCursor !== null && this.#latestCursor !== afterCursor) {
      return Promise.resolve(this.#latestCursor);
    }

    return new Promise<ActivityCursor | null>((resolve, reject) => {
      const onAbort = () => {
        waiter.cleanup();
        reject(abortError(signal));
      };
      const waiter: ActivityWaiter = {
        afterCursor,
        resolve,
        reject,
        cleanup: () => {
          this.#waiters.delete(waiter);
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        },
      };

      this.#waiters.add(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        waiter.cleanup();
        resolve(null);
      }, Math.max(0, timeoutMs));

      // close/observe cannot interleave within this synchronous section, but the
      // second check makes the invariant explicit if the host adds scheduling hooks.
      if (
        this.#latestCursor !== null &&
        this.#latestCursor !== afterCursor &&
        this.#waiters.has(waiter)
      ) {
        const cursor = this.#latestCursor;
        waiter.cleanup();
        resolve(cursor);
      }
    });
  }

  close(reason = "Activity signal hub closed"): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of [...this.#waiters]) {
      waiter.cleanup();
      const controller = new AbortController();
      controller.abort(reason);
      waiter.reject(abortError(controller.signal));
    }
  }
}
