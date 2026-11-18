import { describe, expect, it } from "vitest";
import { generateAgentsMd, generateLlmsFullText, generateLlmsTxt } from "@/lib/llm-discoverability";
import { SHOW_UNSOURCED_RANKINGS } from "@/lib/ranking-visibility";

// While the leaderboard rows are hand-written (#229), nothing served to LLMs or agents may carry
// their figures, model rankings or recommendations.
describe("unsourced rankings stay hidden", () => {
  it("is switched off", () => {
    expect(SHOW_UNSOURCED_RANKINGS).toBe(false);
  });

  const outputs = {
    "llms.txt": generateLlmsTxt("r1"),
    "llms-full.txt": generateLlmsFullText("r1"),
    "agents.md": generateAgentsMd("r1"),
  };

  for (const [name, text] of Object.entries(outputs)) {
    it(`${name} has no hand-written figures or rankings`, () => {
      for (const banned of ["ranks #1", "PoET-2", "0.612", "AlphaFold 3", "Quick Facts", "Recommended:", "Complete Model Rankings", "every month", "empirically validated"]) {
        expect(text, `${name} contains "${banned}"`).not.toContain(banned);
      }
    });
  }

  it("llms.txt still links the use cases and the agent hub", () => {
    expect(outputs["llms.txt"]).toContain("/use-cases/");
    expect(outputs["llms.txt"]).toContain("/agents.md");
    expect(outputs["llms.txt"]).toContain("## Connect your agent");
  });
});
