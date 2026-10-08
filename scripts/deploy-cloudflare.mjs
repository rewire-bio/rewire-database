import { measureDeploymentStage as measure } from "./deployment-metrics.mjs";
import { command } from "./deploy-cloud-run.mjs";

// The Worker holds no data release; it is redeployed only when its own code,
// the legacy redirects or the frontend origin change. Public acceptance runs
// after every publication, through Cloudflare, against the live revision.
const endpoint = account => `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/rewire-database-web/deployments`;

/** @param {Record<string, string | undefined>} env */
export function edgeConfig(env = process.env) {
  const config = { account: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, origin: env.CLOUDFLARE_PUBLIC_ORIGIN };
  if (!config.account || !config.token || !config.origin) throw new Error("Cloudflare account, scoped API token and public verification origin are required");
  if (new URL(config.origin).protocol !== "https:") throw new Error("Use an HTTPS Cloudflare verification origin");
  return config;
}

export function frontendOrigin(url) {
  const origin = new URL(url);
  if (origin.protocol !== "https:" || !origin.hostname.endsWith(".run.app") || origin.pathname !== "/" || origin.search)
    throw new Error("The Worker must proxy to the frontend's run.app origin");
  return origin.origin;
}

/**
 * @param {{ config: ReturnType<typeof edgeConfig>, frontend: string, deployWorker: boolean, acceptance: string,
 *   run?: typeof command, fetchImpl?: typeof fetch }} options
 */
export async function publishEdge({ config, frontend, deployWorker, acceptance, run = command, fetchImpl = fetch }) {
  async function api(method = "GET", body) {
    const response = await fetchImpl(endpoint(config.account), {
      method, headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(`Cloudflare deployment API failed (${response.status})`);
    return result.result;
  }
  // Bootstrap once with Wrangler OAuth before enabling CI: a rollback target must exist.
  const previous = deployWorker ? (await measure("cloudflare.capture", () => api())).deployments?.[0] : undefined;
  if (deployWorker && !previous?.versions?.length) throw new Error("Bootstrap and verify the Worker before enabling automated deployment");
  try {
    if (deployWorker) await measure("cloudflare.worker_deploy", () => run(["npx", "--no-install", "wrangler", "deploy", "--var", `FRONTEND_ORIGIN:${frontendOrigin(frontend)}`]));
    await measure("cloudflare.smoke_verification", () => run(["node", "scripts/smoke-deployment.mjs", config.origin, "--independent-frontend"]));
    await measure("cloudflare.download_verification", () => run(["node", "scripts/check-cloudflare-ranges.mjs", config.origin]));
    await measure("cloudflare.catalogue_verification", () => run(["node", "scripts/check-live-catalogue.mjs", config.origin, "--website", "--independent-frontend", `--acceptance=${acceptance}`]));
  } catch (error) {
    if (!deployWorker) throw error;
    try {
      await measure("cloudflare.rollback", () => api("POST", { strategy: "percentage", versions: previous.versions }));
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Cloudflare deploy failed and rollback requires operator attention");
    }
    throw new Error("Cloudflare deploy failed; previous Worker version restored.", { cause: error });
  }
}
