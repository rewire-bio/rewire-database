import { describe, expect, it, vi } from "vitest";
import {
  contributionDeployment,
  contributionProbeMode,
  serviceEnvironment,
  verifyContributionGate,
} from "../scripts/contribution-deployment.mjs";

const client = {
  FIREBASE_PROJECT_ID: "rewire-it",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "rewire-it",
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-client-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "rewire-it.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_APP_ID: "public-app-id",
};
const unauthorized = { error: { data: { code: "UNAUTHORIZED" } } };
const disabled = { error: "Contributions are not enabled." };
function response(body: unknown, status: number, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

describe("persistent contribution deployment settings", () => {
  it("defaults all activation flags off and never copies secrets", () => {
    const config = contributionDeployment({ SMTP_PASSWORD: "private", GOOGLE_APPLICATION_CREDENTIALS: "/private" });
    expect(config).toMatchObject({ backend: false, frontend: false, mail: false });
    const output = serviceEnvironment(config);
    expect(output).toContain('OMICS_CONTRIBUTIONS_ENABLED="false"');
    expect(output).toContain('PUBLIC_WEB_URL="https://benchmarks.rewirebio.io"');
    expect(output).not.toMatch(/private|PASSWORD|GOOGLE_APPLICATION_CREDENTIALS/);
  });
  it("allows backend activation before the public form", () => {
    expect(contributionDeployment({ OMICS_CONTRIBUTIONS_ENABLED: "true" })).toMatchObject({ backend: true, frontend: false });
  });
  it("requires working backend and complete Firebase config before enabling the form", () => {
    expect(() => contributionDeployment({ NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED: "true" })).toThrow("backend");
    const flags = { OMICS_CONTRIBUTIONS_ENABLED: "true", NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED: "true" };
    expect(() => contributionDeployment(flags)).toThrow("API_KEY");
    expect(contributionDeployment({ ...flags, ...client })).toMatchObject({ backend: true, frontend: true });
    expect(() => contributionDeployment({ ...flags, ...client, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "different" })).toThrow("projects must match");
    expect(() => contributionDeployment({ ...flags, ...client, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "https://invalid" })).toThrow("hostname");
  });
  it("keeps mail independently gated and supplies the reviewed nonsecret sender settings", () => {
    const config = contributionDeployment({ OMICS_MAIL_ENABLED: "true" });
    expect(config.mail).toBe(true);
    expect(config.service).toMatchObject({
      MAIL_PROVIDER: "gmail",
      GMAIL_SERVICE_ACCOUNT: "rewire-mail-runtime@rewire-it.iam.gserviceaccount.com",
      GMAIL_SENDER: "tim@rewire.it",
      MAIL_FROM: "Rewire <tim@rewire.it>", MAIL_REPLY_TO: "tim@rewire.it",
    });
  });
  it.each(["OMICS_CONTRIBUTIONS_ENABLED", "NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED", "OMICS_MAIL_ENABLED"])("rejects misspelled %s", key => {
    expect(() => contributionDeployment({ [key]: "tru" })).toThrow("must be true or false");
  });
});

describe("read-only contribution probes", () => {
  it("uses explicit mode, then the deployment flag, otherwise disabled", () => {
    expect(contributionProbeMode([], {})).toBe("disabled");
    expect(contributionProbeMode([], { OMICS_CONTRIBUTIONS_ENABLED: "true" })).toBe("enabled");
    expect(contributionProbeMode(["--contributions=disabled"], { OMICS_CONTRIBUTIONS_ENABLED: "true" })).toBe("disabled");
    expect(() => contributionProbeMode(["--contributions=unknown"], {})).toThrow("enabled or");
    expect(() => contributionProbeMode(["--contributions=enabled", "--contributions=disabled"], {})).toThrow("only once");
  });
  it("verifies the disabled gate for submissions, curator reads and mixed batches", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => response(disabled, 503));
    await verifyContributionGate("https://example.test", { mode: "disabled", releaseId: "release-1", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining("submission.list?"), expect.stringContaining("curator.list?"),
      expect.stringContaining("catalogue.release,submission.list?batch=1"),
    ]);
  });
  it("verifies enabled authentication and mixed-batch isolation without a token or writes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(unauthorized, 401))
      .mockResolvedValueOnce(response(unauthorized, 401))
      .mockResolvedValueOnce(response([{ result: { data: { release_id: "release-1" } } }, unauthorized], 207));
    await verifyContributionGate("https://example.test", { mode: "enabled", releaseId: "release-1", fetchImpl });
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.method).toBeUndefined();
      expect(options.headers).toBeUndefined();
      expect(options.body).toBeUndefined();
    }
  });
  it("rejects cached private responses", async () => {
    const fetchImpl = vi.fn(async () => response(unauthorized, 401, { "cache-control": "public,max-age=60" }));
    await expect(verifyContributionGate("https://example.test", { mode: "enabled", releaseId: "release-1", fetchImpl })).rejects.toThrow("must not be cached");
  });
  it("rejects a mixed-batch private member that succeeds anonymously", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(unauthorized, 401))
      .mockResolvedValueOnce(response(unauthorized, 401))
      .mockResolvedValueOnce(response([{ result: { data: { release_id: "release-1" } } }, { result: { data: [] } }], 207));
    await expect(verifyContributionGate("https://example.test", { mode: "enabled", releaseId: "release-1", fetchImpl })).rejects.toThrow("cannot authorize");
  });
  it("does not mistake an authentication or routing failure for a disabled service", async () => {
    const fetchImpl = vi.fn(async () => response(unauthorized, 401));
    await expect(verifyContributionGate("https://example.test", { mode: "disabled", releaseId: "release-1", fetchImpl })).rejects.toThrow("expected disabled");
  });
});
