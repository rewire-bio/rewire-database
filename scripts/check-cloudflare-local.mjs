import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { rm } from "node:fs/promises";
import { runtimeAssets } from "./runtime-assets.mjs";

// Exercise workerd itself: unit-test imports and dry-run bundling do not catch
// invalid Worker entrypoint exports or routing/asset-binding runtime failures.
const port = 8792;
const origin = `http://127.0.0.1:${port}`;
const assetRoot = process.argv[2] || await runtimeAssets();
const server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(port), "--assets", assetRoot], {
  stdio: "inherit", detached: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
try {
  let ready = false;
  // Bound cold runtime startup without registering the full multi-GB site twice.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Worker runtime exited (${server.exitCode})`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { await response.body?.cancel(); ready = true; break; }
      await response.body?.cancel();
    } catch { /* Wait for workerd to listen. */ }
    await setTimeout(250);
  }
  assert.ok(ready, "Cloudflare Worker did not become ready");
  const missing = await fetch(`${origin}/__cloudflare_missing__/`);
  assert.equal(missing.status, 404);
  const redirect = await fetch(`${origin}/literature/?q=a%26b&kind=model`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), `${origin}/?kind=result&origin=literature&q=a%26b&kind=model`);
  const contribution = await fetch(`${origin}/contribute/`);
  assert.equal(contribution.status, 200);
  assert.equal(contribution.headers.get("referrer-policy"), "no-referrer");
  assert.match(contribution.headers.get("cache-control") || "", /no-store/);
  for (const kind of ["result", "evaluation"]) {
    const directory = path.join(assetRoot, "database", kind);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT" && process.argv[2]) continue; throw error; }
    const record = entries.find(entry => entry.isDirectory());
    assert.ok(record, `No ${kind} frontend page staged`);
    const detail = await fetch(`${origin}/database/${kind}/${encodeURIComponent(record.name)}/`);
    assert.equal(detail.status, 200, `${kind} page must be served by the local frontend`);
    const html = await detail.text();
    assert.match(html, /<h1[ >]/);
    const chunk = html.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.js)"/);
    assert.ok(chunk, `${kind} page must reference a frontend JavaScript asset`);
    const asset = await fetch(new URL(chunk[1].replaceAll("&amp;", "&"), origin));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") || "", /javascript/);
  }
  console.log("Cloudflare runtime, static assets, privacy headers, redirects and 404 checks passed.");
} finally {
  // Wrangler spawns workerd; stop this process group, never unrelated servers.
  try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  if (!process.argv[2]) await rm(assetRoot, { recursive: true, force: true });
}
