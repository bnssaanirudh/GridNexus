import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();
// Integration fixtures truncate tables. Never run them on a local application DB.
if (!process.env.CI) {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || !new URL(testUrl).pathname.endsWith("_test")) {
    throw new Error("Set TEST_DATABASE_URL to a disposable database whose name ends in _test. Integration tests clear tables; the application database is forbidden.");
  }
  process.env.DATABASE_URL = testUrl;
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
