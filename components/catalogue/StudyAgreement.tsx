import Link from "next/link";
import { formatScore } from "@/lib/score-display";
import { studyRoleLabel } from "@/lib/discrepancies";
import styles from "./Contested.module.css";
import tables from "@/app/database/database.module.css";

type Named = { name: string; href: string | null };

/** One study of a finding, with its source records and the records its comparisons name already resolved. */
export type StudyView = {
  key: string;
  role: string;
  /** The study's source record, or its key when no record resolves. */
  source: Named;
  /** Further source records of the same study. */
  more: Named[];
  /** The DOI or repository page. */
  url: string | null;
  higherA: number;
  higherB: number;
  ties: number;
  gap: number | null;
  total: number;
  comparisons: {
    protocol: Named | null;
    dataset: Named | null;
    metric: string;
    valueA: number | null;
    valueB: number | null;
    resultA: string | null;
    resultB: string | null;
    /** "a", "b", or null for a tie. */
    higher: "a" | "b" | null;
  }[];
};

const ROW = 46;
const BAR = 20;

const named = (n: Named | null) => (n ? n.href ? <Link href={n.href}>{n.name}</Link> : n.name : "Not stated");
const share = (count: number, all: number) => (all ? (count / all) * 100 : 0);
const percent = (value: number) => `${value.toFixed(2)}%`;

/** Each study's comparisons split by which system scored higher: a 100% stacked bar per study. */
export function AgreementChart({ studies, a, b }: { studies: StudyView[]; a: string; b: string }) {
  const height = studies.length * ROW + 4;
  const desc = studies.map((s) => `${s.source.name} (${studyRoleLabel(s.role).toLowerCase()}): ${a} higher in ${s.higherA}, ${b} higher in ${s.higherB}, ${s.ties} ${s.ties === 1 ? "tie" : "ties"}.`).join(" ");
  return <figure className={styles.chart}>
    <svg width="100%" height={height} role="img" aria-labelledby="agreement-title agreement-desc">
      <title id="agreement-title">{`Which system each study ranks higher: ${a} or ${b}`}</title>
      <desc id="agreement-desc">{desc}</desc>
      {studies.map((s, i) => {
        const all = s.higherA + s.ties + s.higherB;
        const y = i * ROW + 18;
        const segments = [
          { count: s.higherA, width: share(s.higherA, all), className: styles.barA, label: `${a} higher` },
          { count: s.ties, width: share(s.ties, all), className: styles.barTie, label: "tie" },
          { count: s.higherB, width: share(s.higherB, all), className: styles.barB, label: `${b} higher` },
        ];
        let x = 0;
        const outlier = s.role === "outlier";
        return <g key={s.key} className={outlier ? styles.chartOutlier : undefined}>
          <text x="0" y={y - 5} className={styles.chartLabel}>
            {outlier && <tspan className={styles.chartRole}>Disagrees: </tspan>}
            {s.source.name.length > 90 ? `${s.source.name.slice(0, 88)}…` : s.source.name}
          </text>
          {segments.map((seg) => {
            const start = x;
            x += seg.width;
            if (!seg.count) return null;
            return <g key={seg.label}>
              <rect x={percent(start)} y={y} width={percent(seg.width)} height={BAR} className={seg.className}>
                <title>{`${seg.count} ${seg.label}`}</title>
              </rect>
              {seg.width >= 9 && <text x={percent(start + seg.width / 2)} y={y + 14} textAnchor="middle" className={seg.className === styles.barTie ? styles.chartCountDark : styles.chartCount}>{seg.count}</text>}
            </g>;
          })}
          {outlier && <rect x="0.5" y={y - 0.5} width="99.8%" height={BAR + 1} className={styles.chartFrame} />}
        </g>;
      })}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchA} aria-hidden="true" />{a} higher</span>
      <span><i className={styles.swatchTie} aria-hidden="true" />Tie</span>
      <span><i className={styles.swatchB} aria-hidden="true" />{b} higher</span>
      <span>Numbers are counts of comparisons; the outlined bar is the study that disagrees.</span>
    </figcaption>
  </figure>;
}

function StudyName({ s }: { s: StudyView }) {
  return <>
    {named(s.source)}
    {s.more.length > 0 && <span className={styles.muted}> and {s.more.length} more {s.more.length === 1 ? "record" : "records"}</span>}
    {s.url && <> · <a href={s.url}>{s.key.startsWith("doi:") ? "DOI" : "Repository"}</a></>}
  </>;
}

/** A study's comparisons, one row each, with both values linked to their result records. */
function Comparisons({ s, a, b }: { s: StudyView; a: string; b: string }) {
  const value = (v: number | null, result: string | null) => {
    if (v === null) return "Not reported";
    const text = formatScore(String(v));
    return result ? <Link href={`/database/result/${encodeURIComponent(result)}/`}>{text}</Link> : text;
  };
  const count = s.comparisons.length < s.total ? `first ${s.comparisons.length} of ${s.total}` : `${s.total}`;
  return <details className={styles.study}>
    <summary>Comparisons in {s.source.name} ({count})</summary>
    <div className={tables.tableScroll} tabIndex={0} role="region" aria-label={`Comparisons in ${s.source.name}`}>
      <table className={tables.resultTable}>
        <thead><tr><th scope="col">Protocol</th><th scope="col">Dataset</th><th scope="col">Metric</th><th scope="col">{a}</th><th scope="col">{b}</th><th scope="col">Higher</th></tr></thead>
        <tbody>
          {s.comparisons.map((c, i) => <tr key={i}>
            <td>{named(c.protocol)}</td>
            <td>{named(c.dataset)}</td>
            <td>{c.metric}</td>
            <td>{value(c.valueA, c.resultA)}</td>
            <td>{value(c.valueB, c.resultB)}</td>
            <td>{c.higher === "a" ? a : c.higher === "b" ? b : "Tie"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}

/** Which studies rank the two systems which way: a chart, a table, and each study's comparisons. */
export function StudyAgreement({ studies, a, b, gap }: { studies: StudyView[]; a: string; b: string; gap: boolean }) {
  const signed = (v: number | null) => (v === null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
  return <>
    <p>Each bar is one study: of the comparisons in which it measured both {a} and {b}, how many score {a} higher and how many score {b} higher. The study marked Disagrees ranks them the other way round from the studies marked Agrees.</p>
    <AgreementChart studies={studies} a={a} b={b} />
    <div className={tables.tableScroll} tabIndex={0} role="region" aria-label="Studies compared in this finding">
      <table className={tables.resultTable}>
        <caption>Studies compared ({studies.length})</caption>
        <thead><tr>
          <th scope="col">Study</th><th scope="col">Role</th><th scope="col">Ranks {a} higher</th><th scope="col">Ranks {b} higher</th><th scope="col">Ties</th>
          {gap && <th scope="col">Gap</th>}
        </tr></thead>
        <tbody>
          {studies.map((s) => <tr key={s.key} className={s.role === "outlier" ? styles.outlierRow : undefined}>
            <th scope="row"><StudyName s={s} /></th>
            <td>{s.role === "outlier" ? <strong>{studyRoleLabel(s.role)}</strong> : studyRoleLabel(s.role)}</td>
            <td>{s.higherA}</td>
            <td>{s.higherB}</td>
            <td>{s.ties}</td>
            {gap && <td>{signed(s.gap)}</td>}
          </tr>)}
        </tbody>
      </table>
    </div>
    {studies.map((s) => <Comparisons key={s.key} s={s} a={a} b={b} />)}
  </>;
}
