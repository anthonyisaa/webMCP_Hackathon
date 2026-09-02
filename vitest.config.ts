import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: [
      "evals/agent/**/*.test.ts",
      "evals/protocol/**/*.test.ts",
      "evals/release/**/*.test.ts",
      "src/app/api/document-v3/**/*.test.ts",
      "src/app/api/repository-v4/**/*.test.ts",
      "src/agent-relay/**/*.test.ts",
      "src/capabilities/**/*.test.ts",
      "src/components/repository/**/*.test.ts",
      "src/domain/**/*.test.ts",
      "src/document/**/*.test.ts",
      "src/repository/**/*.test.ts",
      "src/webmcp/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: false,
    reporters: ["default"],
  },
});
