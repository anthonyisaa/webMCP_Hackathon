import { expect, test } from "@playwright/test";

type DemoSessions = {
  mayaSessionToken: string;
  agentSessionToken: string;
};

test("keeps a non-golden ratification's follow-up context truthful", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Launch deterministic workspace" }).click();
    await expect(page.locator(".revision-block")).toContainText("rev 7");
    const sessions = await page.evaluate(() => ({
      mayaSessionToken: sessionStorage.getItem("ratiflow.maya-session"),
      agentSessionToken: sessionStorage.getItem("ratiflow.agent-session"),
    })) as DemoSessions;
    expect(sessions.mayaSessionToken).toBeTruthy();
    expect(sessions.agentSessionToken).toBeTruthy();

    const webmcpMutation = async (token: string, body: unknown) => page.evaluate(async ({ token: sessionToken, request }) => {
      const response = await fetch("/api/workspace/webmcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    }, { token, request: body });

    const recommended = await webmcpMutation(sessions.agentSessionToken, {
      toolName: "recommend_option",
      capturedSelection: { kind: "OPTION", id: "opt_csv_ga_oct15" },
      capturedContextEpoch: 1,
      envelope: {
        expectedWorkspaceRevision: 7,
        contextEpoch: 1,
        requestId: "c1111111-1111-4111-8111-111111111111",
        rationale: "The deferred option fits the customer commitment.",
        payload: { optionId: "opt_csv_defer_nov1" },
      },
    });
    expect(recommended).toMatchObject({ ok: true, data: { resultingRevision: 8 } });

    const prepared = await webmcpMutation(sessions.agentSessionToken, {
      toolName: "prepare_decision",
      capturedSelection: { kind: "OPTION", id: "opt_csv_defer_nov1" },
      capturedContextEpoch: 2,
      envelope: {
        expectedWorkspaceRevision: 8,
        contextEpoch: 2,
        requestId: "c2222222-2222-4222-8222-222222222222",
        rationale: "Prepare the deferred scope for human review.",
        payload: {
          optionId: "opt_csv_defer_nov1",
          recommendation: "Defer CSV export to Nov 1.",
          risks: ["No Oct 15 export."],
          customerMessageDraft: "Northstar will receive CSV export on Nov 1.",
        },
      },
    });
    expect(prepared).toMatchObject({ ok: true, data: { resultingRevision: 9 } });

    const ratified = await page.evaluate(async ({ token, body }) => {
      const response = await fetch("/api/workspace/ratify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.json();
    }, {
      token: sessions.mayaSessionToken,
      body: {
        expectedWorkspaceRevision: 9,
        requestId: "c3333333-3333-4333-8333-333333333333",
        recommendation: "Defer CSV export to Nov 1.",
        customerMessage: "Northstar will receive CSV export on Nov 1.",
      },
    });
    expect(ratified).toMatchObject({
      ok: true,
      data: {
        resultingRevision: 10,
        workspace: {
          decision: { state: "COMMITTED" },
          followup: {
            inheritedContext: ["Defer export Nov 1, 2026", "GA Nov 1, 2026", "Launch capacity is 18 engineer-days"],
          },
        },
      },
    });
  } finally {
    await context.close();
  }
});
