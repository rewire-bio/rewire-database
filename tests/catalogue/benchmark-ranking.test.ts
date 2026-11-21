import { describe, expect, it } from "vitest";
import type { CatalogueRecord, ResultRow } from "../../shared/omics/catalogue-query";
import { MIN_BENCHMARK_TOOLS, buildBenchmarkBoard, checkProtocol } from "../../lib/benchmark-ranking";

// Synthetic records; ids, names and values are invented.
const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}, extra: Partial<CatalogueRecord> = {}): CatalogueRecord =>
  ({ id, kind, name: `Name ${id}`, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes, ...extra });

type Tool = {
  id: string; value?: string; qualifier?: string; direction?: string; adaptation?: string; types?: string[]; parent?: string;
  split?: string; sources?: string[]; status?: string; evaluationStatus?: string; extra?: [string, string][]; origin?: string;
  /** Test the model record itself, with no configuration. */
  direct?: boolean; systems?: number; assessment?: string;
  /** Tells a second evaluation of the same configuration apart. */
  run?: string;
};

function world(tools: Tool[], protocolAttributes: Record<string, unknown> = { metric: "auroc", metric_direction: "higher" }, protocolId = "p1") {
  const records = new Map<string, CatalogueRecord>();
  const put = (r: CatalogueRecord) => (records.set(r.id, r), r);
  put(record("study", "source", {}, { name: "Fixture benchmark paper" }));
  const protocol = put(record(protocolId, "protocol", protocolAttributes, { name: `Protocol ${protocolId}`, links: [{ relation: "part_of", target_id: "bench" }] }));
  const rows: ResultRow[] = [];
  for (const tool of tools) {
    const tested = tool.direct
      ? put(record(tool.id, "model", {}, { facets: { method_types: tool.types ?? ["foundation_model"] } }))
      : record(tool.id, "configuration", { reported_name: tool.id.toUpperCase() }, {
        facets: { method_types: tool.types ?? ["foundation_model"] },
        links: tool.parent === "" ? [] : [{ relation: "configuration_of", target_id: tool.parent ?? `model-${tool.id}` }],
      });
    const systems = Array.from({ length: tool.systems ?? 1 }, (_, i) => ({ relation: "system", target_id: i ? `${tool.id}-${i}` : tool.id }));
    const key = `${tool.id}${tool.run ?? ""}`;
    const evaluation = put(record(`${protocolId}-e-${key}`, "evaluation", {
      origin: tool.origin ?? "independent_paper",
      comparison: { split: tool.split ?? "test", dataset_version: "v1", adaptation: tool.adaptation ?? "zero-shot" },
    }, { status: tool.evaluationStatus ?? "source_checked", links: [{ relation: "assessment", target_id: tool.assessment ?? protocolId }, ...systems] }));
    const row = (id: string, metric: string, value: string, qualifier?: string, status = "source_checked"): ResultRow => ({
      result: put(record(id, "result", {
        metric, numeric_value: value, printed_value: value, metric_direction: tool.direction ?? "higher", ...(qualifier ? { metric_qualifier: qualifier } : {}),
      }, { status, source_ids: tool.sources ?? ["study"], links: [{ relation: "evaluation", target_id: evaluation.id }] })),
      evaluation, configurations: tool.direct ? [] : [tested], models: tool.direct ? [tested] : [],
      benchmarks: [], methods: [], pipelines: [], services: [], tasks: [], protocols: [protocol], evaluators: [], datasets: [], dataset_subsets: [], sources: [],
      origin: tool.origin ?? "independent_paper", review_status: status,
    });
    rows.push(row(`${protocolId}-r-${key}`, "auroc", tool.value ?? "0.8", tool.qualifier ?? "all variants", tool.status));
    for (const [metric, value] of tool.extra ?? []) rows.push(row(`${protocolId}-r-${key}-${metric}`, metric.split("|")[0], value, metric.split("|")[1]));
  }
  return { protocol, rows, record: (id: string) => records.get(id) ?? null, records };
}

const five = (): Tool[] => [
  { id: "a", value: "0.91" }, { id: "b", value: "0.85" }, { id: "c", value: "0.80" },
  { id: "d", value: "0.72", types: ["conventional_pipeline"], adaptation: "Baseline as configured by the benchmark authors" }, { id: "e", value: "0.60" },
];
const reason = (tools: Tool[], attributes?: Record<string, unknown>, concerned?: Set<string>) => {
  const w = world(tools, attributes);
  const check = checkProtocol(w.protocol, w.rows, w.record, concerned);
  return check.rankable ? "rankable" : check.reason;
};
const inputs = { findings: () => ({}), receiptSources: new Set<string>() };

describe("benchmark boards: what can be ranked without a judgement", () => {
  it("ranks a protocol that names its metric when every tool has one comparable value", () => {
    const w = world(five());
    const check = checkProtocol(w.protocol, w.rows, w.record);
    expect(check.rankable).toBe(true);
    if (!check.rankable) return;
    expect(check.tools).toBe(5);
    expect(check.withheld).toBe(0);
    // A baseline fitted its own way is allowed beside foundation models that share one adaptation.
    expect(check.adaptations).toEqual(["Baseline as configured by the benchmark authors", "zero-shot"]);
    expect(check.mapping.evaluations).toHaveLength(5);
  });

  it("does not rank when the protocol record leaves the metric, the direction or its own review open", () => {
    expect(reason(five(), { metric_direction: "higher" })).toBe("The protocol record does not name one metric and its direction.");
    expect(reason(five(), { metric: "auroc" })).toBe("The protocol record does not name one metric and its direction.");
    expect(reason(five(), { metric: "auroc", metric_direction: "unknown" })).toBe("The protocol record does not name one metric and its direction.");
    const w = world(five());
    expect(checkProtocol({ ...w.protocol, status: "discovered" }, w.rows, w.record)).toEqual({ rankable: false, reason: "The protocol record is not source-checked." });
    expect(checkProtocol(w.protocol, [], w.record)).toEqual({ rankable: false, reason: "No result is recorded against the protocol." });
    expect(checkProtocol(w.protocol, [{ ...w.rows[0], evaluation: null }], w.record)).toEqual({ rankable: false, reason: "A result has no evaluation record." });
  });

  it("does not rank when a row or a column would have to be chosen", () => {
    const [a, ...rest] = five();
    expect(reason([a, { ...a, value: "0.5", run: "-again" }, ...rest])).toBe("A configuration is evaluated more than once, so a row would have to be chosen.");
    expect(reason([{ ...a, extra: [["auroc|coding variants", "0.7"]] }, ...rest])).toBe("An evaluation does not have exactly one source-checked auroc result, so a column would have to be chosen.");
    expect(reason([{ ...a, qualifier: "coding variants" }, ...rest])).toBe("The auroc results are reported for more than one stratum, so a column would have to be chosen.");
    expect(reason([{ ...a, status: "author_reported" }, ...rest])).toBe("An evaluation does not have exactly one source-checked auroc result, so a column would have to be chosen.");
    // A second metric is another column of the same table, not a choice.
    expect(reason([{ ...a, extra: [["auprc", "0.4"]] }, ...rest])).toBe("rankable");
  });

  it("does not rank rows that are not one comparison", () => {
    const [a, ...rest] = five();
    expect(reason([{ ...a, split: "validation" }, ...rest])).toBe("The evaluations differ in split.");
    expect(reason([{ ...a, adaptation: "fine-tuned" }, ...rest])).toBe("The foundation models were adapted in more than one way, so the rows are not one comparison.");
    // A tool whose type the release does not record is held to the same adaptation as the foundation models.
    expect(reason([{ ...a, adaptation: "fine-tuned", types: [] }, ...rest])).toBe("The foundation models were adapted in more than one way, so the rows are not one comparison.");
    expect(reason([{ ...a, direction: "lower" }, ...rest])).toBe("A ranked result states a direction other than the protocol's.");
    expect(reason([{ ...a, sources: ["other"] }, ...rest])).toBe("The ranked results cite different sources.");
    expect(reason([{ ...a, evaluationStatus: "disputed" }, ...rest])).toBe("An evaluation is not source-checked.");
    expect(reason([{ ...a, systems: 2 }, ...rest])).toBe("An evaluation does not test exactly one configuration, model or method.");
    expect(reason([{ ...a, assessment: "another-protocol" }, ...rest])).toBe("A result reaches the protocol through another record, not through an evaluation of the protocol.");
  });

  it("counts tools, not configurations, and only those with a number", () => {
    const tools = five();
    expect(reason(tools.slice(0, MIN_BENCHMARK_TOOLS - 1))).toBe("Fewer than 5 tools have a number.");
    expect(reason(tools.map((t, i) => (i < 2 ? { ...t, parent: "one-model" } : t)))).toBe("Fewer than 5 tools have a number.");
    expect(reason(tools.map((t, i) => (i === 0 ? { ...t, value: "" } : t)))).toBe("Fewer than 5 tools have a number.");
    expect(reason([...tools, { id: "f", value: "" }])).toBe("rankable");
    expect(reason(tools.map((t) => ({ ...t, parent: "" })))).toBe("rankable");
  });

  it("applies the evidence gates a use-case page applies", () => {
    const w = world(five());
    const check = (edit: (source: CatalogueRecord) => CatalogueRecord | null, concerned?: Set<string>) =>
      checkProtocol(w.protocol, w.rows, (id) => (id === "study" ? edit(w.records.get("study")!) : w.record(id)), concerned);
    expect(check((s) => ({ ...s, attributes: { evidence_concerns: ["Two tables disagree."] } })))
      .toEqual({ rankable: false, reason: "A cited source carries an evidence concern over everything it supports." });
    expect(check((s) => ({ ...s, status: "discovered" }))).toEqual({ rankable: false, reason: "A cited source is not source-checked." });
    expect(check(() => null)).toEqual({ rankable: false, reason: "A cited source is not source-checked." });
    expect(check((s) => ({ ...s, kind: "claim" }))).toEqual({ rankable: false, reason: "A cited source is not source-checked." });
    // A scoped concern leaves out the evaluations that rest on the named record, and only those.
    const extra = world([...five(), { id: "f", value: "0.99", extra: [["auprc", "0.3"]] }]);
    const scoped = checkProtocol(extra.protocol, extra.rows, extra.record, new Set(["f"]));
    expect(scoped.rankable && scoped.withheld).toBe(1);
    expect(scoped.rankable && scoped.mapping.evaluations.map((e) => e.configurations[0].id)).toEqual(["a", "b", "c", "d", "e"]);
    // A concern about another metric's result withholds that value, not the ranked one.
    const other = checkProtocol(extra.protocol, extra.rows, extra.record, new Set(["p1-r-f-auprc"]));
    expect(other.rankable && other.withheld).toBe(0);
    expect(other.rankable && other.mapping.evaluations[5].results.map((r) => r.result.id)).toEqual(["p1-r-f"]);
    expect(reason(five(), undefined, new Set(["bench"]))).toBe("Every result is withheld by an evidence concern.");
  });

  it("ranks a model tested as it stands and links the row to the model's own page", () => {
    const tools = five().map((t) => ({ ...t, direct: true }));
    const w = world(tools);
    const { board } = buildBenchmarkBoard({ benchmark: record("bench", "benchmark"), protocols: [{ protocol: w.protocol, rows: w.rows }], record: w.record, ...inputs });
    expect(board!.rows.map((r) => r.model_href)).toEqual(["a", "b", "c", "d", "e"].map((id) => `/database/model/${id}/`));
  });
});

describe("benchmark boards: the board", () => {
  const benchmark = record("bench", "benchmark", {}, { name: "Fixture benchmark" });
  const small = world(five(), undefined, "p1");
  const large = world([...five(), { id: "f", value: "0.95", origin: "author_reported" }], undefined, "p2");
  const unnamed = world(five(), {}, "p3");
  const records = new Map([...small.records, ...large.records, ...unnamed.records]);
  const built = buildBenchmarkBoard({
    benchmark,
    protocols: [small, large, unnamed].map(({ protocol, rows }) => ({ protocol, rows })),
    record: (id) => records.get(id) ?? null, ...inputs,
  });

  it("ranks the rankable protocol with the most tools, in the protocol's direction, with no relevance or baseline", () => {
    const board = built.board!;
    expect(board.protocol).toMatchObject({ comparison_id: "p2", title: "Protocol p2", metric: "auroc", direction: "higher", relevance: "benchmark" });
    expect(board.rows.map((r) => [r.rank, r.model_name, r.display_value, r.origin, r.independent])).toEqual([
      [1, "F", "0.95", "author_reported", false], [2, "A", "0.91", "independent_paper", true], [3, "B", "0.85", "independent_paper", true],
      [4, "C", "0.80", "independent_paper", true], [5, "D", "0.72", "independent_paper", true], [6, "E", "0.60", "independent_paper", true],
    ]);
    expect(board.rows.every((r) => r.source_record_id.startsWith("p2-r-") && r.source_ids.join() === "study")).toBe(true);
    expect(board.baseline).toBeNull();
    expect(board.rows.every((r) => r.margin_over_conventional === null && !r.is_baseline && r.reviewed_status === "source_checked")).toBe(true);
    expect(board.use_case_href).toBe("/database/benchmark/bench/");
  });

  it("says how much of the benchmark the board shows and why the rest is not ranked", () => {
    expect(built.board!.benchmark).toEqual({
      id: "bench", name: "Fixture benchmark", href: "/database/benchmark/bench/",
      protocol_id: "p2", protocol_href: "/database/protocol/p2/", protocols: 3, rankable: 2,
      adaptations: ["Baseline as configured by the benchmark authors", "zero-shot"], withheld: 0,
    });
    expect(built.protocols).toEqual([
      { id: "p1", name: "Protocol p1", rankable: true, reason: null },
      { id: "p2", name: "Protocol p2", rankable: true, reason: null },
      { id: "p3", name: "Protocol p3", rankable: false, reason: "The protocol record does not name one metric and its direction." },
    ]);
    // Coverage counts the benchmark's rankable protocols.
    expect(built.board!.rows.find((r) => r.model_id === "a")!.coverage).toEqual({ evaluated: 2, relevant: 2 });
    expect(built.board!.rows.find((r) => r.model_id === "f")!.coverage).toEqual({ evaluated: 1, relevant: 2 });
  });

  it("has no board when no protocol can be ranked", () => {
    const none = buildBenchmarkBoard({ benchmark, protocols: [{ protocol: unnamed.protocol, rows: unnamed.rows }], record: (id) => records.get(id) ?? null, ...inputs });
    expect(none.board).toBeNull();
    expect(none.protocols).toHaveLength(1);
    expect(buildBenchmarkBoard({ benchmark, protocols: [], record: () => null, ...inputs })).toEqual({ board: null, protocols: [] });
  });
});
