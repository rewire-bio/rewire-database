import fs from "node:fs";
import path from "node:path";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../../services/omics/src/catalogue-query";
import {
  createUseCaseQuery,
  validateUseCaseArtifact,
} from "../../services/omics/src/use-cases";
import { accumulateUseCaseDetail } from "../../lib/use-cases-build";
import {
  computeSmokeSelection,
  SMOKE_USE_CASE_SLUG,
} from "../../lib/smoke-selection";
import { omicsKinds } from "../../lib/omics";

/** Writes out/omics/smoke-manifest.json: the explicit, reviewable record of
 * exactly which routes a PR smoke export generated and why, and the marker
 * every publication path (scripts/deploy-catalogue.mjs,
 * scripts/deploy-cloudflare.mjs, the "deploy" npm script) checks for and
 * refuses to find. Deleting this file does not make an export deployable —
 * it only makes the export's own documentation disappear; the route counts
 * underneath are still those of a small deterministic sample, not the full
 * catalogue. See workbench/pr-smoke-export-checkpoint.md. */

const catalogue: CatalogueSnapshot = JSON.parse(
  fs.readFileSync("out/omics/catalogue.json", "utf8"),
);
const manifestPath = "out/omics/manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const declaration = manifest.coverage?.use_cases;
const useCaseFile = path.join(
  "out/omics/releases",
  catalogue.release_id,
  "use-cases.json",
);
const artifact = declaration
  ? validateUseCaseArtifact(
      catalogue,
      JSON.parse(fs.readFileSync(useCaseFile, "utf8")),
      declaration,
    )
  : undefined;
const query = createCatalogueQuery(catalogue);
const useCaseQuery = createUseCaseQuery(catalogue, artifact, declaration, query);
const hasUseCase = (artifact?.use_cases || []).some(
  (entry) => entry.slug === SMOKE_USE_CASE_SLUG,
);
if (!hasUseCase)
  throw new Error(
    `Smoke export expects the fixed use case "${SMOKE_USE_CASE_SLUG}" to be published, but it was not found in this release's use-cases.json. Update SMOKE_USE_CASE_SLUG in lib/smoke-selection.ts to a currently published slug.`,
  );
const useCaseDetail = accumulateUseCaseDetail(useCaseQuery, SMOKE_USE_CASE_SLUG);
if (!useCaseDetail) throw new Error(`Use case not found: ${SMOKE_USE_CASE_SLUG}`);

const selection = computeSmokeSelection(catalogue, useCaseDetail);

// Cross-check the computed selection against what the build actually wrote,
// so a bug that makes a page's own generateStaticParams disagree with this
// manifest (e.g. a stale import, a copy-paste KIND mismatch) fails loudly
// here instead of silently shipping an unreviewable export.
const drift: string[] = [];
for (const kind of omicsKinds) {
  const dir = path.join("out/database", kind);
  const onDisk = fs.existsSync(dir)
    ? new Set(
        fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
      )
    : new Set<string>();
  const expected = selection.idsByKind[kind];
  for (const id of expected) if (!onDisk.has(id)) drift.push(`${kind}/${id}: expected but not built`);
  for (const id of onDisk) if (!expected.has(id)) drift.push(`${kind}/${id}: built but not in the smoke selection`);
}
const useCaseDir = path.join("out/use-cases", SMOKE_USE_CASE_SLUG);
if (!fs.existsSync(useCaseDir)) drift.push(`use-cases/${SMOKE_USE_CASE_SLUG}: expected but not built`);
for (const entry of fs.readdirSync("out/use-cases", { withFileTypes: true }))
  if (entry.isDirectory() && !selection.useCaseSlugs.has(entry.name))
    drift.push(`use-cases/${entry.name}: built but not in the smoke selection`);
if (drift.length)
  throw new Error(`Smoke export does not match its own selection:\n${drift.join("\n")}`);

const idsByKind = Object.fromEntries(
  omicsKinds.map((kind) => [kind, [...selection.idsByKind[kind]].sort()]),
);
const totalRoutes =
  Object.values(idsByKind).reduce((sum, ids) => sum + ids.length, 0) +
  selection.useCaseSlugs.size;

const output = {
  schema_version: "1.0",
  smoke: true,
  warning:
    "This is a PR smoke export: a small deterministic sample of routes, not the full catalogue. Do not publish it as the production website.",
  release_id: catalogue.release_id,
  generated_from_commit: process.env.GITHUB_SHA || null,
  use_case: {
    slug: SMOKE_USE_CASE_SLUG,
    href: `/use-cases/${SMOKE_USE_CASE_SLUG}/`,
    mapping_count: useCaseDetail.mappings.length,
    evaluation_count: useCaseDetail.mappings.reduce((sum, m) => sum + m.evaluations.length, 0),
    result_count: useCaseDetail.mappings.reduce(
      (sum, m) => sum + m.evaluations.reduce((s, e) => s + e.results.length, 0),
      0,
    ),
    record_ids_by_kind: selection.reasons.useCase?.recordIds || {},
  },
  per_kind_representatives: selection.reasons.perKindRepresentatives,
  alias_shape_representatives: selection.reasons.aliasShapeRepresentatives,
  ids_by_kind: idsByKind,
  use_case_slugs: [...selection.useCaseSlugs],
  total_database_routes: Object.values(idsByKind).reduce((sum, ids) => sum + ids.length, 0),
  total_routes: totalRoutes,
};
fs.writeFileSync("out/omics/smoke-manifest.json", JSON.stringify(output, null, 2) + "\n");
console.log(
  `Smoke manifest: ${totalRoutes} routes (${output.total_database_routes} database detail pages across ${omicsKinds.length} kinds, 1 use case: ${SMOKE_USE_CASE_SLUG}). Verified against out/database and out/use-cases.`,
);
for (const kind of omicsKinds) {
  if (idsByKind[kind].length === 0)
    console.warn(`Smoke manifest: no routes selected for kind "${kind}" — check lib/smoke-selection.ts`);
}
