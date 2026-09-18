/**
 * Report how many evaluations and results each benchmark can actually be reached
 * from, and fail if coverage drops below the recorded floor.
 *
 * Evaluations do not link to a benchmark directly. They link to the task or
 * protocol they ran, and that child declares `part_of` its benchmark, so a
 * benchmark is reached in two hops. Counting only direct links reports zero for
 * every benchmark and hides the real gap, which is that most tasks and protocols
 * never declare a parent.
 */
import fs from "node:fs";

/** Only the fields coverage needs, so published and in-flight records both fit. */
export type CoverageInput = {
  id: string;
  kind: string;
  name: string;
  status: string;
  links?: { relation: string; target_id: string }[];
};

const CATALOGUE = "public/omics/catalogue.json";

const FLOOR_FILE = "data/omics/benchmark-evidence-floor.json";

export type BenchmarkCoverage = {
  id: string;
  name: string;
  status: string;
  evaluations: number;
  results: number;
};

export function benchmarkCoverage(
  records: readonly CoverageInput[],
): BenchmarkCoverage[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const isBenchmark = (id: string) => byId.get(id)?.kind === "benchmark";

  // child task/protocol -> benchmark it belongs to
  const parent = new Map<string, string>();
  for (const r of records)
    for (const link of r.links || [])
      if (
        (link.relation === "part_of" || link.relation === "benchmark") &&
        isBenchmark(link.target_id)
      )
        parent.set(r.id, link.target_id);

  const evaluations = new Map<string, Set<string>>();
  for (const r of records) {
    if (r.kind !== "evaluation") continue;
    for (const link of r.links || []) {
      if (link.relation !== "benchmark") continue;
      const target = isBenchmark(link.target_id)
        ? link.target_id
        : parent.get(link.target_id);
      if (!target) continue;
      if (!evaluations.has(target)) evaluations.set(target, new Set());
      evaluations.get(target)!.add(r.id);
    }
  }

  const results = new Map<string, Set<string>>();
  for (const r of records) {
    if (r.kind !== "result") continue;
    for (const link of r.links || []) {
      if (link.relation !== "evaluation") continue;
      for (const [benchmark, ids] of evaluations)
        if (ids.has(link.target_id)) {
          if (!results.has(benchmark)) results.set(benchmark, new Set());
          results.get(benchmark)!.add(r.id);
        }
    }
  }

  return records
    .filter((r) => r.kind === "benchmark")
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      evaluations: evaluations.get(r.id)?.size ?? 0,
      results: results.get(r.id)?.size ?? 0,
    }))
    .sort((a, b) => b.evaluations - a.evaluations || a.id.localeCompare(b.id));
}

function main() {
  // Audit the published artifact, which is what the site serves. Rebuilding from
  // a subset of the source files describes a catalogue nobody sees.
  const published = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  const coverage = benchmarkCoverage(published.records as CoverageInput[]);
  console.log(`release ${published.release_id}\n`);
  const covered = coverage.filter((c) => c.evaluations > 0);

  for (const c of coverage)
    console.log(
      `${c.evaluations > 0 ? "  " : "! "}${c.id.padEnd(48)} evaluations=${String(
        c.evaluations,
      ).padStart(4)} results=${String(c.results).padStart(4)}`,
    );
  console.log(
    `\n${covered.length} of ${coverage.length} benchmarks are reachable from at least one evaluation.`,
  );
  if (covered.length < coverage.length)
    console.log(
      `${coverage.length - covered.length} have no evaluation. A benchmark is reached ` +
        `through a task or protocol that declares 'part_of' it, so an unreached ` +
        `benchmark usually means its children never declared a parent.`,
    );

  const floor = fs.existsSync(FLOOR_FILE)
    ? JSON.parse(fs.readFileSync(FLOOR_FILE, "utf8")).covered
    : 0;
  if (covered.length < floor) {
    console.error(
      `\nCoverage regressed: ${covered.length} benchmarks reachable, floor is ${floor}.`,
    );
    process.exit(1);
  }
  if (covered.length > floor) {
    fs.writeFileSync(
      FLOOR_FILE,
      JSON.stringify(
        { covered: covered.length, total: coverage.length },
        null,
        2,
      ) + "\n",
    );
    console.log(`\nCoverage floor raised to ${covered.length}.`);
  }
}

if (process.argv[1]?.endsWith("audit-benchmark-evidence.ts")) main();
