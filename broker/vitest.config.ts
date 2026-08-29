import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
