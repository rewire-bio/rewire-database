import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The frontend is one Cloud Run service reached by the Cloudflare Worker via
// its run.app URL: request-based billing (CPU only during requests), no
// minimum instances, a bounded maximum and no Google load balancer. A
// revision is image + data pin; a data-only release reuses the live image.
export const SERVICE = { region: 'europe-west2', name: 'rewire-database-web', memory: '2Gi', cpu: '1', concurrency: 20, timeout: 60 };

/** @param {Record<string, string | undefined>} env */
export function cloudRunConfig(env = process.env) {
  const config = {
    project: env.GCLOUD_PROJECT,
    repository: env.CLOUD_RUN_IMAGE_REPOSITORY,
    serviceAccount: env.CLOUD_RUN_SERVICE_ACCOUNT,
    maxInstances: Number(env.CLOUD_RUN_MAX_INSTANCES || 3),
  };
  if (config.project !== 'rewire-it') throw new Error('Frontend deployment requires the explicit production project');
  if (!/^europe-west2-docker\.pkg\.dev\/rewire-it\/[a-z0-9-]+\/[a-z0-9-]+$/.test(config.repository || ''))
    throw new Error('CLOUD_RUN_IMAGE_REPOSITORY must be an existing europe-west2 Artifact Registry image path');
  // A dedicated identity without project roles: the frontend only calls public APIs.
  if (!/^[a-z][a-z0-9-]+@rewire-it\.iam\.gserviceaccount\.com$/.test(config.serviceAccount || ''))
    throw new Error('CLOUD_RUN_SERVICE_ACCOUNT must be the frontend runtime service account');
  if (!Number.isInteger(config.maxInstances) || config.maxInstances < 1 || config.maxInstances > 10)
    throw new Error('CLOUD_RUN_MAX_INSTANCES must be between 1 and 10');
  return config;
}

/** Revision environment: the data pin and the receipt it must serve. */
export function revisionEnvironment(pin, receipt) {
  return { REWIRE_DATA_PIN: JSON.stringify(pin), REWIRE_DEPLOYMENT_RECEIPT: JSON.stringify(receipt) };
}

export function deployArguments(config, { image, envFile, tag }) {
  return ['run', 'deploy', SERVICE.name, '--project', config.project, '--region', SERVICE.region, '--image', image,
    '--no-traffic', '--tag', tag, '--env-vars-file', envFile,
    '--min-instances', '0', '--max-instances', String(config.maxInstances), '--cpu-throttling', '--cpu-boost',
    '--cpu', SERVICE.cpu, '--memory', SERVICE.memory, '--concurrency', String(SERVICE.concurrency),
    '--timeout', String(SERVICE.timeout), '--service-account', config.serviceAccount,
    '--allow-unauthenticated', '--ingress', 'all', '--quiet', '--format', 'json'];
}

export function trafficArguments(config, revision) {
  return ['run', 'services', 'update-traffic', SERVICE.name, '--project', config.project, '--region', SERVICE.region,
    '--to-revisions', `${revision}=100`, '--quiet', '--format', 'json'];
}

/** The revision serving all traffic and the service URL. The service template
 * names the latest created revision, which after a rollback is not the one serving. */
export function liveService(description) {
  const serving = (description.status?.traffic || []).filter(entry => entry.percent === 100);
  if (serving.length !== 1 || !serving[0].revisionName || !description.status?.url)
    throw new Error('Bootstrap the frontend service once and route all traffic to one revision before automated deployment');
  return { revision: serving[0].revisionName, url: description.status.url };
}

/** The immutable image of one revision, from that revision's own description. */
export function revisionImage(description, revision) {
  const image = description.spec?.containers?.[0]?.image;
  if (description.metadata?.name !== revision || !/@sha256:[a-f0-9]{64}$/.test(image || ''))
    throw new Error(`Serving revision ${revision} has no image digest to reuse`);
  return image;
}

/** Candidate checks through the revision's own tag URL, before any public traffic. */
export async function verifyCandidate(url, { receipt, samples, fetchImpl = fetch }) {
  const get = pathname => fetchImpl(new URL(pathname, url), { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
  const deployed = await get('/deployment.json');
  if (deployed.status !== 200 || JSON.stringify(await deployed.json()) !== JSON.stringify(receipt))
    throw new Error('Candidate revision does not serve the checked receipt');
  for (const pathname of ['/', ...samples]) {
    const response = await get(pathname);
    const html = await response.text();
    if (response.status !== 200 || response.headers.get('x-rewire-frontend') !== receipt.frontend_version ||
        response.headers.get('x-rewire-data-release') !== receipt.release_id || !html.includes(receipt.release_id))
      throw new Error(`Candidate revision failed ${pathname} (${response.status})`);
  }
  const download = await get(`/omics/releases/${receipt.release_id}/records.csv`);
  if (download.status !== 307 || !download.headers.get('location')?.startsWith(`https://raw.githubusercontent.com/${receipt.producer_repository}/${receipt.producer_revision}/`))
    throw new Error('Candidate revision does not redirect downloads to the pinned producer revision');
}

export function command(args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'] });
    let output = '';
    child.stdout?.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${args[0]} ${args[1]} failed (${code})`)));
  });
}

/**
 * Builds or reuses the image, deploys a candidate without traffic, verifies
 * it, then moves all traffic. Returns a rollback to the previous revision.
 */
export async function deployCloudRun({ config, plan, receipt, pin, samples, run = command, fetchImpl = fetch }) {
  const gcloud = (args, capture = true) => run(['gcloud', ...args], { capture });
  const live = liveService(JSON.parse(await gcloud(['run', 'services', 'describe', SERVICE.name, '--project', config.project,
    '--region', SERVICE.region, '--format', 'json'])));
  // A data-only release keeps the image that is serving now, exactly.
  let image = plan.frontend ? undefined : revisionImage(JSON.parse(await gcloud(['run', 'revisions', 'describe', live.revision,
    '--project', config.project, '--region', SERVICE.region, '--format', 'json'])), live.revision);
  if (plan.frontend) {
    const tagged = `${config.repository}:${receipt.frontend_version}`;
    await run(['docker', 'build', '--file', 'Dockerfile', '--build-arg', `REWIRE_FRONTEND_VERSION=${receipt.frontend_version}`, '--tag', tagged, 'build/web']);
    await run(['docker', 'push', tagged]);
    image = (await run(['docker', 'inspect', '--format', '{{index .RepoDigests 0}}', tagged], { capture: true })).trim();
  }
  // Revisions name immutable images, so a rollback redeploys exactly what ran.
  if (!/@sha256:[a-f0-9]{64}$/.test(image || '')) throw new Error('Frontend revisions must reference an image digest');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rewire-frontend-'));
  const envFile = path.join(directory, 'env.json');
  let candidate;
  try {
    await writeFile(envFile, JSON.stringify(revisionEnvironment(pin, receipt)), { mode: 0o600 });
    const tag = `c-${receipt.commit.slice(0, 12)}`;
    const deployed = JSON.parse(await gcloud(deployArguments(config, { image, envFile, tag })));
    candidate = deployed.status?.latestCreatedRevisionName;
    const url = deployed.status?.traffic?.find(entry => entry.tag === tag)?.url;
    if (!candidate || !url || candidate === live.revision) throw new Error('Candidate revision was not created');
    await verifyCandidate(url, { receipt, samples, fetchImpl });
  } finally { await rm(directory, { recursive: true, force: true }); }
  await gcloud(trafficArguments(config, candidate));
  return { previous: live.revision, revision: candidate, url: live.url, image,
    rollback: () => gcloud(trafficArguments(config, live.revision)) };
}
