import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/e2e/**/*.{test,spec}.{ts,tsx}"],
    exclude: (base.test?.exclude ?? []).filter((pattern: string) => pattern !== "tests/e2e/**"),
    testTimeout: 30_000,
    environment: "node",
  },
});
