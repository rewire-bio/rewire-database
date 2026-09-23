import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewedRedirects, domainIds } from './legacy-redirects.mjs';

/** Run against Hosting (including its emulator), without executing page JavaScript. */
export async function checkLegacyRedirects(origin, { encodedQueries = true } = {}) {
  const { review, redirects } = reviewedRedirects();
  assert.deepEqual(JSON.parse(fs.readFileSync('firebase.json')).hosting.redirects, redirects);
  const observations = [];
  const check = async (path, status, destination) => {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    assert.equal(response.status, status, `${path}: HTTP status`);
    const location = response.headers.get('location');
    if (destination) {
      assert.ok(location, `${path}: Location missing`);
      const actual = new URL(location, origin), expected = new URL(destination, origin);
      assert.equal(actual.origin, new URL(origin).origin);
      assert.equal(actual.pathname, expected.pathname, `${path}: destination path`);
      assert.deepEqual([...actual.searchParams], [...expected.searchParams], `${path}: query values/order`);
      assert.equal(actual.hash, '', `${path}: preserve browser fragment inheritance`);
    }
    observations.push({ request_path: path, status: response.status, location });
    return response;
  };
  for (const redirect of redirects) {
    const path = redirect.source.replace('{,/}', '');
    await check(path, 301, redirect.destination);
    await check(`${path}/`, 301, redirect.destination);
  }
  await check('/database/?q=RNA+structure&area=rna&area=protein', 301, '/?q=RNA+structure&area=rna&area=protein');
  await check('/literature/?kind=model&origin=rewire_run&q=splice&q=RNA', 301, '/?kind=result&origin=literature&kind=model&origin=rewire_run&q=splice&q=RNA');
  for (const id of domainIds) await check(`/${id}/?kind=benchmark&area=wrong&q=DNA`, 301, `/?kind=model&area=${id}&kind=benchmark&area=wrong&q=DNA`);
  await check(`/literature/papers/${review.mappings[0].paper_id}/?q=RNA&filter=a&filter=b`, 301, `${review.mappings[0].destination}?q=RNA&filter=a&filter=b`);
  if (encodedQueries) {
    for (const query of ['q=a%26b&x=a%2Fb&literal=%2526&space=two%20words', 'q=%CE%B2-catenin&label=%E8%9B%8B%E7%99%BD&percent=100%25']) {
      await check(`/database/?${query}`, 301, `/?${query}`);
      await check(`/literature/?${query}`, 301, `/?kind=result&origin=literature&${query}`);
      await check(`/literature/papers/${review.mappings[0].paper_id}/?${query}`, 301, `${review.mappings[0].destination}?${query}`);
    }
  }
  for (const excluded of review.excluded) await check(`/literature/papers/${excluded.paper_id}/`, 200);
  for (const path of ['/literature/papers/unknown-paper/', '/literature/papers/', '/database/unknown-record/', '/dna-genomes/unknown/', '/withdrawn-article/', '/unknown-domain/']) await check(path, 404);
  return { tested_at: new Date().toISOString(), origin, encoded_queries_checked: encodedQueries, observations };
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const origin = process.argv[2] || 'http://127.0.0.1:5055';
  const emulator = process.argv.includes('--emulator');
  if (emulator) assert.match(new URL(origin).hostname, /^(127\.0\.0\.1|localhost)$/);
  const receipt = await checkLegacyRedirects(origin, { encodedQueries: !emulator });
  if (process.env.REWIRE_REDIRECT_RECEIPT) fs.writeFileSync(process.env.REWIRE_REDIRECT_RECEIPT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`Verified ${receipt.observations.length} legacy Hosting responses; encoded-query checks ${emulator ? 'require actual Hosting (documented emulator defect)' : 'passed'}.`);
}
