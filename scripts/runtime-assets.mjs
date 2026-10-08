import { readdir, mkdir, mkdtemp, readFile, link, copyFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';

// Runtime routing uses real checked pages and their assets. Full export and artifact
// inventory verification remain responsible for the complete production bundle.
export async function runtimeAssets(source = '.cloudflare/assets') {
  source = path.resolve(source);
  const target = await mkdtemp(path.join(path.dirname(source), 'runtime-check-'));
  async function copy(relative, optional = false) {
    try {
      const info = await lstat(path.join(source, relative));
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw Error('Unsafe runtime asset');
    } catch (error) { if (error.code === 'ENOENT' && optional) return; throw error; }
    let entries;
    try { entries = await readdir(path.join(source, relative), { withFileTypes: true }); }
    catch (error) {
      if (error.code === 'ENOENT' && optional) return;
      if (error.code !== 'ENOTDIR') throw error;
      await mkdir(path.dirname(path.join(target, relative)), { recursive: true });
      try { await link(path.join(source, relative), path.join(target, relative)); }
      catch (failure) { if (failure.code !== 'EXDEV') throw failure; await copyFile(path.join(source, relative), path.join(target, relative)); }
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw Error('Unsafe runtime asset');
      await copy(path.join(relative, entry.name));
    }
  }
  try {
    for (const file of ['index.html', '404.html', '_headers']) await copy(file);
    for (const file of ['deployment.json', 'release-manifest.json', 'contribute', '_next/static']) await copy(file, true);
    for (const kind of ['result', 'evaluation']) {
      const entries = await readdir(path.join(source, 'database', kind), { withFileTypes: true });
      const record = entries.find(entry => entry.isDirectory());
      if (!record) throw Error(`No checked ${kind} page`);
      await copy(path.join('database', kind, record.name));
    }
    await readFile(path.join(target, 'index.html'));
    return target;
  } catch (error) { await rm(target, {recursive:true, force:true}); throw error; }
}
