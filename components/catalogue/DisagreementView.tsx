import Link from "next/link";
import { formatScore } from "@/lib/score-display";
import { gapPercent, PAPER_LIMIT, type Disagreement, type Named, type Paper, type PaperGroup } from "@/lib/disagreement";
import { studyRoleLabel } from "@/lib/discrepancies";
import styles from "./Contested.module.css";
import tables from "@/app/database/database.module.css";

/** How a finding's studies disagree, drawn from its per-study data for any finding and either rule:
 * a plain summary, then for an ordering reversal the papers grouped by which system they rank higher
 * and a bar per paper, and for a gap outlier each paper's gap to the reference. The full view adds the
 * table of papers and their comparisons; the compact view, for list entries, is the summary and one small chart. */
export function DisagreementView({ view, compact = false }: { view: Disagreement; compact?: boolean }) {
  const id = `${compact ? "c" : "f"}-${view.id}`;
  const gapRule = view.rule === "gap-outlier";
  if (compact) {
    return <div className={styles.compactView}>
      <p className={styles.summary}>{view.summary}</p>
      {gapRule ? <GapPlot view={view} id={id} compact /> : <Bars view={view} id={id} compact />}
    </div>;
  }
  const shown = view.papers.slice(0, PAPER_LIMIT);
  const more = view.papers.length - shown.length;
  return <>
    <p className={styles.summary}>{view.summary}</p>
    {gapRule
      ? <GapPlot view={view} id={id} />
      : <><Groups view={view} id={id} /><Bars view={view} id={id} /></>}
    {more > 0 && <p className={styles.muted}>The charts show the {shown.length} papers with the most comparisons, the one that disagrees first; {more} more are in the table.</p>}
    <PaperTable view={view} />
    {view.papers.filter((p) => p.comparisons.length).map((p) => <Comparisons key={p.key} p={p} view={view} />)}
  </>;
}

const clip = (text: string, chars: number) => (text.length <= chars ? text : `${text.slice(0, Math.max(chars - 1, 1))}…`);
const pct = (value: number) => `${value.toFixed(2)}%`;

const GROUP_LABEL = (view: Disagreement): Record<PaperGroup, string> => ({
  a: `Rank ${view.a.name} higher`,
  b: `Rank ${view.b.name} higher`,
  mixed: "Mixed",
});

const listNames = (papers: Paper[]) =>
  papers.length ? papers.map((p) => `${p.short}${p.role === "outlier" ? " (disagrees)" : ""}`).join(", ") : "none";

// Two overlapping circles: left ranks A higher, right ranks B higher, the overlap is mixed.
const VENN = { width: 640, height: 345, cy: 188, r: 150, left: 230, right: 410 };

// Label widths are estimated from character counts: names are short citations, and an estimate that is
// a little wide only makes a label smaller or wrap sooner.
const LABEL_SIZE = 13;
const labelWidth = (text: string, size: number) => text.length * size * 0.56;

/** A label that fits `room` pixels: one line, shrunk to no less than 10px, else two lines split before a
 * citation's year or at the space nearest the middle. */
function fitLabel(text: string, room: number): { lines: string[]; size: number } {
  const shrink = (lines: string[], floor: number) =>
    Math.max(floor, Math.min(LABEL_SIZE, LABEL_SIZE * room / Math.max(...lines.map((l) => labelWidth(l, LABEL_SIZE)))));
  if (labelWidth(text, shrink([text], 10)) <= room || !text.includes(" ")) return { lines: [text], size: shrink([text], 9) };
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index!);
  const at = / (?:19|20)\d{2}$/.test(text) ? text.lastIndexOf(" ")
    : spaces.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best));
  const lines = [text.slice(0, at), text.slice(at + 1)];
  return { lines, size: shrink(lines, 9) };
}

/** Papers grouped by the system at least two thirds of their comparisons that are not ties rank higher. */
function Groups({ view, id }: { view: Disagreement; id: string }) {
  const labels = GROUP_LABEL(view);
  const by = (g: PaperGroup) => view.papers.filter((p) => p.group === g);
  const groups = { a: by("a"), b: by("b"), mixed: by("mixed") };
  const dots = view.papers.length <= PAPER_LIMIT;
  const { cy, r, left, right } = VENN;
  // A region's horizontal extent at height y: left only, overlap, right only.
  const extent = (g: "a" | "b" | "mixed", y: number): [number, number] => {
    const h = Math.sqrt(Math.max(r * r - (y - cy) ** 2, 0));
    return g === "a" ? [left - h, right - h] : g === "mixed" ? [right - h, left + h] : [left + h, right + h];
  };
  const centre = { a: (left - r + right - r) / 2, mixed: (left + right) / 2, b: (left + r + right + r) / 2 };
  const description = (["a", "b", "mixed"] as const).map((g) => `${labels[g]}: ${listNames(groups[g])}.`).join(" ");
  // Each paper's dot and label in its region, spaced further apart when a label needs two lines.
  const place = (g: "a" | "b" | "mixed", papers: Paper[]) => {
    const layout = (step: number) => papers.map((p, i) => {
      const y = cy + (i - (papers.length - 1) / 2) * step;
      const [start, end] = extent(g, y);
      const x = start + 10;
      return { p, x, y, label: fitLabel(p.short, end - 6 - (x + 9)) };
    });
    const tight = layout(Math.min(22, 230 / Math.max(papers.length, 1)));
    return tight.some((d) => d.label.lines.length > 1) ? layout(Math.min(32, 230 / Math.max(papers.length, 1))) : tight;
  };
  return <figure className={styles.chart}>
    <div className={styles.chartScroll}>
      <svg viewBox={`0 0 ${VENN.width} ${VENN.height}`} className={styles.venn} role="img" aria-labelledby={`${id}-groups-title ${id}-groups-desc`}>
        <title id={`${id}-groups-title`}>{`Papers grouped by which system they rank higher: ${view.a.name} or ${view.b.name}`}</title>
        <desc id={`${id}-groups-desc`}>{description}</desc>
        <circle cx={left} cy={cy} r={r} className={styles.vennA} />
        <circle cx={right} cy={cy} r={r} className={styles.vennB} />
        <text x={centre.a} y="20" textAnchor="middle" className={styles.vennHeading}>{clip(labels.a, 30)}</text>
        <text x={centre.mixed} y="20" textAnchor="middle" className={styles.vennHeading}>Mixed</text>
        <text x={centre.b} y="20" textAnchor="middle" className={styles.vennHeading}>{clip(labels.b, 30)}</text>
        {(["a", "mixed", "b"] as const).map((g) => {
          const papers = groups[g];
          if (!dots) return <text key={g} x={centre[g]} y={cy + 6} textAnchor="middle" className={styles.vennCount}>{papers.length}</text>;
          return place(g, papers).map(({ p, x, y, label }) => {
            const outlier = p.role === "outlier";
            const first = y + 4 - ((label.lines.length - 1) * label.size * 1.1) / 2;
            return <g key={p.key} className={outlier ? styles.chartOutlier : undefined}>
              <circle cx={x} cy={y} r={outlier ? 6 : 4} className={outlier ? styles.dotOutlier : styles.dot} />
              <text x={x + 9} y={first} className={styles.chartLabel} style={{ fontSize: `${label.size.toFixed(1)}px` }}>
                {label.lines.map((line, i) => <tspan key={i} x={x + 9} dy={i ? `${label.size * 1.1}` : undefined}>{line}</tspan>)}
                <title>{p.name}</title>
              </text>
            </g>;
          });
        })}
      </svg>
    </div>
    <figcaption className={dots ? styles.srOnly : styles.legend}>
      <ul className={styles.groupList}>
        {(["a", "b", "mixed"] as const).map((g) =>
          <li key={g}>{labels[g]} ({groups[g].length}): {listNames(groups[g])}</li>)}
      </ul>
    </figcaption>
    <p className={styles.muted}>Each paper sits where at least two thirds of its comparisons point; Mixed means neither model reaches two thirds.{dots && " The larger, outlined dot is the paper that disagrees."}</p>
  </figure>;
}

type BarRow = { key: string; label: string; title: string; outlier: boolean; a: number; ties: number; b: number };

/** One 100% stacked bar per paper: comparisons where each system scored higher, and ties. */
function Bars({ view, id, compact = false }: { view: Disagreement; id: string; compact?: boolean }) {
  const consensus = view.papers.filter((p) => p.role !== "outlier");
  const sum = (pick: (p: Paper) => number) => consensus.reduce((n, p) => n + pick(p), 0);
  const row = (p: Paper): BarRow => ({ key: p.key, label: p.short, title: p.name, outlier: p.role === "outlier", a: p.higherA, ties: p.ties, b: p.higherB });
  const rows: BarRow[] = compact
    ? [
      ...(consensus.length ? [{ key: "consensus", label: consensus.length === 1 ? consensus[0].short : `${consensus.length} other papers`, title: "", outlier: false, a: sum((p) => p.higherA), ties: sum((p) => p.ties), b: sum((p) => p.higherB) }] : []),
      ...view.papers.filter((p) => p.role === "outlier").map(row),
    ]
    : view.papers.slice(0, PAPER_LIMIT).map(row);
  const rowHeight = compact ? 36 : 46;
  const bar = compact ? 14 : 20;
  const description = rows.map((r) => `${r.label}${r.outlier ? " (disagrees)" : ""}: ${view.a.name} higher in ${r.a}, ${view.b.name} higher in ${r.b}, ${r.ties} ${r.ties === 1 ? "tie" : "ties"}.`).join(" ");
  return <figure className={compact ? styles.compactChart : styles.chart}>
    <svg width="100%" height={rows.length * rowHeight + 4} role="img" aria-labelledby={`${id}-bars-title ${id}-bars-desc`}>
      <title id={`${id}-bars-title`}>{`Comparisons in which each paper scores ${view.a.name} or ${view.b.name} higher`}</title>
      <desc id={`${id}-bars-desc`}>{description}</desc>
      {rows.map((r, i) => {
        const all = r.a + r.ties + r.b;
        const y = i * rowHeight + 18;
        const segments = [
          { count: r.a, className: styles.barA, label: `${view.a.name} higher`, dark: false },
          { count: r.ties, className: styles.barTie, label: "tie", dark: true },
          { count: r.b, className: styles.barB, label: `${view.b.name} higher`, dark: false },
        ];
        let x = 0;
        return <g key={r.key} className={r.outlier ? styles.chartOutlier : undefined}>
          <text x="0" y={y - 5} className={styles.chartLabel}>
            {r.outlier && <tspan className={styles.chartRole}>Disagrees: </tspan>}
            {clip(r.label, 80)}{r.title && <title>{r.title}</title>}
          </text>
          {segments.map((seg) => {
            const width = all ? (seg.count / all) * 100 : 0;
            const start = x;
            x += width;
            if (!seg.count) return null;
            return <g key={seg.label}>
              <rect x={pct(start)} y={y} width={pct(width)} height={bar} className={seg.className}><title>{`${seg.count} ${seg.label}`}</title></rect>
              {width >= 9 && <text x={pct(start + width / 2)} y={y + bar - (compact ? 3 : 6)} textAnchor="middle" className={seg.dark ? styles.chartCountDark : styles.chartCount}>{seg.count}</text>}
            </g>;
          })}
          {r.outlier && <rect x="1" y={y - 1} width="99.6%" height={bar + 2} className={styles.chartFrame} />}
        </g>;
      })}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchA} aria-hidden="true" />{view.a.name} higher</span>
      <span><i className={styles.swatchTie} aria-hidden="true" />Tie</span>
      <span><i className={styles.swatchB} aria-hidden="true" />{view.b.name} higher</span>
      {!compact && <span>Numbers are counts of comparisons; the outlined bar is the paper that disagrees.</span>}
    </figcaption>
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
  // The full plot keeps the left quarter for paper names, on the same line as their dots.
  const [from, span] = compact ? [5, 90] : [27, 68];
  const x = (gap: number) => pct(from + ((gap - lo) / (hi - lo)) * span);
  const rowHeight = compact ? 0 : 30;
  const top = 8;
  const plotHeight = compact ? 24 : papers.length * rowHeight;
  const height = top + plotHeight + 30;
  const band = view.consensusGap;
  const description = [
    band && `The other papers range from ${gapPercent(band[0])} to ${gapPercent(band[1])}.`,
    ...papers.map((p) => `${p.short}${p.role === "outlier" ? " (disagrees)" : ""}: ${gapPercent(p.gap!)}.`),
  ].filter(Boolean).join(" ");
  return <figure className={compact ? styles.compactChart : styles.chart}>
    <svg width="100%" height={height} role="img" aria-labelledby={`${id}-gap-title ${id}-gap-desc`}>
      <title id={`${id}-gap-title`}>{`How far ${view.a.name} scores from ${view.b.name} in each paper`}</title>
      <desc id={`${id}-gap-desc`}>{description}</desc>
      {band && <rect x={x(band[0])} y={top} width={pct(((band[1] - band[0]) / (hi - lo)) * span || 0.4)} height={plotHeight} className={styles.gapBand} />}
      <line x1={x(0)} x2={x(0)} y1={top} y2={top + plotHeight} className={styles.gapZero} />
      {papers.map((p, i) => {
        const y = compact ? top + plotHeight / 2 : top + i * rowHeight + rowHeight / 2;
        const outlier = p.role === "outlier";
        return <g key={p.key} className={outlier ? styles.chartOutlier : undefined}>
          {!compact && <text x="0" y={y + 4} className={styles.chartLabel}>{p.short}<title>{p.name}</title></text>}
          <circle cx={x(p.gap!)} cy={y} r={outlier ? 7 : 5} className={outlier ? styles.dotOutlier : styles.dot}><title>{`${p.short}: ${gapPercent(p.gap!)}`}</title></circle>
          {(!compact || outlier) && <text x={x(p.gap!)} dx="11" y={y + 4} className={styles.chartLabel}>{compact ? `${p.short} ` : ""}{gapPercent(p.gap!)}</text>}
        </g>;
      })}
      <text x={x(lo + pad)} y={height - 8} textAnchor="middle" className={styles.chartAxis}>{gapPercent(lo + pad)}</text>
      <text x={x(0)} y={height - 8} textAnchor="middle" className={styles.chartAxis}>{`= ${clip(view.b.name, 24)}`}</text>
      <text x={x(hi - pad)} y={height - 8} textAnchor="middle" className={styles.chartAxis}>{gapPercent(hi - pad)}</text>
    </svg>
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
