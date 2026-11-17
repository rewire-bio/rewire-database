/** Locator grammar v2: a typed reading of the free-text `source_locator` a record carries.
 *
 * Today a locator is prose. The only machine-readable grammar in the repository is the regex at
 * `scripts/omics/batch.py:30-31`, which parses 20,540 of the 52,278 stored result locators (39.3%)
 * and only inside `check-values`. This module reads the other forms as well: unquoted row values,
 * spreadsheet cells with a sheet name, table labels with no row keyword, figures, Roman numeral and
 * dotted table labels, CSV and text line numbers, JSON paths, and identifier plus column forms.
 *
 * The grammar, per locator string, after splitting on `;` and top-level `,` outside quotes and
 * brackets:
 *
 *     locator   := anchor+ address? selector* qualifier*
 *     anchor    := table | figure | sheet | file | container
 *     address   := sheet_cell | cell_range | line | row_number | xml_cell | json_path
 *                | quote | sentence | paragraph
 *     selector  := key ('=' | ':' | ' ') value, the value quoted, bracketed or bare
 *     qualifier := page | layer | commit | parenthetical note
 *
 * Parsing consumes tokens from each segment, longest standing first, and whatever is left over is
 * reported as residue rather than dropped. A locator is addressed only when every component is
 * consumed into a typed field, so a string that resolves nothing cannot pass by being typed
 * loosely. `coverageOf` gives the four buckets the coverage report counts:
 *
 *     full        an anchor or address, something that names a row, something that names a column,
 *                 and no residue; or a cell address with labels that check it; or a text span
 *     partial     addressed in one direction only, or a bare cell address with nothing to check it
 *     residue     part of the string was not consumed into a field
 *     unanchored  no anchor and no address
 *
 * This module writes nothing. It reads stored locators and reports on them. Nothing in the store
 * holds a span yet; the span type is declared here because the offset basis is expensive to change
 * later, and because `oa:TextPositionSelector` counts code points while a byte offset into a text
 * layer does not.
 */
import { z } from "zod";

/** A span into a pinned text layer, in the two bases the W3C Web Annotation model separates.
 *
 * `start` and `end` count Unicode code points from 0, as `oa:TextPositionSelector` does.
 * `byte_start` and `byte_end` count UTF-8 bytes into the same layer, as `oa:DataPositionSelector`
 * does. Both are kept because the resolvers work in bytes and the published annotation is in code
 * points, and a layer that holds any astral or combining character makes the two disagree.
 *
 * JavaScript string indices are UTF-16 code units, so `string.length`, `indexOf` and `slice` give
 * neither basis. Count code points with `[...text].length` and bytes with
 * `Buffer.byteLength(text, "utf8")`.
 *
 * `exact`, with optional `prefix` and `suffix`, is `oa:TextQuoteSelector`: it relocates the span
 * when the layer is rebuilt and the offsets shift. The layer is never Unicode-normalised, so the
 * quote is compared byte for byte against the layer that `layer_sha256` names.
 */
export const spanSchema = z.object({
  /** SHA-256 of the text layer these offsets index. */
  layer_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** First code point of the span, counted from 0. */
  start: z.number().int().min(0),
  /** One past the last code point of the span. */
  end: z.number().int().min(0),
  /** First UTF-8 byte of the span, counted from 0. */
  byte_start: z.number().int().min(0),
  /** One past the last UTF-8 byte of the span. */
  byte_end: z.number().int().min(0),
  /** The layer text the span covers, verbatim. */
  exact: z.string().min(1),
  /** Layer text immediately before `exact`, for relocation. */
  prefix: z.string().optional(),
  /** Layer text immediately after `exact`, for relocation. */
  suffix: z.string().optional(),
}).refine((s) => s.end >= s.start, { message: "span end is before its start" })
  .refine((s) => s.byte_end >= s.byte_start, { message: "span byte_end is before its byte_start" })
  .refine((s) => s.byte_end - s.byte_start >= s.end - s.start, {
    message: "a span covers at least as many UTF-8 bytes as code points",
  });
export type Span = z.infer<typeof spanSchema>;

export const anchorKinds = ["table", "figure", "sheet", "file", "container"] as const;
export const addressKinds = [
  "sheet_cell", "cell_range", "line", "row_number", "xml_cell", "json_path",
  "quote", "sentence", "paragraph",
] as const;
export const qualifierKinds = ["page", "layer", "layer_line", "commit", "note"] as const;
/** How the value was written next to its key. */
export const selectorForms = ["quoted", "bracketed", "equals", "bare"] as const;

export const anchorSchema = z.object({
  kind: z.enum(anchorKinds),
  /** The printed identifier: "S18", "4b", "IV", a sheet name, a file path, a container label. */
  value: z.string(),
  /** The container the anchor sits in, where the string names one ("Supplementary", "Appendix B"). */
  container: z.string().optional(),
  /** The text this anchor was read from. */
  raw: z.string(),
});
export type LocatorAnchor = z.infer<typeof anchorSchema>;

/** An address points at a place directly rather than naming a label to look up.
 *
 * `refines` chains one address onto another the way `oa:refinedBy` does: a workbook locator that
 * gives a cell and then a second cell for its uncertainty holds the first as the address and the
 * second as a refinement. */
export const addressSchema = z.object({
  kind: z.enum(addressKinds),
  value: z.string(),
  /** Second coordinate, where the form carries one: the column of an XML cell, the end of a range. */
  value2: z.string().optional(),
  raw: z.string(),
});
export type LocatorAddress = z.infer<typeof addressSchema>;

export const selectorSchema = z.object({
  /** Lower-cased key as printed: "row", "column", "tool", "sub-column", "model". */
  key: z.string(),
  /** The value, or null where the form carried a key and no readable value. */
  value: z.string().nullable(),
  form: z.enum(selectorForms),
  raw: z.string(),
});
export type LocatorSelector = z.infer<typeof selectorSchema>;

export const qualifierSchema = z.object({
  kind: z.enum(qualifierKinds),
  text: z.string(),
});
export type LocatorQualifier = z.infer<typeof qualifierSchema>;

/** The authored locator: what a record will carry once locators are written as structure rather
 * than read back out of prose. Stricter than what parsing a stored string yields, on purpose. The
 * store is described by `ParsedLocator`; this is what new batches must produce. */
export const locatorSchema = z.object({
  anchors: z.array(anchorSchema).min(1),
  address: addressSchema.optional(),
  /** Addresses that narrow the first one, in the order they apply. */
  refines: z.array(addressSchema).optional(),
  selectors: z.array(selectorSchema).default([]),
  qualifiers: z.array(qualifierSchema).default([]),
  /** The span in the pinned text layer, once a resolver has placed the locator. */
  span: spanSchema.optional(),
  /** The string a reader sees, which `renderLocator` produces from the fields above. */
  printed: z.string().min(1),
});
export type Locator = z.infer<typeof locatorSchema>;

export const verdicts = [
  "full_cell", "full_row_col", "full_keyed", "text_span",
  "cell_only", "partial", "anchor_only", "residue", "no_anchor",
] as const;
export type LocatorVerdict = (typeof verdicts)[number];

export const coverages = ["full", "partial", "residue", "unanchored"] as const;
export type LocatorCoverage = (typeof coverages)[number];

/** What parsing a stored locator string yields. Lenient where the store is: 4,480 stored locators
 * have no anchor at all and 1,173 carry more than one address, and a type that forbade either would
 * describe something other than the data. */
export const parsedLocatorSchema = z.object({
  printed: z.string(),
  anchors: z.array(anchorSchema),
  addresses: z.array(addressSchema),
  selectors: z.array(selectorSchema),
  qualifiers: z.array(qualifierSchema),
  /** Text that no token consumed, one entry per segment that kept some. */
  residue: z.array(z.string()),
  verdict: z.enum(verdicts),
});
export type ParsedLocator = z.infer<typeof parsedLocatorSchema>;

// ---------------------------------------------------------------------------------------------
// The grammar's tokens.
//
// Order matters twice: a token earlier in the list wins a tie on match position, and the tokens
// that would swallow a later one (a quoted sentence, a parenthetical, a page note) stand first.

const ROMAN = "(?:XVIII|XVII|XVI|XIV|XIII|XIX|XII|XI|XV|XX|IX|VIII|VII|VI|IV|III|II|I|X|V)";
/** A table or figure number: "3", "S18", "A2", "4b", "2.1", the dotted "A.2", or a Roman numeral. */
const TNUM = `(?:[A-Z]{0,2}\\d+(?:\\.\\d+)*[a-z]?|[A-Z]{1,2}\\.\\d+(?:\\.\\d+)*[a-z]?|${ROMAN})`;
/** Where a table, figure or data object sits in a publication. */
const CONTAINER =
  "(?:Appendix(?:\\s+[A-Z])?|Supplementary(?:\\s+(?:Materials?|Information|Data|Dataset|Note|Notes|file|Tables?|Methods|Text))?" +
  "|Supplemental(?:\\s+(?:Materials?|Information|Data|Tables?))?|Supporting Information|Extended Data" +
  "|Additional file \\d+|Data file [A-Z]?\\d*|Source Data|Zenodo|Online Methods|Methods|Results|Discussion)";

type TokenName =
  | "addr_sentence" | "addr_quote" | "addr_para" | "addr_jsonp"
  | "qual_layer" | "qual_layerline" | "qual_page" | "qual_commit" | "qual_paren"
  | "addr_xml" | "addr_range" | "addr_sheetcell" | "addr_line" | "addr_rowno" | "addr_json"
  | "anchor_sheet" | "anchor_bangsheet" | "anchor_table" | "anchor_figure" | "anchor_file"
  | "anchor_container"
  | "sel_group" | "sel_grouprev" | "sel_panel" | "sel_quoted" | "sel_bracket" | "sel_eq" | "sel_bare";

const TOKENS: { name: TokenName; re: RegExp }[] = [
  // Prose addresses, which hold quoted text a selector would otherwise claim.
  { name: "addr_sentence", re: /\b(?:sentence|sentences)\s+(?:beginning|starting|reading)\s*['‘’"](?<sent>[^'’"]{4,})['’"]/i },
  { name: "addr_quote", re: /(?<![\p{L}\p{N}_])['‘’"](?<quote>[^'’"]{40,})['’"]/u },
  { name: "addr_para", re: /\b(?:paragraph|para\.?|bullet|sentence)\s*(?<para>\d{1,3})\b/i },
  { name: "addr_jsonp", re: /\b(?<jp2>(?:\$|entries|data|results|root)(?:\.[\p{L}\p{N}_%+() -]+|\[\d+\])+)/u },
  // Qualifiers: which rendering of the source, which page, which commit, and loose notes.
  { name: "qual_layer", re: /\(?\b(?:text-layer|PDF page text|PDF caption|PDF text|PDF|XML|HTML|JATS|JSON|CSV|TSV|source CSV|source data|SI)\b[\p{L}\p{N}_.: /\u2013-]{0,24}\)?/iu },
  { name: "qual_layerline", re: /\(?\btext-layer line\s*\d+\)?/i },
  { name: "qual_page", re: /\(?\b(?:page|pages|p\.|pp\.)\s*\d+(?:\s*of\s*\d+)?\)?/i },
  { name: "qual_commit", re: /\bat commit [0-9a-f]{7,40}\b/i },
  { name: "qual_paren", re: /\([^()]{0,44}\)/ },
  // Addresses.
  { name: "addr_xml", re: /\bXML\s+(?:data\s+)?(?:tr\s+)?row\s*(?<xrow>\d+)[ ,]*(?:column|col)\s*(?<xcol>\d+)/i },
  { name: "addr_range", re: /(?:!|\bcells?\s+)(?<c1>[A-Z]{1,3}\d{1,6}):(?<c2>[A-Z]{1,3}\d{1,6})/ },
  { name: "addr_sheetcell", re: /(?:!|\bcell\s+|\bcells\s+|\b)(?<cell>[A-Z]{1,3}\d{1,6})\b(?![\p{L}\p{N}_.(])/u },
  { name: "addr_line", re: /\b(?:line|lines)\s*(?<line>\d{1,7})\b/i },
  { name: "addr_rowno", re: /\b(?:data\s+)?rows?\s*(?<rowno>\d{1,7})\b(?!\s*[:=])/i },
  { name: "addr_json", re: /\b(?<jp>(?:\$|data|entries|results|root|leaderboard)(?:\.[\p{L}\p{N}_%+() -]+|\[\d+\])+)/u },
  // Anchors.
  { name: "anchor_sheet", re: /\bsheets?\s*['‘’"]?(?<sheet>[^'’",;()!]{1,60}?)['’"]?(?=\s*[,;)!]|\s*$|\s+cell|\s+[A-Z]{1,3}\d)/i },
  { name: "anchor_bangsheet", re: /['‘’"]?(?<bsheet>[\p{L}\p{N}_ .%+-]{1,50})['’"]?(?=!)/u },
  { name: "anchor_table", re: new RegExp(`\\b(?:(?<tcontainer>${CONTAINER})\\s+)?Tables?\\s*(?<table>${TNUM})\\b\\.?`, "i") },
  { name: "anchor_figure", re: new RegExp(`\\b(?:(?<fcontainer>${CONTAINER})\\s+)?(?:Figures?|Fig\\.?)\\s*(?<figure>${TNUM})\\b`, "i") },
  { name: "anchor_file", re: /(?<file>[\p{L}\p{N}_./+()%-]+\.(?:csv|tsv|json|jsonl|xlsx|xls|txt|parquet|md|ya?ml|html|xml|pdf|zip)(?:\.gz)?)/iu },
  { name: "anchor_container", re: new RegExp(`\\b(?<ccontainer>${CONTAINER})(?:\\s+(?<obj>[A-Z]?\\d+[a-z]?))?`, "i") },
  // Selectors.
  { name: "sel_group", re: /(?<key>(?:metric |column |row |value )?(?:block|group|panel|sub-?table|part|section|strategy|subgroup))\s*[:=]?\s*['‘’"](?<qv>[^'’"]*)['’"]/i },
  { name: "sel_grouprev", re: /['‘’"](?<qv>[^'’"]*)['’"]\s*(?<key>block|group|panel|sub-?table|section)\b/i },
  { name: "sel_panel", re: /\b(?<key>Panel|panel)\s+(?<bv>[A-Za-z]\b)/ },
  { name: "sel_quoted", re: /(?<key>[\p{L}\p{N}_ .#%/+-]{1,40}?)\s*[:=]?\s*['‘’"](?<qv>[^'’"]*)['’"]/u },
  { name: "sel_bracket", re: /(?<key>[\p{L}\p{N}_ .#%/+-]{1,40}?)\s*\(\s*(?<pv>[^()]{1,80})\s*\)/u },
  { name: "sel_eq", re: /(?<key>[\p{L}\p{N}_ .#%/+-]{1,40}?)\s*=\s*(?<ev>[^,;]{1,80})/u },
  {
    name: "sel_bare",
    re: /\b(?<key>row|rows|column|col|columns|sub-column|sub-col|key|metric|model|models|tool|tools|method|methods|dataset|datasets|caller|split|task|target|subset|group|entry|field|variant|measure|statistic|system|submission|strategy|platform|depth|tier)\s+(?<bv>[^,;'"()]{1,80}?)(?=\s*[,;)]|\s*$)/i,
  },
];

const ANCHOR_KIND: Record<string, (typeof anchorKinds)[number]> = {
  anchor_sheet: "sheet", anchor_bangsheet: "sheet", anchor_table: "table",
  anchor_figure: "figure", anchor_file: "file", anchor_container: "container",
};
const ADDRESS_KIND: Record<string, (typeof addressKinds)[number]> = {
  addr_sentence: "sentence", addr_quote: "quote", addr_para: "paragraph",
  addr_jsonp: "json_path", addr_json: "json_path", addr_xml: "xml_cell",
  addr_range: "cell_range", addr_sheetcell: "sheet_cell", addr_line: "line",
  addr_rowno: "row_number",
};
const QUALIFIER_KIND: Record<string, (typeof qualifierKinds)[number]> = {
  qual_layer: "layer", qual_layerline: "layer_line", qual_page: "page",
  qual_commit: "commit", qual_paren: "note",
};
const SELECTOR_FORM: Record<string, (typeof selectorForms)[number]> = {
  sel_group: "quoted", sel_grouprev: "quoted", sel_panel: "bare", sel_quoted: "quoted",
  sel_bracket: "bracketed", sel_eq: "equals", sel_bare: "bare",
};

/** Keys that name the row a value sits in. */
const ROW_KEYS = new Set(["row", "rows", "row label"]);
/** Keys that name the column a value sits in. */
const COL_KEYS = new Set(["column", "col", "columns", "sub-column", "sub-col", "key", "field", "column group"]);
/** A printed key may carry its own ordinal: "column 1 of 4" names the first of four columns. */
const ORDINAL_KEY = /\s+\d+(?:\s+of\s+\d+)?$/;

/** What a selector key names: the row, the column, or something else the row is found by. */
export function selectorRole(key: string): "row" | "column" | "other" {
  const head = key.replace(ORDINAL_KEY, "").trim();
  if (ROW_KEYS.has(head)) return "row";
  if (COL_KEYS.has(head)) return "column";
  return "other";
}
/** Addresses that place a value without needing a label. */
const DIRECT: Set<LocatorAddress["kind"]> = new Set(["sheet_cell", "xml_cell", "json_path"]);
/** Addresses that place a row but not a column. */
const LINE_ADDRESSED: Set<LocatorAddress["kind"]> = new Set(["line", "row_number"]);
/** Addresses that point at prose rather than at a table cell. */
const PROSE: Set<LocatorAddress["kind"]> = new Set(["sentence", "quote", "paragraph"]);

/** Punctuation only: what is left of a segment when everything in it was read. */
const NOISE = /^[\s,;:.()[\]'"‘’/|-]*$/;
/** Words that carry no address on their own, so a segment left holding only these is not residue. */
const NOISE_WORDS =
  /\b(?:and|the|of|in|at|for|with|value|values|cell|cells|row|rows|column|columns|col|sheet|table|tables|workbook|xlsx|xls|csv|tsv|data|file|page|from|as|printed|reported|see|also|only|per|no|not|is|are|to|by|version|v\d+|header|headers|label|labels|first|second|third|final|last|top|bottom|left|right|mean|overall|all|main|text|supplement|supplementary|appendix|figure|fig|note|notes|caption|legend|body|entries|entry|block|blocks|section|sections|sub|subtable|part|parts|panel|panels|image|images|commit|tier|unnamed|single|standard|error|rounded|assessable|count|counts|frozen|bar|read|group|groups|subgroup|strategy|under|above|below|next|prior|same|its|their|which|where|when|that|this|these|those|one|two|three|four|five)\b/gi;

/** Split a locator into segments on `;` and on commas outside quotes and brackets. */
export function splitSegments(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (const ch of text) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === "‘" || ch === "’" || ch === '"') {
      quote = ch === '"' ? '"' : "'";
      buf += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === ";" || ch === ",") && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

type Hit = { name: TokenName; match: RegExpExecArray };

/** Strip every token this grammar knows from one segment, leftmost first, and report what is left. */
function consume(segment: string): { hits: Hit[]; residue: string } {
  const hits: Hit[] = [];
  let text = segment;
  let changed = true;
  let guard = 0;
  while (changed && guard < 40) {
    guard += 1;
    changed = false;
    let best: Hit | null = null;
    for (const token of TOKENS) {
      const match = token.re.exec(text);
      if (match && (best === null || match.index < best.match.index)) best = { name: token.name, match };
    }
    if (!best) break;
    if (best.match[0].length === 0) break;
    hits.push(best);
    text = (text.slice(0, best.match.index) + " " + text.slice(best.match.index + best.match[0].length)).trim();
    changed = true;
  }
  const left = text.replace(NOISE_WORDS, " ");
  return { hits, residue: NOISE.test(left) ? "" : text };
}

function anchorOf(hit: Hit): LocatorAnchor {
  const g = hit.match.groups ?? {};
  const kind = ANCHOR_KIND[hit.name];
  const value = g.sheet ?? g.bsheet ?? g.table ?? g.figure ?? g.file ?? g.obj ?? hit.match[0].trim();
  // A container anchor with an object number keeps the two apart ("Supplementary Data" and "2"),
  // so rendering writes the label back out rather than the bare number.
  const container = g.tcontainer ?? g.fcontainer ?? (g.obj ? g.ccontainer : undefined);
  const anchor: LocatorAnchor = { kind, value: value.trim(), raw: hit.match[0].trim() };
  if (container) anchor.container = container.trim();
  if (kind === "container" && !g.obj) anchor.value = hit.match[0].trim();
  return anchor;
}

function addressOf(hit: Hit): LocatorAddress {
  const g = hit.match.groups ?? {};
  const kind = ADDRESS_KIND[hit.name];
  const value = g.sent ?? g.quote ?? g.para ?? g.jp2 ?? g.jp ?? g.xrow ?? g.c1 ?? g.cell ?? g.line ?? g.rowno ?? "";
  const address: LocatorAddress = { kind, value: value.trim(), raw: hit.match[0].trim() };
  const second = g.xcol ?? g.c2;
  if (second) address.value2 = second.trim();
  return address;
}

function selectorOf(hit: Hit): LocatorSelector {
  const g = hit.match.groups ?? {};
  const value = [g.qv, g.pv, g.ev, g.bv].find((v) => v !== undefined);
  return {
    key: (g.key ?? "").trim().toLowerCase(),
    value: value === undefined ? null : value.trim(),
    form: SELECTOR_FORM[hit.name],
    raw: hit.match[0].trim(),
  };
}

/** Read a stored locator string into anchors, addresses, selectors, qualifiers and residue. */
export function parseLocator(printed: string): ParsedLocator {
  const anchors: LocatorAnchor[] = [];
  const addresses: LocatorAddress[] = [];
  const selectors: LocatorSelector[] = [];
  const qualifiers: LocatorQualifier[] = [];
  const residue: string[] = [];
  for (const segment of splitSegments(printed)) {
    const read = consume(segment);
    for (const hit of read.hits) {
      if (hit.name.startsWith("anchor")) anchors.push(anchorOf(hit));
      else if (hit.name.startsWith("addr")) addresses.push(addressOf(hit));
      else if (hit.name.startsWith("sel")) selectors.push(selectorOf(hit));
      else qualifiers.push({ kind: QUALIFIER_KIND[hit.name], text: hit.match[0].trim() });
    }
    if (read.residue) residue.push(read.residue);
  }
  const parsed: ParsedLocator = {
    printed, anchors, addresses, selectors, qualifiers, residue, verdict: "no_anchor",
  };
  parsed.verdict = verdictOf(parsed);
  return parsed;
}

/** How much of a value's position the parse actually pins down. */
export function verdictOf(parsed: ParsedLocator): LocatorVerdict {
  const roles = parsed.selectors.map((s) => selectorRole(s.key));
  const kinds = new Set(parsed.addresses.map((a) => a.kind));
  const hasRow = roles.includes("row");
  const hasColumn = roles.includes("column");
  const otherKeys = roles.filter((r) => r === "other");
  const prose = [...PROSE].some((k) => kinds.has(k));
  const direct = [...DIRECT].some((k) => kinds.has(k));
  const lineAddressed = [...LINE_ADDRESSED].some((k) => kinds.has(k));
  if (parsed.anchors.length === 0 && parsed.addresses.length === 0) return "no_anchor";
  if (parsed.residue.length > 0) return "residue";
  if (prose) return "text_span";
  // A cell address next to labels is self-checking: the labels say what the cell should hold.
  if (direct && (hasColumn || hasRow || otherKeys.length > 0)) return "full_cell";
  if (direct) return "cell_only";
  if ((hasRow || lineAddressed) && hasColumn) return "full_row_col";
  if (otherKeys.length > 0 && hasColumn) return "full_keyed";
  if (lineAddressed || hasRow || otherKeys.length > 0 || hasColumn) return "partial";
  return "anchor_only";
}

const COVERAGE_OF: Record<LocatorVerdict, LocatorCoverage> = {
  full_cell: "full", full_row_col: "full", full_keyed: "full", text_span: "full",
  cell_only: "partial", partial: "partial", anchor_only: "partial",
  residue: "residue", no_anchor: "unanchored",
};

/** The reported bucket for a verdict. Fully addressed means every component was consumed into a
 * typed field and the parse names both a row and a column, or an address that stands for both. */
export function coverageOf(verdict: LocatorVerdict): LocatorCoverage {
  return COVERAGE_OF[verdict];
}

// ---------------------------------------------------------------------------------------------
// Rendering.

function quoteValue(value: string): string {
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

function renderAnchor(anchor: LocatorAnchor): string {
  const prefix = anchor.container ? `${anchor.container} ` : "";
  if (anchor.kind === "table") return `${prefix}Table ${anchor.value}`;
  if (anchor.kind === "figure") return `${prefix}Figure ${anchor.value}`;
  if (anchor.kind === "sheet") return `${prefix}sheet ${quoteValue(anchor.value)}`;
  return `${prefix}${anchor.value}`;
}

function renderAddress(address: LocatorAddress): string {
  switch (address.kind) {
    case "sheet_cell": return `cell ${address.value}`;
    case "cell_range": return `cells ${address.value}:${address.value2 ?? address.value}`;
    case "line": return `line ${address.value}`;
    case "row_number": return `row ${address.value}`;
    case "xml_cell": return `XML row ${address.value} column ${address.value2 ?? ""}`.trim();
    case "json_path": return address.value;
    case "quote": return quoteValue(address.value);
    case "sentence": return `sentence beginning ${quoteValue(address.value)}`;
    case "paragraph": return `paragraph ${address.value}`;
  }
}

function renderSelector(selector: LocatorSelector): string {
  if (selector.value === null) return selector.key;
  if (selector.form === "equals") return `${selector.key}=${selector.value}`;
  if (selector.form === "bracketed") return `${selector.key} (${selector.value})`;
  if (selector.form === "bare") return `${selector.key} ${selector.value}`;
  return `${selector.key} ${quoteValue(selector.value)}`;
}

/** Write a parsed locator back out as a string, from its typed fields only.
 *
 * The canonical form is `anchors, address, selectors (qualifiers)`, with keys lower-cased as
 * parsed and values single-quoted. It does not reproduce the original punctuation, so
 * `renderLocator(parseLocator(x)) === x` holds for locators already written in the canonical form
 * and not for the rest. That share is what the coverage report measures; it is the gate on
 * inverting the contract, where the structure is authored and the string is rendered from it. */
export function renderLocator(locator: {
  anchors: LocatorAnchor[];
  /** As a parse yields them. */
  addresses?: LocatorAddress[];
  /** As a locator is authored: one address, narrowed by any refinements. */
  address?: LocatorAddress;
  refines?: LocatorAddress[];
  selectors: LocatorSelector[];
  qualifiers: LocatorQualifier[];
}): string {
  const parsed = locator;
  const addresses = locator.addresses
    ?? [locator.address, ...(locator.refines ?? [])].filter((a): a is LocatorAddress => a !== undefined);
  const parts: string[] = [];
  for (const anchor of parsed.anchors) parts.push(renderAnchor(anchor));
  for (const address of addresses) parts.push(renderAddress(address));
  for (const selector of parsed.selectors) parts.push(renderSelector(selector));
  let text = parts.join(", ");
  for (const qualifier of parsed.qualifiers) text += ` (${qualifier.text.replace(/^\(|\)$/g, "")})`;
  return text;
}

// ---------------------------------------------------------------------------------------------
// Classes, for the coverage report.

export const locatorClasses = [
  "table_row_col", "roman_table", "dotted_table", "table_unquoted_row", "table_row_unmatched",
  "table_no_row_keyword", "sheet_cell", "figure",
  "json_path", "line_addressed", "identifier_column", "other",
] as const;
export type LocatorClass = (typeof locatorClasses)[number];

/** The regex at `scripts/omics/batch.py:30-31`, ported for conformance only.
 *
 * `check-values` reports `locator_not_parsed` for every locator this does not match, so the port
 * has to agree with it row for row on the 14 `data/omics/*​/value-check.tsv` files. Nothing else
 * uses it; the original stays in place until the resolvers replace it. */
export const legacyLocatorPattern =
  /^(?<prefix>Appendix |Supplementary |Extended Data )?(?<table>Table [A-Z]?\d+[a-z]?)\b.*?row ["'](?<row>[^"']+)["'](?:.*?col(?:umn)? ["'](?<col>[^"']+)["'])?(?:.*?sub-col(?:umn)? ["'](?<sub>[^"']+)["'])?/;

/** Does the v1 regex parse this locator? */
export function parsesUnderLegacyRegex(printed: string): boolean {
  return legacyLocatorPattern.test(printed);
}

const PREFIX = "(?:Appendix |Supplementary |Extended Data )?";
const TABLE_HEAD = new RegExp(`^${PREFIX}Table `);

/** Which measured class a stored locator belongs to, read off the printed string alone.
 *
 * The first eight classes are the ones measured over the whole store on 2026-11-17 and keep that
 * measurement's decision order, so the report can be compared with it: `table_row_col` is what the
 * v1 regex parses (20,540), `roman_table` 224, `dotted_table` 8, `table_unquoted_row` 7,484,
 * `table_no_row_keyword` 3,125, `sheet_cell` 4,542 (a table named inside the string rather than at
 * its start, which is how a workbook sheet and cell reference reads) and `figure` 1,355. The
 * measurement left the remaining 15,000 in one bucket; the last four classes split it by what the
 * string addresses, because the grammar reads those forms apart. */
export function classifyLocator(printed: string): LocatorClass {
  const text = printed.trim();
  if (parsesUnderLegacyRegex(text)) return "table_row_col";
  if (TABLE_HEAD.test(text)) {
    if (new RegExp(`^${PREFIX}Table [IVXLC]+\\b`).test(text)) return "roman_table";
    if (new RegExp(`^${PREFIX}Table (?:[A-Z]|[A-Z]?\\d+)\\.\\d`).test(text)) return "dotted_table";
    if (/\brow\b/.test(text) && !/\brow ["']/.test(text)) return "table_unquoted_row";
    if (/\brow\b/.test(text)) return "table_row_unmatched";
    return "table_no_row_keyword";
  }
  if (/\bTable\b|'Suppl/.test(text)) return "sheet_cell";
  if (new RegExp(`^${PREFIX}(?:Figure|Fig\\.)`, "i").test(text)) return "figure";
  if (/(?:^|[\s,;])(?:\$|data|entries|results|root|leaderboard)(?:\.[\p{L}\p{N}_%+() -]+|\[\d+\])+/u.test(text)) return "json_path";
  if (/\b(?:line|lines|row|rows)\s*\d/i.test(text)) return "line_addressed";
  if (/\bcol(?:umn)?\b/i.test(text)) return "identifier_column";
  return "other";
}
