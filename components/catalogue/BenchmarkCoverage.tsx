import Link from "next/link";
import type { BenchmarkResearchData } from "@/shared/omics/benchmark-research";
import styles from "@/app/database/database.module.css";

/** An empty catalogue is a collection gap, never evidence of no experiments. */
export default function BenchmarkCoverage({
  results, evaluations, charts, research,
}: {
  results: number; evaluations: number; charts: number;
  research?: BenchmarkResearchData;
}) {
  return (
    <section className={styles.section} aria-label="Result coverage">
      {results > 0 ? (
        <p>
          <a href="#results">{evaluations} recorded {evaluations === 1 ? "evaluation" : "evaluations"}, {results} metric rows</a>.
          {charts > 0 ? <> <a href="#charts">Explore {charts} source-scoped {charts === 1 ? "chart" : "charts"}</a>.</> :
            " A comparison chart has not yet been validated for these results. The table retains the individual findings and their sources."}
        </p>
      ) : (
        <>
          <h2>Published results still to collect</h2>
          <p>This release has no source-checked evaluations linked to this page. It does not mean that the benchmark has no published results.</p>
          {research?.gaps[0] && <p>{research.gaps[0]}</p>}
          <p>{research && <><a href="#evidence">Read the papers and extraction notes</a>. </>}Charts will appear when compatible result tables have been checked against their sources.</p>
        </>
      )}
      <p className={styles.muted}><Link href="/coverage/">View coverage and remaining gaps across all benchmarks</Link></p>
    </section>
  );
}
