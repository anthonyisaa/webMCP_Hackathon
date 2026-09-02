import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  root: repositoryRoot,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/app/deck/**/*.test.ts"],
  },
});
