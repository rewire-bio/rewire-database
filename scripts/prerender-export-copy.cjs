'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_NEXT_VERSION = '14.2.16';
const ROOT_ENV = 'REWIRE_PRERENDER_EXPORT_ROOT';

function plainDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory)
    throw new Error(`Unsafe prerender export directory: ${directory}`);
  return stat;
}

/** Intercept only Next 14.2.16's completed app prerender copies. The factory
 * does not patch fs; tests and callers can exercise it in isolation. */
function createPrerenderExportCopy({ root, copyFile = fs.promises.copyFile, link = fs.promises.link } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root)
    throw new Error('A canonical absolute prerender export root is required.');
  plainDirectory(root);
  const app = path.join(root, '.next/server/app');
  const out = path.join(root, 'out');

  return async function prerenderExportCopy(source, destination, mode) {
    // Buffer/URL paths and all unrelated operations retain native semantics.
    if (typeof source !== 'string' || typeof destination !== 'string')
      return copyFile(source, destination, mode);
    const from = path.resolve(source), to = path.resolve(destination);
    const relative = path.relative(app, from);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative))
      return copyFile(source, destination, mode);
    const extension = path.extname(relative);
    if (extension !== '.html' && extension !== '.rsc') return copyFile(source, destination, mode);
    const route = relative.slice(0, -extension.length);
    const outputExtension = extension === '.html' ? 'html' : 'txt';
    const expected = route === 'index'
      ? path.join(out, `index.${outputExtension}`)
      : path.join(out, route, `index.${outputExtension}`);
    if (to !== expected) return copyFile(source, destination, mode);

    if (source !== from || destination !== to || (mode !== undefined && mode !== 0))
      throw new Error('Noncanonical prerender export copy or unsupported copy flags.');
    // realpath equality rejects a symlink anywhere in either parent chain.
    plainDirectory(root);
    plainDirectory(app);
    plainDirectory(out);
    plainDirectory(path.dirname(from));
    const parent = plainDirectory(path.dirname(to));
    const stat = fs.lstatSync(from);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(from) !== from)
      throw new Error(`Unsafe prerender export source: ${from}`);
    try {
      fs.lstatSync(to);
      throw new Error(`Prerender export destination already exists: ${to}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat.dev !== parent.dev) throw new Error('Prerender export requires one filesystem.');
    // link rejects a destination created after the check; never copy or overwrite.
    await link(from, to);
  };
}

function installPrerenderExportCopy(root) {
  plainDirectory(root);
  const packagePath = path.join(root, 'node_modules/next/package.json');
  const installed = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  if (installed !== SUPPORTED_NEXT_VERSION)
    throw new Error(`Prerender export hook supports Next ${SUPPORTED_NEXT_VERSION}; installed ${installed}.`);
  fs.promises.copyFile = createPrerenderExportCopy({ root, copyFile: fs.promises.copyFile });
}

module.exports = { createPrerenderExportCopy, installPrerenderExportCopy, SUPPORTED_NEXT_VERSION, ROOT_ENV };
// Explicit --require activation is confined to the Next build child. Forked
// workers may inherit it, but every non-export copy still delegates to Node.
if (process.env[ROOT_ENV]) installPrerenderExportCopy(process.env[ROOT_ENV]);
