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
    // Workers default to the available cores. Archive fixtures are large, but peak memory
    // with eight workers was under 5 GB, well within a CI runner's 16 GB.
    exclude: [
      ...configDefaults.exclude,
      "services/**",
      "workbench/**",
      "scratch/**",
      "benchmarks/**",
    ],
  },
});
