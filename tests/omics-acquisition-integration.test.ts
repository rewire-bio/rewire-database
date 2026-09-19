import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { applyAcquisitionCorrections, getMfassPrecisionCorrection, mfassUpstreamSourceId } from "../scripts/omics/acquisition/records";
import { profileSchema } from "../services/omics/src/profile-schema";
import type { RecordEntry } from "../scripts/omics/schema";
const root = "data/omics/acquisition/2026-09-19";
const read = (name: string): any[] =>
  fs
    .readFileSync(`${root}/${name}`, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const candidates = [
  ...read("proteins/candidates.jsonl"),
  ...read("challenges/candidates.jsonl"),
  ...read("cells-networks/candidates.jsonl"),
];
const byCandidate = new Map(candidates.map((c) => [c.candidate_id, c]));
const records = read("reviewed-records.jsonl");
const byId = new Map(records.map((r) => [r.id, r]));
const results = records.filter((r) => r.kind === "result");
const protocols = records.filter((r) => r.kind === "protocol");
const evalFor = (r: any) =>
  byId.get(r.links.find((l: any) => l.relation === "evaluation").target_id)!;
const protocolFor = (r: any) =>
  byId.get(
    evalFor(r).links.find((l: any) => l.relation === "benchmark").target_id,
  )!;
const candidateFor = (r: any) =>
  byCandidate.get(r.attributes.acquisition_candidate_id)!;
describe("reviewed acquisition graph and scientific scope", () => {
  it("does not promote incomplete scientific metadata using numerical transcription checks", () => {
    for (const r of records.filter((r) =>
      ["configuration", "protocol", "dataset_subset", "evaluation"].includes(
        r.kind,
      ),
    ))
      expect(r.status, r.id).toBe("discovered");
    for (const r of results) expect(r.status).toBe("source_checked");
  });
  it("preserves every accepted source string, unit, metric, uncertainty and reciprocal evaluation link", () => {
    const decisions = read("integration-decisions.jsonl");
    expect(results.length).toBe(decisions.filter((d) => d.accepted).length);
    for (const r of results) {
      const c = candidateFor(r);
      expect(r.attributes.printed_value, r.id).toBe(c.printed_value);
      expect(Number(r.attributes.numeric_value), r.id).toBe(c.numeric_value);
      expect(r.attributes.unit, r.id).toBe(c.unit);
      expect(r.attributes.metric, r.id).toBe(c.metric);
      expect(r.attributes.uncertainty, r.id).toEqual(c.uncertainty);
      expect(evalFor(r).kind).toBe("evaluation");
      expect(protocolFor(r).links).toContainEqual({
        relation: "part_of",
        target_id: c.benchmark_id,
      });
    }
  });
  it("keeps BEELINE reference networks and gene selections in separate protocol strata", () => {
    const groups = new Map<string, Set<string>>();
    for (const r of results) {
      const c = candidateFor(r);
      if (!c.benchmark_id.includes("beeline")) continue;
      const id = protocolFor(r).id;
      const set = groups.get(id) || new Set();
      set.add(
        JSON.stringify([
          c.dataset,
          c.conditions.reference_network,
          c.conditions.gene_selection,
        ]),
      );
      groups.set(id, set);
    }
    expect(groups.size).toBeGreaterThan(17);
    for (const scopes of groups.values()) expect(scopes.size).toBe(1);
  });
  it("retains every provisional VCC submission exactly once across bounded source-order panels", () => {
    const rs = results.filter((r) =>
      candidateFor(r).benchmark_id.includes("virtual-cell"),
    );
    expect(rs).toHaveLength(1048);
    const panels = protocols
      .filter((p) =>
        p.links.some((l: any) => l.target_id.includes("virtual-cell")),
      )
      .flatMap((p) => p.attributes.comparison_panels);
    const ids = panels.flatMap((p: any) => p.result_ids);
    expect(new Set(ids).size).toBe(rs.length);
    expect(ids.length).toBe(rs.length);
    expect(panels.every((p: any) => p.result_ids.length <= 80)).toBe(true);
    for (const r of rs) {
      const e = evalFor(r);
      expect(e.attributes.conditions.is_final).toBe(false);
      expect(e.attributes.conditions.anchor_version).toBe(
        "vcc2026-valA-r4+vcc2026-valB-r4+vcc2026-valC-r4",
      );
      expect(e.attributes.conditions.submission_id).toBe(
        candidateFor(r).conditions.submission_id,
      );
    }
  });
  it("does not compare Vina's ground-truth pocket or DiffDock's rigid receptor with co-folding inputs", () => {
    const protocolsByMethod = new Map<string, Set<string>>();
    for (const r of results) {
      const c = candidateFor(r);
      if (!c.benchmark_id.includes("plinder")) continue;
      const s = protocolsByMethod.get(c.model_or_submission) || new Set();
      s.add(protocolFor(r).id);
      protocolsByMethod.set(c.model_or_submission, s);
    }
    const vina = [...protocolsByMethod.get("Vina")!][0],
      diff = [...protocolsByMethod.get("DiffDock")!][0],
      af = [...protocolsByMethod.get("AF3")!][0];
    expect(vina).not.toBe(diff);
    expect(vina).not.toBe(af);
    expect(diff).not.toBe(af);
  });
  it("preserves per-metric aggregation when several metric rows share one evaluation", () => {
    for (const r of results) {
      const c = candidateFor(r);
      if (!c.benchmark_id.includes("plinder")) continue;
      const aggregation =
        r.attributes.reported_conditions?.aggregation ??
        r.attributes.conditions?.aggregation ??
        r.attributes.aggregation ??
        evalFor(r).attributes.conditions.aggregation;
      expect(aggregation, `${c.model_or_submission}/${c.metric}`).toBe(
        c.conditions.aggregation,
      );
    }
  });
  it("retains CAFA anonymous identities and unresolved mode semantics without invented model-family links", () => {
    const rs = results.filter((r) =>
      candidateFor(r).benchmark_id.includes("cafa"),
    );
    expect(rs).toHaveLength(438);
    for (const r of rs) {
      const e = evalFor(r);
      expect(e.attributes.conditions.evaluation_mode).toContain(
        "not established",
      );
      const m = byId.get(
        e.links.find((l: any) => l.relation === "model").target_id,
      )!;
      expect(m.name).toMatch(/^CAFA3 /);
      expect(m.links).toEqual([]);
      expect(m.attributes.missing_metadata.model_family).toBe("unextracted");
    }
  });
  it("preserves CAMI gold-standard reference identity and explicitly reported standard errors", () => {
    const rs = results.filter((r) =>
      candidateFor(r).benchmark_id.includes("cami"),
    );
    const refs = rs.filter(
      (r) => candidateFor(r).model_or_submission === "Gold standard",
    );
    expect(refs).toHaveLength(16);
    for (const r of refs)
      expect(evalFor(r).attributes.conditions.gold_standard_reference).toBe(
        true,
      );
    const means = rs.filter((r) => r.attributes.metric.startsWith("Average "));
    expect(means).toHaveLength(64);
    for (const r of means) {
      expect(r.attributes.uncertainty.kind).toBe("standard_error");
      expect(r.attributes.uncertainty.source_column).toContain(
        "Std error of av.",
      );
    }
  });
  it("keeps scIB feature/scaling configurations distinct without merging separate evaluated configurations", () => {
    const seen = new Map<string, Set<string>>();
    for (const r of results) {
      const c = candidateFor(r);
      if (!c.benchmark_id.includes("scib")) continue;
      const e = evalFor(r);
      const key = JSON.stringify([
        c.model_or_submission,
        c.conditions.features,
        c.conditions.scaling,
        c.conditions.configuration,
      ]);
      const s = seen.get(e.id) || new Set();
      s.add(key);
      seen.set(e.id, s);
    }
    for (const values of seen.values()) expect(values.size).toBe(1);
  });
  it("does not publish unresolved PEtab timings, conflicting FLIP2 values or missing numerical cells", () => {
    for (const r of results) {
      const c = candidateFor(r);
      expect(c.benchmark_id).not.toContain("petab");
      expect(c.numeric_value).not.toBeNull();
      expect(c.publication_eligibility).not.toBe("quarantined_source_conflict");
    }
  });
  it("binds provenance hashes to the actual XML artifact and CAFA archive member", () => {
    for (const r of results) {
      const c = candidateFor(r);
      const source = byId.get(r.source_ids[0]);
      if (!source) continue;
      if (c.artifact_url)
        expect(source.attributes.artifact_url).toBe(c.artifact_url);
      if (c.benchmark_id.includes("cafa")) {
        expect(source.attributes.hash_scope).toMatch(/member/i);
        expect(source.attributes.archive_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(source.attributes.artifact_member).toContain("_fmax_sheet.csv");
      }
    }
  });
});

describe("reviewed scIB correction overlay", () => {
  const original = fs
    .readFileSync("data/omics/benchmark-profiles.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((r) => r.id === "discovery-benchmark-scib").profile;
  const fixture = (): RecordEntry => ({
    id: "discovery-benchmark-scib",
    kind: "benchmark",
    name: "scIB",
    description: "Benchmark study",
    status: "discovered",
    facets: {},
    source_ids: ["evidence-discovery-final-scib"],
    links: [],
    attributes: { profile: structuredClone(original) },
  });
  it("applies exact reviewed field changes without modifying the historical input", () => {
    const before = fixture();
    const after = applyAcquisitionCorrections([before])[0];
    expect(before.attributes.profile).toEqual(original);
    const p = profileSchema.parse(after.attributes.profile);
    expect(p.facts.find((f) => f.label === "Datasets")?.value).toContain(
      "13 integration tasks",
    );
    expect(p.facts.find((f) => f.label === "Entity type")?.value).toContain(
      "Benchmark study",
    );
    expect(p.facts.find((f) => f.label === "Uncertainty")?.status).toBe(
      "unreported",
    );
    expect(p.review.date).toBe("2026-09-19");
    expect(after.id).toBe(before.id);
    expect(after.kind).toBe("benchmark");
  });
  it("rejects an unexpected prior value rather than silently overwriting unrelated edits", () => {
    const r = fixture();
    (r.attributes.profile as any).summary = "An intervening edit";
    expect(() => applyAcquisitionCorrections([r])).toThrow(
      /Correction baseline changed/,
    );
  });
});

describe("MFASS current-release precision correction",()=>{
 const descriptor=getMfassPrecisionCorrection()!;
 const legacy:RecordEntry={id:"rewire-mfass-v2-source",kind:"source",name:"Legacy MFASS website import",description:"",status:"source_checked",facets:{},source_ids:[],links:[],attributes:{artifact_sha256:"a3af693afc070b39b334e359beed7f9affd76f7456a4f9264e2d1e9dab26111d"}};
 const fixture=():RecordEntry=>({id:descriptor.record_id,kind:"result",name:"Baseline average precision",description:"",status:"reproduced",facets:{},source_ids:[legacy.id],links:[{relation:"evaluation",target_id:"rewire-evaluation-baseline-kmer-position-v2"}],attributes:{printed_value:"0.28641674595892375",numeric_value:"0.28641674595892375",metric:"average_precision",source_locator:"benchmarks/mfass/results/baseline-kmer-position-v2.json :: average_precision"}});
 it("preserves exact pinned source decimals, old inputs, historical source and evaluation identity",()=>{const original=fixture();const result=applyAcquisitionCorrections([original,legacy]);const corrected=result.find(r=>r.id===original.id)!;expect(corrected.attributes.printed_value).toBe("0.2864167459589237");expect(corrected.attributes.numeric_value).toBe("0.2864167459589237");expect(Number(corrected.attributes.numeric_value).toFixed(3)).toBe(Number(original.attributes.numeric_value).toFixed(3));expect(original.attributes.printed_value).toBe("0.28641674595892375");expect(result.find(r=>r.id===legacy.id)).toEqual(legacy);expect(corrected.links).toEqual(original.links);expect(corrected.status).toBe(original.status);expect(corrected.source_ids).toEqual([mfassUpstreamSourceId]);expect(corrected.attributes.source_locator).toBe("JSON pointer /metrics/average_precision_sklearn");const source=result.find(r=>r.id===mfassUpstreamSourceId)!;expect(source.attributes.artifact_sha256).toBe("9a0b78674cc714177fec6e8c487588d6186d4fe93d6d7dbcb48bed6858885e15");expect(source.attributes.artifact_url).toContain("bee9133b83f3aedaf2bbb9013f1875515845607e/benchmarks/mfass/results/baseline-kmer-position-v2.json");});
 it("is idempotent and emits field-specific descriptors for the appended audit resolution",()=>{const first=applyAcquisitionCorrections([fixture(),legacy]);expect(applyAcquisitionCorrections(first)).toEqual(first);expect(first.filter(r=>r.id===mfassUpstreamSourceId)).toHaveLength(1);expect(descriptor.changes).toHaveLength(4);expect(descriptor.changes.filter(c=>c.outcome==="contradicted").map(c=>c.field_path).sort()).toEqual(["attributes.numeric_value","attributes.printed_value"]);for(const c of descriptor.changes){expect(c.source_ids).toEqual([mfassUpstreamSourceId]);expect(c.review_date).toBe("2026-09-19");}});
 it("rejects unexpected values and conflicting source identities without changing either",()=>{const modified=fixture();modified.attributes.numeric_value="0.9";expect(()=>applyAcquisitionCorrections([modified,legacy])).toThrow(/Correction baseline changed/);const conflict=structuredClone(descriptor.source_record);conflict.attributes.artifact_sha256="f".repeat(64);expect(()=>applyAcquisitionCorrections([fixture(),legacy,conflict])).toThrow(/source identity conflicts/);expect(conflict.attributes.artifact_sha256).toBe("f".repeat(64));expect(applyAcquisitionCorrections([legacy])).toEqual([legacy]);});
});
