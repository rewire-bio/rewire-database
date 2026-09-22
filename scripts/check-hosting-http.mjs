import assert from 'node:assert/strict';
import fs from 'node:fs';

const origin = process.argv[2] || 'http://127.0.0.1:5055';
async function check(path, status, type) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
  assert.equal(response.status, status, `${path}: expected ${status}, got ${response.status}`);
  if (type) assert.ok(response.headers.get('content-type')?.includes(type), `${path}: unexpected content type`);
  return response;
}

const home = await check('/', 200, 'text/html');
assert.match(await home.text(), /id="mfass-v1"/);
await check('/literature/?q=splice', 200, 'text/html');
await check('/runs/mfass-v2/', 200, 'text/html');
await check('/sitemap.xml', 200, 'xml');
const analytics = await check('/_analytics/', 200, 'text/html');
assert.equal(analytics.headers.get('referrer-policy'), 'no-referrer');
assert.match(analytics.headers.get('x-robots-tag') || '', /noindex/);
assert.match(analytics.headers.get('cache-control') || '', /no-store/);
await check('/_analytics/frame.js', 200, 'javascript');
for (const icon of ['/icon', '/apple-icon']) await check(icon, 200, 'image/png');
for (const name of ['papers.json', 'results.csv']) {
  const response = await check(`/benchmark-literature/${name}`, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(`data/benchmark-literature/${name}`));
}
for (const route of ['/__missing_page__/', '/blog/', '/benchmarks/']) await check(route, 404);
// Published baseline must not expose review-only routes. Review branch checks its own catalogue.
if (!fs.existsSync('app/database')) {
  await check('/database/', 404);
  await check('/contribute/', 404);
}
if (fs.existsSync('app/contribute')) {
  const response = await check('/contribute/', 200);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
}
console.log(`Firebase Hosting HTTP checks passed against ${origin}.`);
