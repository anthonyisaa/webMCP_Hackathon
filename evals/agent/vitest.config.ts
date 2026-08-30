import { defineConfig } from "vitest/config";

// The application suite intentionally scopes its default include list to product code.
// Keep the ledger's self-contained evidence checks runnable without broadening that suite.
export default defineConfig({
  test: {
    include: ["evals/agent/**/*.test.ts"],
  },
});
