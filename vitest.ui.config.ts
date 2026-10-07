import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// UI coverage includes reusable components and route-local UI, including hooks.
// Server route entry points, metadata, and data loading are checked separately.
export default mergeConfig(base, defineConfig({
  test: {
    coverage: {
      provider: "v8",
      all: true,
      reportOnFailure: true,
      include: [
        "components/**/*.{ts,tsx}",
        "app/database/Explorer*.tsx",
        "app/database/useCatalogueExplorer.ts",
        "app/database/**/detail.tsx",
        "app/database/_entities/*.tsx",
        "app/audits/AuditExplorer.tsx",
        "app/contribute/ContributionForm.tsx",
        "app/LegacyCatalogueRedirect.tsx",
        "app/not-found.tsx",
      ],
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "coverage/ui",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
}));
