import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

// Exercise workerd itself: unit-test imports and dry-run bundling do not catch
// invalid Worker entrypoint exports or routing/asset-binding runtime failures.
const port = 8792;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(port), ...(process.argv[2] ? ["--assets", process.argv[2]] : [])], {
  stdio: "inherit", detached: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
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
  console.log("Cloudflare runtime, static assets, privacy headers, redirects and 404 checks passed.");
} finally {
  // Wrangler spawns workerd; stop this process group, never unrelated servers.
  try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
