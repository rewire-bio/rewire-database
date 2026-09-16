import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateRecords } from './schema';
const catalogue = JSON.parse(fs.readFileSync('out/omics/catalogue.json', 'utf8'));
const records = validateRecords(catalogue.records);
const failures: string[] = [];
function page(url: string) {
  const file = path.join('out', url, 'index.html');
  if (!fs.existsSync(file)) failures.push(file);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
for (const record of records) {
  const html = page(`/database/${record.kind}/${record.id}/`);
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/database/') && !href.startsWith('/omics/')) continue;
    const url = new URL(href, 'https://benchmarks.rewire.it');
    let file = path.join('out', decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) failures.push(href);
  }
}
for (const url of ['/literature/', '/runs/mfass-v1/', '/runs/mfass-v2/', '/contribute/']) page(url);
if (!page('/').includes('id="mfass-v1"')) failures.push('Preserved MFASS v1 anchor');
const papers = JSON.parse(fs.readFileSync('data/benchmark-literature/papers.json', 'utf8'));
for (const paper of papers) page(`/literature/papers/${paper.id}/`);
const manifest = JSON.parse(fs.readFileSync('out/omics/manifest.json', 'utf8'));
for (const [file, digest] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(path.join('out/omics/releases', manifest.release_id, file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== digest) failures.push(`Checksum ${file}`);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Verified ${records.length} record pages and their local links, ${papers.length} historical paper pages, MFASS history and release checksums.`);

const contributionPage = page('/contribute/');
if (!contributionPage.includes('Submissions are not open yet.')) throw new Error('Submissions unexpectedly enabled');
if (!contributionPage.includes('no-referrer')) throw new Error('Contribution referrer protection missing');
if (/googletagmanager|google-analytics|goatcounter/i.test(contributionPage)) throw new Error('Analytics in contribution workflow');
console.log('New contribution route remains disabled and analytics-free.');
