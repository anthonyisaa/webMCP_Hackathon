import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.RATIFLOW_BASE_URL;
const nativeBrowserChannel = process.env.RATIFLOW_NATIVE_BROWSER_CHANNEL;
const nativeWebMCPTesting = process.env.RATIFLOW_NATIVE_WEBMCP_TESTING === "1";
if (!baseURL) {
  throw new Error("RATIFLOW_BASE_URL is required; refusing to run browser evals without a deployed URL");
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // Surface captures are timestamped manually with commit/client metadata; the default
  // reporter must not create an artifact that could be mistaken for native evidence.
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    channel: nativeBrowserChannel,
    ...(nativeWebMCPTesting ? {
      headless: false,
      launchOptions: { args: ["--enable-features=WebMCPTesting"] },
    } : {}),
  },
});
