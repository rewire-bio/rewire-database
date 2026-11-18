import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Archive fixtures are intentionally large; bound concurrent catalogue copies.
    maxWorkers: 2,
    minWorkers: 1,
    exclude: [
      ...configDefaults.exclude,
      "services/**",
      "workbench/**",
      "scratch/**",
      "benchmarks/**",
    ],
  },
});
