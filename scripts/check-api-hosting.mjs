import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://127.0.0.1:5055';
// Exercise the real Hosting -> Functions rewrite with production's default-off gate.
const response = await fetch(`${origin}/api/trpc/submission.list`, { redirect: 'manual' });
assert.equal(response.status, 503, 'Hosting must reach the disabled API, not redirect or serve HTML');
assert.match(response.headers.get('content-type') || '', /application\/json/);
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.deepEqual(await response.json(), { error: 'Contributions are not enabled.' });
console.log('Firebase Hosting reaches its same-project API; submissions remain disabled.');
