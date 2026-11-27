import { describe, expect, it } from "vitest";
import { relationLabel } from "../lib/evidence-labels";

const STORE_RELATIONS = [
  "alias_of", "applicable_to", "assessed_by", "assessment", "benchmark",
  "companion_of", "configuration", "configuration_of", "data", "dataset",
  "evaluates_task", "evaluation", "family", "implemented_by", "measured_in",
  "model", "parent", "part_of", "pipeline", "protocol",
  "same_data_as", "subject", "supersedes", "system", "used_in",
  "uses_data", "uses_model", "variant_of",
];

describe("relationLabel", () => {
  it("gives plain-English direct and reverse labels for every store relation", () => {
    for (const rel of STORE_RELATIONS) {
      const direct = relationLabel(rel, "direct");
      const reverse = relationLabel(rel, "reverse");
      expect(direct).not.toContain("_");
      expect(reverse).not.toContain("_");
      expect(direct.length).toBeGreaterThan(0);
      expect(reverse.length).toBeGreaterThan(0);
    }
    expect(relationLabel("configuration_of", "direct")).toBe("Configuration of");
    expect(relationLabel("configuration_of", "reverse")).toBe("Configuration");
    expect(relationLabel("uses_model", "direct")).toBe("Uses model");
    expect(relationLabel("uses_model", "reverse")).toBe("Used by");
    expect(relationLabel("part_of", "direct")).toBe("Part of");
    expect(relationLabel("part_of", "reverse")).toBe("Includes");
    expect(relationLabel("supersedes", "direct")).toBe("Supersedes");
    expect(relationLabel("supersedes", "reverse")).toBe("Superseded by");
  });

  it("formats unknown relations gracefully without underscores", () => {
    expect(relationLabel("custom_link", "direct")).toBe("Custom link");
  });
});
