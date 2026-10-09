import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { fetchWithRetry, verifyResolutionPublications } from "./deployment-transaction.mjs";
import { contributionProbeMode, verifyContributionGate } from "./contribution-deployment.mjs";

import { pinnedDownloads, assertProducerReceipt, fetchGithubDownload } from "./github-downloads.mjs";

// Read-only acceptance probe. No Firebase credentials, imports or writes.
export async function checkLiveCatalogue({ args = process.argv.slice(2), read = readFile, fetchImpl = fetchWithRetry, verifyGate = verifyContributionGate } = {}) {
const acceptance = args.find(arg => arg.startsWith("--acceptance="))?.slice("--acceptance=".length) || "full";
assert.ok(["core", "full"].includes(acceptance), "Unknown live acceptance profile");
const core = acceptance === "core";
const independent = args.includes("--independent-frontend");
const downloads = independent ? await pinnedDownloads(read) : undefined;
const contributionMode = contributionProbeMode(args);
const origin = (args.find(arg => !arg.startsWith("--")) || "https://benchmarks.rewirebio.io").replace(
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
const manifestBytes = await read(new URL("../public/omics/manifest.json", import.meta.url));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (independent) assert.equal(manifest.release_id, downloads.lock.release_id, "Checked manifest must match pinned producer release");
const expectedCount = Object.values(manifest.counts).reduce(
  (sum, count) => sum + Number(count),
  0,
);
const pinned = { release_id: manifest.release_id };
const useCaseBytes = manifest.coverage.use_cases ? await read(new URL(
  `../public/omics/releases/${manifest.release_id}/use-cases.json`, import.meta.url,
)) : undefined;
const useCases = useCaseBytes ? JSON.parse(useCaseBytes.toString("utf8")) : undefined;
const probe = Date.now();
// The contributions function allows up to 120s per invocation; a shorter
// probe timeout would abort a legitimate cold-start/full-catalogue response
// and pile on competing retries instead of waiting for the real answer.
const CATALOGUE_QUERY_TIMEOUT_MS = 135_000;
async function query(name, input) {
  const response = await fetchImpl(
    `${origin}/api/trpc/catalogue.${name}?input=${encodeURIComponent(JSON.stringify(input))}&verify=${probe}`,
    { redirect: "manual", timeoutMs: CATALOGUE_QUERY_TIMEOUT_MS },
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

if (useCases && core) {
  const entry = useCases.use_cases.find(item => item.slug === "brca1-brca2-germline-interpretation");
  assert.ok(entry, "Core acceptance requires the BRCA use case");
  const index = await query("useCases", { ...pinned, limit: 1 });
  assert.equal(index.input_sha256, manifest.coverage.use_cases.input_sha256);
  assert.equal(index.total, useCases.use_cases.length);
  assert.deepEqual(index.items, useCases.use_cases.slice(0, 1));
  const detail = await query("useCase", { ...pinned, slug: entry.slug, limit: 1 });
  assert.equal(detail.input_sha256, useCases.input_sha256);
  assert.deepEqual(detail.use_case, entry);
  const mappings = useCases.mappings.filter(mapping => mapping.use_case_id === entry.id);
  assert.equal(detail.mappings.length, mappings.length);
  assert.ok(detail.evaluations_total > 0, "BRCA must retain evaluated evidence");
  const mapping = mappings.find(item => item.lifecycle === "active" && ["direct", "proxy"].includes(item.relevance));
  assert.ok(mapping, "BRCA must retain an active reviewed mapping");
  const resolved = detail.mappings.find(item => item.id === mapping.id);
  assert.ok(resolved, "BRCA must serve its reviewed mapping");
  assert.deepEqual(Object.fromEntries(Object.keys(mapping).map(key => [key, resolved[key]])), mapping);
  const links = await query("useCaseLinks", { ...pinned, id: mapping.protocol_id });
  assert.equal(links.input_sha256, useCases.input_sha256);
  assert.ok(links.items.some(item => item.mapping_id === mapping.id && item.slug === entry.slug), "BRCA protocol must link back to its use case");
}

if (useCases && !core) {
  const entries = [];
  let cursor;
  do {
    const page = await query("useCases", { ...pinned, limit: 100, ...(cursor ? { cursor } : {}) });
    assert.equal(page.input_sha256, manifest.coverage.use_cases.input_sha256);
    assert.equal(page.total, useCases.use_cases.length);
    entries.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  assert.deepEqual(entries, useCases.use_cases, "Published use-case questions must match the reviewed artifact");
  for (const entry of entries) {
    // The detail response paginates evaluations across all of a use case's
    // mappings so one oversized mapping cannot blow the probe response budget;
    // accumulate every page to recover the complete reviewed evidence.
    const byMappingId = new Map();
    let detail, detailCursor;
    do {
      const page = await query("useCase", { ...pinned, slug: entry.slug, limit: 20, ...(detailCursor ? { cursor: detailCursor } : {}) });
      assert.equal(page.input_sha256, useCases.input_sha256);
      assert.deepEqual(page.use_case, entry);
      assert.equal(page.mappings.length, useCases.mappings.filter(mapping => mapping.use_case_id === entry.id).length);
      for (const resolved of page.mappings) {
        const bucket = byMappingId.get(resolved.id) || { ...resolved, evaluations: [] };
        bucket.evaluations.push(...resolved.evaluations);
        byMappingId.set(resolved.id, bucket);
      }
      detail = page;
      detailCursor = page.evaluations_next_cursor;
    } while (detailCursor);
    assert.ok(detail.evaluations_total >= 0);
    const mappings = useCases.mappings.filter(mapping => mapping.use_case_id === entry.id);
    assert.equal(byMappingId.size, mappings.length);
    for (const mapping of mappings) {
      const resolved = byMappingId.get(mapping.id);
      assert.ok(resolved, "Every reviewed mapping must be served");
      assert.deepEqual(Object.fromEntries(Object.keys(mapping).map(key => [key, resolved[key]])), mapping);
      const live = mapping.lifecycle === "active" && ["direct", "proxy"].includes(mapping.relevance);
      assert.deepEqual(resolved.evaluations.map(item => item.evaluation.id), live ? mapping.evaluation_ids : []);
      for (const evaluation of resolved.evaluations) {
        // Each evaluation embeds only a bounded preview of its result rows;
        // follow results_next_cursor to confirm the rest remain reachable.
        const allResults = [...evaluation.results];
        let resultsCursor = evaluation.results_next_cursor;
        while (resultsCursor) {
          const resultsPage = await query("useCaseEvaluationResults", {
            ...pinned, mapping_id: mapping.id, evaluation_id: evaluation.evaluation.id, limit: 50, cursor: resultsCursor,
          });
          assert.equal(resultsPage.input_sha256, useCases.input_sha256);
          allResults.push(...resultsPage.items);
          resultsCursor = resultsPage.next_cursor;
        }
        assert.equal(allResults.length, evaluation.results_total,
          "All evidence rows for an evaluation must be reachable through pagination");
        for (const configuration of evaluation.configurations) {
          const links = await query("useCaseLinks", { ...pinned, id: configuration.id });
          assert.equal(links.input_sha256, useCases.input_sha256);
          assert.deepEqual(links.items.find(item => item.mapping_id === mapping.id)?.configuration_ids, [configuration.id],
            "A configuration backlink must not claim evidence from sibling configurations");
        }
      }
    }
  }
}

await verifyGate(origin, {
  mode: contributionMode,
  releaseId: manifest.release_id,
  probe,
});

if (args.includes("--website")) {
  const response = await fetchImpl(
    `${origin}/${independent ? "release-manifest.json" : "omics/manifest.json"}?verify=${probe}`,
    { redirect: "manual", headers: { "Cache-Control": "no-cache" } },
  );
  assert.equal(response.status, 200, "Live website manifest must be available");
  if (independent) {
    const receiptResponse = await fetchImpl(`${origin}/deployment.json?verify=${probe}`, { redirect: "manual" });
    assert.equal(receiptResponse.status, 200, "Frontend producer receipt must be available");
    assertProducerReceipt(await receiptResponse.json(), downloads.lock, manifest.release_id);
  }
  if (useCases) {
    const index = await fetchImpl(`${origin}/use-cases/?verify=${probe}`);
    assert.equal(index.status, 200, "Use-case navigation must be published");
    const html = await index.text();
    for (const entry of useCases.use_cases.slice(0, 10)) assert.ok(html.includes(`/use-cases/${entry.slug}/`));
    for (const entry of useCases.use_cases.filter(entry => !core || entry.slug === "brca1-brca2-germline-interpretation")) {
      const page = await fetchImpl(`${origin}/use-cases/${entry.slug}/?verify=${probe}`);
      assert.equal(page.status, 200, "Reviewed use-case page must be published");
      const detailHtml = await page.text();
      assert.ok(detailHtml.includes(useCases.release_id) && detailHtml.includes(useCases.input_sha256));
    }
    const artifactBytes = independent
      ? await fetchGithubDownload(origin, `/omics/releases/${manifest.release_id}/use-cases.json`, downloads, fetchImpl)
      : await (async () => { const artifact = await fetchImpl(`${origin}/omics/releases/${manifest.release_id}/use-cases.json?verify=${probe}`); assert.equal(artifact.status, 200); return Buffer.from(await artifact.arrayBuffer()); })();
    assert.equal(createHash("sha256").update(artifactBytes).digest("hex"), manifest.files["use-cases.json"]);
    for (const source of core ? [] : manifest.coverage.use_case_sources || []) {
      const copyBytes = independent
        ? await fetchGithubDownload(origin, `/omics/sources/${source.sha256}.md`, downloads, fetchImpl)
        : await (async () => { const copy = await fetchImpl(`${origin}/omics/sources/${source.sha256}.md?verify=${probe}`); assert.equal(copy.status, 200, "Reviewed source copies must be publicly accessible"); return Buffer.from(await copy.arrayBuffer()); })();
      assert.equal(createHash("sha256").update(copyBytes).digest("hex"), source.sha256);
    }
  }
  assert.equal(
    createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"),
    createHash("sha256").update(manifestBytes).digest("hex"),
    "Live website manifest bytes must match the checked release",
  );
}

console.log(
  `Read-only ${acceptance} live check passed: ${origin}, release ${manifest.release_id}, ${expectedCount} records; BarcodeBERT links and ${contributionMode} contribution gates verified.`,
);

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await checkLiveCatalogue();
