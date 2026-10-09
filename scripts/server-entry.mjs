import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { downloadLocations } from './download-locations.mjs';
import { verifyServing } from './fetch-serving-data.mjs';

// Container entrypoint: check the release the image embeds (data/), then
// start Next's unmodified standalone server. The image build verified the
// prepared file's digest; this refuses an image whose lock, prepared file and
// release manifest disagree. A data release is a new image.
const here = path.dirname(fileURLToPath(import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const PREPARED_CONTRACT_MAJOR = '2';

export function loadPin(root) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  verifyServing(pin);
  return pin;
}

/** The prepared file must be the pinned release, in a contract this image reads. */
export function checkPrepared(file, pin) {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map(row => [row.key, row.value]));
    if (meta.release_id !== pin.release_id) throw new Error(`Prepared file holds release ${meta.release_id}, not the pinned ${pin.release_id}`);
    if (String(meta.serving_contract_version).split('.')[0] !== PREPARED_CONTRACT_MAJOR)
      throw new Error(`Unsupported prepared contract ${meta.serving_contract_version}`);
    return meta;
  } finally { db.close(); }
}

/** The receipt a deployment publishes must describe this exact image and pin. */
export function checkReceipt(receipt, pin, frontend, releaseManifest) {
  if (receipt.frontend_version !== frontend || receipt.release_id !== pin.release_id ||
      receipt.producer_revision !== pin.revision || receipt.producer_repository !== pin.repository ||
      receipt.producer_manifest_sha256 !== pin.manifest_sha256 || receipt.manifest_sha256 !== sha(releaseManifest))
    throw new Error('Deployment receipt does not describe this image and data pin');
  return receipt;
}

export function prepareOrigin(env = process.env) {
  // The image's embedded release, or a prepared checkout for local checks.
  const root = path.resolve(env.REWIRE_DATA_ROOT || path.join(here, '../../data'));
  const pin = loadPin(root);
  const frontend = env.REWIRE_FRONTEND_VERSION || '';
  if (!/^[a-f0-9]{40}$/.test(frontend)) throw new Error('REWIRE_FRONTEND_VERSION must be the image commit');
  const manifestFile = [path.join(root, 'website/manifest.json'), path.join(root, 'workbench/benchmark-data/website/manifest.json')].find(file => fs.existsSync(file));
  if (!manifestFile) throw new Error('Pinned producer manifest unavailable');
  downloadLocations(pin, fs.readFileSync(manifestFile)); // Verifies digest, release and every download mapping.
  checkPrepared(path.join(root, 'serving', pin.serving.file), pin);
  const releaseManifest = fs.readFileSync(path.join(root, 'public/omics/manifest.json'));
  if (JSON.parse(releaseManifest.toString('utf8')).release_id !== pin.release_id) throw new Error('Release manifest differs from the data pin');
  if (env.REWIRE_DEPLOYMENT_RECEIPT) checkReceipt(JSON.parse(env.REWIRE_DEPLOYMENT_RECEIPT), pin, frontend, releaseManifest);
  return { pin, frontend, root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const started = Date.now();
  const { pin, frontend, root } = prepareOrigin();
  // The application, middleware and route handlers read these.
  process.env.REWIRE_DATA_PIN = JSON.stringify(pin);
  process.env.REWIRE_DATA_RELEASE = pin.release_id;
  process.env.REWIRE_DATA_ROOT = root;
  console.log(`Checked data release ${pin.release_id} for frontend ${frontend} in ${Date.now() - started} ms`);
  await import(pathToFileURL(process.env.REWIRE_NEXT_SERVER || path.join(here, '../../server.js')).href);
}
