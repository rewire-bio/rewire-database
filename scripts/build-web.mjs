import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyServing } from './fetch-serving-data.mjs';

// The production image: Next's standalone server, its static assets and public
// files, plus the pinned release under data/: the prepared SQLite file that
// pages and the public API read, and the few small files pages render.
// Downloads stay on GitHub. A data release is a new image.
export const OUTPUT = 'build/web';
export const DATA = 'data';
const EXCLUDED_PUBLIC = new Set(['omics', 'benchmark-literature']);
export const RUNTIME_FILES = ['scripts/server-entry.mjs', 'scripts/prepare-benchmark-data.mjs',
  'scripts/download-locations.mjs', 'scripts/fetch-serving-data.mjs'];
export const ENTRYPOINT = 'runtime/scripts/server-entry.mjs';
const MAX_FILE_BYTES = 50 * 1024 ** 2;

/** Checkout files the pages read, by destination. The prepared file holds everything else. */
export function renderFiles(lock, root) {
  const serving = verifyServing(lock);
  const releases = path.join(root, 'data/omics/releases');
  return [
    'benchmark-data.lock.json', 'website/manifest.json', `serving/${serving.file}`,
    'public/omics/manifest.json', 'public/omics/refresh.json', `public/omics/coverage/${lock.release_id}.json`,
    'data/benchmark-literature/papers.json', 'data/benchmark-literature/results.csv', 'data/omics/scope-audit.jsonl',
    'data/benchmark-runs/mfass-v2.json',
    // Release receipts listed by the updates page and feed.
    ...(fs.existsSync(releases) ? fs.readdirSync(releases).filter(name => /^[^/]+\.json$/.test(name)).map(name => `data/omics/releases/${name}`) : []),
  ];
}
const checkoutSource = { 'website/manifest.json': 'workbench/benchmark-data/website/manifest.json' };
// Modules the server cannot start without; the image must contain them itself.
const RUNTIME_MODULES = ['next', 'react', 'react-dom', 'styled-jsx', '@swc/helpers'];

function walk(root, relative = '', files = []) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in frontend build: ${name}`);
    if (entry.isDirectory()) walk(root, name, files);
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported file in frontend build: ${name}`);
  }
  return files;
}

/** Moves .next/standalone into build/web and adds what Next leaves to the operator. */
export function assembleStandalone(root = process.cwd()) {
  const standalone = path.join(root, '.next/standalone');
  const output = path.join(root, OUTPUT);
  if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Next standalone server missing; is output "standalone" configured?');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.renameSync(standalone, output);
  fs.cpSync(path.join(root, '.next/static'), path.join(output, '.next/static'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(root, 'public'))) {
    if (!EXCLUDED_PUBLIC.has(entry)) fs.cpSync(path.join(root, 'public', entry), path.join(output, 'public', entry), { recursive: true });
  }
  // The container entrypoint and its dependencies, at the same relative paths.
  for (const file of RUNTIME_FILES) {
    fs.mkdirSync(path.dirname(path.join(output, 'runtime', file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(output, 'runtime', file));
  }
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  for (const destination of renderFiles(lock, root)) {
    const source = path.join(root, checkoutSource[destination] || destination);
    if (!fs.existsSync(source)) throw new Error(`Release file missing from the checkout: ${destination}; run npm run data:prepare`);
    fs.mkdirSync(path.dirname(path.join(output, DATA, destination)), { recursive: true });
    fs.copyFileSync(source, path.join(output, DATA, destination));
  }
  return verifyStandalone(output, lock);
}

/** Release data ships only as the pinned files under data/, and the prepared file matches the lock. */
export function verifyStandalone(output, lock) {
  const files = walk(output);
  const expected = new Set(renderFiles(lock, path.join(output, DATA)).map(name => `${DATA}/${name}`));
  const serving = `${DATA}/serving/${verifyServing(lock).file}`;
  let bytes = 0;
  for (const name of files) {
    const size = fs.statSync(path.join(output, name)).size;
    bytes += size;
    if (name.startsWith(`${DATA}/`)) {
      if (!expected.has(name)) throw new Error(`Unexpected release file in the image: ${name}`);
      continue;
    }
    if (/(^|\/)(public\/omics|data\/omics|workbench|serving)\//.test(name) || /(^|\/)(catalogue|benchmark-data\.lock)\.json$/.test(name) || name.endsWith('.sqlite'))
      throw new Error(`Release data must ship only under ${DATA}/: ${name}`);
    if (size > MAX_FILE_BYTES) throw new Error(`Unexpectedly large frontend file: ${name} (${size} bytes)`);
  }
  for (const name of expected) if (!files.includes(name)) throw new Error(`Release file missing from the image: ${name}`);
  const embedded = JSON.parse(fs.readFileSync(path.join(output, DATA, 'benchmark-data.lock.json'), 'utf8'));
  if (JSON.stringify(embedded) !== JSON.stringify(lock)) throw new Error('Embedded lock differs from the checkout lock');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, serving))).digest('hex');
  if (digest !== lock.serving.sha256) throw new Error(`Prepared release file ${digest} differs from the lock`);
  if (!files.includes('server.js') || !files.includes(ENTRYPOINT) ||
      !files.some(name => name.startsWith('.next/static/'))) throw new Error('Incomplete standalone frontend');
  for (const module of RUNTIME_MODULES)
    if (!files.includes(`node_modules/${module}/package.json`)) throw new Error(`Runtime dependency missing from the image: ${module}`);
  // Load the server's module graph from inside the build: a file tracing missed fails here, not on Cloud Run.
  const load = spawnSync(process.execPath, ['-e', "require('next/dist/server/next'); require('next/dist/server/lib/start-server')"], { cwd: output, encoding: 'utf8' });
  if (load.status !== 0) throw new Error(`Standalone server cannot load its own modules:\n${load.stderr}`);
  // Runtime rendering only: prerendered HTML would carry the build's data.
  const prerendered = files.filter(name => name.startsWith('.next/server/app/') && name.endsWith('.html') && !/\/(_not-found|404|500)\.html$/.test(name));
  if (prerendered.length) throw new Error(`Frontend build prerendered data-bearing pages: ${prerendered.slice(0, 5).join(', ')}`);
  return { files: files.length, bytes };
}

/** Pages render on request. Building against an empty data root makes any
 * build-time read of a release fail, so no page is prerendered with data. */
function nextBuild(root) {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-build-without-data-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, REWIRE_DATA_ROOT: empty },
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Next build failed (${code})`)));
  }).finally(() => fs.rmSync(empty, { recursive: true, force: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await nextBuild(process.cwd());
    console.log(JSON.stringify(assembleStandalone()));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
