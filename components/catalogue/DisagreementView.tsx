import Link from "next/link";
import { formatScore } from "@/lib/score-display";
import { gapPercent, PAPER_LIMIT, paperGroup, type Disagreement, type Named, type Paper, type PaperGroup } from "@/lib/disagreement";
import { studyRoleLabel } from "@/lib/discrepancies";
import styles from "./Contested.module.css";
import tables from "@/app/database/database.module.css";

/** How a finding's studies disagree, drawn from its per-study data for any finding and either rule:
 * a plain summary, then for an ordering reversal a row per paper leaning toward the system it ranks
 * higher, and for a gap outlier each paper's gap to the reference. The full view adds the
 * table of papers and their comparisons; the compact view, for list entries, is the summary and one small chart. */
export function DisagreementView({ view, compact = false }: { view: Disagreement; compact?: boolean }) {
  const id = `${compact ? "c" : "f"}-${view.id}`;
  const gapRule = view.rule === "gap-outlier";
  if (compact) {
    return <div className={styles.compactView}>
      <p className={styles.summary}>{view.summary}</p>
      {gapRule ? <GapPlot view={view} id={id} compact /> : <Lean view={view} compact />}
    </div>;
  }
  const shown = view.papers.slice(0, PAPER_LIMIT);
  const more = view.papers.length - shown.length;
  return <>
    <p className={styles.summary}>{view.summary}</p>
    {gapRule
      ? <GapPlot view={view} id={id} />
      : <Lean view={view} />}
    {more > 0 && <p className={styles.muted}>The chart shows the {shown.length} papers with the most comparisons, the one that disagrees first; {more} more are in the table.</p>}
    <PaperTable view={view} />
    {view.papers.filter((p) => p.comparisons.length).map((p) => <Comparisons key={p.key} p={p} view={view} />)}
  </>;
}

const clip = (text: string, chars: number) => (text.length <= chars ? text : `${text.slice(0, Math.max(chars - 1, 1))}…`);
const pct = (value: number) => `${value.toFixed(2)}%`;

/** Above this many agreeing papers, the lean chart adds a row for all of them together, and the compact
 * view shows that row in place of each paper. */
export const POOL_ABOVE = 5;

type LeanRow = { key: string; label: string; title: string; role: Paper["role"] | "pooled"; a: number; b: number; ties: number; note?: string };

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a row says in words. The words follow the paper's group, so a split never reads as one model ahead. */
export function leanText(view: Disagreement, r: Pick<LeanRow, "a" | "b" | "ties">): string {
  const total = r.a + r.b + r.ties;
  const ties = r.ties ? `; ${countOf(r.ties, "tie")}` : "";
  if (!r.a && !r.b) return total === 1 ? "Tied in its one comparison" : `Tied in all ${total} comparisons`;
  const group = paperGroup(r.a, r.b);
  if (group === "mixed") return `Split: ${view.a.name} ahead in ${r.a}, ${view.b.name} in ${r.b}, of ${countOf(total, "comparison")}`;
  const [name, n] = group === "a" ? [view.a.name, r.a] : [view.b.name, r.b];
  return `${name} ahead in ${n} of ${countOf(total, "comparison")}${ties}`;
}

const ROLE_WORD: Partial<Record<LeanRow["role"], string>> = { outlier: "Disagrees", party: "In conflict" };

/** One row per paper, each a bar from the even line toward the model the paper puts ahead: the share of its
 * comparisons that are not ties won by each model. Bar thickness grows with the paper's comparisons. */
function Lean({ view, compact = false }: { view: Disagreement; compact?: boolean }) {
  const consensus = view.papers.filter((p) => p.role === "consensus");
  const pooled = consensus.length > POOL_ABOVE;
  const row = (p: Paper): LeanRow => ({ key: p.key, label: p.short, title: p.name, role: p.role, a: p.higherA, b: p.higherB, ties: p.ties });
  const sum = (pick: (p: Paper) => number) => consensus.reduce((n, p) => n + pick(p), 0);
  const leaning = (g: PaperGroup) => consensus.filter((p) => p.group === g).length;
  const together: LeanRow = {
    key: "pooled", label: `The other ${consensus.length} papers together`, title: "", role: "pooled",
    a: sum((p) => p.higherA), b: sum((p) => p.higherB), ties: sum((p) => p.ties),
    note: `By paper: ${leaning("a")} put ${view.a.name} ahead, ${leaning("b")} put ${view.b.name} ahead, ${leaning("mixed")} split or tied.`,
  };
  const rows: LeanRow[] = compact && pooled
    ? [...view.papers.filter((p) => p.role !== "consensus").map(row), together]
    : [...view.papers.slice(0, compact ? undefined : PAPER_LIMIT).map(row), ...(pooled ? [together] : [])];
  // Scaled to the most compared paper of the finding, so a row in the compact view keeps its weight.
  const most = Math.max(...view.papers.map((p) => p.higherA + p.higherB + p.ties), 1);
  const thickness = (r: LeanRow) => r.role === "pooled" ? 18 : Math.round(4 + 14 * Math.sqrt((r.a + r.b + r.ties) / most));
  return <figure className={compact ? styles.compactChart : styles.chart}>
    <div className={styles.leanAxis} aria-hidden="true">
      <span>{view.a.name} ahead</span><span>Even</span><span>{view.b.name} ahead</span>
    </div>
    <ul className={styles.lean} aria-label={`Which of ${view.a.name} and ${view.b.name} each paper puts ahead`}>
      {rows.map((r) => {
        const decided = r.a + r.b;
        const share = decided ? (r.b / decided) * 100 : 50;
        const role = ROLE_WORD[r.role];
        return <li key={r.key} className={[styles.leanItem, r.role === "outlier" && styles.leanOutlier, r.role === "pooled" && styles.leanPooled].filter(Boolean).join(" ")}>
          <p className={styles.leanText}>
            <span className={styles.leanName} title={r.title || undefined}>{r.label}</span>
            {role && <span className={styles.leanRole}>{role}</span>}
            <span className={styles.srOnly}>: </span>
            <span>{leanText(view, r)}</span>
          </p>
          {r.note && <p className={styles.leanNote}>{r.note}</p>}
          <div className={styles.leanTrack} style={{ height: `${thickness(r)}px` }} aria-hidden="true">
            {decided > 0 && Math.abs(share - 50) >= 0.5
              ? <span className={share < 50 ? styles.leanA : styles.leanB} style={{ left: `${Math.min(share, 50)}%`, width: `${Math.abs(share - 50)}%` }} />
              : <span className={styles.leanEven} />}
          </div>
        </li>;
      })}
    </ul>
    {!compact && <figcaption className={styles.legend}>
      Each bar runs from the even line toward the model the paper puts ahead, by its share of comparisons that are not ties. Thicker bars rest on more comparisons.
    </figcaption>}
  </figure>;
}

/** Each paper's median relative gap between the system and the reference, with the other papers' range shaded. */
function GapPlot({ view, id, compact = false }: { view: Disagreement; id: string; compact?: boolean }) {
  const papers = view.papers.filter((p) => p.gap !== null).slice(0, compact ? undefined : PAPER_LIMIT);
  if (!papers.length) return null;
  const values = [0, ...papers.map((p) => p.gap!), ...(view.consensusGap ?? [])];
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.08, 0.02);
  const lo = Math.min(...values) - pad;
  const hi = Math.max(...values) + pad;
  const pos = (gap: number) => pct(4 + ((gap - lo) / (hi - lo)) * 92);
  const band = view.consensusGap;
  const bandStyle = band
    ? { left: pos(band[0]), width: `max(4px, ${pct(((band[1] - band[0]) / (hi - lo)) * 92)})` }
    : null;
  const title = `How far ${view.a.name} scores from ${view.b.name} in each paper`;
  const description = [
    band && `The other papers range from ${gapPercent(band[0])} to ${gapPercent(band[1])}.`,
    ...papers.map((p) => `${p.short}${p.role === "outlier" ? " (disagrees)" : ""}: ${gapPercent(p.gap!)}.`),
  ].filter(Boolean).join(" ");
  const outlier = papers.find((p) => p.role === "outlier");
  const shown = compact && outlier ? [outlier] : papers;
  return <figure className={compact ? styles.compactChart : styles.chart} aria-labelledby={`${id}-gap-title`}>
    <p id={`${id}-gap-title`} className={styles.srOnly}>{title}. {description}</p>
    {!compact && <div className={styles.gapAxis} aria-hidden="true">
      <span>{gapPercent(lo + pad)}</span>
      <span>Same as {clip(view.b.name, 20)}</span>
      <span>{gapPercent(hi - pad)}</span>
    </div>}
    <ul className={styles.lean} aria-label={title}>
      {shown.map((p) => {
        const isOutlier = p.role === "outlier";
        return <li key={p.key} className={[styles.leanItem, isOutlier && styles.leanOutlier].filter(Boolean).join(" ")}>
          <p className={styles.leanText}>
            {isOutlier && <span className={styles.leanRole}>Disagrees</span>}
            <span className={styles.leanName} title={p.name || undefined}>{p.short}</span>
            <span className={styles.srOnly}>: </span>
            <span className={styles.gapValue}>{gapPercent(p.gap!)}</span>
          </p>
          <div className={styles.gapTrack} aria-hidden="true">
            {bandStyle && <span className={styles.gapBandBox} style={bandStyle} />}
            <span className={styles.gapZeroLine} style={{ left: pos(0) }} />
            {compact && papers.filter((other) => other.key !== p.key).map((other) => (
              <span key={other.key} className={styles.gapDot} style={{ left: pos(other.gap!) }} />
            ))}
            <span className={isOutlier ? styles.gapDotOutlier : styles.gapDot} style={{ left: pos(p.gap!) }} />
          </div>
        </li>;
      })}
    </ul>
    {compact && <div className={styles.gapAxis} aria-hidden="true">
      <span>{gapPercent(lo + pad)}</span>
      <span>Same as {clip(view.b.name, 20)}</span>
      <span>{gapPercent(hi - pad)}</span>
    </div>}
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchBand} aria-hidden="true" />Range of the other papers</span>
      {!compact && <span>Relative difference of {view.a.name} from {view.b.name}, (system − reference) / reference; the outlined dot is the paper that disagrees.</span>}
    </figcaption>
  </figure>;
}

function PaperName({ p }: { p: Paper }) {
  return <>
    {p.href ? <Link href={p.href}>{p.name}</Link> : p.name}
    {p.more.length > 0 && <span className={styles.muted}> and {p.more.length} more {p.more.length === 1 ? "record" : "records"}</span>}
    {p.url && <> · <a href={p.url}>{p.key.startsWith("doi:") ? "DOI" : p.key.startsWith("repository:") ? "Repository" : "Source"}</a></>}
  </>;
}

function PaperTable({ view }: { view: Disagreement }) {
  const gap = view.rule === "gap-outlier" || view.papers.some((p) => p.gap !== null);
  return <div className={tables.tableScroll} tabIndex={0} role="region" aria-label="Papers compared in this finding">
    <table className={tables.resultTable}>
      <caption>Papers compared ({view.papers.length})</caption>
      <thead><tr>
        <th scope="col">Paper</th><th scope="col">Role</th><th scope="col">Ranks {view.a.name} higher</th><th scope="col">Ranks {view.b.name} higher</th><th scope="col">Ties</th>
        {gap && <th scope="col">Gap to {view.b.name}</th>}
      </tr></thead>
      <tbody>
        {view.papers.map((p) => <tr key={p.key} className={p.role === "outlier" ? styles.outlierRow : undefined}>
          <th scope="row"><PaperName p={p} /></th>
          <td>{p.role === "outlier" ? <strong>{studyRoleLabel(p.role)}</strong> : studyRoleLabel(p.role)}</td>
          <td>{p.higherA}</td>
          <td>{p.higherB}</td>
          <td>{p.ties}</td>
          {gap && <td>{p.gap === null ? "" : gapPercent(p.gap)}</td>}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

const named = (n: Named | null) => (n ? n.href ? <Link href={n.href}>{n.name}</Link> : n.name : "Not stated");

/** A paper's comparisons, one row each, with both values linked to their result records. */
function Comparisons({ p, view }: { p: Paper; view: Disagreement }) {
  const value = (v: number | null, result: string | null) => {
    if (v === null) return "Not reported";
    const text = formatScore(String(v));
    return result ? <Link href={`/database/result/${encodeURIComponent(result)}/`}>{text}</Link> : text;
  };
  const count = p.comparisons.length < p.total ? `first ${p.comparisons.length} of ${p.total}` : `${p.total}`;
  return <details className={styles.study}>
    <summary>Comparisons in {p.short} ({count})</summary>
    <div className={tables.tableScroll} tabIndex={0} role="region" aria-label={`Comparisons in ${p.name}`}>
      <table className={tables.resultTable}>
        <thead><tr><th scope="col">Protocol</th><th scope="col">Dataset</th><th scope="col">Metric</th><th scope="col">{view.a.name}</th><th scope="col">{view.b.name}</th><th scope="col">Higher</th></tr></thead>
        <tbody>
          {p.comparisons.map((c, i) => <tr key={i}>
            <td>{named(c.protocol)}</td>
            <td>{named(c.dataset)}</td>
            <td>{c.metric}</td>
            <td>{value(c.valueA, c.resultA)}</td>
            <td>{value(c.valueB, c.resultB)}</td>
            <td>{c.higher === "a" ? view.a.name : c.higher === "b" ? view.b.name : "Tie"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}
