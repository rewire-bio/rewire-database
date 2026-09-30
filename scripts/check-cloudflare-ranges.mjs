import assert from "node:assert/strict";

const origin = process.argv[2];
assert.ok(origin && new URL(origin).protocol === "https:", "Supply the HTTPS Cloudflare origin");
const source = "https://rewire-it.web.app/omics/manifest.json";
const reference = await fetch(source, { headers: { "Accept-Encoding": "identity" }, signal: AbortSignal.timeout(30_000) });
assert.equal(reference.status, 200);
const bytes = Buffer.from(await reference.arrayBuffer());
const probe = Date.now();
for (const [range, start, end] of [["bytes=0-63", 0, 64], ["bytes=4096-4159", 4096, 4160], ["bytes=-64", bytes.length - 64, bytes.length]]) {
  const url = `${origin.replace(/\/$/, "")}/omics/manifest.json?rangeverify=${probe}`;
  const headers = { Range: range, "Accept-Encoding": "identity" };
  const redirect = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), `${source}?rangeverify=${probe}`);
  assert.equal(redirect.headers.get("cache-control"), "no-store");
  const partial = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  assert.equal(partial.status, 206);
  assert.equal(new URL(partial.url).origin, "https://rewire-it.web.app");
  assert.equal(partial.headers.get("content-range"), `bytes ${start}-${end - 1}/${bytes.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(start, end));
}
console.log(`Public export ranges verified through temporary redirects: ${origin}; prefix, offset and suffix bytes match the origin.`);
