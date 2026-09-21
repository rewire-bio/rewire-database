import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyContributionExport } from "../scripts/omics/contribution-export";

const privacy = '<meta name="referrer" content="no-referrer"/>';
async function rendered(enabled: boolean, configured = true) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED", String(enabled));
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", configured ? "public-client-key" : "");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "rewire-it.firebaseapp.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "rewire-it");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "public-app-id");
  const { default: Form } = await import("../app/contribute/ContributionForm");
  return privacy + renderToStaticMarkup(createElement(Form));
}
afterEach(() => { vi.unstubAllEnvs(); });

describe("contribution static export activation", () => {
  it("accepts the rendered enabled sign-in flow without exposing authenticated controls", async () => {
    const html = await rendered(true);
    expect(html).toContain('type="email"');
    expect(html).toContain("Email me a sign-in link");
    expect(verifyContributionExport(html, "true")).toBe(true);
  });
  it("accepts the disabled local-draft flow", async () => {
    const html = await rendered(false);
    expect(verifyContributionExport(html, "false")).toBe(false);
    expect(verifyContributionExport(html, undefined)).toBe(false);
  });
  it("rejects a disabled build when activation was expected, including missing Firebase config", async () => {
    await expect(rendered(false).then(html => verifyContributionExport(html, "true"))).rejects.toThrow("Enabled contribution export");
    await expect(rendered(true, false).then(html => verifyContributionExport(html, "true"))).rejects.toThrow("Enabled contribution export");
  });
  it("rejects an enabled build when validation forgot or disabled the activation flag", async () => {
    const html = await rendered(true);
    expect(() => verifyContributionExport(html, undefined)).toThrow("Disabled contribution export");
    expect(() => verifyContributionExport(html, "false")).toThrow("Disabled contribution export");
  });
  it("does not treat hydration text as an actual sign-in form", async () => {
    const html = await rendered(false);
    const fake = '<script><form><input type="email"/><button>Email me a sign-in link</button></form></script>';
    expect(() => verifyContributionExport(html + fake, "true")).toThrow("Enabled contribution export");
  });
  it("retains privacy checks in enabled mode", async () => {
    const html = await rendered(true);
    expect(() => verifyContributionExport(html.replace(privacy, ""), "true")).toThrow("referrer");
    expect(() => verifyContributionExport(html + '<script src="https://google-analytics.com/a.js"></script>', "true")).toThrow("Analytics");
    expect(() => verifyContributionExport(html + '<button>Copy library access token</button>', "true")).toThrow("authenticated controls");
  });
});
