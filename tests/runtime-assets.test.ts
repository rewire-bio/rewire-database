import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runtimeAssets } from '../scripts/runtime-assets.mjs';
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-assets-')); roots.push(root);
  const source = path.join(root, 'assets'); await mkdir(source);
  for (const file of ['index.html','404.html','_headers','_next/static/chunk.js','contribute/index.html','database/result/one/index.html','database/result/two/index.html','database/evaluation/one/index.html','omics/private-download.json']) {
    await mkdir(path.dirname(path.join(source, file)), {recursive:true});
    await writeFile(path.join(source, file), file);
  }
  return {root, source};
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive:true, force:true}); });
it('checks real page bytes and chunks while leaving the full source and downloads intact', async () => {
  const {source} = await fixture(); const target = await runtimeAssets(source);
  expect(await readFile(path.join(target, 'database/result/one/index.html'), 'utf8')).toBe('database/result/one/index.html');
  expect(await readFile(path.join(target, '_next/static/chunk.js'), 'utf8')).toBe('_next/static/chunk.js');
  await expect(readFile(path.join(target, 'database/result/two/index.html'))).rejects.toThrow();
  await expect(readFile(path.join(target, 'omics/private-download.json'))).rejects.toThrow();
  expect(await readFile(path.join(source, 'omics/private-download.json'), 'utf8')).toBe('omics/private-download.json');
});
it('rejects a linked source asset and cleans only its owned temporary directory', async () => {
  const {root,source} = await fixture(); await rm(path.join(source, 'index.html'));
  await writeFile(path.join(root,'preserve'), 'original'); await symlink(path.join(root,'preserve'), path.join(source,'index.html'));
  await expect(runtimeAssets(source)).rejects.toThrow('Unsafe');
  expect(await readdir(root)).toEqual(['assets','preserve']);
  expect(await readFile(path.join(root,'preserve'), 'utf8')).toBe('original');
});
