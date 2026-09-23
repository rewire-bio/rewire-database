import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const exists = (file) => {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const directory = (file) => {
  if (!fs.lstatSync(file).isDirectory()) throw new Error(`Expected a real directory: ${file}`);
};

function linkTree(source, destination) {
  // mkdir/link both reject existing destinations; never overwrite export files.
  fs.mkdirSync(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) linkTree(from, to);
    else if (entry.isFile()) fs.linkSync(from, to);
    else throw new Error(`Unsupported archive entry (no symlink exports): ${from}`);
  }
}

/**
 * Keep only the current release visible to Next's public-directory copier.
 * Staging and hard links require one filesystem; there is deliberately no copy
 * fallback. Build callbacks must settle only after their child has stopped.
 *
 * Recovery after SIGKILL, machine failure, or a restore collision:
 * workbench/build-static.lock/recovery.json identifies the root and releases.
 * Confirm its PID is no longer running, then move each directory in historical/
 * back to public/omics/releases/ ONLY if that destination does not exist. Resolve
 * collisions manually without deleting either copy. Remove the empty historical
 * directory, recovery.json and lock directory after restoring everything.
 * A stale lock is never automatically stolen; unrelated workbench files remain.
 * @param {{root?: string, build?: (options: {root: string, signal?: AbortSignal}) => Promise<unknown>, signal?: AbortSignal}} [options]
 */
export async function buildStatic({ root = process.cwd(), build, signal } = {}) {
  if (typeof build !== 'function') throw new TypeError('A build callback is required');
  root = path.resolve(root);
  const releases = path.join(root, 'public/omics/releases');
  const output = path.join(root, 'out/omics/releases');
  const lock = path.join(root, 'workbench/build-static.lock');
  const staged = path.join(lock, 'historical');
  const receipt = path.join(lock, 'recovery.json');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Static build already running or recovery required: ${lock}. Inspect recovery.json; never remove staged archives.`);
    throw error;
  }
  const moved = [];
  let failure;
  let current;
  try {
    signal?.throwIfAborted();
    directory(releases);
    ({ release_id: current } = JSON.parse(fs.readFileSync(path.join(root, 'public/omics/manifest.json'), 'utf8')));
    if (typeof current !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(current)) throw new Error('Invalid current release_id');
    directory(path.join(releases, current));
    const historical = fs.readdirSync(releases, { withFileTypes: true }).filter(entry => entry.name !== current);
    for (const entry of historical) if (!entry.isDirectory()) throw new Error(`Expected a historical release directory: ${path.join(releases, entry.name)}`);
    fs.mkdirSync(staged);
    fs.writeFileSync(receipt, JSON.stringify({ pid: process.pid, root, current_release: current, historical: historical.map(entry => entry.name), recovery: 'After confirming the build PID has stopped, restore historical/* to public/omics/releases without overwriting existing destinations; then remove this empty lock. See scripts/build-static.mjs.' }, null, 2) + '\n', { flag: 'wx' });
    for (const entry of historical) {
      fs.renameSync(path.join(releases, entry.name), path.join(staged, entry.name));
      moved.push(entry.name);
    }
    await build({ root, signal });
    signal?.throwIfAborted();
  } catch (error) { failure = error; }

  const restoreErrors = [];
  for (const name of moved) {
    const source = path.join(staged, name), destination = path.join(releases, name);
    try {
      if (exists(destination)) throw new Error(`Restore collision: ${destination}; preserved staged archive at ${source}`);
      fs.renameSync(source, destination);
    } catch (error) { restoreErrors.push(error); }
  }
  if (restoreErrors.length) {
    throw new AggregateError([...(failure ? [failure] : []), ...restoreErrors], `Archive restoration requires recovery at ${lock}. Both copies are preserved. ${restoreErrors.map(error => error.message).join('; ')}`);
  }
  try {
    if (!failure) {
      directory(output);
      directory(path.join(output, current)); // Never report success without the current release export.
      for (const name of moved) if (exists(path.join(output, name))) throw new Error(`Export collision: ${path.join(output, name)}; no files overwritten`);
      for (const name of moved) linkTree(path.join(releases, name), path.join(output, name));
    }
  } catch (error) { failure = error; }
  finally {
    // Delete only our known metadata and empty directories, never user files.
    try {
      if (exists(receipt)) fs.unlinkSync(receipt);
      if (exists(staged)) fs.rmdirSync(staged);
      fs.rmdirSync(lock);
    } catch (error) {
      failure = new AggregateError([...(failure ? [failure] : []), error], `Static build cleanup failed; inspect ${lock}`);
    }
  }
  if (failure) throw failure;
}

/** @param {{root: string, signal?: AbortSignal}} options */
export function runNextBuild({ root, signal }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], {
      cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
    });
    let signalError;
    const abort = () => {
      if (!child.pid) return;
      const reason = signal?.reason;
      const requested = reason === 'SIGINT' || reason === 'SIGTERM' ? reason : 'SIGTERM';
      try {
        if (process.platform === 'win32') child.kill(requested);
        else process.kill(-child.pid, requested);
      } catch (error) { if (error.code !== 'ESRCH') signalError = error; }
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.once('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.once('close', (code, killedBy) => {
      signal?.removeEventListener('abort', abort);
      if (signalError) reject(signalError);
      else if (code === 0 && !signal?.aborted) resolve();
      else reject(new Error(`Next build failed (${killedBy || code}${signal?.aborted ? `; interrupted by ${signal.reason}` : ''})`));
    });
  });
}

async function main() {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort('SIGINT');
  const onTerminate = () => controller.abort('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try { await buildStatic({ build: runNextBuild, signal: controller.signal }); }
  catch (error) {
    console.error(error);
    process.exitCode = controller.signal.reason === 'SIGINT' ? 130 : controller.signal.reason === 'SIGTERM' ? 143 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
