import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Read-only acceptance probe. No Firebase credentials, imports or writes.
const origin = (process.argv[2] || 'https://benchmarks.rewire.it').replace(/\/$/, '');
const parsed = new URL(origin);
assert.ok(parsed.protocol === 'https:' || ['localhost','127.0.0.1'].includes(parsed.hostname), 'Use HTTPS outside local emulators');
assert.ok(!parsed.username && !parsed.password, 'Do not put credentials in probe URLs');
const manifest = JSON.parse(await readFile(new URL('../public/omics/manifest.json', import.meta.url),'utf8'));
const expectedCount=Object.values(manifest.counts).reduce((sum,count)=>sum+Number(count),0);
const pinned={release_id:manifest.release_id};
const probe=Date.now();
async function query(name,input) {
  const response=await fetch(`${origin}/api/trpc/catalogue.${name}?input=${encodeURIComponent(JSON.stringify(input))}&verify=${probe}`,{redirect:'manual',signal:AbortSignal.timeout(30_000)});
  assert.equal(response.status,200,`${name} must return 200`);
  assert.match(response.headers.get('content-type')||'',/application\/json/);
  const json=await response.json();
  assert.ok(json.result?.data,`${name} must return a catalogue response`);
  assert.equal(json.result.data.release_id,manifest.release_id,'API and generated website must use the same release');
  return json.result.data;
}
const release=await query('release',{});
assert.equal(release.record_count,expectedCount,'Public record count must match the release manifest');
const page=await query('list',{...pinned,kind:'model',limit:2});
assert.equal(page.items.length,2);
const result=await query('get',{...pinned,id:'b2-barcodebert-2026'});
assert.equal(result.record.attributes.printed_value,'78.5');
const rows=await query('results',{...pinned,id:result.record.id});
assert.equal(rows.total,1);
const row=rows.items[0];
assert.match(row.models[0]?.name||'',/BarcodeBERT/);
assert.ok(row.evaluation && row.benchmarks.length && row.datasets.length && row.sources.length);
assert.equal(row.review_status,'source_checked');
const modelResults=await query('results',{...pinned,id:row.models[0].id});
assert.ok(modelResults.items.some(item=>item.result.id===result.record.id),'The model must link back to its exact evaluation');
const evidence=await query('evidence',{...pinned,id:result.record.id,scope:'individual_claim',limit:10});
assert.ok(evidence.items.some(item=>item.field_path==='attributes.printed_value' && item.value==='78.5' && item.source_locator.includes('Table 1') && item.review_status==='source_checked'));
const disabled=await fetch(`${origin}/api/trpc/submission.list?verify=${probe}`,{redirect:'manual',signal:AbortSignal.timeout(30_000)});
assert.equal(disabled.status,503,'Production submissions must remain disabled');
assert.equal(disabled.headers.get('cache-control'),'no-store');
assert.deepEqual(await disabled.json(),{error:'Contributions are not enabled.'});
console.log(`Read-only live check passed: ${origin}, release ${manifest.release_id}, ${expectedCount} records; BarcodeBERT links and disabled submissions verified.`);
