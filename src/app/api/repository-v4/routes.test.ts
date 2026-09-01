import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, test } from "vitest";

import type { IssueSessionBundle, RepositoryFailure } from "@/repository/contracts";
import { repositoryResponse } from "./_response";

type PostHandler = (request: Request) => Promise<Response>;

const NO_BODY = Symbol("NO_BODY");

const originalSupabaseUrl = process.env.RATIFLOW_SUPABASE_URL;
const originalSupabaseKey = process.env.RATIFLOW_SUPABASE_PUBLISHABLE_KEY;

beforeAll(() => {
  delete process.env.RATIFLOW_SUPABASE_URL;
  delete process.env.RATIFLOW_SUPABASE_PUBLISHABLE_KEY;
});

afterAll(() => {
  setEnvironment("RATIFLOW_SUPABASE_URL", originalSupabaseUrl);
  setEnvironment("RATIFLOW_SUPABASE_PUBLISHABLE_KEY", originalSupabaseKey);
});

function setEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(
  path: string,
  body: unknown | typeof NO_BODY,
  options: {
    token?: string;
    headers?: Record<string, string>;
    rawBody?: string;
  } = {},
): Request {
  const hasBody = body !== NO_BODY || options.rawBody !== undefined;
  return new Request(`http://local.test${path}`, {
    method: "POST",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.rawBody ?? (body === NO_BODY ? undefined : JSON.stringify(body)),
  });
}

function get(path: string, token?: string): Request {
  return new Request(`http://local.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function launchIssue(displayName = "Route tester"): Promise<IssueSessionBundle> {
  const { POST } = await import("./launch/route");
  const response = await POST(request("/api/repository-v4/launch", {
    kind: "POSTMORTEM",
    displayName,
  }));
  expect(response.status).toBe(201);
  const payload = await json<{ ok: true; data: IssueSessionBundle }>(response);
  return payload.data;
}

test("launch and inspect use exact success statuses, JSON, and bearer-header transport", async () => {
  const { POST: launch } = await import("./launch/route");
  const launchResponse = await launch(request("/api/repository-v4/launch", {
    kind: "POSTMORTEM",
    displayName: "Priya Shah",
  }));
  expect(launchResponse.status).toBe(201);
  expect(launchResponse.headers.get("content-type")).toContain("application/json");
  expect(launchResponse.headers.get("set-cookie")).toBeNull();
  const launched = await json<{ ok: true; data: IssueSessionBundle }>(launchResponse);
  expect(launched.ok).toBe(true);
  expect(launched.data.surface.document).toMatchObject({
    protocolVersion: 4,
    kind: "POSTMORTEM",
    revision: 1,
    activityVersion: 1,
  });

  const { GET: inspect } = await import("./surface/route");
  const withoutBearer = await inspect(get("/api/repository-v4/surface"));
  expect(withoutBearer.status).toBe(401);
  const inspected = await inspect(get(
    "/api/repository-v4/surface",
    launched.data.humanSessionToken,
  ));
  expect(inspected.status).toBe(200);
  expect(inspected.headers.get("content-type")).toContain("application/json");
  const surface = await json<{ ok: true; data: { document: { id: string } } }>(inspected);
  expect(surface.data.document.id).toBe(launched.data.surface.document.id);
});

test("malformed JSON is rejected before runtime dispatch", async () => {
  const { POST: launch } = await import("./launch/route");
  const response = await launch(request(
    "/api/repository-v4/launch",
    NO_BODY,
    { rawBody: "{" },
  ));
  expect(response.status).toBe(400);
  await expect(json<RepositoryFailure>(response)).resolves.toMatchObject({
    ok: false,
    code: "INVALID_INPUT",
  });
});

const humanMutations: Array<{
  name: string;
  path: string;
  load: () => Promise<{ POST: PostHandler }>;
}> = [
  { name: "presence", path: "/api/repository-v4/presence", load: () => import("./presence/route") },
  { name: "save revision", path: "/api/repository-v4/revision/save", load: () => import("./revision/save/route") },
  { name: "restore revision", path: "/api/repository-v4/revision/restore", load: () => import("./revision/restore/route") },
  { name: "create task", path: "/api/repository-v4/task/create", load: () => import("./task/create/route") },
  { name: "cancel task", path: "/api/repository-v4/task/cancel", load: () => import("./task/cancel/route") },
  { name: "accept task", path: "/api/repository-v4/task/accept", load: () => import("./task/accept/route") },
  { name: "reject task", path: "/api/repository-v4/task/reject", load: () => import("./task/reject/route") },
  { name: "create thread", path: "/api/repository-v4/thread/create", load: () => import("./thread/create/route") },
  { name: "comment", path: "/api/repository-v4/thread/comment", load: () => import("./thread/comment/route") },
  { name: "resolve thread", path: "/api/repository-v4/thread/resolve", load: () => import("./thread/resolve/route") },
];

test("every human mutation requires a valid Idempotency-Key and rejects public requestId", async () => {
  const session = await launchIssue("Human boundary tester");
  for (const route of humanMutations) {
    const { POST } = await route.load();
    const missing = await POST(request(route.path, {}, { token: session.humanSessionToken }));
    expect(missing.status, `${route.name}: missing key`).toBe(400);
    const invalid = await POST(request(route.path, {}, {
      token: session.humanSessionToken,
      headers: { "Idempotency-Key": "not-a-uuid" },
    }));
    expect(invalid.status, `${route.name}: invalid key`).toBe(400);
    const forged = await POST(request(route.path, { requestId: randomUUID() }, {
      token: session.humanSessionToken,
      headers: { "Idempotency-Key": randomUUID() },
    }));
    expect(forged.status, `${route.name}: forged requestId`).toBe(400);
    const payload = await json<RepositoryFailure>(forged);
    expect(payload).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  }
});

const agentEndpoints: Array<{
  name: string;
  path: string;
  mutation: boolean;
  body: Record<string, unknown>;
  load: () => Promise<{ POST: PostHandler }>;
}> = [
  { name: "list tasks", path: "/api/repository-v4/agent/tasks", mutation: false, body: {}, load: () => import("./agent/tasks/route") },
  { name: "wait tasks", path: "/api/repository-v4/agent/tasks/wait", mutation: false, body: { afterActivityVersion: 0, afterRevision: 0 }, load: () => import("./agent/tasks/wait/route") },
  { name: "comment", path: "/api/repository-v4/agent/comment", mutation: true, body: {}, load: () => import("./agent/comment/route") },
  { name: "result", path: "/api/repository-v4/agent/result", mutation: true, body: {}, load: () => import("./agent/result/route") },
];

test("all agent endpoints require a valid page-session header", async () => {
  const session = await launchIssue("Agent boundary tester");
  for (const route of agentEndpoints) {
    const { POST } = await route.load();
    const baseHeaders: Record<string, string> = route.mutation
      ? { "Idempotency-Key": randomUUID() }
      : {};
    const missing = await POST(request(route.path, route.body, {
      token: session.agentSessionToken,
      headers: baseHeaders,
    }));
    expect(missing.status, `${route.name}: missing page session`).toBe(400);
    const invalid = await POST(request(route.path, route.body, {
      token: session.agentSessionToken,
      headers: { ...baseHeaders, "X-Ratiflow-Page-Session": "not-a-uuid" },
    }));
    expect(invalid.status, `${route.name}: invalid page session`).toBe(400);
  }
});

test("agent mutations reject requestId in public JSON", async () => {
  const session = await launchIssue("Agent mutation tester");
  for (const route of agentEndpoints.filter((entry) => entry.mutation)) {
    const { POST } = await route.load();
    const response = await POST(request(route.path, { requestId: randomUUID() }, {
      token: session.agentSessionToken,
      headers: {
        "Idempotency-Key": randomUUID(),
        "X-Ratiflow-Page-Session": session.sessionInstanceId,
      },
    }));
    expect(response.status, route.name).toBe(400);
    await expect(json<RepositoryFailure>(response)).resolves.toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  }
});

test("public example accepts only an absent or empty object body", async () => {
  const { POST: example } = await import("./example/route");
  const absent = await example(request("/api/repository-v4/example", NO_BODY));
  expect(absent.status).toBe(201);
  const empty = await example(request("/api/repository-v4/example", {}));
  expect(empty.status).toBe(201);
  const nonempty = await example(request("/api/repository-v4/example", { displayName: "forged" }));
  expect(nonempty.status).toBe(400);
  const malformed = await example(request("/api/repository-v4/example", NO_BODY, { rawBody: "{" }));
  expect(malformed.status).toBe(400);
});

test("handler failures and the shared response mapper preserve HTTP error semantics", async () => {
  const { GET: inspect } = await import("./surface/route");
  expect((await inspect(get("/api/repository-v4/surface"))).status).toBe(401);

  const { POST: join } = await import("./join/route");
  expect((await join(request("/api/repository-v4/join", {
    shareToken: "a".repeat(32),
    displayName: "Missing issue",
  }))).status).toBe(404);

  const session = await launchIssue("Conflict mapper");
  const { POST: save } = await import("./revision/save/route");
  const stale = await save(request("/api/repository-v4/revision/save", {
    expectedRevision: 0,
    title: "Stale",
    body: "Stale",
    changeSummary: "This must conflict.",
  }, {
    token: session.humanSessionToken,
    headers: { "Idempotency-Key": randomUUID() },
  }));
  expect(stale.status).toBe(409);
  await expect(json<RepositoryFailure>(stale)).resolves.toMatchObject({
    ok: false,
    code: "STALE_DOCUMENT",
  });

  const mappings: Array<[RepositoryFailure["code"], number]> = [
    ["INVALID_INPUT", 400],
    ["UNAUTHORIZED", 401],
    ["NOT_FOUND", 404],
    ["RATE_LIMITED", 429],
    ["STALE_DOCUMENT", 409],
    ["STALE_TASK_CONTEXT", 409],
    ["TASK_MODE_VIOLATION", 409],
    ["REQUEST_REPLAY_MISMATCH", 409],
    ["STALE_PAGE_CONTEXT", 409],
    ["WAIT_ALREADY_ACTIVE", 409],
    ["PROTOCOL_MISMATCH", 409],
  ];
  for (const [code, expectedStatus] of mappings) {
    const response = repositoryResponse({
      ok: false,
      code,
      message: "mapped",
      retryable: false,
    });
    expect(response.status, code).toBe(expectedStatus);
  }
});

test("protected reset is indistinguishable when unavailable and succeeds only with preview token", async () => {
  const originalToken = process.env.RATIFLOW_EVAL_RESET_TOKEN;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  const token = "route-reset-secret";
  const hidden = { ok: false, code: "NOT_FOUND" };
  try {
    const { POST: reset } = await import("./eval/reset/route");
    setEnvironment("VERCEL_ENV", "preview");
    setEnvironment("RATIFLOW_EVAL_RESET_TOKEN", undefined);
    const absent = await reset(request("/api/repository-v4/eval/reset", NO_BODY));
    expect(absent.status).toBe(404);
    expect(await json(absent)).toEqual(hidden);

    setEnvironment("RATIFLOW_EVAL_RESET_TOKEN", token);
    const wrong = await reset(request("/api/repository-v4/eval/reset", NO_BODY, {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(wrong.status).toBe(404);
    expect(await json(wrong)).toEqual(hidden);

    setEnvironment("VERCEL_ENV", "production");
    const production = await reset(request("/api/repository-v4/eval/reset", NO_BODY, {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(production.status).toBe(404);
    expect(await json(production)).toEqual(hidden);

    setEnvironment("VERCEL_ENV", "preview");
    const allowed = await reset(request("/api/repository-v4/eval/reset", NO_BODY, {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(allowed.status).toBe(201);
    await expect(json<{
      ok: true;
      data: { fixtureVersion: string; revision: number; activityVersion: number };
    }>(allowed)).resolves.toMatchObject({
      ok: true,
      data: {
        fixtureVersion: "repo-document-v4.postmortem.v1",
        revision: 1,
        activityVersion: 4,
      },
    });
  } finally {
    setEnvironment("RATIFLOW_EVAL_RESET_TOKEN", originalToken);
    setEnvironment("VERCEL_ENV", originalVercelEnvironment);
  }
});
