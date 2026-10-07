import { measureDeploymentStage as measure } from "./deployment-metrics.mjs";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { liveAcceptanceProfile } from "./deployment-plan.mjs";
import { assertNotSmokeExport } from "./assert-not-smoke-export.mjs";

assertNotSmokeExport();

// Firebase publication must have completed successfully first. Keep its origin
// and immutable historical releases available to both old and new Worker versions.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const origin = process.env.CLOUDFLARE_PUBLIC_ORIGIN;
if (!account || !token || !origin) throw new Error("Cloudflare account, scoped API token and public verification origin are required");
if (new URL(origin).protocol !== "https:") throw new Error("Use an HTTPS Cloudflare verification origin");
const plan = JSON.parse(await readFile("workbench/deployment-plan.json", "utf8"));
const acceptanceArgument = `--acceptance=${liveAcceptanceProfile(plan)}`;
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/rewire-database-web/deployments`;
async function api(method = "GET", body) {
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`Cloudflare deployment API failed (${response.status})`);
  return result.result;
}
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${args[0]} failed (${code})`)));
  });
}
// Bootstrap once with Wrangler OAuth before enabling CI. Requiring a rollback
// target prevents a failed first upload from replacing the old production site.
const previous = (await measure("cloudflare.capture", () => api())).deployments?.[0];
if (!previous?.versions?.length) throw new Error("Bootstrap and verify the Worker before enabling automated deployment");
try {
  await measure("cloudflare.upload_activation", () => run(["npx", "--no-install", "wrangler", "deploy"]));
  await measure("cloudflare.http_verification", () => run(["node", "scripts/check-hosting-http.mjs", origin]));
  await measure("cloudflare.range_verification", () => run(["node", "scripts/check-cloudflare-ranges.mjs", origin]));
  await measure("cloudflare.catalogue_verification", () => run(["node", "scripts/check-live-catalogue.mjs", origin, "--website", acceptanceArgument]));
} catch (error) {
  try {
    await measure("cloudflare.rollback", () => api("POST", { strategy: "percentage", versions: previous.versions }));
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], "Cloudflare deploy failed and rollback requires operator attention");
  }
  throw new Error("Cloudflare deploy failed; previous Worker version restored. Firebase retains the reviewed release.", { cause: error });
}
