/**
 * Read tables out of a pinned HTML or JATS XML artifact.
 *
 * Papers reach us in three shapes: LaTeXML output from arXiv, where each table
 * sits in a `figure` beside its `figcaption`; JATS full text from Europe PMC,
 * where it sits in a `table-wrap` beside a `label` and `caption`; and plain
 * HTML. All three are read here so an extractor works on cells rather than on
 * a text layout, which is where transcription errors come from.
 *
 * LaTeXML writes every formula twice, once as glyphs and once as the TeX it
 * came from, so `0.31 ± 1e-2` arrives as "0.31±1×10−20.31\pm 1\times 10^{-2}".
 * The TeX copy lives in an `annotation` element and is dropped here.
 */
export type Table = { caption: string; rows: string[][] };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  minus: "−",
  plusmn: "±",
  times: "×",
  rho: "ρ",
  sigma: "σ",
  alpha: "α",
  beta: "β",
  Delta: "Δ",
  uarr: "↑",
  darr: "↓",
};

export function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name] ?? whole);
}

/** Visible text of a fragment: no tags, no TeX duplicates, collapsed spaces. */
export function text(fragment: string): string {
  return decode(
    fragment
      .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cells(row: string): string[] {
  const out: string[] = [];
  for (const m of row.matchAll(/<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    out.push(text(m[3]));
    const span = Number(/colspan\s*=\s*"?(\d+)/i.exec(m[2])?.[1] || 1);
    // A spanning header labels its first column here; the extractor names the
    // columns it wants by index, so the padding keeps those indices honest.
    for (let i = 1; i < span; i++) out.push("");
  }
  return out;
}

function rowsOf(table: string): string[][] {
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    cells(m[1]),
  );
}

/**
 * Every table in the artifact, in document order, with its caption.
 *
 * The table is found first and its caption second. Matching the wrapper first
 * looks tidier but breaks on nested elements: a non-greedy match for the
 * closing tag stops at the first inner one and returns a table with its last
 * rows missing, which is worse than no table at all because it still parses.
 *
 * A caption sits either inside the table element or in the span just before it
 * (LaTeXML figures, JATS table-wraps). Only the span since the previous table
 * is searched, so a table cannot borrow the caption of the one above it, and
 * nothing after the table is considered: the caption that follows an equation
 * belongs to the table below, not to the equation.
 */
export function tables(source: string): Table[] {
  const out: Table[] = [];
  // The element is <table>, not <table-wrap>: a word boundary would match both,
  // and a JATS table-wrap swallowed the table inside it.
  const open = /<table(?=[\s/>])[^>]*>/gi;
  let previousEnd = 0;
  for (let match = open.exec(source); match; match = open.exec(source)) {
    const from = match.index;
    if (from < previousEnd) continue;
    let depth = 0;
    const scan = /<table(?=[\s/>])[^>]*>|<\/table\s*>/gi;
    scan.lastIndex = from;
    let to = -1;
    for (let tag = scan.exec(source); tag; tag = scan.exec(source)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        to = tag.index + tag[0].length;
        break;
      }
    }
    if (to < 0) throw new Error("Unclosed table element in artifact");
    const body = source.slice(from, to);
    out.push({
      caption: caption(body) || caption(source.slice(previousEnd, from)),
      rows: rowsOf(body),
    });
    previousEnd = to;
    open.lastIndex = to;
  }
  return out;
}

function caption(fragment: string): string {
  const figure = [
    ...fragment.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi),
  ].pop();
  if (figure) return text(figure[1]);
  const label = [
    ...fragment.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi),
  ].pop();
  const jats = [
    ...fragment.matchAll(/<caption\b[^>]*>([\s\S]*?)<\/caption>/gi),
  ].pop();
  return [label && text(label[1]), jats && text(jats[1])]
    .filter(Boolean)
    .join(" ");
}

/** The one table whose caption matches, so an extractor never guesses an index. */
export function tableMatching(source: string, pattern: RegExp): Table {
  const found = tables(source).filter((t) => pattern.test(t.caption));
  if (found.length !== 1)
    throw new Error(
      `Expected one table matching ${pattern}, found ${found.length}`,
    );
  return found[0];
}

/** A printed cell, split into the number and its spread, or nothing at all. */
/** `sd` is the historical field name for the printed spread. Its statistical
 * meaning must be supplied from source evidence, never inferred from ±. */
export type Cell = { printed: string; value: string | null; sd: string | null };

const NOT_REPORTED = /^(|-|--|–|—|n\/?a|na|nan|\.|\/)$/i;

export const isMissingCell = (printed: string): boolean =>
  NOT_REPORTED.test(printed.trim());

/** "1×10−2" and "4.03e-04" are the same number written two ways. */
/**
 * Bold, italic and sans-serif digits are separate Unicode characters, and a
 * paper that bolds its best result writes them. They are the same digits.
 */
const asciiDigits = (value: string) =>
  value.replace(/[\u{1D7CE}-\u{1D7FF}]/gu, (digit) =>
    String((digit.codePointAt(0)! - 0x1d7ce) % 10),
  );

function numberFrom(text: string): string | null {
  const clean = asciiDigits(text)
    .replace(/[−‐-―]/g, "-")
    .replace(/[,\s]/g, "")
    .replace(/[↑↓*†‡]/g, "");
  const sci = /^(-?\d*\.?\d+)×10\^?\{?(-?\d+)\}?$/.exec(clean);
  // Parse as one decimal literal rather than multiplying: 9 * 10 ** -4 is
  // 0.0009000000000000001 in binary floating point, and that noise would be
  // published as the paper's reported spread.
  if (sci) {
    const value = Number(`${sci[1]}e${sci[2]}`);
    return Number.isFinite(value) ? String(value) : null;
  }
  const plain = /^(-?\d*\.?\d+(?:[eE][-+]?\d+)?)$/.exec(clean);
  if (!plain) return null;
  return Number.isFinite(Number(plain[1])) ? plain[1] : null;
}

/**
 * Read one printed cell.
 *
 * Bold, daggers and footnote marks are typography, not data. A cell the paper
 * did not fill returns no value, so no result record is written for it: a dash
 * means the method was not run, and inventing a number there would be a
 * fabrication rather than a gap.
 */
export function parseCell(
  printed: string,
  options: { unit?: string } = {},
): Cell {
  // Bold marks the paper's best result. It is emphasis, not data, so the
  // recorded printed value keeps the digits and drops the styling.
  const stripped = asciiDigits(printed)
    .replace(/±plus-or-minus±/g, "±")
    .replace(/\s+/g, " ")
    .trim();
  if (isMissingCell(stripped)) return { printed, value: null, sd: null };
  const spread = /^([^±(]+?)\s*(?:±|\()\s*([^)]+?)\)?$/.exec(stripped);
  const head = spread ? spread[1] : stripped;
  const tail = spread ? spread[2] : null;
  // Keep the paper's percentage scale. Only the caller that explicitly labels
  // this column "percent" may strip the percent sign; do not silently turn a
  // percent into a fraction or a generic score.
  const numeric = (part: string) =>
    numberFrom(options.unit === "percent" ? part.replace(/%\s*$/, "") : part);
  const value = numeric(head);
  if (value === null)
    throw new Error(`Unrecognised numeric cell: ${JSON.stringify(printed)}`);
  const sd = tail ? numeric(tail) : null;
  if (tail && (sd === null || Number(sd) < 0))
    throw new Error(`Unrecognised uncertainty in cell: ${JSON.stringify(printed)}`);
  return { printed: stripped, value, sd };
}

/**
 * Rows of a table whose first column is a section label spanning several rows.
 *
 * A row that carries the label is one cell wider than the rest, so the label is
 * taken from it and carried down until the next one. Guessing instead, by
 * matching known section names, silently drops a row when a paper adds one.
 */
export function sectioned(
  rows: string[][],
  width: number,
): { section: string; cells: string[] }[] {
  const out: { section: string; cells: string[] }[] = [];
  let section = "";
  for (const row of rows) {
    if (row.length === width + 1) {
      // A blank label continues the current section. Papers leave the cell
      // empty for a trailing row, and letting that clear the section silently
      // files it under the next one.
      if (row[0].trim()) section = row[0];
      out.push({ section, cells: row.slice(1) });
    } else if (row.length === width) {
      out.push({ section, cells: row });
    } else {
      throw new Error(
        `Row has ${row.length} cells, expected ${width} or ${width + 1}: ${row.join(" | ")}`,
      );
    }
  }
  return out;
}

export type Block = {
  /** Column headings above the metric row, joined top to bottom. */
  groups: string[];
  /** The metric row itself, one entry per column. */
  metrics: string[];
  rows: string[][];
};

/**
 * Split a table into blocks of header rows followed by their data rows.
 *
 * Wide comparisons are often printed as several stacked blocks, each with its
 * own header: ProteinBench prints backbone design at four sequence lengths as
 * two blocks of two. Reading such a table as one grid attributes the second
 * block's numbers to the first block's columns.
 *
 * A header row is one whose first cell is empty, which is how these tables mark
 * the corner cell above the row labels. Group headings span several columns, so
 * each group row is carried forward across the padding the spans leave.
 */
export function headedBlocks(table: Table): Block[] {
  const out: Block[] = [];
  let header: string[][] = [];
  for (const row of table.rows) {
    if (!row[0]?.trim() && row.slice(1).some((cell) => cell.trim())) {
      if (out.length && out[out.length - 1].rows.length) header = [];
      header.push(row);
      const width = Math.max(...header.map((r) => r.length));
      const groups = header.slice(0, -1).map((r) => {
        const filled: string[] = [];
        let current = "";
        for (let i = 0; i < width; i++) {
          if (r[i]?.trim()) current = r[i].trim();
          filled.push(current);
        }
        return filled;
      });
      const block: Block = {
        groups: Array.from({ length: width }, (_, i) =>
          [...new Set(groups.map((g) => g[i]).filter(Boolean))].join(", "),
        ),
        metrics: header[header.length - 1].map((cell) => cell.trim()),
        rows: [],
      };
      if (out.length && !out[out.length - 1].rows.length) out.pop();
      out.push(block);
    } else if (out.length && row[0]?.trim()) {
      out[out.length - 1].rows.push(row);
    }
  }
  return out.filter((block) => block.rows.length);
}

/** The direction a metric heading marks with an arrow. */
export function arrowDirection(heading: string): "higher" | "lower" | null {
  if (/\u2191/.test(heading)) return "higher";
  if (/\u2193/.test(heading)) return "lower";
  return null;
}

/**
 * Rows of a table printed in a PDF text layer.
 *
 * A PDF has no table structure, only glyphs at positions, so columns are found
 * by runs of two or more spaces. Single spaces are kept, because model names
 * contain them, and a cell is never split on a single space: that is how a
 * name such as "Splice-H510" loses its digits to the data.
 */
export function layoutRows(
  source: string,
  from: RegExp,
  to: RegExp,
): string[][] {
  // Patterns are matched against the trimmed line: a PDF text layer indents
  // whole blocks by whatever the page layout used, and that indent is not part
  // of the text.
  const lines = source.split("\n").map((line) => line.replace(/\s+$/, ""));
  const start = lines.findIndex((line) => from.test(line.trim()));
  if (start < 0) throw new Error(`Table start not found: ${from}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => to.test(line.trim()));
  if (end < 0) throw new Error(`Table end not found: ${to}`);
  return rest
    .slice(0, end)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()));
}

/**
 * Undo the way a PDF text layer renders small capitals.
 *
 * Small caps are set as a full-size initial followed by smaller capitals, and
 * the extracted text puts a space between them: Enformer arrives as
 * "E NFORMER" and DeepSEA as "D EEP SEA". Joining them recovers the token the
 * paper prints; the capitalisation is the typeface's, not the name's.
 */
export function joinSmallCaps(printed: string): string {
  return printed.replace(/\b([A-Z]) ([A-Z]{2,})(?: ([A-Z]{2,}))*/g, (match) =>
    match.replace(/\s+/g, ""),
  );
}
