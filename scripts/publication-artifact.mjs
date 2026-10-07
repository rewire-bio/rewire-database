import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, lstat, link, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validReceipt } from './deployment-plan.mjs';

const safe = name => typeof name === 'string' && name.length > 0 &&
  !/[\\\u0000-\u001f]/.test(name) && !path.posix.isAbsolute(name) &&
  name.split('/').every(part => part && part !== '.' && part !== '..');
const payloadPath = name => safe(name) && ((name.startsWith('out/') && !name.startsWith('out/omics/')) ||
  ['public/omics/catalogue.json', 'public/omics/manifest.json', 'workbench/deployment-plan.json'].includes(name));
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function regular(file) {
  if (!(await lstat(file)).isFile()) throw Error('Publication payload requires regular files');
}
async function copy(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  try { await link(source, target); }
  catch (error) { if (error.code !== 'EXDEV') throw error; await copyFile(source, target); }
}
async function files(root, relative = '', skipOmics = false) {
  const result = [];
  if (!(await lstat(path.join(root, relative))).isDirectory()) throw Error('Publication payload requires real directories');
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (skipOmics && name === 'omics') continue;
    if (!safe(name)) throw Error('Unsafe publication file name');
    const info = await lstat(path.join(root, name));
    if (info.isSymbolicLink()) throw Error('Publication payload cannot contain symlinks');
    if (info.isDirectory()) result.push(...await files(root, name, skipOmics));
    else { await regular(path.join(root, name)); result.push(name); }
  }
  return result.sort();
}
function identity(plan, receipt, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit) || plan.commit !== commit || receipt.commit !== commit ||
    !validReceipt(receipt) || !['web', 'full'].includes(plan.mode) ||
    JSON.stringify(plan.fingerprints) !== JSON.stringify(receipt.fingerprints))
    throw Error('Publication artifact does not match checked source and release');
}
export async function packPublication(root = process.cwd(), destination = path.join(root, 'workbench/publication')) {
  // Refuse existing staging trees rather than deleting or following someone else's files.
  await mkdir(destination);
  const plan = JSON.parse(await readFile(path.join(root, 'workbench/deployment-plan.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(path.join(root, 'out/deployment.json'), 'utf8'));
  identity(plan, receipt, plan.commit);
  const names = (await files(path.join(root, 'out'), '', true)).filter(name => !name.startsWith('omics/')).map(name => `out/${name}`);
  names.push('public/omics/catalogue.json', 'public/omics/manifest.json', 'workbench/deployment-plan.json');
  const inventory = [];
  for (const name of names.sort()) {
    if (!payloadPath(name)) throw Error('Unexpected publication payload');
    const source = path.join(root, name); await regular(source);
    const info = await lstat(source);
    await copy(source, path.join(destination, name));
    inventory.push({ path: name, bytes: info.size, sha256: await hash(source) });
  }
  const manifest = { schema: 1, prepared_at: new Date().toISOString(), commit: plan.commit, mode: plan.mode, release_id: receipt.release_id, files: inventory };
  await writeFile(path.join(destination, 'artifact.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { files: inventory.length, bytes: inventory.reduce((n, file) => n + file.bytes, 0), mode: plan.mode };
}
export async function verifyPublication(source, commit) {
  await regular(path.join(source, 'artifact.json'));
  const manifest = JSON.parse(await readFile(path.join(source, 'artifact.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.commit !== commit || !Array.isArray(manifest.files)) throw Error('Invalid publication artifact');
  const expected = new Set(['artifact.json']);
  for (const file of manifest.files) {
    if (!payloadPath(file.path) || expected.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw Error('Unsafe or duplicate publication inventory');
    expected.add(file.path);
  }
  const actual = await files(source);
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) throw Error('Publication inventory differs from payload');
  for (const file of manifest.files) {
    const filename = path.join(source, file.path);
    if ((await lstat(filename)).size !== file.bytes || await hash(filename) !== file.sha256) throw Error('Publication payload checksum mismatch');
  }
  const plan = JSON.parse(await readFile(path.join(source, 'workbench/deployment-plan.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(path.join(source, 'out/deployment.json'), 'utf8'));
  identity(plan, receipt, commit);
  if (manifest.mode !== plan.mode || manifest.release_id !== receipt.release_id) throw Error('Publication artifact identity mismatch');
  const bytes = await readFile(path.join(source, 'public/omics/manifest.json'));
  if (createHash('sha256').update(bytes).digest('hex') !== receipt.manifest_sha256 ||
    JSON.parse(bytes).release_id !== receipt.release_id) throw Error('Publication manifest mismatch');
  return manifest;
}
export async function restorePublication(source, root = process.cwd(), commit) {
  const manifest = await verifyPublication(source, commit);
  // Full publications hydrate pinned archives before restore. Check identity, then reuse
  // those verified bytes through hardlinks without putting historical data in Actions artifacts.
  if (manifest.mode === 'full') {
    for (const name of ['catalogue.json', 'manifest.json']) {
      const current = path.join(root, 'public/omics', name);
      if (await hash(current) !== await hash(path.join(source, 'public/omics', name))) throw Error('Hydrated release differs from checked build');
    }
    await mkdir(path.join(root, 'out'), { recursive: true });
    await mkdir(path.join(root, 'out/omics'));
    for (const name of await files(path.join(root, 'public/omics'))) {
      await copy(path.join(root, 'public/omics', name), path.join(root, 'out/omics', name));
    }
  }
  for (const file of manifest.files) {
    if (manifest.mode === 'full' && file.path.startsWith('public/omics/')) continue;
    if (file.path === 'workbench/deployment-plan.json') {
      try {
        await regular(path.join(root, file.path));
        if (await hash(path.join(root, file.path)) !== file.sha256) throw Error('Existing publication plan differs from artifact');
        continue;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await copy(path.join(source, file.path), path.join(root, file.path));
  }
  return manifest;
}
async function main() {
  const [mode, source] = process.argv.slice(2);
  if (mode === 'pack') console.log(JSON.stringify(await packPublication()));
  else if (mode === 'verify' || mode === 'restore') {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const manifest = mode === 'verify' ? await verifyPublication(source, commit) : await restorePublication(source, process.cwd(), commit);
    if (process.env.GITHUB_OUTPUT) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(process.env.GITHUB_OUTPUT, `mode=${manifest.mode}\n`);
    }
    console.log(`Verified checked ${manifest.mode} publication artifact`);
  } else throw Error('Usage: publication-artifact.mjs pack | verify SOURCE | restore SOURCE');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
