import { COMPARED_TEXT, DOMAINS, positionOf, standing, type ReachCell, type ReachColumn, type ReachRow } from "@/lib/model-reach";
import styles from "./ModelReach.module.css";

const boardHref = (slug: string) => `/use-cases/${slug}/#order`;

function cellWords(cell: ReachCell | undefined): string {
  if (!cell) return "not compared";
  return cell.state === "ranked" ? `ranked ${positionOf(cell)}` : COMPARED_TEXT[cell.reason];
}

function Cell({ cell, column, model }: { cell: ReachCell | undefined; column: ReachColumn; model: string }) {
  if (!cell) return <td className={styles.none}><span className={styles.srOnly}>Not compared</span></td>;
  const title = `${model}, ${column.label}: ${cellWords(cell)}`;
  if (cell.state === "compared")
    return <td className={styles.compared}>
      <a href={boardHref(column.slug)} title={title}>{cell.reason === "one study" ? "1 study" : "Not ranked"}</a>
    </td>;
  const span = Math.max(cell.of - 1, 1);
  return <td className={styles.ranked}>
    <a href={boardHref(column.slug)} title={title}>
      <span className={styles.track} aria-hidden="true">
        <span style={{ left: `${((cell.best - 1) / span) * 100}%`, width: `max(3px, ${((cell.worst - cell.best) / span) * 100}%)` }} />
      </span>
      <span className={styles.position}>{cell.best === cell.worst ? cell.best : `${cell.best} to ${cell.worst}`}</span>
      <span className={styles.of}>of {cell.of}</span>
    </a>
  </td>;
}

/** Models by use case: where each is ranked, compared without a rank, or not compared. */
export function ModelReachMatrix({ rows, columns }: { rows: ReachRow[]; columns: ReachColumn[] }) {
  const groups = DOMAINS.map((d) => ({ ...d, span: columns.filter((c) => c.domain === d.id).length })).filter((d) => d.span);
  const firstOfGroup = new Set(groups.map((g) => columns.find((c) => c.domain === g.id)!.slug));
  return <figure className={styles.reach}>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Use cases each model is compared on">
      <table className={styles.matrix}>
        <caption className={styles.srOnly}>Each model&apos;s place on the board of each use case it is compared on</caption>
        <thead>
          <tr>
            <td />
            {groups.map((g) => <th key={g.id} scope="colgroup" colSpan={g.span} className={styles.group}>{g.label}</th>)}
          </tr>
          <tr>
            <th scope="col" className={styles.modelHead}>Model</th>
            {columns.map((c) => <th key={c.slug} scope="col" className={`${styles.useCase} ${firstOfGroup.has(c.slug) ? styles.groupStart : ""}`}>
              <a href={boardHref(c.slug)}><span>{c.label}</span></a>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <tr key={r.id}>
            <th scope="row">{r.name}<span className={styles.meta}>ranked on {r.ranked} of {Object.keys(r.cells).length}</span></th>
            {columns.map((c) => <Cell key={c.slug} cell={r.cells[c.slug]} column={c} model={r.name} />)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <figcaption className={styles.legend}>
      <span><span className={styles.legendTrack} aria-hidden="true"><span /></span>Ranked: the bar is the place the board gives, first on the left; a long bar means the studies do not settle it.</span>
      <span><span className={styles.legendCompared}>1 study</span>Compared, not ranked.</span>
      <span><span className={styles.legendNone} aria-hidden="true" />Not compared.</span>
    </figcaption>
  </figure>;
}

const SIZE = 470;
const C = SIZE / 2;
const R = 112;
const HOLE = 34;
const radius = (s: number) => HOLE + s * (R - HOLE);
const at = (angle: number, r: number) => [C + r * Math.cos(angle), C + r * Math.sin(angle)] as const;
const f = (n: number) => n.toFixed(1);

/** One model on a circle of use cases, grouped by kind with a gap between groups. Distance from the centre is the
 * place on that board (outer ring first, inner ring last); a band is the range of places. Use cases the model is
 * not ranked on are left empty, not drawn at the centre. */
export function ModelReachRadar({ row, columns }: { row: ReachRow; columns: ReachColumn[] }) {
  const groups = DOMAINS.filter((d) => columns.some((c) => c.domain === d.id));
  const slots: (ReachColumn | null)[] = groups.flatMap((g) => [...columns.filter((c) => c.domain === g.id), null]);
  const angle = (i: number) => (i / slots.length) * 2 * Math.PI - Math.PI / 2;
  const points = slots.map((c, i) => {
    const cell = c ? row.cells[c.slug] : undefined;
    if (!c || cell?.state !== "ranked") return null;
    const mid = (standing(cell.best, cell.of) + standing(cell.worst, cell.of)) / 2;
    return at(angle(i), radius(mid));
  });
  return <figure className={styles.radar}>
    <figcaption className={styles.radarName}>{row.name}</figcaption>
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${row.name}: ${columns.map((c) => `${c.label} ${cellWords(row.cells[c.slug])}`).join("; ")}`}>
      {[0, 0.5, 1].map((s) => <circle key={s} cx={C} cy={C} r={radius(s)} className={s === 1 ? styles.ringFirst : styles.ring} />)}
      <circle cx={C} cy={C} r={HOLE} className={styles.hole} />
      {/* The ring labels sit in the empty slot that closes the circle, clear of every axis. */}
      {(["first", "last"] as const).map((word) => {
        const [x, y] = at(angle(slots.length - 1), word === "first" ? radius(1) - 8 : radius(0) + 8);
        return <text key={word} x={f(x)} y={f(y + 3)} textAnchor="middle" className={styles.ringLabel}>{word}</text>;
      })}
      {slots.map((c, i) => {
        if (!c) return null;
        const a = angle(i);
        const cell = row.cells[c.slug];
        const [x1, y1] = at(a, HOLE);
        const [x2, y2] = at(a, R);
        const [lx, ly] = at(a, R + 10);
        const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return <g key={c.slug}>
          <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} className={styles.axis} />
          {cell?.state === "ranked" && (() => {
            const [bx1, by1] = at(a, radius(standing(cell.worst, cell.of)));
            const [bx2, by2] = at(a, radius(standing(cell.best, cell.of)));
            return <line x1={f(bx1)} y1={f(by1)} x2={f(bx2)} y2={f(by2)} className={styles.band} />;
          })()}
          {cell?.state === "compared" && (() => {
            const [cx, cy] = at(a, HOLE - 12);
            return <circle cx={f(cx)} cy={f(cy)} r="4" className={styles.comparedMark} />;
          })()}
          <text x={f(lx)} y={f(ly + 3)} textAnchor={anchor} className={cell ? styles.axisLabel : styles.axisLabelNone}>{c.label}</text>
        </g>;
      })}
      {points.map((p, i) => {
        const next = points[i + 1];
        return p && next ? <line key={i} x1={f(p[0])} y1={f(p[1])} x2={f(next[0])} y2={f(next[1])} className={styles.link} /> : null;
      })}
      {points.map((p, i) => p && <circle key={i} cx={f(p[0])} cy={f(p[1])} r="3.5" className={styles.mid} />)}
    </svg>
    <ul className={styles.radarText}>
      {groups.map((g) => <li key={g.id}><strong>{g.label}:</strong> {columns.filter((c) => c.domain === g.id).map((c) => `${c.label} ${cellWords(row.cells[c.slug])}`).join("; ")}.</li>)}
    </ul>
  </figure>;
}

export function ModelReachRadars({ rows, columns }: { rows: ReachRow[]; columns: ReachColumn[] }) {
  return <div className={styles.radars}>{rows.map((r) => <ModelReachRadar key={r.id} row={r} columns={columns} />)}</div>;
}
