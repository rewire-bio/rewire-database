import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firebase } from '../services/omics/dist/firebase.js';
import { importRelease } from '../services/omics/dist/catalogue.js';
import { activateRelease } from '../services/omics/dist/catalogue-service.js';
import { validateSnapshot } from '../services/omics/dist/validation.js';

const origin = process.argv[2] || 'http://127.0.0.1:5055';
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
// This check seeds data. It must never mutate a real project or remote endpoint.
assert.ok(project.startsWith('demo-'), 'Use a demo Firebase emulator project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Firestore must be a local emulator');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Hosting must be local');
const bytes = await readFile(new URL('../public/omics/catalogue.json', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../public/omics/manifest.json', import.meta.url), 'utf8'));
const snapshot = validateSnapshot(JSON.parse(bytes));
const db = firebase().db;

async function query(procedure, input, expected = 200) {
  const response = await fetch(`${origin}/api/trpc/catalogue.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`, {redirect:'manual',signal:AbortSignal.timeout(30_000)});
  assert.equal(response.status, expected, `catalogue.${procedure} must reach the real Hosting rewrite`);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  const body = await response.json();
  if (expected !== 200) return body;
  assert.match(response.headers.get('cache-control') || '', /^public/, 'Public catalogue responses should retain cache headers through Hosting');
  assert.ok(body.result, `Successful tRPC envelope missing for ${procedure}`);
  assert.equal(body.result.data?.release_id, snapshot.release_id, 'Every response must retain its requested release');
  return body.result.data;
}

try {
  const imported=await importRelease(db, bytes, manifest);
  if(imported.imported) await query('release', {release_id:snapshot.release_id},404);
  await activateRelease(db,snapshot.release_id);
  const release = await query('release',{});
  assert.equal(release.record_count,snapshot.records.filter(record=>record.status!=='excluded').length);
  const pinned = {release_id:snapshot.release_id};
  const first = await query('list',{...pinned,kind:'model',limit:2});
  assert.equal(first.items.length,2);
  assert.ok(first.next_cursor);
  const second = await query('list',{...pinned,kind:'model',limit:2,cursor:first.next_cursor});
  assert.equal(new Set([...first.items,...second.items].map(record=>record.id)).size,4);
  await query('list',{...pinned,kind:'benchmark',limit:2,cursor:first.next_cursor},400);
  await query('get',{release_id:'not-a-published-release',id:'b2-barcodebert-2026'},404);
  const result = await query('get',{...pinned,id:'b2-barcodebert-2026'});
  assert.equal(result.record.attributes.printed_value,'78.5');
  const rows = await query('results',{...pinned,id:result.record.id});
  assert.equal(rows.total,1);
  const row=rows.items[0];
  assert.equal(row.models.length,1);
  assert.match(row.models[0].name,/BarcodeBERT/);
  assert.ok(row.evaluation && row.benchmarks.length && row.datasets.length);
  assert.equal(row.review_status,'source_checked');
  assert.ok(row.sources.length);
  const model = await query('get',{...pinned,id:row.models[0].id});
  assert.ok(model.reverse.some(link=>link.record.id===row.evaluation.id));
  const reciprocal = await query('results',{...pinned,id:model.record.id});
  assert.ok(reciprocal.items.some(item=>item.result.id===result.record.id));
  const filtered = await query('results',{...pinned,id:model.record.id,configuration_id:row.evaluation.id,metric:row.result.attributes.metric});
  assert.equal(filtered.total,1);
  const evidence = await query('evidence',{...pinned,id:model.record.id,scope:'individual_claim',limit:2});
  assert.equal(evidence.items.length,2);
  assert.ok(evidence.next_cursor);
  const nextEvidence = await query('evidence',{...pinned,id:model.record.id,scope:'individual_claim',limit:2,cursor:evidence.next_cursor});
  assert.equal(new Set([...evidence.items,...nextEvidence.items].map(item=>item.row_id)).size,4);
  await query('evidence',{...pinned,id:model.record.id,scope:'record_context',cursor:evidence.next_cursor},400);
  const resultEvidence = await query('evidence',{...pinned,id:result.record.id,scope:'individual_claim'});
  assert.ok(resultEvidence.items.some(item=>item.value==='78.5' && item.source_locator.includes('Table 1')));
  const comparison = await query('compare',{...pinned,ids:[result.record.id,result.record.id]});
  assert.equal(comparison.compatible,false,'A result cannot count as independent evidence twice');
  const privateProbe=structuredClone(snapshot);
  privateProbe.records[0].attributes.nested={contact_email:'private@example.org'};
  assert.throws(()=>validateSnapshot(privateProbe),/Private data/);

  // Exercise the real Hosting -> Functions rewrite with production's default-off gate.
  const disabled = await fetch(`${origin}/api/trpc/submission.list`, {redirect:'manual'});
  assert.equal(disabled.status,503,'Disabled submissions must not redirect or serve HTML');
  assert.match(disabled.headers.get('content-type') || '', /application\/json/);
  assert.equal(disabled.headers.get('cache-control'),'no-store');
  assert.deepEqual(await disabled.json(),{error:'Contributions are not enabled.'});
  const mixed = await fetch(`${origin}/api/trpc/catalogue.release,submission.list?batch=1&input=${encodeURIComponent(JSON.stringify({0:pinned,1:{}}))}`,{redirect:'manual'});
  assert.equal(mixed.status,503,'Public/private batches cannot bypass the contribution gate');
  assert.equal(mixed.headers.get('cache-control'),'no-store');
  console.log(`Firebase Hosting serves ${snapshot.records.length} records from ${snapshot.release_id}; release pinning, pagination, reciprocal BarcodeBERT links and private-data gates pass.`);
} finally {
  await db.terminate();
}
