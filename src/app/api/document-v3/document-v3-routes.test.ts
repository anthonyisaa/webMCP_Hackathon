import { randomUUID } from "node:crypto";

import { expect, test } from "vitest";

import { POST as launch } from "./launch/route";
import { POST as join } from "./join/route";
import { GET as surface } from "./surface/route";
import { POST as save } from "./save/route";
import { POST as createWork } from "./work/create/route";
import { POST as listWork } from "./agent/work/route";
import { POST as propose } from "./agent/proposal/route";
import { POST as accept } from "./work/accept/route";
import { POST as memory } from "./memory/route";

function request(
  path: string,
  body: unknown,
  token?: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://local.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test("v3 route chain preserves agent proposal and human acceptance authority", async () => {
  const launched = await json<{
    data: {
      shareToken: string;
      humanSessionToken: string;
      selfMemberId: string;
    };
  }>(await launch(request("/api/document-v3/launch", { displayName: "Jordan Lee" })));
  const joined = await json<{
    data: {
      humanSessionToken: string;
      agentSessionToken: string;
      selfMemberId: string;
    };
  }>(await join(request("/api/document-v3/join", {
    shareToken: launched.data.shareToken,
    displayName: "Maya Chen",
  })));

  const body = "Launch CSV export as generally available on October 15.";
  const saved = await json<{ data: { document: { revision: number } } }>(await save(request(
    "/api/document-v3/save",
    { expectedRevision: 0, requestId: randomUUID(), title: "Northstar", body },
    launched.data.humanSessionToken,
  )));
  expect(saved.data.document.revision).toBe(1);

  const created = await json<{ data: { document: { activityVersion: number } } }>(
    await createWork(request(
      "/api/document-v3/work/create",
      {
        expectedRevision: 1,
        requestId: randomUUID(),
        source: "CONTEXT_MENU",
        intent: "REWRITE",
        instruction: "Rewrite this recommendation while preserving both dates.",
        assignedToMemberId: joined.data.selfMemberId,
        targetField: "BODY",
        rangeStart: 0,
        rangeEnd: Array.from(body).length,
      },
      launched.data.humanSessionToken,
    )),
  );
  expect(created.data.document.activityVersion).toBe(2);

  const pageSessionId = randomUUID();
  const listedResponse = await listWork(request(
    "/api/document-v3/agent/work",
    {},
    joined.data.agentSessionToken,
    { "X-Ratiflow-Page-Session": pageSessionId },
  ));
  const listed = await json<{
    data: {
      workOrders: Array<{ workOrderId: string }>;
      revision: number;
      activityVersion: number;
    };
  }>(listedResponse);
  expect(listedResponse.status).toBe(200);
  expect(listed.data).toMatchObject({ revision: 1, activityVersion: 2 });
  expect(listed.data.workOrders).toHaveLength(1);

  const replacementText =
    "Launch a Northstar beta on October 15, then make CSV export generally available on November 1.";
  const proposed = await json<{
    data: { document: { revision: number; activityVersion: number } };
  }>(await propose(request(
    "/api/document-v3/agent/proposal",
    {
      workOrderId: listed.data.workOrders[0]?.workOrderId,
      expectedRevision: 1,
      replacementText,
      changeSummary: "Use a beta before general availability.",
    },
    joined.data.agentSessionToken,
    {
      "X-Ratiflow-Page-Session": pageSessionId,
      "Idempotency-Key": randomUUID(),
    },
  )));
  expect(proposed.data.document).toMatchObject({ revision: 1, activityVersion: 3 });

  const accepted = await json<{ data: { document: { body: string; revision: number } } }>(
    await accept(request(
      "/api/document-v3/work/accept",
      {
        workOrderId: listed.data.workOrders[0]?.workOrderId,
        expectedRevision: 1,
        requestId: randomUUID(),
        rationale: null,
      },
      launched.data.humanSessionToken,
    )),
  );
  expect(accepted.data.document).toMatchObject({ body: replacementText, revision: 2 });

  const inspected = await json<{ data: { document: { body: string } } }>(await surface(
    new Request("http://local.test/api/document-v3/surface", {
      headers: { authorization: `Bearer ${joined.data.humanSessionToken}` },
    }),
  ));
  expect(inspected.data.document.body).toBe(replacementText);

  const remembered = await json<{ data: { events: Array<{ kind: string; rationale: string | null }> } }>(
    await memory(request(
      "/api/document-v3/memory",
      { limit: 20 },
      joined.data.agentSessionToken,
    )),
  );
  expect(remembered.data.events.at(-1)).toMatchObject({
    kind: "PROPOSAL_ACCEPTED",
    rationale: null,
  });
});

test("agent routes reject missing page and idempotency context", async () => {
  const response = await listWork(request("/api/document-v3/agent/work", {}, "invalid"));
  expect(response.status).toBe(400);
  const proposalResponse = await propose(request(
    "/api/document-v3/agent/proposal",
    {},
    "invalid",
  ));
  expect(proposalResponse.status).toBe(400);
});
