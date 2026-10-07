import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import SectionNavigation, { revealFragment } from "../components/catalogue/SectionNavigation";
class ElementStub {
  parentElement: ElementStub | null = null;
  top = 0;
  children: DetailsStub[] = [];
  constructor(public id: string) {}
  scrollIntoView = vi.fn();
  querySelectorAll() { return this.children; }
  getBoundingClientRect() { return { top: this.top, bottom: 100 }; }
}
class DetailsStub extends ElementStub { open = false; }
class AnchorStub { constructor(public href: string) {} }
let renderer: ReactTestRenderer | undefined;
let nodes: Map<string, ElementStub>;
let events: Map<string, (event?: unknown) => void>;
let frames: Array<() => void>;
let properties: Map<string, string>;
const flush = () => { const pending = frames.splice(0); pending.forEach((fn) => fn()); };
beforeEach(() => {
  nodes = new Map(); events = new Map(); frames = []; properties = new Map();
  const eventHandlers = { addEventListener: (name: string, fn: (event?: unknown) => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name) };
  vi.stubGlobal("document", { ...eventHandlers, getElementById: (id: string) => nodes.get(id), documentElement: { style: { getPropertyValue: (key: string) => properties.get(key) || "", setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key) } } });
  vi.stubGlobal("window", { ...eventHandlers, location: { hash: "", href: "https://example.test/record/", origin: "https://example.test", pathname: "/record/", search: "" } });
  vi.stubGlobal("HTMLDetailsElement", DetailsStub);
  vi.stubGlobal("HTMLAnchorElement", AnchorStub);
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => { frames.push(fn); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

describe("section navigation", () => {
  it("reveals a disclosure target and all ancestors before scrolling", () => {
    const parent = new DetailsStub("outer");
    const target = new DetailsStub("specifications");
    const child = new DetailsStub("inner");
    target.parentElement = parent; target.children = [child]; nodes.set(target.id, target);
    revealFragment("#specifications");
    expect([parent.open, target.open, child.open]).toEqual([true, true, true]);
    expect(target.scrollIntoView).not.toHaveBeenCalled(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    for (const hash of ["", "#missing", "#%ZZ"]) expect(() => revealFragment(hash)).not.toThrow();
  });
  it("updates the current section in both scrolling directions and supports mobile jumps", () => {
    const first = new ElementStub("first"); first.top = 150;
    const second = new ElementStub("second"); second.top = 800;
    nodes.set(first.id, first); nodes.set(second.id, second);
    act(() => { renderer = create(<SectionNavigation sections={[{ id: "first", label: "First" }, { id: "second", label: "Second" }, { id: "missing", label: "Missing" }]} />, { createNodeMock: () => ({ offsetHeight: 62, getBoundingClientRect: () => ({ bottom: 100 }) }) }); });
    const selected = () => renderer!.root.findByType("select").props.value;
    expect(selected()).toBe("first");
    expect(properties.get("--section-nav-height")).toBe("62px");
    first.top = -900; second.top = 125; // Anchor offset can round 1–2px beyond the 24px gap.
    act(() => { events.get("scroll")?.(); events.get("scroll")?.(); flush(); });
    expect(selected()).toBe("second");
    second.top = 400;
    act(() => { events.get("scroll")?.(); flush(); });
    expect(selected()).toBe("first");
    act(() => renderer!.root.findByType("select").props.onChange({ target: { value: "second" } }));
    flush();
    expect(selected()).toBe("second");
    expect(second.scrollIntoView).toHaveBeenCalled();
    act(() => renderer!.root.findAllByType("a")[0].props.onClick());
    expect(selected()).toBe("first");
    act(() => renderer!.unmount()); renderer = undefined;
    expect(properties.has("--section-nav-height")).toBe(false);
    expect(events.size).toBe(0);
  });
  it("only reveals links within the same document on unmodified clicks", () => {
    const target = new ElementStub("first"); nodes.set(target.id, target);
    properties.set("--section-nav-height", "40px");
    act(() => { renderer = create(<SectionNavigation sections={[{ id: "first", label: "First" }]} />, { createNodeMock: () => ({ offsetHeight: 62, getBoundingClientRect: () => ({ bottom: 100 }) }) }); });
    const click = (href: string, extras = {}) => events.get("click")?.({ button: 0, target: { closest: () => new AnchorStub(href) }, ...extras });
    for (const href of ["https://external.test/record/#first", "https://example.test/other/#first", "https://example.test/record/?filter=x#first", "https://example.test/record/"]) click(href);
    for (const extras of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) click("https://example.test/record/#first", extras);
    events.get("click")?.({ button: 0, target: { closest: () => null } });
    flush(); expect(target.scrollIntoView).not.toHaveBeenCalled();
    click("https://example.test/record/#first"); flush();
    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    window.location.hash = "#first";
    events.get("hashchange")?.(); flush();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    act(() => renderer!.unmount()); renderer = undefined;
    expect(properties.get("--section-nav-height")).toBe("40px");
  });
  it("keeps the last section selected at the page bottom even below the sticky boundary", () => {
    const first = new ElementStub("first"); first.top = -600;
    const last = new ElementStub("sources"); last.top = 300;
    nodes.set(first.id, first); nodes.set(last.id, last);
    Object.assign(document.documentElement, { scrollHeight: 2000 });
    Object.assign(window, { scrollY: 1000, innerHeight: 844 });
    act(() => { renderer = create(<SectionNavigation sections={[{ id: "first", label: "First" }, { id: "sources", label: "Sources" }]} />, { createNodeMock: () => ({ offsetHeight: 62, getBoundingClientRect: () => ({ bottom: 100 }) }) }); });
    expect(renderer!.root.findByType("select").props.value).toBe("first");
    Object.assign(window, { scrollY: 1156 });
    act(() => { events.get("scroll")?.(); flush(); });
    expect(renderer!.root.findByType("select").props.value).toBe("sources");
    Object.assign(window, { scrollY: 1000 });
    act(() => { events.get("scroll")?.(); flush(); });
    expect(renderer!.root.findByType("select").props.value).toBe("first");
  });
});
