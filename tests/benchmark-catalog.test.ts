import { describe, expect, it } from "vitest";
import { DOMAINS, MATCHES, MODELS, TESTS } from "../lib/benchmark-catalog";

describe("benchmark catalog integrity", () => {
  it("keeps six unique category routes", () => {
    expect(DOMAINS).toHaveLength(6);
    expect(new Set(DOMAINS.map((domain) => domain.id)).size).toBe(DOMAINS.length);
  });

  it("links each candidate model and test to at least one compatible match", () => {
    const domains = new Set(DOMAINS.map((domain) => domain.id));
    const models = new Map(MODELS.map((model) => [model.id, model]));
    const tests = new Map(TESTS.map((test) => [test.id, test]));
    expect(models.size).toBe(MODELS.length);
    expect(tests.size).toBe(TESTS.length);

    for (const model of MODELS) {
      expect(model.domainIds.length).toBeGreaterThan(0);
      expect(model.domainIds.every((id) => domains.has(id))).toBe(true);
      expect(MATCHES.some((match) => match.modelId === model.id)).toBe(true);
      expect(new URL(model.sourceUrl).protocol).toBe("https:");
    }
    for (const test of TESTS) {
      expect(domains.has(test.domainId)).toBe(true);
      expect(MATCHES.some((match) => match.testId === test.id)).toBe(true);
    }
    const pairs = new Set<string>();
    for (const match of MATCHES) {
      const model = models.get(match.modelId);
      const test = tests.get(match.testId);
      expect(model).toBeDefined();
      expect(test).toBeDefined();
      expect(model!.domainIds).toContain(test!.domainId);
      const pair = `${match.modelId}:${match.testId}`;
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
    }
  });
});
