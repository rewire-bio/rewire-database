import { afterEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ pathname: "/" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import Header, { primaryNavigationHref } from "../components/header";
let renderer: ReactTestRenderer;
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe("primary navigation", () => {
  it.each([
    ["/", "/"], ["/database", "/"], ["/database/result/x/", "/"],
    ["/models", "/models/"], ["/models/page/2/", "/models/"],
    ["/database/model/x/", "/models/"], ["/database/benchmark/x/", "/benchmarks/"],
    ["/use-cases/example/", "/use-cases/"], ["/literature/papers/example/", "/evidence/"],
    ["/investigations/x/", "/evidence/"], ["/literature/papers/x/", "/evidence/"],
    ["/contribute", "/contribute/"], ["/unknown", undefined],
  ])("places %s in its parent section", (path, expected) => {
    expect(primaryNavigationHref(path)).toBe(expected);
  });
  it("marks exact pages separately from a parent section", () => {
    state.pathname = "/models";
    expect(renderToStaticMarkup(<Header />)).toContain('href="/models/" class="active" aria-current="page"');
    state.pathname = "/database/model/example/";
    expect(renderToStaticMarkup(<Header />)).toContain('href="/models/" class="active" aria-current="location"');
    state.pathname = null;
    expect(renderToStaticMarkup(<Header />)).toContain('href="/" class="active" aria-current="page"');
  });
  it("dismisses the mobile menu with Escape and returns focus to its toggle", () => {
    const events = new Map<string, (event: { key: string }) => void>();
    vi.stubGlobal("document", { addEventListener: (name: string, fn: (event: { key: string }) => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name) });
    const focus = vi.fn();
    state.pathname = "/";
    act(() => { renderer = create(<Header />, { createNodeMock: (node) => node.type === "button" ? { focus } : null }); });
    const toggle = () => renderer.root.findByType("button");
    act(() => toggle().props.onClick());
    expect(toggle().props["aria-expanded"]).toBe(true);
    act(() => events.get("keydown")?.({ key: "Tab" }));
    expect(toggle().props["aria-expanded"]).toBe(true);
    act(() => events.get("keydown")?.({ key: "Escape" }));
    expect(toggle().props["aria-expanded"]).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
    act(() => toggle().props.onClick());
    act(() => renderer.root.findAllByType("a").find((link) => link.props.href === "/models/")!.props.onClick());
    expect(toggle().props["aria-expanded"]).toBe(false);
    act(() => toggle().props.onClick());
    state.pathname = "/models/";
    act(() => renderer.update(<Header />));
    expect(toggle().props["aria-expanded"]).toBe(false);
  });
});
