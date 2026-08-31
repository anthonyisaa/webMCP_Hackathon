import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RealtimeWorkspaceNotice } from "@/contracts";

const inspect = vi.fn(async () => undefined);
const subscribe = vi.fn<(token: string, callback: (notice: RealtimeWorkspaceNotice) => void) => () => void>(() => vi.fn());

vi.mock("@/domain/http-session", () => ({
  sessionTokenFrom: () => "demo-token",
}));
vi.mock("@/domain/ratiflow-runtime", () => ({
  getRuntimeRatiflowService: () => ({ inspect, subscribe }),
}));

import { GET } from "./route";

async function connectedResponse(signal?: AbortSignal): Promise<Response> {
  return GET(new Request("https://ratiflow.test/api/workspace/realtime", {
    headers: { authorization: "Bearer demo-token" },
    signal,
  }));
}

describe("GET /api/workspace/realtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    inspect.mockClear();
    subscribe.mockClear();
  });

  it("closes before the platform timeout and unsubscribes", async () => {
    const response = await connectedResponse();
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await expect(reader!.read()).resolves.toMatchObject({ done: false });

    await vi.advanceTimersByTimeAsync(240_000);

    await expect(reader!.read()).resolves.toMatchObject({ done: true });
    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribe.mock.results[0]?.value).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("closes and unsubscribes when the request is aborted", async () => {
    const abortController = new AbortController();
    const response = await connectedResponse(abortController.signal);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader!.read();

    abortController.abort();

    await expect(reader!.read()).resolves.toMatchObject({ done: true });
    expect(subscribe.mock.results[0]?.value).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("streams activity-cursor invalidation notices without workspace payloads", async () => {
    subscribe.mockImplementationOnce((_token: string, callback: (notice: RealtimeWorkspaceNotice) => void) => {
      callback({ eventId: "activity-1", activityCursor: "cursor-1", workspaceRevision: null });
      return vi.fn();
    });
    const response = await connectedResponse();
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain("event: activity");
    expect(text).toContain('"activityCursor":"cursor-1"');
    expect(text).not.toContain("workspace\"");
    await reader.cancel();
    vi.useRealTimers();
  });
});
