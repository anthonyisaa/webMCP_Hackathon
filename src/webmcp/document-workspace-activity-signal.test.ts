import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { DocumentWorkspaceActivitySignal } from "./document-workspace-activity-signal";

afterEach(() => {
  vi.useRealTimers();
});

test("observes activity monotonically and wakes every waiter only on a higher version", async () => {
  const signal = new DocumentWorkspaceActivitySignal(3);
  const first = signal.waitForChange(3, 1_000);
  const second = signal.waitForChange(2, 1_000);

  assert.equal(await second, 3);
  signal.observe(3);
  signal.observe(2);
  assert.equal(signal.latestActivityVersion, 3);

  signal.observe(4);
  assert.equal(await first, 4);
  assert.equal(await signal.waitForChange(3, 1_000), 4);

  signal.close();
});

test("times out, aborts, and closes pending numeric waits without leaking them", async () => {
  vi.useFakeTimers();
  const signal = new DocumentWorkspaceActivitySignal(1);

  const timed = signal.waitForChange(1, 25);
  await vi.advanceTimersByTimeAsync(25);
  assert.equal(await timed, null);

  const controller = new AbortController();
  const aborted = signal.waitForChange(1, 1_000, controller.signal);
  controller.abort("route changed");
  await assert.rejects(aborted, (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  });

  const closed = signal.waitForChange(1, 1_000);
  signal.close("session ended");
  await assert.rejects(closed, (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  });
  await assert.rejects(signal.waitForChange(1, 1_000), (error: unknown) => {
    return error instanceof DOMException && error.name === "AbortError";
  });
});
