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
      "evals/protocol/**/*.test.ts",
      "src/capabilities/**/*.test.ts",
      "src/domain/**/*.test.ts",
      "src/webmcp/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: false,
    reporters: ["default"],
  },
});
