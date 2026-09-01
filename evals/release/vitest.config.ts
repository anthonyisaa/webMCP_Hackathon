import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["evals/release/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
});
