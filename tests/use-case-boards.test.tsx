import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueRecord } from "../shared/omics/catalogue-query";
import type { ResolvedMapping, UseCase } from "../shared/omics/use-cases";
import { boardsProblems, type Board, type BoardsFile } from "../lib/boards";
import { REASON_TEXT, intervalText, positionText, releaseBoards, strengthText, useCaseBoard } from "../lib/use-case-boards";
import { UseCaseBoard } from "../components/catalogue/UseCaseBoard";
import fixture from "./fixtures/boards.json";

// Boards for three use cases from kb/board.py in rewire-benchmark-data, release "unreleased":
// splicing ranks 6 models, rare disease ranks 35 with wide position ranges, UTR ranks none.
const RELEASE = "unreleased";
const file = () => structuredClone(fixture) as unknown as BoardsFile;
const boardOf = (slug: string) => file().boards.find((b) => b.use_case === slug)!;

/** A data root holding the given boards file (or none), as REWIRE_DATA_ROOT. */
function dataRoot(content?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boards-"));
  if (content !== undefined) {
    fs.mkdirSync(path.join(root, "public/omics/boards"), { recursive: true });
    fs.writeFileSync(path.join(root, `public/omics/boards/${RELEASE}.json`), content);
  }
  process.env.REWIRE_DATA_ROOT = root;
  return root;
}

const original = process.env.REWIRE_DATA_ROOT;
afterEach(() => {
  if (original === undefined) delete process.env.REWIRE_DATA_ROOT;
  else process.env.REWIRE_DATA_ROOT = original;
  vi.restoreAllMocks();
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const record = (id: string, kind: CatalogueRecord["kind"], name = `Record ${id}`): CatalogueRecord =>
  ({ id, kind, name, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {} }) as CatalogueRecord;
const known: Record<string, CatalogueRecord> = {
  "discovery-model-pangolin": record("discovery-model-pangolin", "model", "Pangolin"),
  "splicing-follow-up-20261009-source-riepe2021": record("splicing-follow-up-20261009-source-riepe2021", "source", "Riepe et al. 2021"),
};
const lookup = (id: string) => known[id] ?? null;
const render = (board: Board) => renderToStaticMarkup(<UseCaseBoard board={board} record={lookup} returnTo="/use-cases/x/" />);

describe("fixture", () => {
  it("is a valid boards file", () => {
    expect(boardsProblems(fixture, RELEASE)).toEqual([]);
    expect(boardOf("splicing-follow-up").rows).toHaveLength(6);
    expect(boardOf("rare-disease-candidate-ranking").rows[0].positions).toEqual([1, 22]);
    expect(boardOf("utr-translation-baselines").rows).toHaveLength(0);
  });
});

describe("reading the release's boards file", () => {
  it("returns each use case's board, and nothing for a board with no ranked rows", () => {
    dataRoot(JSON.stringify(fixture));
    expect([...releaseBoards(RELEASE)!.keys()].sort()).toEqual(["rare-disease-candidate-ranking", "splicing-follow-up", "utr-translation-baselines"]);
    expect(useCaseBoard(RELEASE, "splicing-follow-up")?.rows).toHaveLength(6);
    expect(useCaseBoard(RELEASE, "utr-translation-baselines")).toBeNull();
    expect(useCaseBoard(RELEASE, "no-such-use-case")).toBeNull();
  });
  it("returns nothing when the release has no boards file", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dataRoot();
    expect(releaseBoards(RELEASE)).toBeNull();
    expect(useCaseBoard(RELEASE, "splicing-follow-up")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
  it("returns nothing, with a warning, for an invalid file", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = file();
    broken.boards[0].rows[0].interval = [0.1, 0.2];
    dataRoot(JSON.stringify(broken));
    expect(releaseBoards(RELEASE)).toBeNull();
    dataRoot("{ not json");
    expect(releaseBoards(RELEASE)).toBeNull();
    dataRoot(JSON.stringify({ ...file(), release_id: "another-release" }));
    expect(useCaseBoard(RELEASE, "splicing-follow-up")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("formatting", () => {
  it("prints a position range, or one number when it is settled", () => {
    expect(positionText([1, 3])).toBe("1 to 3");
    expect(positionText([2, 2])).toBe("2");
  });
  it("prints strength and interval as whole percents", () => {
    expect(strengthText(0.869)).toBe("87%");
    expect(strengthText(0)).toBe("0%");
    expect(intervalText([0.833, 0.919])).toBe("83% to 92%");
    expect(intervalText([0.991, 0.994])).toBe("99%");
  });
  it("has plain words for every reason a model is not ranked", () => {
    expect(REASON_TEXT).toEqual({
      "one study": "compared in one study only",
      "not a model record": "not a model record",
      "not compared with the main group": "not compared with the main group of models",
      "no second model to rank": "no second model to rank it against",
    });
  });
});

describe("order across studies", () => {
  it("shows each row's position, strength with its interval, studies, opponents, comparisons and basis", () => {
    const html = render(boardOf("splicing-follow-up"));
    const rows = html.split("<tr>").slice(2);
    expect(rows).toHaveLength(6);
    const first = text(rows[0]);
    expect(first).toMatch(/^1 to 3 Pangolin 87% 83% to 92% 7 studies, 22 opponents, 212 comparisons .* Several studies$/);
    expect(rows[0]).toContain('href="/database/model/discovery-model-pangolin/?return_to=%2Fuse-cases%2Fx%2F"');
    expect(rows[0]).toContain('aria-label="Pangolin: 87% chance of beating an average model; 83% to 92% with any one study left out"');
    expect(rows[0]).toMatch(/class="[^"]*dot[^"]*" style="left:84\.68/);
    // An unknown record is named without a link.
    expect(rows[1]).not.toContain("<a href=\"/database/");
    expect(text(rows[1])).toContain("AlphaGenome");
    // CADD rests mostly on one study, and says so in words.
    expect(text(rows[4])).toMatch(/CADD .* Mostly one study$/);
  });
  it("links each study's sources and DOIs, with the number of comparisons", () => {
    const html = render(boardOf("splicing-follow-up"));
    expect(html).toContain('<a href="/database/source/splicing-follow-up-20261009-source-riepe2021/">Riepe et al. 2021</a>');
    expect(html).toContain('<a href="https://doi.org/10.1002/humu.24212">doi:10.1002/humu.24212</a>');
    expect(text(html)).toContain("Riepe et al. 2021 · doi:10.1002/humu.24212 (308 comparisons)");
    // A study with no DOI is shown by its source ids.
    expect(html).toContain("<code>rewire-mfass-v2-source</code>");
  });
  it("lists models that are not ranked, with their reasons, behind a disclosure", () => {
    const html = render(boardOf("splicing-follow-up"));
    const notRanked = html.slice(html.indexOf('data-testid="use-case-board-not-ranked"'));
    expect(text(notRanked)).toContain("Not ranked (34 models)");
    expect(text(notRanked)).toContain("AlphaGenome Variant Impact (AVI): compared in one study only");
    expect(text(notRanked)).toContain("DNABERT-2 (Acceptor classification): not a model record");
  });
  it("states the board's summary and what the order is not", () => {
    const words = text(render(boardOf("splicing-follow-up")));
    expect(words).toContain("It gives no score on any benchmark metric, and it does not say what would happen if every model were run on one test.");
    expect(words).toContain("Strength is the chance of beating an average model on this page, with its range when any one study is left out.");
    expect(words).toContain("Position Model Strength Studies Basis");
    expect(words).toContain("Each row pools a model's versions and sizes.");
    expect(words).toContain(`${boardOf("splicing-follow-up").summary} Based on 40 models in 74 comparison groups from 9 studies.`);
  });
  it("shows every row of a long board, wide position ranges included", () => {
    const html = render(boardOf("rare-disease-candidate-ranking"));
    expect(html.split("<tr>").length - 2).toBe(35);
    expect(html).not.toContain("Show all");
    expect(text(html.split("<tr>")[2])).toMatch(/^1 to 22 GEMME 99% 96% to 100%/);
    const notRanked = text(html.slice(html.indexOf('data-testid="use-case-board-not-ranked"')));
    expect(notRanked).toMatch(/: not compared with the main group of models/);
  });
});

// The page, with the release mocked as in tests/use-case-pages.test.tsx.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(""), notFound: () => { throw new Error("not found"); } }));
const state = vi.hoisted(() => ({ entry: undefined as unknown as UseCase, mappings: [] as ResolvedMapping[] }));
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ query: { get: () => undefined, record: () => null, hasDiscrepancies: () => false } }) }));
vi.mock("../lib/use-cases-build", () => ({
  buildUseCases: () => ({ entries: [state.entry] }),
  fullUseCaseDetail: () => ({ use_case: state.entry, mappings: state.mappings, sources: [], release_id: "unreleased", input_sha256: "b".repeat(64) }),
}));

describe("use-case page", () => {
  const review = { method: "automated_source_review" as const, actor: "Fixture curator", reviewed_at: "2026-09-25T12:00:00Z", note: "Not independent human scientific review" };
  const entry = (slug: string): UseCase => ({
    id: `use-case-${slug}`, slug, title: "Fixture use case", question: "Which model?", area: "cells-tissues", contexts: ["research"], search_terms: [], intended_users: ["Researchers"], decision: "Choose", inputs: ["Variants"], output: "Scores", setting: "Lab", exclusions: [], clinical_scope: "Research use only.", evidence_gaps: [], citations: [], review, planned_work: [],
  });
  let Page: (props: { params: { slug: string } }) => JSX.Element;
  beforeAll(async () => {
    Page = (await import("../app/use-cases/[slug]/page")).default;
  });
  // Two configurations scored in one study: enough for the single-protocol Ranking section.
  const scored = (): ResolvedMapping => {
    const scoring = (config: string, value: string) => ({
      evaluation: record(`e-${config}`, "evaluation"), configurations: [record(config, "configuration")], results_total: 1, results_next_cursor: null,
      results: [{ result: { ...record(`r-${config}`, "result"), attributes: { metric: "recall", printed_value: value, numeric_value: value, metric_direction: "higher" } } }],
    });
    return {
      id: "m", use_case_id: "q", lifecycle: "active", revision: 1, reason: "Reviewed", protocol_id: "protocol", task_id: "task", evaluation_ids: [], endpoint: "Recall", relevance: "direct", rationale: "", constraints: [], limitations: [], citations: [], review, evidence_sha256: "a".repeat(64),
      protocol: record("protocol", "protocol"), task: null, sources: [], evaluations: [scoring("c1", "0.9"), scoring("c2", "0.8")],
    } as unknown as ResolvedMapping;
  };
  const page = (slug: string, mappings: ResolvedMapping[] = []) => {
    state.entry = entry(slug);
    state.mappings = mappings;
    return renderToStaticMarkup(<Page params={{ slug }} />);
  };

  it("adds the section straight after Ranking, in the section navigation and in heading order", () => {
    dataRoot(JSON.stringify(fixture));
    const html = page("splicing-follow-up", [scored()]);
    expect(html).toContain('data-testid="use-case-board"');
    const nav = html.slice(html.indexOf('aria-label="On this page"'));
    const links = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, id, label]) => [id, label]);
    const headings = [...html.matchAll(/<section id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)].map(([, id, label]) => [id, label]);
    expect(links).toEqual(headings);
    expect(links.slice(0, 3)).toEqual([["ranking", "Ranking"], ["order", "Order across studies"], ["tools", "Tools compared"]]);
  });
  it("shows nothing for an empty board, an absent file or an invalid file", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    dataRoot(JSON.stringify(fixture));
    expect(page("utr-translation-baselines")).not.toContain("Order across studies");
    dataRoot();
    expect(page("splicing-follow-up")).not.toContain("Order across studies");
    dataRoot(JSON.stringify({ ...file(), schema_version: 2 }));
    expect(page("splicing-follow-up")).not.toContain("Order across studies");
  });
});

// Once an adopted release brings the data repository's validator into shared/omics, both must agree.
const mirrored = path.resolve(__dirname, "../shared/omics/boards.ts");
describe.skipIf(!fs.existsSync(mirrored))("validator parity with shared/omics", () => {
  it("reports the same problems", async () => {
    const shared = await import(/* @vite-ignore */ mirrored);
    const variants: unknown[] = [fixture, {}, { ...file(), schema_version: 2 }];
    const unordered = file();
    unordered.boards[0].rows.reverse();
    const uncited = file();
    uncited.boards[0].studies = {};
    variants.push(unordered, uncited);
    for (const value of variants) expect(shared.boardsProblems(value, RELEASE)).toEqual(boardsProblems(value, RELEASE));
  });
});
