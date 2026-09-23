import { createElement } from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_FRAME_ORIGIN, ANALYTICS_ORIGIN, CLIENT_KEY, CONSENT_KEY } from "../lib/analytics/privacy";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
let SiteAnalytics: typeof import("../components/SiteAnalytics").default;
let rendered: ReactTestRenderer | undefined;
let listeners: Map<string, Set<(event: any) => void>>;
let storage: Map<string, string>;
let frames: { contentWindow: { postMessage: ReturnType<typeof vi.fn> } }[];
let location: { origin: string; pathname: string; search: string; hash: string };
const stored = (choice: string) => JSON.stringify({ choice, at: Date.now() });
const emit = (name: string, event: unknown) => act(() => listeners.get(name)?.forEach(fn => fn(event)));
const iframe = () => rendered!.root.findAllByType("iframe");
function click(label: string) {
  const button = rendered!.root.findAllByType("button").find(button => button.props.children === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => button.props.onClick());
}
function mount() {
  act(() => {
    rendered = create(createElement(SiteAnalytics), {
      createNodeMock: element => {
        if (element.type !== "iframe") return null;
        const frame = { contentWindow: { postMessage: vi.fn() } };
        frames.push(frame);
        return frame;
      },
    });
  });
}
beforeAll(async () => {
  // Renderer and React are already loaded in test mode; only the site config
  // reads this environment. No browser or Google endpoint is contacted.
  await import("react/jsx-dev-runtime");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-P0CLMZMKF8");
  SiteAnalytics = (await import("../components/SiteAnalytics")).default;
  vi.stubEnv("NODE_ENV", "test");
});
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.useFakeTimers();
  navigation.path = "/";
  listeners = new Map(); storage = new Map(); frames = [];
  location = { origin: ANALYTICS_ORIGIN, pathname: "/", search: "?q=private", hash: "#private" };
  vi.stubGlobal("window", {
    location,
    addEventListener: (name: string, fn: (event: any) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: (event: any) => void) => listeners.get(name)?.delete(fn),
  });
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("document", { title: "Benchmark database", referrer: ANALYTICS_ORIGIN + "/contribute/?email=private" });
});
afterEach(() => {
  act(() => rendered?.unmount());
  rendered = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("analytics consent and React navigation", () => {
  it("makes no frame or client ID before consent, then passes only public page data", () => {
    mount();
    expect(iframe()).toHaveLength(0); expect(storage.has(CLIENT_KEY)).toBe(false);
    click("Allow analytics");
    expect(iframe()).toHaveLength(1);
    expect(iframe()[0].props.src).toBe(ANALYTICS_FRAME_ORIGIN + "/_analytics/");
    expect(iframe()[0].props.referrerPolicy).toBe("no-referrer");
    act(() => iframe()[0].props.onLoad());
    const [payload, target] = frames.at(-1)!.contentWindow.postMessage.mock.calls.at(-1)!;
    expect(target).toBe(ANALYTICS_FRAME_ORIGIN);
    expect(payload).toMatchObject({ page: { location: ANALYTICS_ORIGIN + "/" }, referrer: "" });
    expect(JSON.stringify(payload)).not.toContain("private");
    expect(storage.get(CLIENT_KEY)).toBe(payload.clientId);
  });
  it("sends withdrawal before teardown, deletes identity and waits for a trusted acknowledgement", () => {
    mount(); click("Allow analytics");
    const frame = frames.at(-1)!;
    click("Analytics preferences"); click("No thanks");
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith({ type: "rewire-stop" }, ANALYTICS_FRAME_ORIGIN);
    expect(storage.has(CLIENT_KEY)).toBe(false);
    expect(iframe()).toHaveLength(1);
    emit("message", { origin: "https://evil.example", source: frame.contentWindow, data: { type: "rewire-stopped" } });
    expect(iframe()).toHaveLength(1);
    emit("message", { origin: ANALYTICS_FRAME_ORIGIN, source: frame.contentWindow, data: { type: "rewire-stopped" } });
    expect(iframe()).toHaveLength(0);
  });
  it("tears down on timeout when a blocked frame cannot acknowledge", () => {
    mount(); click("Allow analytics"); click("Analytics preferences"); click("No thanks");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(iframe()).toHaveLength(0);
  });
  it("replaces a stopped frame when another tab denies and immediately grants again", () => {
    mount(); click("Allow analytics"); const oldFrame = frames.at(-1)!;
    emit("storage", { key: CONSENT_KEY, newValue: stored("denied") });
    emit("storage", { key: CONSENT_KEY, newValue: stored("granted") });
    expect(frames.at(-1)).not.toBe(oldFrame);
    emit("message", { origin: ANALYTICS_FRAME_ORIGIN, source: oldFrame.contentWindow, data: { type: "rewire-stopped" } });
    expect(iframe()).toHaveLength(1);
  });
  it("remounts after BFCache and does not reuse an identity withdrawn while cached", () => {
    mount(); click("Allow analytics"); const oldId = storage.get(CLIENT_KEY); const oldFrame = frames.at(-1);
    emit("pageshow", { persisted: true });
    expect(frames.at(-1)).not.toBe(oldFrame);
    storage.set(CONSENT_KEY, stored("denied")); storage.delete(CLIENT_KEY);
    emit("pageshow", { persisted: true });
    expect(iframe()).toHaveLength(0);
    click("Analytics preferences"); click("Allow analytics");
    expect(storage.get(CLIENT_KEY)).not.toBe(oldId);
  });
  it("removes analytics on private navigation even with previous consent", () => {
    mount(); click("Allow analytics");
    navigation.path = "/contribute/"; location.pathname = navigation.path;
    act(() => rendered!.update(createElement(SiteAnalytics)));
    expect(rendered!.toJSON()).toBeNull();
  });
  it("does not mount on the contribution landing page, preview hosts, or under browser privacy signals", () => {
    storage.set(CONSENT_KEY, stored("granted"));
    navigation.path = "/contribute/"; location.pathname = navigation.path; mount();
    expect(rendered!.toJSON()).toBeNull();
    act(() => rendered!.unmount()); rendered = undefined;
    navigation.path = "/"; location.pathname = "/"; location.origin = "https://preview.example"; mount();
    expect(rendered!.toJSON()).toBeNull();
    act(() => rendered!.unmount()); rendered = undefined;
    location.origin = ANALYTICS_ORIGIN; vi.stubGlobal("navigator", { globalPrivacyControl: true }); mount();
    expect(iframe()).toHaveLength(0);
    expect(rendered!.root.findAllByType("section")).toHaveLength(0);
  });
});
