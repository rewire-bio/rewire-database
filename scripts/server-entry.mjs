import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hydrateRuntimeData } from './runtime-data.mjs';
import { downloadLocations } from './download-locations.mjs';
import { verifyLock } from './prepare-benchmark-data.mjs';

// Container entrypoint: fix this revision's data pin, prepare the verified
// release files pages read, then start Next's unmodified standalone server.
// Changing REWIRE_DATA_PIN on Cloud Run adopts a release without a rebuild.
const here = path.dirname(fileURLToPath(import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function loadPin(env = process.env, cwd = process.cwd()) {
  const pin = JSON.parse(env.REWIRE_DATA_PIN ?? fs.readFileSync(path.join(cwd, 'benchmark-data.lock.json'), 'utf8'));
  verifyLock(pin);
  return pin;
}

/** The receipt a deployment publishes must describe this exact image and pin. */
export function checkReceipt(receipt, pin, frontend, releaseManifest) {
  if (receipt.frontend_version !== frontend || receipt.release_id !== pin.release_id ||
      receipt.producer_revision !== pin.revision || receipt.producer_repository !== pin.repository ||
      receipt.producer_manifest_sha256 !== pin.manifest_sha256 || receipt.manifest_sha256 !== sha(releaseManifest))
    throw new Error('Deployment receipt does not describe this image and data pin');
  return receipt;
}

/**
 * Producer files compiled into the image (only the candidate-model taxonomy)
 * must be byte-identical in the pinned release. Otherwise adopting the pin
 * needs an image build; starting would label new data with old code.
 */
export function checkCompiledData(compiled, manifest) {
  for (const [destination, digest] of Object.entries(compiled)) {
    const entry = manifest.files.find(file => file.destination === destination);
    if (!entry || entry.sha256 !== digest)
      throw new Error(`The pinned release changes ${destination}, which this image compiles in; build a new image to adopt it`);
  }
}

export async function prepareOrigin(env = process.env) {
  // A container must be told its release; only a prepared checkout may default to its lock file.
  if (!env.REWIRE_DATA_PIN && !env.REWIRE_DATA_ROOT) throw new Error('REWIRE_DATA_PIN is required');
  const pin = loadPin(env, env.REWIRE_DATA_ROOT || process.cwd());
  const frontend = env.REWIRE_FRONTEND_VERSION || '';
  if (!/^[a-f0-9]{40}$/.test(frontend)) throw new Error('REWIRE_FRONTEND_VERSION must be the image commit');
  const root = env.REWIRE_DATA_ROOT
    ? path.resolve(env.REWIRE_DATA_ROOT)
    : await hydrateRuntimeData(pin, env.REWIRE_DATA_CACHE || path.join(os.tmpdir(), 'rewire-data'));
  const manifestFile = [path.join(root, 'website/manifest.json'), path.join(root, 'workbench/benchmark-data/website/manifest.json')].find(file => fs.existsSync(file));
  if (!manifestFile) throw new Error('Pinned producer manifest unavailable');
  const manifestBytes = fs.readFileSync(manifestFile);
  downloadLocations(pin, manifestBytes); // Verifies digest, release and every download mapping.
  const compiledFile = path.join(here, '../compiled-data.json');
  if (fs.existsSync(compiledFile)) checkCompiledData(JSON.parse(fs.readFileSync(compiledFile, 'utf8')), JSON.parse(manifestBytes.toString('utf8')));
  const releaseManifest = fs.readFileSync(path.join(root, 'public/omics/manifest.json'));
  if (JSON.parse(releaseManifest.toString('utf8')).release_id !== pin.release_id) throw new Error('Release manifest differs from the data pin');
  if (env.REWIRE_DEPLOYMENT_RECEIPT) checkReceipt(JSON.parse(env.REWIRE_DEPLOYMENT_RECEIPT), pin, frontend, releaseManifest);
  return { pin, frontend, root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const started = Date.now();
  const { pin, frontend, root } = await prepareOrigin();
  // The application, middleware and route handlers read these.
  process.env.REWIRE_DATA_PIN = JSON.stringify(pin);
  process.env.REWIRE_DATA_RELEASE = pin.release_id;
  process.env.REWIRE_DATA_ROOT = root;
  console.log(`Prepared data release ${pin.release_id} for frontend ${frontend} in ${Date.now() - started} ms`);
  await import(pathToFileURL(process.env.REWIRE_NEXT_SERVER || path.join(here, '../../server.js')).href);
}
