import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelReachMatrix, ModelReachRadar, ModelReachRadars } from "../components/catalogue/ModelReach";
import { DOMAINS, homeReach, modelReach, positionOf, radarSet, reachFromBoardsFile, standing, type ReachBoard } from "../lib/model-reach";
import type { BoardsFile } from "../shared/omics/boards";
import fixture from "./fixtures/model-reach.json";

// Release 2026-11-27-599b5b1af1cc's boards, keeping only model records, with each board's number of ranked rows.
const boards: ReachBoard[] = fixture.boards.map((b) => ({ use_case: b.use_case, size: b.ranked, rows: b.rows as ReachBoard["rows"], not_ranked: b.not_ranked as ReachBoard["not_ranked"] }));
const kinds = fixture.kinds as Record<string, string>;
const reach = modelReach(boards, (id) => kinds[id] ?? null);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("model reach", () => {
  it("groups every use case of the release and all 39 active use cases", () => {
    const slugs = DOMAINS.flatMap((d) => d.useCases.map(([slug]) => slug));
    expect(slugs).toHaveLength(39);
    for (const b of boards) expect(slugs).toContain(b.use_case);
  });

  it("keeps model records ranked somewhere and compared in at least two groups", () => {
    expect(reach.rows).toHaveLength(31);
    for (const row of reach.rows) {
      expect(row.ranked).toBeGreaterThanOrEqual(1);
      expect(row.domains.length).toBeGreaterThanOrEqual(2);
    }
    expect(reach.rows.slice(0, 2).map((r) => r.name)).toEqual(["DNABERT-2", "Nucleotide Transformer"]);
    const evo2 = reach.rows.find((r) => r.name === "Evo 2")!;
    expect(evo2.cells["brca1-brca2-germline-interpretation"]).toEqual({ state: "ranked", best: 8, worst: 17, of: 44 });
    expect(evo2.cells["rare-disease-candidate-ranking"]).toEqual({ state: "ranked", best: 6, worst: 32, of: 35 });
    expect(evo2.cells["regulatory-variant-gene-follow-up"]).toEqual({ state: "ranked", best: 2, worst: 4, of: 8 });
    expect(evo2.cells["splicing-follow-up"]).toEqual({ state: "compared", reason: "one study" });
    // A record that is not of kind model is left out, however widely it is compared.
    expect(modelReach(boards, (id) => (id === evo2.id ? "method" : kinds[id])).rows.some((r) => r.id === evo2.id)).toBe(false);
  });

  it("orders columns by group and shows only use cases some row reaches", () => {
    const order = DOMAINS.map((d) => d.id);
    const groups = reach.columns.map((c) => order.indexOf(c.domain));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(reach.columns.map((c) => c.slug)).not.toContain("hit-discovery-virtual-screening");
  });

  it("picks top homepage rows ordered by number of ranked boards and trims unreached columns", () => {
    const top = homeReach(reach.rows, reach.columns, 8);
    expect(top.rows).toHaveLength(8);
    expect(top.rows[0].ranked).toBeGreaterThanOrEqual(top.rows[7].ranked);
    expect(top.rows.slice(0, 4).map((r) => r.name)).toEqual(["ESM-1b", "EVE", "ESM-2", "Evo 2"]);
    for (const col of top.columns) expect(top.rows.some((r) => r.cells[col.slug])).toBe(true);
  });

  it("reads data-driven groups from a boards file when present and handles missing boards files", () => {
    expect(reachFromBoardsFile(null, () => "model").rows).toEqual([]);
    const customFile = {
      schema_version: 1,
      release_id: "test",
      released_at: null,
      method: "test",
      groups: [
        { id: "g1", label: "Group One", use_cases: [["brca1-brca2-germline-interpretation", "BRCA1"]] },
        { id: "g2", label: "Group Two", use_cases: [["splicing-follow-up", "Splicing"]] },
      ],
      boards: fixture.boards
        .filter((b) => ["brca1-brca2-germline-interpretation", "splicing-follow-up"].includes(b.use_case))
        .map((b) => ({
        use_case: b.use_case,
        use_case_id: b.use_case,
        title: b.use_case,
        release_id: "test",
        released_at: null,
        method: "test",
        summary: "test",
        counts: { studies: 2, groups: 2, models: b.rows.length + b.not_ranked.length, ranked: b.rows.length, one_study: 0, not_a_model: 0, not_connected: 0, too_few: 0 },
        rows: b.rows.map((r) => ({ ...r, record_ids: [r.model_id], strength: 0.5, interval: [0.4, 0.6], studies: { s1: 1, s2: 1 }, opponents: 1, comparisons: 2, basis: "several studies" })),
        not_ranked: b.not_ranked.map((n) => ({ ...n, study_ids: ["s1"] })),
        studies: { s1: { source_ids: [], dois: [] }, s2: { source_ids: [], dois: [] } },
      })),
    } as unknown as BoardsFile;
    const custom = reachFromBoardsFile(customFile, (id) => kinds[id] ?? null);
    expect(custom.groups.map((g) => g.label)).toEqual(["Group One", "Group Two"]);
    expect(custom.rows.length).toBeGreaterThan(0);
  });

  it("states positions in words and places them on a 0 to 1 scale", () => {
    expect(positionOf({ state: "ranked", best: 8, worst: 17, of: 44 })).toBe("8 to 17 of 44");
    expect(positionOf({ state: "ranked", best: 3, worst: 3, of: 3 })).toBe("3 of 3");
    expect(standing(1, 44)).toBe(1);
    expect(standing(44, 44)).toBe(0);
    expect(standing(1, 1)).toBe(1);
  });
});

describe("matrix", () => {
  const html = renderToStaticMarkup(<ModelReachMatrix {...reach} />);
  it("links each compared cell, model name, and each column to the use case's board", () => {
    expect(html).toContain('href="/use-cases/brca1-brca2-germline-interpretation/#order"');
    expect(html).toContain('href="/database/model/discovery-model-evo-2/"');
    expect(html).toContain('title="Evo 2, BRCA1/BRCA2: ranked 8 to 17 of 44"');
    expect(html).toContain('title="Evo 2, Splicing follow-up: compared in one study only"');
  });
  it("says each state in words, not by colour alone", () => {
    const words = text(html);
    expect(words).toMatch(/Evo 2 ranked on 3 of 6/);
    expect(words).toContain("8 to 17 of 44");
    expect(words).toContain("1 study");
    expect(words).toContain("Not compared");
  });
});

describe("radar", () => {
  const set = radarSet(reach.rows, reach.columns);
  it("takes the models ranked on the most boards", () => {
    expect(set.rows.map((r) => r.name)).toEqual(["ESM-1b", "EVE", "ESM-2", "Evo 2"]);
  });
  it("draws no point where a model is not ranked, and lists every axis in words", () => {
    const evo2 = set.rows.find((r) => r.name === "Evo 2")!;
    const html = renderToStaticMarkup(<ModelReachRadar row={evo2} columns={set.columns} />);
    expect(html.match(/class="_mid_/g)?.length).toBe(3);
    expect(html.match(/comparedMark/g)?.length).toBe(3);
    expect(text(html)).toContain("Proteins: Protein variant effects not compared; Protein stability not compared.");
    const multi = renderToStaticMarkup(<ModelReachRadars rows={set.rows.slice(0, 2)} columns={set.columns} />);
    expect(multi).toContain("ESM-1b");
    expect(multi).toContain("EVE");
  });
});
