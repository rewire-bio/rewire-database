/**
 * Composition and coverage figures for the database index.
 *
 * Server-rendered inline SVG: these are static figures, so a chart library and a
 * hydration cost would buy nothing. Each figure keeps a readable label and value
 * beside every bar, so nothing is carried by colour alone.
 */

type Row = { label: string; value: number; muted?: boolean };

function Bars({
  rows,
  title,
  colour = "var(--accent)",
  width = 620,
}: {
  rows: Row[];
  title: string;
  colour?: string;
  width?: number;
}) {
  const rowH = 28;
  const padL = 176;
  const padR = 56;
  const height = rows.length * rowH + 8;
  const plotW = width - padL - padR;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={title}
      style={{ maxWidth: "100%" }}
    >
      <title>{title}</title>
      {rows.map((r, i) => {
        const y = i * rowH + 4;
        const w = Math.max(2, (r.value / max) * plotW);
        return (
          <g key={r.label}>
            <text
              x={padL - 12}
              y={y + 15}
              textAnchor="end"
              fontSize="12.5"
              fill="var(--ink-2)"
            >
              {r.label}
            </text>
            <rect
              x={padL}
              y={y + 4}
              width={w}
              height={14}
              rx="3"
              fill={r.muted ? "var(--line-2)" : colour}
            />
            <text
              x={padL + w + 8}
              y={y + 15}
              fontSize="11"
              fill="var(--ink-3)"
              fontFamily="var(--mono)"
            >
              {r.value.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CompositionCharts({
  kinds,
  areas,
}: {
  kinds: Row[];
  areas: Row[];
}) {
  return (
    <div className="chartGrid">
      <figure>
        <figcaption>Records by kind</figcaption>
        <Bars rows={kinds} title="Record count by kind" />
      </figure>
      <figure>
        <figcaption>Records by research area</figcaption>
        <Bars
          rows={areas}
          title="Record count by research area"
          colour="var(--accent-ink)"
        />
      </figure>
    </div>
  );
}

/**
 * Benchmark evidence coverage.
 *
 * A benchmark is reached through a task or protocol that declares `part_of` it,
 * so a benchmark with no evaluations usually means its children never declared a
 * parent. Showing the zeroes is the point: the gap is a curation backlog and
 * hiding it would misrepresent the database.
 */
export function CoverageChart({
  covered,
  total,
  rows,
}: {
  covered: number;
  total: number;
  rows: Row[];
}) {
  return (
    <figure className="coverageFig">
      <figcaption>
        <strong>
          {covered} of {total} benchmarks
        </strong>{" "}
        are reachable from at least one evaluation. The rest are discovered
        entries whose tasks have not yet been linked to them.
      </figcaption>
      <Bars rows={rows} title="Evaluations reachable per benchmark" />
    </figure>
  );
}
