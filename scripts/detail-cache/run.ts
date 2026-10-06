import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadEnvConfig } from "@next/env";
import { buildCatalogue } from "../../lib/catalogue-build";
import { buildUseCases } from "../../lib/use-cases-build";
import { buildDetailDependencies } from "../../lib/detail-cache/dependencies";
import { computeRendererEpoch } from "./renderer-epoch.mjs";
import { staticAssetHash, readEntry, saveEntry, restoreEntry } from "./store.mjs";
import { captureDetailInputs, assertDetailInputsUnchanged, detailDependencyKey } from "./input-integrity";

async function main() {
  const { buildStatic, runNextBuild } = await import("../build-static.mjs");
  if (process.env.OMICS_SMOKE_EXPORT === "true") throw new Error("Detail cache requires a complete export, not a PR sample");
  loadEnvConfig(process.cwd(), false);
  const started = performance.now();
  const root = process.cwd();
  const cache = path.join(root, ".detail-cache");
  fs.mkdirSync(cache, { recursive: true });
  const lock = path.join(cache, "run.lock");
  fs.mkdirSync(lock); // Concurrent writers must not share a skip list or out/.
  const skipFile = path.join(lock, "skip.json");
  const controller = new AbortController();
  const interrupt = () => controller.abort("SIGINT");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    const epoch = computeRendererEpoch(root);
    process.env.DETAIL_CACHE = "1";
    process.env.DETAIL_CACHE_EPOCH = epoch;
    process.env.DETAIL_CACHE_SKIP_FILE = skipFile;
    const inputs = captureDetailInputs(root);
    const { catalogue, query } = buildCatalogue();
    const useCaseQuery = buildUseCases().query;
    const candidates: Array<{
      kind: "result" | "source"; id: string; key: string; directory: string;
      dependencies: Record<string, unknown>; entry: ReturnType<typeof readEntry>;
    }> = [];
    const anchors = new Set<string>();
    for (const record of catalogue.records) {
      if (!["result", "source"].includes(record.kind) || !/^[a-zA-Z0-9._-]+$/.test(record.id)) continue;
      const kind = record.kind as "result" | "source";
      const dependencies = buildDetailDependencies(catalogue, kind, record.id, { query, useCaseQuery });
      if (!dependencies) continue;
      const key = detailDependencyKey(epoch, dependencies);
      const directory = path.join(cache, "entries", epoch, kind, record.id, key);
      const anchor = !anchors.has(kind);
      anchors.add(kind);
      const entry = !anchor && !process.argv.includes("--no-cache") ? readEntry(directory, key, epoch) : null;
      candidates.push({ kind, id: record.id, key, directory, dependencies, entry });
    }
    const manifestSeconds = (performance.now() - started) / 1000;
    const hits = candidates.filter(candidate => candidate.entry);
    const ids = Object.fromEntries(["result", "source"].map(kind => [kind, hits.filter(hit => hit.kind === kind).map(hit => hit.id)]));
    fs.writeFileSync(skipFile, JSON.stringify({ epoch, ids }));
    console.log(`Detail cache: ${hits.length} hits / ${candidates.length} candidates; ${manifestSeconds.toFixed(1)}s dependency scan`);
    await buildStatic({ build: runNextBuild, currentOnly: true, signal: controller.signal });
    assertDetailInputsUnchanged(root, inputs, epoch);
    // A cached result/source page must retain all of its own referenced leaf
    // chunks and every shared asset. Unrelated entity page chunks can change.
    const pagePayloads = (useHits: boolean) => candidates.flatMap(candidate => {
      if (useHits && candidate.entry) return Object.values(candidate.entry.files) as Buffer[];
      const output = path.join(root, "out/database", candidate.kind, candidate.id);
      return ["index.html", "index.txt"].map(name => fs.readFileSync(path.join(output, name)));
    });
    let assets: string | undefined;
    let incompatible = false;
    try {
      assets = staticAssetHash(path.join(root, "out"), pagePayloads(true));
      incompatible = hits.some(hit => hit.entry!.receipt.assets !== assets);
    } catch (error) {
      if (!hits.length) throw error;
      // A stale or missing cached asset is a miss for the whole export. The
      // complete render below must pass the same checks before any entry is saved.
      console.warn(`Cached asset check failed; rendering every route: ${error}`);
      incompatible = true;
    }
    if (incompatible) {
      console.log("Static assets changed: regenerating every cached route before publishing output");
      fs.writeFileSync(skipFile, JSON.stringify({ epoch, ids: {} }));
      await buildStatic({ build: runNextBuild, currentOnly: true, signal: controller.signal });
      assertDetailInputsUnchanged(root, inputs, epoch);
      assets = staticAssetHash(path.join(root, "out"), pagePayloads(false));
    } else {
      for (const hit of hits) restoreEntry(hit.entry, path.join(root, "out/database", hit.kind, hit.id));
    }
    if (!assets) throw new Error("Static asset digest was not computed");
    for (const candidate of candidates) {
      const output = path.join(root, "out/database", candidate.kind, candidate.id);
      saveEntry(candidate.directory, output, { ...candidate, epoch, assets });
    }
    const report = {
      schema: 1, release_id: catalogue.release_id, renderer_epoch: epoch,
      eligible: candidates.length, cache_hits: incompatible ? 0 : hits.length,
      rendered: candidates.length - (incompatible ? 0 : hits.length),
      asset_fallback: incompatible, asset_hash: assets,
      dependency_seconds: manifestSeconds,
      total_seconds: (performance.now() - started) / 1000,
      cached_payload_bytes: candidates.reduce((sum, candidate) => sum +
        ["index.html", "index.txt"].reduce((n, name) => n + fs.statSync(path.join(candidate.directory, name)).size, 0), 0),
    };
    fs.writeFileSync(path.join(cache, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    fs.rmSync(skipFile, { force: true });
    fs.rmdirSync(lock);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
