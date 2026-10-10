import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
}));
import { BrowseReturn } from "../components/catalogue/SectionNavigation";

describe("reactive return to browsing context", () => {
  it("reads the router query on every render, including navigation between records", () => {
    state.search = new URLSearchParams({
      return_to: "/?kind=benchmark&q=NABench#browse",
    }).toString();
    const first = renderToStaticMarkup(
      <BrowseReturn fallback="/?kind=benchmark#browse" />,
    );
    expect(first).toContain('href="/?kind=benchmark&amp;q=NABench#browse"');
    state.search = new URLSearchParams({
      return_to: "/?kind=model&q=ESM&cursor=abc#browse",
    }).toString();
    const second = renderToStaticMarkup(
      <BrowseReturn fallback="/?kind=model#browse" />,
    );
    expect(second).toContain(
      'href="/?kind=model&amp;q=ESM&amp;cursor=abc#browse"',
    );
  });
  it("uses the safe fallback when a return path is absent or external", () => {
    for (const search of [
      "",
      "return_to=https%3A%2F%2Fevil.test",
      "return_to=%2F%2Fevil.test",
    ]) {
      state.search = search;
      expect(
        renderToStaticMarkup(
          <BrowseReturn fallback="/?kind=benchmark#browse" />,
        ),
      ).toContain('href="/?kind=benchmark#browse"');
    }
  });
});

describe("return link label", () => {
  it("names its destination", () => {
    for (const [search, label] of [
      [new URLSearchParams({ return_to: "/use-cases/pathogen-detection/#comparison-a" }).toString(), "Back to the use case"],
      [new URLSearchParams({ return_to: "/use-cases/" }).toString(), "Back to use cases"],
      [new URLSearchParams({ return_to: "/?kind=model&q=ESM#browse" }).toString(), "Back to search"],
      ["", "Browse all results"],
    ]) {
      state.search = search;
      const html = renderToStaticMarkup(<BrowseReturn fallback="/?kind=result#browse" />);
      expect(html).toContain(label);
      expect(html).not.toContain("Back to results");
    }
  });
});
