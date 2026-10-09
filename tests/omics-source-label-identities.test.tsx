import { describe, expect, it, vi } from "vitest";
import { preparedFromSnapshot } from "./helpers/prepared";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../shared/omics/catalogue-query";
import { validateSnapshot } from "../shared/omics/validation";
import { filterCatalogue } from "../lib/omics-browse";
import { testedSearchText } from "../components/catalogue/BenchmarkCharts";
import ConfigurationPage from "../app/database/configuration/[id]/page";
import ResultPage from "../app/database/result/[id]/page";
import TaskPage from "../app/database/task/[id]/page";

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: preparedFromSnapshot(fixture.snapshot!),
  }),
}));

const released: CatalogueSnapshot = JSON.parse(fs.readFileSync("tests/fixtures/source-label-identities.json", "utf8"));

describe("reviewed source-label identities", () => {

  it("searches readable names and printed labels in the query API, browse and chart rows", () => {
    const snapshot = released;
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    const query = createCatalogueQuery(snapshot);
    const ids = (q: string) => query.list({ kind: "configuration", q, limit: 50 }).items.map((item) => item.id);
    expect(ids("deepaffinity")).toEqual(["atom3d-method-karimi-et-al-2019"]);
    expect(ids("[Öztürk et al., 2018]")).toEqual(["atom3d-method-zt-rk-et-al-2018"]);
    expect(ids("ciga")).toEqual(["hest-method-ciga"]);
    expect(ids("simclr histology")).toEqual(["hest-method-ciga"]);
    expect(filterCatalogue(snapshot.records as any, { kind: "result", readiness: "", q: "karimi et al", area: "", status: "", origin: "" })
      .map((item) => item.id)).toContain("atom3d-result-karimi-et-al-2019-lba-rmse-rmse");
    const detail = query.get({ id: "atom3d-task-lba-rmse" })!;
    const rows = detail.published_comparisons.flatMap((panel) => panel.rows);
    expect(rows.filter((row) => testedSearchText(row).includes("[karimi et al., 2019]"))).toHaveLength(1);
    expect(rows.filter((row) => testedSearchText(row).includes("deepdta"))).toHaveLength(1);
  });

  it("renders identity notices on configuration and result pages and cited labels in tables", async () => {
    fixture.snapshot = released;
    const configuration = renderToStaticMarkup(
      <ConfigurationPage params={{ id: "atom3d-method-karimi-et-al-2019" }} />);
    expect(configuration).toContain("Identified as DeepAffinity. The source table prints [Karimi et al., 2019].");
    expect(configuration).toContain("DSSP");
    expect(configuration).toContain("/database/model/identity-model-deepaffinity");
    expect(configuration).toContain("no human scientific review");
    const result = renderToStaticMarkup(
      await ResultPage({ params: { id: "hest-result-ciga-ccrcc-pearson-r" } }));
    expect(result).toContain("The source table prints the tested method as Ciga.");
    expect(result).toContain("/database/configuration/hest-method-ciga");
    const hest = renderToStaticMarkup(<ConfigurationPage params={{ id: "hest-method-ciga" }} />);
    expect(hest).toContain("Not established: Backbone.");
    expect(hest).toContain("labels the recipe");
    const task = renderToStaticMarkup(<TaskPage params={{ id: "atom3d-task-lba-rmse" }} />);
    expect(task).toContain("DeepDTA (ATOM3D baseline)");
    expect(task).toContain("(cited as [Öztürk et al., 2018])");
    expect(task).not.toMatch(/>\[Karimi et al\., 2019\]</);
  });
});

describe("source-label identity guards", () => {
  it("renders an unresolved identity on linked result pages", async () => {
    fixture.snapshot = JSON.parse(fs.readFileSync("tests/fixtures/unresolved-source-identity.json", "utf8"));
    const html = renderToStaticMarkup(await ResultPage({ params: { id: "result" } }));
    expect(html).toContain("the method it refers to is unresolved");
    expect(html).toContain('data-source-identity="unresolved"');
    expect(html).toContain("/database/configuration/config");
  });
});

vi.mock("../lib/record-page", async (original) => (await import("./fixtures/record-pages")).localRecordPages(original));
