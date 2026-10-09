import fs from "node:fs";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { PreparedCatalogue } from "../services/omics/src/prepared-catalogue";
import { describe, expect, it, vi } from "vitest";
import {
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { entityKinds, type EntityKind } from "../services/omics/src/entity-kinds";
import { recordRouteKinds } from "../lib/omics";
import { recordPageKinds } from "../services/omics/src/record-pages";

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
  query: null as PreparedCatalogue | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: fixture.query!,
  }),
}));
// Mirrors the existing notFound() mock pattern used by
// tests/omics-investigation-ui.test.tsx and tests/use-case-pages.test.tsx.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../lib/record-page", async (original) => (await import("./fixtures/record-pages")).localRecordPages(original));
fixture.snapshot = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
);
fixture.query = preparedFromSnapshot(fixture.snapshot!);

import ModelPage, { generateMetadata as modelMetadata } from "../app/database/model/[id]/page";
import MethodPage, { generateMetadata as methodMetadata } from "../app/database/method/[id]/page";
import ConfigurationPage, { generateMetadata as configurationMetadata } from "../app/database/configuration/[id]/page";
import PipelinePage, { generateMetadata as pipelineMetadata } from "../app/database/pipeline/[id]/page";
import ServicePage, { generateMetadata as serviceMetadata } from "../app/database/service/[id]/page";
import BenchmarkPage, { generateMetadata as benchmarkMetadata } from "../app/database/benchmark/[id]/page";
import TaskPage, { generateMetadata as taskMetadata } from "../app/database/task/[id]/page";
import ProtocolPage, { generateMetadata as protocolMetadata } from "../app/database/protocol/[id]/page";
import EvaluatorPage, { generateMetadata as evaluatorMetadata } from "../app/database/evaluator/[id]/page";
import DatasetPage, { generateMetadata as datasetMetadata } from "../app/database/dataset/[id]/page";
import DatasetSubsetPage, { generateMetadata as datasetSubsetMetadata } from "../app/database/dataset_subset/[id]/page";
import BaselinePage, { generateMetadata as baselineMetadata } from "../app/database/baseline/[id]/page";
import EvaluationPage, { generateMetadata as evaluationMetadata } from "../app/database/evaluation/[id]/page";
import ResultPage, { generateMetadata as resultMetadata } from "../app/database/result/[id]/page";
import SourcePage, { generateMetadata as sourceMetadata } from "../app/database/source/[id]/page";
import ClaimPage, { generateMetadata as claimMetadata } from "../app/database/claim/[id]/page";

type Page = (props: { params: { id: string } }) => unknown;
type GenerateMetadata = (props: { params: { id: string } }) => unknown;

const pagesByKind: Record<EntityKind, { Page: Page; generateMetadata: GenerateMetadata }> = {
  model: { Page: ModelPage, generateMetadata: modelMetadata },
  method: { Page: MethodPage, generateMetadata: methodMetadata },
  configuration: { Page: ConfigurationPage, generateMetadata: configurationMetadata },
  pipeline: { Page: PipelinePage, generateMetadata: pipelineMetadata },
  service: { Page: ServicePage, generateMetadata: serviceMetadata },
  benchmark: { Page: BenchmarkPage, generateMetadata: benchmarkMetadata },
  task: { Page: TaskPage, generateMetadata: taskMetadata },
  protocol: { Page: ProtocolPage, generateMetadata: protocolMetadata },
  evaluator: { Page: EvaluatorPage, generateMetadata: evaluatorMetadata },
  dataset: { Page: DatasetPage, generateMetadata: datasetMetadata },
  dataset_subset: { Page: DatasetSubsetPage, generateMetadata: datasetSubsetMetadata },
  baseline: { Page: BaselinePage, generateMetadata: baselineMetadata },
  evaluation: { Page: EvaluationPage, generateMetadata: evaluationMetadata },
  result: { Page: ResultPage, generateMetadata: resultMetadata },
  source: { Page: SourcePage, generateMetadata: sourceMetadata },
  claim: { Page: ClaimPage, generateMetadata: claimMetadata },
};

// A representative, real id for every kind, taken from the pinned release
// rather than hardcoded, so this stays valid across future data releases.
const sampleIdByKind = Object.fromEntries(
  entityKinds.map((kind) => [
    kind,
    fixture.snapshot!.records.find((record) => record.kind === kind)?.id,
  ]),
) as Record<EntityKind, string | undefined>;

// `source` and `claim` records are never legacy-kind alias sources or
// targets in the current data model (only model/benchmark/dataset segments
// receive aliases, from the predictive/evaluation-design/dataset families
// respectively — see workbench/entity-page-split-checkpoint.md). Probing
// with one of these two guarantees a genuine kind mismatch, not an alias
// hit, regardless of which kind is under test.
function wrongKindProbe(kind: EntityKind): { id: string; probeKind: EntityKind } {
  const probeKind: EntityKind = kind === "claim" ? "source" : "claim";
  const probeRecord = fixture.snapshot!.records.find(
    (record) => record.id === sampleIdByKind[probeKind],
  )!;
  if (recordRouteKinds(probeRecord).includes(kind))
    throw new Error(
      `Test fixture assumption broken: ${probeRecord.id} (${probeKind}) aliases into ${kind}`,
    );
  return { id: probeRecord.id, probeKind };
}

// Static routes answer synchronously; server-rendered routes are async and
// their metadata 404s with the page instead of returning empty metadata.
async function settle(run: () => unknown) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return "NOT_FOUND";
    throw error;
  }
}
const absentMetadata = (kind: EntityKind) =>
  (recordPageKinds as readonly string[]).includes(kind) ? "NOT_FOUND" : {};

describe("entity detail route guards (404 and metadata) across all 16 kinds", () => {
  it("has a real sample record for every kind in the pinned release", () => {
    for (const kind of entityKinds) expect(sampleIdByKind[kind], kind).toBeDefined();
  });

  it.each(entityKinds)("renders its own canonical id without a 404: %s", async (kind) => {
    const { Page } = pagesByKind[kind];
    expect(await settle(() => Page({ params: { id: sampleIdByKind[kind]! } }))).not.toBe("NOT_FOUND");
  });

  it.each(entityKinds)("404s on an id that does not exist anywhere in the catalogue: %s", async (kind) => {
    const { Page } = pagesByKind[kind];
    expect(await settle(() => Page({ params: { id: "does-not-exist-in-any-release" } }))).toBe("NOT_FOUND");
  });

  it.each(entityKinds)("404s on a real id that belongs to a different, non-aliased kind: %s", async (kind) => {
    const { id } = wrongKindProbe(kind);
    const { Page } = pagesByKind[kind];
    expect(await settle(() => Page({ params: { id } }))).toBe("NOT_FOUND");
  });

  it.each(entityKinds)("returns no metadata, not another kind's canonical, for a wrong-kind id: %s", async (kind) => {
    const { id, probeKind } = wrongKindProbe(kind);
    const { generateMetadata } = pagesByKind[kind];
    expect(await settle(() => generateMetadata({ params: { id } }))).toEqual(absentMetadata(kind));
    // Confirms the probe id itself remains valid on its real kind's page,
    // so the empty result above is the guard rejecting it, not a typo.
    const valid = await settle(() => pagesByKind[probeKind].generateMetadata({ params: { id } }));
    expect(valid).not.toEqual({});
    expect(valid).not.toBe("NOT_FOUND");
  });

  it.each(entityKinds)("returns no metadata for an id that does not exist anywhere: %s", async (kind) => {
    const { generateMetadata } = pagesByKind[kind];
    expect(await settle(() => generateMetadata({ params: { id: "does-not-exist-in-any-release" } }))).toEqual(
      absentMetadata(kind),
    );
  });
});
