import { describe, it, expect } from "vitest";
import { legacyCatalogueDestination } from "../lib/omics-navigation";

describe("legacy catalogue navigation", () => {
  it("preserves unrelated repeated parameters and requested fragments", () => {
    expect(
      legacyCatalogueDestination(
        "/?kind=result&origin=literature#browse",
        "?q=RNA&area=rna&area=genomics&kind=model&origin=rewire_run",
        "#saved-view",
      ),
    ).toBe(
      "/?q=RNA&area=rna&area=genomics&kind=result&origin=literature#saved-view",
    );
  });
  it("uses the destination anchor when the old URL has none", () => {
    expect(
      legacyCatalogueDestination(
        "/?kind=result&origin=literature#browse",
      ),
    ).toBe("/?kind=result&origin=literature#browse");
  });
  it("rejects external redirects and browser backslash normalization", () => {
    for (const target of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example/",
    ])
      expect(() => legacyCatalogueDestination(target)).toThrow();
  });
});
