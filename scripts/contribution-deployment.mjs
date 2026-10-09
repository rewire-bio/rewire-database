import assert from "node:assert/strict";
import { fetchWithRetry } from "./deployment-transaction.mjs";

/** Flags are deliberately strict: a misspelled activation must not silently deploy. */
export function deploymentFlag(value, name) {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false`);
}

/** @param {Record<string, string | undefined>} env */
export function contributionDeployment(env = process.env) {
  const backend = deploymentFlag(env.OMICS_CONTRIBUTIONS_ENABLED, "OMICS_CONTRIBUTIONS_ENABLED");
  const frontend = deploymentFlag(env.NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED, "NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED");
  const mail = deploymentFlag(env.OMICS_MAIL_ENABLED, "OMICS_MAIL_ENABLED");
  if (frontend && !backend) throw new Error("The contribution form requires the backend to be enabled");
  if (frontend) {
    for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID"]) {
      const value = env[`NEXT_PUBLIC_FIREBASE_${key}`];
      if (!value || /[\r\n\0]/.test(value)) throw new Error(`Missing or invalid NEXT_PUBLIC_FIREBASE_${key}`);
    }
    if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== env.FIREBASE_PROJECT_ID)
      throw new Error("Firebase client and deployment projects must match");
    if (!/^[a-z0-9.-]+$/.test(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN))
      throw new Error("Firebase auth domain must be a hostname");
  }
  // Deliberately exclude credentials and inherited runner environment variables.
  const service = {
    OMICS_CONTRIBUTIONS_ENABLED: String(backend),
    OMICS_MAIL_ENABLED: String(mail),
    PUBLIC_WEB_URL: "https://benchmarks.rewirebio.io",
    ALLOWED_ORIGINS: "https://benchmarks.rewire.it,https://benchmarks.rewirebio.io",
    MAIL_PROVIDER: "gmail",
    GMAIL_SERVICE_ACCOUNT: "rewire-mail-runtime@rewire-it.iam.gserviceaccount.com",
    GMAIL_SENDER: "tim@rewire.it",
    MAIL_FROM: "Rewire <tim@rewire.it>",
    MAIL_REPLY_TO: "tim@rewire.it",
  };
  return { backend, frontend, mail, service };
}

export function serviceEnvironment(config) {
  return Object.entries(config.service).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n";
}

/** @param {string[]} args @param {Record<string, string | undefined>} env */
export function contributionProbeMode(args = [], env = process.env) {
  const options = args.filter(arg => arg.startsWith("--contributions="));
  if (options.length > 1) throw new Error("Specify the contribution probe mode only once");
  const mode = options[0]?.split("=")[1];
  if (mode !== undefined && !["enabled", "disabled"].includes(mode))
    throw new Error("Use --contributions=enabled or --contributions=disabled");
  return mode || (deploymentFlag(env.OMICS_CONTRIBUTIONS_ENABLED, "OMICS_CONTRIBUTIONS_ENABLED") ? "enabled" : "disabled");
}

/** Unauthenticated, read-only probes: never create submissions or send mail. */
export async function verifyContributionGate(origin, { mode, releaseId, probe = Date.now(), fetchImpl = fetch }) {
  assert.ok(["enabled", "disabled"].includes(mode), "An explicit contribution mode is required");
  const enabled = mode === "enabled";
  async function request(path, expectedStatus) {
    const response = await fetchWithRetry(`${origin}/api/trpc/${path}${path.includes("?") ? "&" : "?"}verify=${probe}`, {
      fetchImpl, redirect: "manual", expectedStatus, expectedContentType: "application/json",
    });
    assert.equal(response.status, expectedStatus, `${path}: contributions expected ${mode}`);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store", "Private and mixed requests must not be cached");
    return response.json();
  }
  for (const procedure of ["submission.list", "curator.list"]) {
    const body = await request(procedure, enabled ? 401 : 503);
    if (enabled) assert.equal(body.error?.data?.code, "UNAUTHORIZED", "Enabled contributions still require authentication");
    else assert.deepEqual(body, { error: "Contributions are not enabled." });
  }
  const input = encodeURIComponent(JSON.stringify({ 0: { release_id: releaseId }, 1: {} }));
  const mixed = await request(`catalogue.release,submission.list?batch=1&input=${input}`, enabled ? 207 : 503);
  if (enabled) {
    assert.equal(mixed.length, 2);
    // The Worker sends a batch to the frontend only if every member is a catalogue
    // procedure; a mixed batch reaches Firebase, which serves no catalogue reads.
    assert.equal(mixed[0]?.error?.data?.code, "NOT_FOUND", "Mixed batches must not serve catalogue reads from Firebase");
    assert.equal(mixed[1]?.error?.data?.code, "UNAUTHORIZED", "A public procedure cannot authorize a private batch member");
  } else assert.deepEqual(mixed, { error: "Contributions are not enabled." });
}
