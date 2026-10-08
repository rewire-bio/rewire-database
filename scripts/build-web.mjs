import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The production frontend: Next's standalone server, its static assets and the
// public files it serves, assembled for the container image. Release data and
// downloads are excluded; they are served by the API and GitHub.
export const OUTPUT = 'build/web';
const EXCLUDED_PUBLIC = new Set(['omics', 'benchmark-literature']);
export const RUNTIME_FILES = ['scripts/server-entry.mjs', 'scripts/runtime-data.mjs', 'scripts/prepare-benchmark-data.mjs',
  'scripts/download-locations.mjs'];
export const ENTRYPOINT = 'runtime/scripts/server-entry.mjs';
const MAX_FILE_BYTES = 50 * 1024 ** 2;

// Producer files compiled into the image; the entrypoint refuses a pin that changes them.
export const COMPILED_DATA = ['lib/generated-benchmark-catalog.ts'];
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
  fs.writeFileSync(path.join(output, 'runtime/compiled-data.json'), JSON.stringify(Object.fromEntries(COMPILED_DATA.map(file =>
    [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))) + '\n');
  return verifyStandalone(output);
}

/** The server must never be able to read the release from its own image. */
export function verifyStandalone(output) {
  const files = walk(output);
  let bytes = 0;
  for (const name of files) {
    const size = fs.statSync(path.join(output, name)).size;
    bytes += size;
    if (/(^|\/)(public\/omics|data\/omics|workbench)\//.test(name) || /(^|\/)(catalogue|benchmark-data\.lock)\.json$/.test(name))
      throw new Error(`Release data must not ship in the frontend image: ${name}`);
    if (size > MAX_FILE_BYTES) throw new Error(`Unexpectedly large frontend file: ${name} (${size} bytes)`);
  }
  if (!files.includes('server.js') || !files.includes(ENTRYPOINT) || !files.includes('runtime/compiled-data.json') ||
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

/** The image holds code only. Building against an empty data root makes any
 * build-time read of a release fail, so the image cannot embed one. */
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
