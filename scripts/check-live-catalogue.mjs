import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchWithRetry, verifyResolutionPublications } from "./deployment-transaction.mjs";

// Read-only acceptance probe. No Firebase credentials, imports or writes.
const origin = (process.argv[2] || "https://benchmarks.rewire.it").replace(
  /\/$/,
  "",
);
const parsed = new URL(origin);
assert.ok(
  parsed.protocol === "https:" ||
    ["localhost", "127.0.0.1"].includes(parsed.hostname),
  "Use HTTPS outside local emulators",
);
assert.ok(
  !parsed.username && !parsed.password,
  "Do not put credentials in probe URLs",
);
const manifest = JSON.parse(
  await readFile(
    new URL("../public/omics/manifest.json", import.meta.url),
    "utf8",
  ),
);
const expectedCount = Object.values(manifest.counts).reduce(
  (sum, count) => sum + Number(count),
  0,
);
const pinned = { release_id: manifest.release_id };
const probe = Date.now();
async function query(name, input) {
  const response = await fetchWithRetry(
    `${origin}/api/trpc/catalogue.${name}?input=${encodeURIComponent(JSON.stringify(input))}&verify=${probe}`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 200, `${name} must return 200`);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  const body = await response.text();
  assert.ok(
    Buffer.byteLength(body) < 1_000_000,
    `${name} exceeds the probe response budget`,
  );
  const json = JSON.parse(body);
  assert.ok(json.result?.data, `${name} must return a catalogue response`);
  assert.equal(
    json.result.data.release_id,
    manifest.release_id,
    "API and generated website must use the same release",
  );
  return json.result.data;
}
const release = await query("release", {});
assert.equal(
  release.record_count,
  expectedCount,
  "Public record count must match the release manifest",
);
const page = await query("list", { ...pinned, kind: "model", limit: 2 });
assert.equal(page.items.length, 2);
const benchmark = await query("get", {
  ...pinned,
  id: "discovery-benchmark-nabench",
});
assert.equal(benchmark.published_comparisons.length, 1);
assert.ok(benchmark.comparison_options.length > 40);
assert.deepEqual(benchmark.aggregate_comparisons, []);
const chart = await query("comparison", {
  ...pinned,
  id: benchmark.record.id,
  panel_id: benchmark.comparison_options.at(-1).id,
});
assert.ok(
  chart.panel.rows.length > 1,
  "An individually requested chart must contain its source rows",
);
const result = await query("get", { ...pinned, id: "b2-barcodebert-2026" });
assert.equal(result.record.attributes.printed_value, "78.5");
const rows = await query("results", { ...pinned, id: result.record.id });
assert.equal(rows.total, 1);
const row = rows.items[0];
assert.match(row.models[0]?.name || "", /BarcodeBERT/);
assert.ok(
  row.evaluation &&
    row.benchmarks.length &&
    row.datasets.length &&
    row.sources.length,
);
assert.equal(row.review_status, "source_checked");
const modelResults = await query("results", {
  ...pinned,
  id: row.models[0].id,
});
assert.ok(
  modelResults.items.some((item) => item.result.id === result.record.id),
  "The model must link back to its exact evaluation",
);
const evidence = await query("evidence", {
  ...pinned,
  id: result.record.id,
  scope: "individual_claim",
  limit: 10,
});
assert.ok(
  evidence.items.some(
    (item) =>
      item.field_path === "attributes.printed_value" &&
      item.value === "78.5" &&
      item.source_locator.includes("Table 1") &&
      item.review_status === "source_checked",
  ),
);
if (manifest.coverage.audit_history) {
  const runs = await query("auditRuns", { ...pinned, limit: 2 });
  assert.equal(runs.total, manifest.coverage.audit_history.runs);
  const audit = await query("auditRecords", { ...pinned, limit: 2 });
  assert.equal(audit.total, manifest.coverage.audit_history.records);
  assert.ok(audit.next_cursor, "Audit pagination must remain available");
  const next = await query("auditRecords", {
    ...pinned,
    limit: 2,
    cursor: audit.next_cursor,
  });
  assert.notEqual(next.items[0].record_id, audit.items[0].record_id);
  const corrected = await query("auditChecks", {
    ...pinned,
    record_id: "rewire-result-baseline-kmer-position-v2-average-precision",
    limit: 1,
  });
  assert.ok(corrected.total > 1);
  assert.ok(
    corrected.resolutions.length > 0,
    "Exact-source correction must have linked resolution",
  );
  const publishedResolutions = JSON.parse(await readFile(new URL(
    `../public/omics/releases/${manifest.release_id}/audit-resolutions.json`,
    import.meta.url,
  ), "utf8"));
  verifyResolutionPublications(corrected.resolutions, publishedResolutions);
  assert.ok(corrected.record_url);
  for (const name of [
    "beeline",
    "cafa",
    "cami",
    "capri",
    "casp",
    "flip2",
    "plinder",
    "scib",
    "virtual-cell-challenge-2026",
  ]) {
    const profile = await query("get", {
      ...pinned,
      id: `discovery-benchmark-${name}`,
    });
    assert.ok(
      profile.comparison_options.length > 0,
      `${name} must expose reviewed charts`,
    );
    assert.ok(
      profile.published_comparisons[0]?.rows.length > 0,
      `${name} must return an initial chart`,
    );
  }
}

const disabled = await fetchWithRetry(
  `${origin}/api/trpc/submission.list?verify=${probe}`,
  {
    redirect: "manual",
    expectedStatus: 503,
    expectedContentType: "application/json",
  },
);
assert.equal(
  disabled.status,
  503,
  "Production submissions must remain disabled",
);
assert.equal(disabled.headers.get("cache-control"), "no-store");
assert.deepEqual(await disabled.json(), {
  error: "Contributions are not enabled.",
});

if (process.argv.includes("--website")) {
  const response = await fetchWithRetry(
    `${origin}/omics/manifest.json?verify=${probe}`,
    { redirect: "manual", headers: { "Cache-Control": "no-cache" } },
  );
  assert.equal(response.status, 200, "Live website manifest must be available");
  if (manifest.coverage.audit_history) {
    const auditPage = await fetchWithRetry(`${origin}/audits/?verify=${probe}`);
    assert.equal(auditPage.status, 200);
    assert.ok((await auditPage.text()).includes("Catalogue audit history"));
  }
  assert.equal(
    (await response.json()).release_id,
    manifest.release_id,
    "Live website and API must use the same release",
  );
}

console.log(
  `Read-only live check passed: ${origin}, release ${manifest.release_id}, ${expectedCount} records; BarcodeBERT links and disabled submissions verified.`,
);
