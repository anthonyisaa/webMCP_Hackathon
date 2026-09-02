import { expect, test } from "@playwright/test";

type ProbeEvidence = {
  schemaVersion: 2;
  overall: "PASSED" | "FAILED";
  evidenceClass: "UNCLASSIFIED_PAGE_OBSERVATION";
  namespace: string;
  observedInputEncoding: "NOT_OBSERVED" | "OBJECT" | "JSON_STRING_COMPAT";
  cancellationTransport:
    | "NATIVE_CALLBACK_SIGNAL"
    | "APPLICATION_PROPAGATED"
    | "UNAVAILABLE";
  initialCatalog: string[];
  relayCatalog: string[];
  relayPhysicalName: string;
  finalCatalog: string[];
  callbackDispatches: number;
  authorizedEchoes: number;
  cancellationObservedByCallback: number;
  checks: Array<{ id: string; status: string; detail: string }>;
};

test("bound supported browser is eligible for native idle → Relay → idle capture", async ({
  browser,
  browserName,
  page,
}) => {
  const configuredBaseURL = process.env.RATIFLOW_BASE_URL;
  const approvedBrowserChannel = process.env.RATIFLOW_NATIVE_BROWSER_CHANNEL;
  const approvedBrowserVersion = process.env.RATIFLOW_NATIVE_BROWSER_VERSION;
  const approvedUserAgentToken = process.env.RATIFLOW_NATIVE_USER_AGENT_TOKEN;
  if (!configuredBaseURL) throw new Error("RATIFLOW_BASE_URL is required.");
  const deployedURL = new URL(configuredBaseURL);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (deployedURL.protocol !== "https:" || loopbackHosts.has(deployedURL.hostname)) {
    throw new Error(
      "Native evidence requires an approved deployed HTTPS URL; local and adapter surfaces are rejected.",
    );
  }
  if (!approvedBrowserChannel || !approvedBrowserVersion || !approvedUserAgentToken) {
    throw new Error(
      "RATIFLOW_NATIVE_BROWSER_CHANNEL, RATIFLOW_NATIVE_BROWSER_VERSION, and RATIFLOW_NATIVE_USER_AGENT_TOKEN are required to bind native evidence to an approved client.",
    );
  }
  expect(browserName).toBe("chromium");
  expect(test.info().project.use.channel).toBe(approvedBrowserChannel);
  expect(browser.version()).toBe(approvedBrowserVersion);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/webmcp-probe");
  const nativeSurface = await page.evaluate(() => {
    const context = document.modelContext;
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "modelContext");
    const descriptorGetterSource = descriptor?.get
      ? Function.prototype.toString.call(descriptor.get)
      : "";
    return {
      userAgent: navigator.userAgent,
      hasDocumentModelContext: Boolean(context),
      hasGetTools: typeof context?.getTools === "function",
      hasExecuteTool: typeof context?.executeTool === "function",
      hasToolchangeListener:
        typeof context?.addEventListener === "function"
        && typeof context?.removeEventListener === "function",
      modelContextOwnProperty: Object.prototype.hasOwnProperty.call(document, "modelContext"),
      hasDocumentPrototypeDescriptor: Boolean(descriptor),
      descriptorHasGetter: typeof descriptor?.get === "function",
      descriptorGetterLooksNative: descriptorGetterSource.includes("[native code]"),
    };
  });
  test.info().annotations.push(
    {
      type: "native-browser-channel",
      description: approvedBrowserChannel,
    },
    {
      type: "native-browser-version",
      description: browser.version(),
    },
    {
      type: "native-user-agent",
      description: nativeSurface.userAgent,
    },
    {
      type: "evidence-class",
      description: "NATIVE_CAPTURED",
    },
  );
  expect(nativeSurface.userAgent).toContain(approvedUserAgentToken);
  expect(
    {
      hasDocumentModelContext: nativeSurface.hasDocumentModelContext,
      hasGetTools: nativeSurface.hasGetTools,
      hasExecuteTool: nativeSurface.hasExecuteTool,
      hasToolchangeListener: nativeSurface.hasToolchangeListener,
      modelContextOwnProperty: nativeSurface.modelContextOwnProperty,
      hasDocumentPrototypeDescriptor: nativeSurface.hasDocumentPrototypeDescriptor,
      descriptorHasGetter: nativeSurface.descriptorHasGetter,
      descriptorGetterLooksNative: nativeSurface.descriptorGetterLooksNative,
    },
    "This fail-closed smoke requires a browser-owned document.modelContext consumer API. An own-property adapter can never count as native evidence.",
  ).toEqual({
    hasDocumentModelContext: true,
    hasGetTools: true,
    hasExecuteTool: true,
    hasToolchangeListener: true,
    modelContextOwnProperty: false,
    hasDocumentPrototypeDescriptor: true,
    descriptorHasGetter: true,
    descriptorGetterLooksNative: true,
  });

  await expect(page.getByTestId("probe-phase")).toHaveText("IDLE");
  await page.getByRole("button", { name: "Run idle → Relay → idle proof" }).click();
  await expect(page.getByTestId("probe-outcome")).toHaveText("PASSED", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("probe-phase")).toHaveText("IDLE");

  const rawEvidence = await page.getByTestId("probe-evidence").textContent();
  if (!rawEvidence) throw new Error("The native probe did not render evidence.");
  const evidence = JSON.parse(rawEvidence) as ProbeEvidence;
  expect(evidence).toMatchObject({
    schemaVersion: 2,
    overall: "PASSED",
    evidenceClass: "UNCLASSIFIED_PAGE_OBSERVATION",
    namespace: "document.modelContext",
    initialCatalog: ["ratiflow_probe_idle"],
    relayCatalog: [evidence.relayPhysicalName],
    finalCatalog: ["ratiflow_probe_idle"],
    authorizedEchoes: 1,
    cancellationObservedByCallback: 1,
  });
  expect(["OBJECT", "JSON_STRING_COMPAT"]).toContain(evidence.observedInputEncoding);
  expect(["NATIVE_CALLBACK_SIGNAL", "APPLICATION_PROPAGATED"]).toContain(
    evidence.cancellationTransport,
  );
  expect(evidence.relayPhysicalName).toMatch(/^ratiflow_probe_relay_g_[a-f0-9]{32}$/u);
  expect(evidence.callbackDispatches).toBe(4);
  expect(evidence.checks).toHaveLength(11);
  expect(evidence.checks.every(({ status }) => status === "PASSED")).toBe(true);
  expect(pageErrors).toEqual([]);
});
