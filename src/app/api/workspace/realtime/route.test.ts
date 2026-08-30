import { beforeEach, describe, expect, it, vi } from "vitest";

const inspect = vi.fn(async () => undefined);
const subscribe = vi.fn(() => vi.fn());

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
});
