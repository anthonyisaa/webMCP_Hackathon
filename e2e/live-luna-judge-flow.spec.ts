import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  MANAGED_AGENT_TOOL_CATALOGS,
  MANAGED_AGENT_TOOL_DEFINITIONS,
  RELAY_BOUNDS,
  type ManagedAgentSpecialty,
} from "../src/agent-relay/contracts";
import { MANAGED_RELAY_EXAMPLE_OVERLAYS } from "../src/domain/repository-examples";
import {
  REPOSITORY_TOOL_NAMES,
  type IssueDocumentKind,
} from "../src/repository/contracts";

const LIVE_LUNA_ENABLED = process.env.RATIFLOW_LIVE_LUNA_JUDGE === "1";
const REQUIRE_FIRST_ATTEMPT = process.env.RATIFLOW_REQUIRE_FIRST_ATTEMPT === "1";
const JUDGE_NAME = "WebMCP Judge";
const ATTEMPT_UI_TIMEOUT_MS = RELAY_BOUNDS.attemptDeadlineMs + 30_000;

type NativeCatalogEntry = {
  name: string;
  sameOrigin: boolean;
  sameWindow: boolean;
};

const AGENT_NAMES: Readonly<Record<ManagedAgentSpecialty, string>> = {
  CODE: "Code",
  DATA: "Data",
  GENERAL: "General",
};

async function nativeCatalog(page: Page): Promise<NativeCatalogEntry[]> {
  return page.evaluate(async () => {
    const context = document.modelContext;
    if (!context?.getTools) {
      throw new Error(
        "The configured browser does not expose document.modelContext.getTools().",
      );
    }
    const tools = await context.getTools();
    return tools.map((tool) => ({
      name: tool.name,
      sameOrigin: tool.origin === window.location.origin,
      sameWindow: tool.window === window,
    }));
  });
}

async function expectNativeBrowserSurface(page: Page): Promise<void> {
  const observation = await page.evaluate(() => {
    const context = document.modelContext;
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "modelContext",
    );
    const getterSource = descriptor?.get
      ? Function.prototype.toString.call(descriptor.get)
      : "";
    return {
      hasContext: Boolean(context),
      hasGetTools: typeof context?.getTools === "function",
      hasExecuteTool: typeof context?.executeTool === "function",
      hasToolchange: typeof context?.addEventListener === "function"
        && typeof context?.removeEventListener === "function",
      isDocumentOwnProperty: Object.prototype.hasOwnProperty.call(
        document,
        "modelContext",
      ),
      hasPrototypeDescriptor: Boolean(descriptor),
      hasNativeGetter: getterSource.includes("[native code]"),
      visibilityState: document.visibilityState,
    };
  });

  expect(
    observation,
    "The live Luna journey requires the configured browser's native document.modelContext surface; an injected adapter is not accepted.",
  ).toEqual({
    hasContext: true,
    hasGetTools: true,
    hasExecuteTool: true,
    hasToolchange: true,
    isDocumentOwnProperty: false,
    hasPrototypeDescriptor: true,
    hasNativeGetter: true,
    visibilityState: "visible",
  });
}

async function expectIdleCatalog(page: Page): Promise<void> {
  const expectedNames = [...REPOSITORY_TOOL_NAMES].sort();
  await expect.poll(async () => {
    const entries = await nativeCatalog(page);
    return {
      names: entries.map(({ name }) => name).sort(),
      ownedByPage: entries.every(({ sameOrigin, sameWindow }) =>
        sameOrigin && sameWindow),
    };
  }, {
    message: "The native page catalog should settle on the exact eight idle tools.",
    timeout: 15_000,
  }).toEqual({ names: expectedNames, ownedByPage: true });
}

function isExactRoleCatalog(
  entries: readonly NativeCatalogEntry[],
  specialty: ManagedAgentSpecialty,
): boolean {
  const role = specialty.toLocaleLowerCase("en-US");
  const providerKeys = MANAGED_AGENT_TOOL_CATALOGS[specialty]
    .map((logicalName) => MANAGED_AGENT_TOOL_DEFINITIONS[logicalName].providerKey)
    .sort();
  if (
    entries.length !== providerKeys.length
    || entries.some(({ sameOrigin, sameWindow }) => !sameOrigin || !sameWindow)
  ) return false;

  const prefixes = entries.map(({ name }) =>
    name.match(new RegExp(`^(rf_${role}_[a-f0-9]{16}_g[1-9][0-9]*_)`, "u"))?.[1]
    ?? null);
  const prefix = prefixes[0];
  if (!prefix || prefixes.some((candidate) => candidate !== prefix)) return false;
  const observedProviderKeys = entries
    .map(({ name }) => name.slice(prefix.length))
    .sort();
  return JSON.stringify(observedProviderKeys) === JSON.stringify(providerKeys);
}

async function waitForExactRoleCatalog(
  page: Page,
  specialty: ManagedAgentSpecialty,
): Promise<void> {
  let observed = false;
  await expect.poll(async () => {
    const entries = await nativeCatalog(page);
    if (isExactRoleCatalog(entries, specialty)) observed = true;
    return observed;
  }, {
    message: `The native catalog never exposed the exact ${specialty} role tools.`,
    timeout: 30_000,
    intervals: [50, 100, 200, 500],
  }).toBe(true);
}

async function launchExample(
  page: Page,
  kind: IssueDocumentKind,
  initialRevision: number,
): Promise<string> {
  await page.goto("/");
  await page.getByLabel("What should collaborators call you?").fill(JUDGE_NAME);
  const card = page.getByTestId("template-picker").locator(
    `[data-document-kind="${kind}"]`,
  );
  await expect(card).toBeEnabled();
  await card.click();
  await expect(page).toHaveURL(/\/issue\/[A-Za-z0-9_-]+$/u);
  await expect(page.getByTestId("repository-workspace")).toBeVisible();
  await expect(page.getByRole("button", {
    name: `Open revision history. Revision ${initialRevision}`,
  })).toBeVisible();
  await expect(page.getByTestId("writing-surface")).toHaveAttribute(
    "data-sheet-count",
    "2",
  );
  await expect(page.getByTestId("guided-selection")).toBeEnabled();
  await expectNativeBrowserSurface(page);
  await expectIdleCatalog(page);
  return page.url();
}

async function expectVisibleLogicalCatalog(
  page: Page,
  specialty: ManagedAgentSpecialty,
): Promise<Locator> {
  const agentName = AGENT_NAMES[specialty];
  const rail = page.getByRole("complementary", {
    name: "Comments, history, and relay",
  });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("tab", { name: /^Relay/u })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const recorder = rail.getByTestId("relay-flight-recorder");
  await expect(recorder).toContainText(`@${agentName}`);
  const catalog = recorder.getByRole("list", {
    name: `${agentName} tool catalog`,
  });
  await expect(catalog.locator("li")).toHaveText([
    ...MANAGED_AGENT_TOOL_CATALOGS[specialty],
  ]);
  await expect(recorder).toContainText("tools · role scoped");
  return recorder;
}

async function waitForAttemptOutcome(
  page: Page,
  recorder: Locator,
  agentName: string,
  expectedRevision: number,
): Promise<"COMPLETED" | "RETRY" | "EXHAUSTED"> {
  const revision = page.getByRole("button", {
    name: `Open revision history. Revision ${expectedRevision}`,
  });
  const retry = recorder.getByRole("button", { name: "Retry once" });
  const deadline = Date.now() + ATTEMPT_UI_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await retry.isVisible().catch(() => false)) return "RETRY";
    const recorderText = await recorder.textContent();
    if (recorderText?.includes("Attempt budget exhausted")
      || recorderText?.includes("run exhausted")) return "EXHAUSTED";
    if (
      await revision.isVisible().catch(() => false)
      && recorderText?.includes(`@${agentName}`)
      && recorderText?.includes("Run completed")
    ) return "COMPLETED";
    await page.waitForTimeout(250);
  }
  throw new Error(
    `The @${agentName} run did not complete or offer its bounded retry within the attempt window.`,
  );
}

async function expectTraceCompletion(recorder: Locator): Promise<void> {
  await expect(recorder).toContainText("Revision recorded");
  await expect(recorder).toContainText("Page dispatched the selected tool");
  await expect(recorder).toContainText("Scoped revision committed");
  await expect(recorder).toContainText("Application recorded the tool result");
  await expect(recorder).toContainText("Run completed");
  const kinds = await recorder.locator('[aria-label="Relay trace"] > li')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-kind")));
  const ordered = [
    "WEBMCP_EXECUTE_STARTED",
    "REVISION_COMMITTED",
    "WEBMCP_EXECUTE_COMPLETED",
    "RUN_COMPLETED",
  ];
  let cursor = -1;
  for (const kind of ordered) {
    cursor = kinds.indexOf(kind, cursor + 1);
    expect(cursor, `${kind} must appear in the application trace order.`)
      .toBeGreaterThanOrEqual(0);
  }
}

async function assignGuidedAgent(
  page: Page,
  specialty: ManagedAgentSpecialty,
  expectedRevision: number,
): Promise<void> {
  const agentName = AGENT_NAMES[specialty];
  const guided = page.getByTestId("guided-selection");
  await expect(guided).toContainText(`Load @${agentName}`);
  await guided.click();

  const composer = page.getByTestId("selection-comment-composer");
  await expect(composer).toBeVisible();
  await expect(composer.getByLabel("Comment or @ an agent")).toHaveValue(
    new RegExp(`^@${agentName}\\b`, "u"),
  );
  await expect(composer).toContainText(
    `Assigned to @${agentName} · ${specialty.toLocaleLowerCase("en-US")} specialist`,
  );

  const roleCatalog = waitForExactRoleCatalog(page, specialty);
  await composer.getByRole("button", {
    name: "Assign & run",
    exact: true,
  }).click();
  await roleCatalog;
  const recorder = await expectVisibleLogicalCatalog(page, specialty);

  for (let attempt = 1; attempt <= RELAY_BOUNDS.maxAttemptsPerRun; attempt += 1) {
    const outcome = await waitForAttemptOutcome(
      page,
      recorder,
      agentName,
      expectedRevision,
    );
    if (outcome === "COMPLETED") {
      await expectTraceCompletion(recorder);
      await expectIdleCatalog(page);
      return;
    }
    if (outcome === "EXHAUSTED") {
      throw new Error(`The @${agentName} run exhausted both bounded attempts.`);
    }
    if (REQUIRE_FIRST_ATTEMPT) {
      throw new Error(
        `The @${agentName} run offered Retry once; RATIFLOW_REQUIRE_FIRST_ATTEMPT=1 requires the first attempt to succeed.`,
      );
    }
    expect(attempt, "A second failed attempt exhausts the managed run.").toBeLessThan(
      RELAY_BOUNDS.maxAttemptsPerRun,
    );
    await expectIdleCatalog(page);
    const retryCatalog = waitForExactRoleCatalog(page, specialty);
    await recorder.getByRole("button", { name: "Retry once" }).click();
    await expect(page.getByRole("button", {
      name: `@${agentName} working. Open agent guide.`,
    })).toBeVisible({ timeout: 15_000 });
    await expect(recorder.getByRole("button", {
      name: "Retry once",
    })).toBeHidden({ timeout: 15_000 });
    await retryCatalog;
    await expectVisibleLogicalCatalog(page, specialty);
  }
}

async function inspectManagedRevision(
  page: Page,
  input: {
    revision: number;
    sourceRevision: number;
    agentName: string;
    evidence: RegExp;
    replacementFacts: readonly RegExp[];
  },
): Promise<void> {
  const rail = page.getByRole("complementary", {
    name: "Comments, history, and relay",
  });
  await rail.getByRole("tab", { name: /^History/u }).click();
  const card = rail.locator(
    `[data-testid="revision-card"][data-revision="${input.revision}"]`,
  );
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-authority", "direct");
  await expect(card).toContainText(
    `${input.agentName} · Direct from r${input.sourceRevision}`,
  );
  await card.getByRole("button").click();
  await expect(rail).toContainText(
    `${input.agentName} · managed agent changed the document`,
  );
  await expect(rail).toContainText(input.evidence);
  await expect(rail).toContainText("Immutable snapshot");
  const replacement = rail.locator("ins").last();
  for (const fact of input.replacementFacts) {
    await expect(replacement).toContainText(fact);
  }
  await rail.getByRole("button", { name: "← All history" }).click();
}

async function expectPostmortemFacts(page: Page): Promise<void> {
  const document = page.getByTestId("rendered-document-body");
  await expect(document).toContainText(/provider (?:HTTP )?429/iu);
  await expect(document).toContainText("7d3c9e1");
  await expect(document).toContainText("Retry-After");
  await expect(document).toContainText("5.8");
  await expect(document).toContainText(/18[,.\s]?240/u);
  await expect(document).toContainText(/external trigger/iu);
  await expect(document).toContainText(/internal amplifier/iu);
}

async function expectPostmortemCodeStructure(page: Page): Promise<void> {
  const rootCause = page.getByTestId("rendered-document-body").getByRole("heading", {
    name: "Root cause",
    exact: true,
  });
  const rootCauseList = rootCause.locator("xpath=following-sibling::ul[1]");
  const bullets = rootCauseList.locator(":scope > li");
  await expect(bullets).toHaveCount(3);
  await expect(bullets.nth(0)).toContainText(/^Trigger\b/u);
  await expect(bullets.nth(1)).toContainText(/^Amplifier\b/u);
  await expect(bullets.nth(2)).toContainText(/^Why it persisted\b/u);
}

async function expectProductFacts(page: Page): Promise<void> {
  const document = page.getByTestId("rendered-document-body");
  await expect(document).toContainText(/14 engineering days/iu);
  await expect(document).toContainText(/10[^\n]{0,80}4[^\n]{0,80}14/iu);
  await expect(document).toContainText(/18[^\n]{0,100}(?:exceed|over)[^\n]{0,40}4/iu);
  await expect(document).toContainText("October 15");
  await expect(document).toContainText(/invite-only/iu);
  await expect(document).toContainText("November 1");
}

test.describe("opt-in native Luna judge trajectory", () => {
  test.skip(
    !LIVE_LUNA_ENABLED,
    "Set RATIFLOW_LIVE_LUNA_JUDGE=1 to spend live Luna calls and run the native judge trajectory.",
  );

  test("fresh Postmortem @Code → r6 → @General → r7, then fresh Product @Data → r7", async ({
    browserName,
    page,
  }) => {
    test.setTimeout(660_000);
    expect(browserName).toBe("chromium");
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const postmortemUrl = await launchExample(page, "POSTMORTEM", 5);
    await expect(page.getByRole("heading", {
      level: 1,
      name: MANAGED_RELAY_EXAMPLE_OVERLAYS.POSTMORTEM.title,
    })).toBeVisible();

    await assignGuidedAgent(page, "CODE", 6);
    await expectPostmortemFacts(page);
    await expectPostmortemCodeStructure(page);
    await inspectManagedRevision(page, {
      revision: 6,
      sourceRevision: 5,
      agentName: "Code",
      evidence: /checkout\.log|commit:7d3c9e1/u,
      replacementFacts: [
        /provider (?:HTTP )?429/iu,
        /7d3c9e1/u,
        /Retry-After/u,
        /5\.8/u,
        /18[,.\s]?240/u,
      ],
    });

    await expect(page.getByTestId("guided-selection")).toContainText(
      "Load @General on Root cause",
    );
    await assignGuidedAgent(page, "GENERAL", 7);
    await expectPostmortemFacts(page);
    await inspectManagedRevision(page, {
      revision: 7,
      sourceRevision: 6,
      agentName: "General",
      evidence: /Ratiflow consistency rules/u,
      replacementFacts: [
        /external trigger/iu,
        /internal amplifier/iu,
        /7d3c9e1/u,
        /5\.8/u,
        /18[,.\s]?240/u,
      ],
    });
    await expect(page.getByRole("button", {
      name: "Open revision history. Revision 7",
    })).toBeVisible();

    const productUrl = await launchExample(page, "PRODUCT_DOCUMENT", 6);
    expect(productUrl).not.toBe(postmortemUrl);
    await expect(page.getByRole("heading", {
      level: 1,
      name: MANAGED_RELAY_EXAMPLE_OVERLAYS.PRODUCT_DOCUMENT.title,
    })).toBeVisible();
    await assignGuidedAgent(page, "DATA", 7);
    await expectProductFacts(page);
    await inspectManagedRevision(page, {
      revision: 7,
      sourceRevision: 6,
      agentName: "Data",
      evidence: /northstar_launch_capacity/u,
      replacementFacts: [
        /14(?: engineering)?[- ]days?/iu,
        /10[\s\S]{0,320}4[\s\S]{0,220}14/iu,
        /18[\s\S]{0,180}(?:exceed|over)[\s\S]{0,80}4/iu,
        /October 15/u,
        /invite-only/iu,
        /November 1/u,
      ],
    });
    await expect(page.getByRole("button", {
      name: "Open revision history. Revision 7",
    })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
