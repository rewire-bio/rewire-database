import { useId } from "react";
import type { OmicsProfile } from "@/lib/omics-profile";
import styles from "./ProfileDiagram.module.css";

type Diagram = NonNullable<OmicsProfile["diagram"]>;
type Stage = {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
};

/** Presentation only: labels and their order come from the reviewed profile. */
function wrap(text: string, capacity: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    // Long identifiers must fit too; no scientific text is shortened or omitted.
    const pieces = word.match(new RegExp(`.{1,${capacity}}`, "gu")) || [word];
    for (const [index, piece] of pieces.entries()) {
      if (line && `${line} ${piece}`.length > capacity) {
        // A line that ends between words keeps its space, so copied and spoken text stays readable.
        lines.push(index ? line : `${line} `);
        line = "";
      }
      line = line ? `${line} ${piece}` : piece;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Abstract marks convey flow, not quantitative values or architecture details. */
function Motif({
  text,
  index,
  last,
}: {
  text: string;
  index: number;
  last: boolean;
}) {
  if (/sequence|bases|tokens|DNA|RNA|protein/i.test(text) && index === 0) {
    return (
      <g>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <rect
            key={n}
            x={n * 10}
            y={9 + (n % 2) * 7}
            width="6"
            height="19"
            rx="3"
          />
        ))}
        <path d="M0 5H56M0 39H56" className={styles.motifLine} />
      </g>
    );
  }
  if (last) {
    return (
      <g>
        <rect
          x="5"
          y="3"
          width="43"
          height="38"
          rx="7"
          className={styles.motifOutline}
        />
        {[12, 22, 32].map((y) => (
          <g key={y}>
            <circle cx="15" cy={y} r="2" />
            <path d={`M23 ${y}H39`} className={styles.motifLine} />
          </g>
        ))}
      </g>
    );
  }
  if (
    /embedding|representation|pair|graph|attention|transformer|encoder|trunk|layer/i.test(
      text,
    )
  ) {
    return (
      <g>
        {[0, 1, 2].map((n) => (
          <g key={n} opacity={0.45 + n * 0.25}>
            <rect
              x={5 + n * 7}
              y={4 + n * 6}
              width="34"
              height="24"
              rx="5"
              className={styles.motifLayer}
            />
            <path
              d={`M${12 + n * 7} ${12 + n * 6}h18M${12 + n * 7} ${19 + n * 6}h12`}
              className={styles.motifLine}
            />
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <rect
        x="7"
        y="4"
        width="42"
        height="36"
        rx="10"
        className={styles.motifOutline}
      />
      {[0, 1, 2].map((n) => (
        <rect key={n} x={15 + n * 10} y="14" width="5" height="16" rx="2" />
      ))}
    </g>
  );
}

function DiagramSvg({
  diagram,
  prefix,
  layout,
}: {
  diagram: Diagram;
  prefix: string;
  layout: "wide" | "medium" | "compact";
}) {
  const compact = layout !== "wide";
  const columns =
    layout === "compact"
      ? 1
      : layout === "medium"
        ? 2
        : diagram.steps.length <= 4
          ? Math.max(1, diagram.steps.length)
          : 3;
  const width = layout === "compact" ? 360 : layout === "medium" ? 520 : 960;
  const gap = compact ? 24 : 34;
  const margin = compact ? 4 : 8;
  const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const capacity = Math.floor((cardWidth - (compact ? 99 : 44)) / 8.5);
  const lines = diagram.steps.map((step) => wrap(step, capacity));
  const rowHeights = Array.from(
    { length: Math.ceil(lines.length / columns) },
    (_, row) =>
      Math.max(
        ...lines
          .slice(row * columns, (row + 1) * columns)
          .map((items) =>
            compact
              ? Math.max(96, items.length * 20 + 32)
              : Math.max(184, items.length * 22 + 100),
          ),
      ),
  );
  const rowY = rowHeights.map(
    (_, row) =>
      margin +
      rowHeights.slice(0, row).reduce((sum, height) => sum + height + gap, 0),
  );
  const stages: Stage[] = lines.map((items, index) => {
    const row = Math.floor(index / columns);
    const column = row % 2 ? columns - 1 - (index % columns) : index % columns;
    return {
      x: margin + column * (cardWidth + gap),
      y: rowY[row],
      width: cardWidth,
      height: rowHeights[row],
      lines: items,
    };
  });
  const height =
    rowHeights.reduce((sum, value) => sum + value, 0) +
    Math.max(0, rowHeights.length - 1) * gap +
    margin * 2;
  const titleId = `${prefix}-title`;
  const descId = `${prefix}-description`;
  const arrowId = `${prefix}-arrow`;
  return (
    <svg
      className={styles[layout]}
      viewBox={`0 0 ${width} ${Math.max(height, 1)}`}
      role="img"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <title id={titleId}>{diagram.title}</title>
      <desc id={descId}>
        {diagram.steps
          .map((step, index) => `${index + 1}. ${step}`)
          .join(". Then: ")}
      </desc>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M1 1L8 5L1 9" className={styles.arrowhead} />
        </marker>
      </defs>
      <g aria-hidden="true">
        {stages.slice(0, -1).map((stage, index) => {
          const next = stages[index + 1];
          const sameRow = stage.y === next.y;
          const forward = next.x > stage.x;
          const path = sameRow
            ? `M${stage.x + (forward ? stage.width : 0)} ${stage.y + stage.height / 2}H${next.x + (forward ? 0 : next.width) + (forward ? -5 : 5)}`
            : `M${stage.x + stage.width / 2} ${stage.y + stage.height}V${next.y - 5}`;
          return (
            <path
              key={index}
              d={path}
              markerEnd={`url(#${arrowId})`}
              className={styles.connector}
            />
          );
        })}
        {stages.map((stage, index) => (
          <g key={index} transform={`translate(${stage.x} ${stage.y})`}>
            <rect
              width={stage.width}
              height={stage.height}
              rx="14"
              className={
                index === stages.length - 1 ? styles.finalCard : styles.card
              }
            />
            {compact ? (
              <>
                <circle
                  cx="35"
                  cy="27"
                  r="13"
                  className={styles.numberCircle}
                />
                <text
                  x="35"
                  y="31"
                  textAnchor="middle"
                  className={styles.compactNumber}
                >
                  {String(index + 1).padStart(2, "0")}
                </text>
                <g
                  transform="translate(9 46) scale(.86)"
                  className={styles.motif}
                >
                  <Motif
                    text={diagram.steps[index]}
                    index={index}
                    last={index === stages.length - 1}
                  />
                </g>
              </>
            ) : (
              <>
                <text x="22" y="35" className={styles.number}>
                  {String(index + 1).padStart(2, "0")}
                </text>
                <g
                  transform={`translate(${stage.width - 78} 18)`}
                  className={styles.motif}
                >
                  <Motif
                    text={diagram.steps[index]}
                    index={index}
                    last={index === stages.length - 1}
                  />
                </g>
                <path
                  d={`M22 73H${stage.width - 22}`}
                  className={styles.divider}
                />
              </>
            )}
            <text
              x={compact ? 79 : 22}
              y={
                compact
                  ? (stage.height - (stage.lines.length - 1) * 20) / 2 + 5
                  : 106
              }
              className={styles.label}
            >
              {stage.lines.map((line, lineIndex) => (
                <tspan
                  key={lineIndex}
                  x={compact ? 79 : 22}
                  dy={lineIndex ? (compact ? 20 : 22) : 0}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function ProfileDiagram({
  diagram,
  id,
}: {
  diagram: Diagram;
  id?: string;
}) {
  const instance = useId().replace(/:/g, "");
  const prefix = `${id || "profile-diagram"}-${instance}`;
  return (
    <div className={styles.diagram}>
      <DiagramSvg diagram={diagram} prefix={`${prefix}-wide`} layout="wide" />
      <DiagramSvg
        diagram={diagram}
        prefix={`${prefix}-medium`}
        layout="medium"
      />
      <DiagramSvg
        diagram={diagram}
        prefix={`${prefix}-compact`}
        layout="compact"
      />
    </div>
  );
}
