import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// This adapter depends on the exact locked export implementation. Re-review it
// when Next changes; never silently fall back to a duplicate multi-GiB export.
export const NEXT_EXPORT_SHA256 = '552c92740df3190364a9639a505c8929f8aad56ff919b4854129a93ec3a3ce7b';

export function assertStaticExporter(root) {
  const packageFile = path.join(root, 'node_modules/next/package.json');
  const exporter = path.join(root, 'node_modules/next/dist/export/index.js');
  if (JSON.parse(fs.readFileSync(packageFile, 'utf8')).version !== '14.2.16' ||
      createHash('sha256').update(fs.readFileSync(exporter)).digest('hex') !== NEXT_EXPORT_SHA256)
    throw new Error('Static export linking requires the reviewed Next 14.2.16 exporter.');
}

const inside = (parent, file) => file.startsWith(`${parent}${path.sep}`);

/** Link only finished App Router HTML/RSC files to their exact static routes.
 * Next calls this after prerender workers finish. Other copyFile calls retain
 * their normal semantics. A collision, alias or cross-device link fails closed.
 */
export function staticExportCopy(root, copyFile, state = { linked: 0, bytes: 0 }) {
  root = fs.realpathSync(root);
  const sourceRoot = path.join(root, '.next/server/app');
  const outputRoot = path.join(root, 'out');
  return async (source, destination, flags) => {
    if (typeof source !== 'string' || typeof destination !== 'string')
      return copyFile(source, destination, flags);
    const from = path.resolve(source), to = path.resolve(destination);
    const extension = path.extname(from);
    if (!inside(sourceRoot, from) || !inside(outputRoot, to) || !['.html', '.rsc'].includes(extension))
      return copyFile(source, destination, flags);
    const stem = path.relative(sourceRoot, from).slice(0, -extension.length);
    const outputExtension = extension === '.html' ? 'html' : 'txt';
    const expected = stem === 'index'
      ? path.join(outputRoot, `index.${outputExtension}`)
      : path.join(outputRoot, stem, `index.${outputExtension}`);
    if (to !== expected || (flags !== undefined && flags !== 0))
      throw new Error(`Unexpected Next static export route: ${from} -> ${to}`);
    const stat = fs.lstatSync(from);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(from) !== from ||
        fs.realpathSync(path.dirname(to)) !== path.dirname(to))
      throw new Error('Static export links require ordinary files and canonical directories.');
    await fs.promises.link(from, to); // EEXIST / EXDEV remain errors; never overwrite or copy.
    state.linked += 1;
    state.bytes += stat.size;
  };
}

export function installStaticExportLinks(root) {
  assertStaticExporter(root);
  const state = { linked: 0, bytes: 0 };
  fs.promises.copyFile = staticExportCopy(root, fs.promises.copyFile.bind(fs.promises), state);
  return state;
}
