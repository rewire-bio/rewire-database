import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileDiagram from "../components/catalogue/ProfileDiagram";

const step = "Specify molecules and input settings for a structure prediction job";
const longIdentifier = "A".repeat(80);

describe("profile diagram labels", () => {
  it("keeps the space between words at each wrapped line, and none inside a split identifier", () => {
    const html = renderToStaticMarkup(<ProfileDiagram diagram={{ title: "Workflow", steps: [step, longIdentifier], caption: "", source_ids: [], source_locator: "" }} />);
    const labels = [...html.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ""));
    expect(labels.filter((label) => label === longIdentifier).length).toBe(3);
    expect(labels.filter((label) => label === step).length).toBe(3);
  });
});
