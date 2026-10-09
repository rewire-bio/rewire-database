import fs from "node:fs";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { PreparedCatalogue } from "../services/omics/src/prepared-catalogue";
import { describe, expect, it, vi } from "vitest";
import {
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { entityKinds } from "../services/omics/src/entity-kinds";
import { recordRouteKinds } from "../lib/omics";
import { recordPageKinds, recordPageRoutes } from "../services/omics/src/record-pages";

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
fixture.snapshot = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
);
fixture.query = preparedFromSnapshot(fixture.snapshot!);

// Each of the 16 kinds owns a canonical page at app/database/<kind>/[id]/page.tsx.
// There is no generic app/database/[kind]/[id]/page.tsx fallback.
const pageModules = {
  model: () => import("../app/database/model/[id]/page"),
  method: () => import("../app/database/method/[id]/page"),
  configuration: () => import("../app/database/configuration/[id]/page"),
  pipeline: () => import("../app/database/pipeline/[id]/page"),
  service: () => import("../app/database/service/[id]/page"),
  benchmark: () => import("../app/database/benchmark/[id]/page"),
  task: () => import("../app/database/task/[id]/page"),
  protocol: () => import("../app/database/protocol/[id]/page"),
  evaluator: () => import("../app/database/evaluator/[id]/page"),
  dataset: () => import("../app/database/dataset/[id]/page"),
  dataset_subset: () => import("../app/database/dataset_subset/[id]/page"),
  baseline: () => import("../app/database/baseline/[id]/page"),
  evaluation: () => import("../app/database/evaluation/[id]/page"),
  result: () => import("../app/database/result/[id]/page"),
  source: () => import("../app/database/source/[id]/page"),
  claim: () => import("../app/database/claim/[id]/page"),
} as const;

describe("entity detail route inventory", () => {
  it("has a canonical page module for every entity kind, no generic fallback", () => {
    expect(Object.keys(pageModules).sort()).toEqual([...entityKinds].sort());
    expect(fs.existsSync("app/database/[kind]")).toBe(false);
  });

  it("renders every route on request: no module bakes a release into build-time parameters", async () => {
    for (const [kind, load] of Object.entries(pageModules))
      expect("generateStaticParams" in (await load()), `${kind} must render on demand`).toBe(false);
  });

  it("materializes exactly the canonical and alias result/evaluation routes", () => {
    const generated = new Set<string>();
    for (const route of recordPageRoutes(fixture.snapshot!)) {
      const key = `${route.kind}/${route.record.id}`;
      expect(generated.has(key), `${key} materialized twice`).toBe(false);
      generated.add(key);
    }
    const expected = new Set<string>();
    for (const record of fixture.snapshot!.records)
      if (record.status !== "excluded")
        for (const kind of recordRouteKinds(record))
          if ((recordPageKinds as readonly string[]).includes(kind)) expected.add(`${kind}/${record.id}`);

    const missing = [...expected].filter((route) => !generated.has(route));
    const extra = [...generated].filter((route) => !expected.has(route));
    expect(missing, "routes dropped by the split").toEqual([]);
    expect(extra, "routes invented by the split").toEqual([]);
    expect(generated.size).toBe(expected.size);
  });

  // Release-independent on purpose: exact canonical/alias counts change with every
  // data release (see workbench/entity-page-split-checkpoint.md for the figures
  // observed at split time). What must never drift is agreement between the two
  // ways of counting an alias — this catches a regression in `recordRouteKinds`
  // itself, which the parity test above can't, since it builds its own "expected"
  // set from that same function.
  it("agrees on alias counts whether derived via recordRouteKinds or read directly off legacy_kinds", () => {
    const aliasesViaRouteKinds = fixture.snapshot!.records.reduce(
      (sum, record) => sum + recordRouteKinds(record).length - 1,
      0,
    );
    const aliasesViaRawAttribute = fixture.snapshot!.records.reduce((sum, record) => {
      const legacy = record.attributes.legacy_kinds;
      if (!Array.isArray(legacy)) return sum;
      return (
        sum +
        legacy.filter(
          (kind) =>
            kind !== record.kind &&
            (entityKinds as readonly string[]).includes(kind),
        ).length
      );
    }, 0);
    expect(aliasesViaRouteKinds).toBe(aliasesViaRawAttribute);
    // Sanity floor, not a brittle exact count: the pinned release has aliases: a
    // regression that silently drops `legacy_kinds` handling entirely would
    // still pass the equality above (0 === 0) but not this.
    expect(aliasesViaRouteKinds).toBeGreaterThan(0);
  });
});
