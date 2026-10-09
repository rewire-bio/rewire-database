import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ANALYTICS_ORIGIN, ANALYTICS_FRAME_ORIGIN, isPublicAnalyticsPath, privacySignal, publicPage, publicReferrer, readConsent } from "../lib/analytics/privacy";

function analyticsFrame(origin = ANALYTICS_FRAME_ORIGIN) {
  const scripts: Record<string, unknown>[] = [];
  let listener: (event: unknown) => void = () => {};
  const replies: unknown[] = [];
  const parent = { postMessage: (...args: unknown[]) => replies.push(args) };
  const window = { location: { origin }, parent, dataLayer: [] as IArguments[], addEventListener: (name: string, fn: typeof listener) => { if (name === "message") listener = fn; } };
  vm.runInNewContext(readFileSync("public/_analytics/frame.js", "utf8"), {
    window, URL, Date,
    document: { cookie: "", createElement: () => ({}), head: { appendChild: (script: Record<string, unknown>) => scripts.push(script) } },
  });
  const post = (path: string, overrides = {}) => listener({
    origin: ANALYTICS_ORIGIN, source: parent,
    data: { type: "rewire-public-page", measurementId: "G-P0CLMZMKF8", clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", page: { location: ANALYTICS_ORIGIN + path, title: "Model results" }, referrer: "https://example.org/search?email=private@example.org" },
    ...overrides,
  });
  return { scripts, window, post, replies, commands: () => window.dataLayer.map(args => Array.from(args)) };
}

describe("consented public analytics", () => {
  it("covers every current canonical record path, including dataset subsets", () => {
    const records = JSON.parse(readFileSync("public/omics/catalogue.json").toString("utf8")).records as { kind: string; id: string }[];
    expect(records.length).toBeGreaterThan(0);
    expect(records.filter(record => !isPublicAnalyticsPath(`/database/${record.kind}/${record.id}/`))).toEqual([]);
    const frame = analyticsFrame();
    frame.post("/database/dataset_subset/example/");
    expect(frame.commands().filter(row => row[0] === "event")).toHaveLength(1);
  });
  it("does not load or send anything without an explicit message from the consented parent", () => {
    const frame = analyticsFrame();
    expect(frame.scripts).toHaveLength(0);
    expect(frame.commands()).toHaveLength(0);
  });
  it("never loads on other origins or accepts messages from unrelated windows", () => {
    const local = analyticsFrame("http://localhost:3000"); local.post("/");
    expect(local.scripts).toHaveLength(0);
    const frame = analyticsFrame();
    frame.post("/", { source: {} }); frame.post("/", { origin: "https://evil.example" });
    expect(frame.scripts).toHaveLength(0);
    const sameOrigin = analyticsFrame(ANALYTICS_ORIGIN); sameOrigin.post("/");
    expect(sameOrigin.scripts).toHaveLength(0);
  });
  it("disables collection and acknowledges withdrawal before the parent removes the frame", () => {
    const frame = analyticsFrame();
    frame.post("/");
    frame.post("/", { data: { type: "rewire-stop" } });
    expect(frame.window).toHaveProperty("ga-disable-G-P0CLMZMKF8", true);
    expect(frame.commands().at(-1)).toEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(frame.replies).toEqual([[{ type: "rewire-stopped" }, ANALYTICS_ORIGIN]]);
    frame.post("/evidence/");
    expect(frame.commands().filter(row => row[0] === "event")).toHaveLength(1);
  });
  it("cannot start collecting after a withdrawal that arrives before its first page", () => {
    const frame = analyticsFrame();
    frame.post("/", { data: { type: "rewire-stop" } });
    frame.post("/");
    expect(frame.scripts).toHaveLength(0);
    expect(frame.commands().filter(row => row[0] === "event")).toHaveLength(0);
  });
  it("refuses contribution, callback, API, unknown and legacy pages", () => {
    const frame = analyticsFrame();
    for (const path of ["/contribute/", "/contribute/?oobCode=secret", "/api/", "/auth/callback/", "/unknown/", "/database/", "/literature/"]) {
      expect(isPublicAnalyticsPath(path.split("?")[0])).toBe(false);
      frame.post(path);
    }
    expect(frame.scripts).toHaveLength(0);
  });
  it("counts canonical public navigation once and strips query, fragment and referrer details", () => {
    const frame = analyticsFrame();
    frame.post("/?q=private-sequence#email");
    frame.post("/?q=another-private-sequence");
    frame.post("/database/model/esm-2/?return_to=private#auth");
    const events = frame.commands().filter(row => row[0] === "event");
    expect(events).toHaveLength(2);
    expect(events[0][2]).toMatchObject({ page_location: ANALYTICS_ORIGIN + "/", page_referrer: "https://example.org/" });
    expect(events[1][2]).toMatchObject({ page_location: ANALYTICS_ORIGIN + "/database/model/esm-2/", page_referrer: ANALYTICS_ORIGIN + "/" });
    expect(JSON.stringify(frame.commands())).not.toMatch(/private|email|auth|return_to/);
    expect(frame.scripts).toHaveLength(1);
    const config = frame.commands().find(row => row[0] === "config");
    expect(config?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, cookie_domain: "rewire-it.web.app", cookie_prefix: "rewire_bench" });
    expect(frame.commands()[0]).toEqual(["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect(frame.scripts[0]).toMatchObject({ referrerPolicy: "no-referrer", src: "https://www.googletagmanager.com/gtag/js?id=G-P0CLMZMKF8" });
  });
  it("counts returning to a page and cannot switch measurement IDs mid-session", () => {
    const frame = analyticsFrame();
    frame.post("/"); frame.post("/evidence/"); frame.post("/");
    frame.post("/evidence/", { data: { type: "rewire-public-page", measurementId: "G-OTHER", clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", page: { location: ANALYTICS_ORIGIN + "/evidence/", title: "Evidence" } } });
    expect(frame.commands().filter(row => row[0] === "event")).toHaveLength(3);
  });
  it("uses a blank referrer after a contribution visit", () => {
    const frame = analyticsFrame();
    frame.post("/", { data: { type: "rewire-public-page", measurementId: "G-P0CLMZMKF8", clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", page: { location: ANALYTICS_ORIGIN + "/", title: "Database" }, referrer: ANALYTICS_ORIGIN + "/contribute/?email=private" } });
    expect(frame.commands().find(row => row[0] === "event")?.[2]).toMatchObject({ page_referrer: "" });
  });
  it("sanitizes in the parent too", () => {
    expect(publicPage({ origin: ANALYTICS_ORIGIN, pathname: "/" }, "Database")).toEqual({ location: ANALYTICS_ORIGIN + "/", title: "Database" });
    expect(publicPage({ origin: "http://localhost:3000", pathname: "/" }, "Database")).toBeNull();
    expect(publicPage({ origin: ANALYTICS_ORIGIN, pathname: "/contribute/" }, "Private")).toBeNull();
    expect(publicReferrer(ANALYTICS_ORIGIN + "/contribute/?secret=1")).toBe("");
    expect(publicReferrer(ANALYTICS_ORIGIN + "/evidence/?q=secret")).toBe(ANALYTICS_ORIGIN + "/evidence/");
    expect(publicReferrer("https://search.example/query?q=secret#secret")).toBe("https://search.example/");
    expect(publicReferrer("javascript:alert(1)")).toBe("");
  });
  it("honours browser privacy preferences and expires consent after 180 days", () => {
    expect(privacySignal({ doNotTrack: "1" })).toBe(true);
    expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
    expect(privacySignal({})).toBe(false);
    const at = 100;
    for (const choice of ["granted", "denied"]) expect(readConsent(JSON.stringify({ choice, at }), 101)).toBe(choice);
    expect(readConsent(JSON.stringify({ choice: "granted", at }), 181 * 86400000)).toBeNull();
    expect(readConsent(JSON.stringify({ choice: "granted", at }), 99)).toBeNull();
    expect(readConsent("garbage")).toBeNull();
    expect(readConsent('{"choice":"granted"}')).toBeNull();
  });
});
