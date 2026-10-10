import { unitSuffix } from "./metric-labels";

// Presentation only. Sorting and the best-value marker use `value`, never the formatted text,
// and every formatted cell keeps the printed value in its title.

/** One printed result, read for display. */
export type Reading = {
  printed: string;
  /** The number on the display scale (percent when the page shows the metric as a percentage), or null. */
  value: number | null;
  /** Decimal places as printed, after any rescaling. */
  decimals: number;
  /** Computed values printed with more than four decimals are rounded to three significant figures. */
  long: boolean;
  prefix: string;
  suffix: string;
  /** Printed text after the number, such as " ± 0.0015" or " (103 of 110)". */
  rest: string;
  /** Text shown instead of a formatted number: source wording, or a note when no number could be read. */
  verbatim: string | null;
  missing: boolean;
  note: string | null;
};

export type ReadingInput = {
  printed: string | null; numeric: number | null; unit: string | null;
  anomaly?: string | null; undefinedReason?: string | null;
};

const NUMBER = /^([<>≤≥~≈]?\s*)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(\s*%)?(.*)$/i;
const MISSING = /^(nan|na|n\/a|nd|n\.d\.|undefined|null|none|-|–|—)$/i;
// Only an uncertainty after the number is rescaled with it; any other trailing text keeps the printed scale.
const SCALABLE_REST = /^\s*(?:±\s*\d*\.?\d+|\(\s*\d*\.?\d+\s*[–-]\s*\d*\.?\d+\s*\))?\s*$/;

const decimalsOf = (token: string) => (token.split(/e/i)[0].split(".")[1] ?? "").length;
const percentOf = (token: string) => {
  const decimals = Math.max(0, decimalsOf(token) - 2);
  return { value: Number((Number(token) * 100).toFixed(decimals)), decimals };
};

/** Reads a printed value. `asPercent` shows a fraction as a percentage, for pages that print the metric both ways. */
export function readValue(input: ReadingInput, asPercent = false): Reading {
  const printed = (input.printed ?? "").trim();
  const base = { printed, value: null, decimals: 0, long: false, prefix: "", suffix: "", rest: "", missing: false, note: null };
  if (input.numeric === null) {
    if (!printed) return { ...base, verbatim: "Not reported", missing: true };
    if (input.anomaly) return { ...base, verbatim: "Unreadable in source", missing: true, note: input.anomaly };
    if (input.undefinedReason) return { ...base, verbatim: "Undefined", missing: true, note: input.undefinedReason };
    if (MISSING.test(printed)) return { ...base, verbatim: "Not reported", missing: true };
    return { ...base, verbatim: printed };
  }
  const match = printed.match(NUMBER);
  let token: string, prefix = "", percent = input.unit === "percent", rest = "";
  if (match && Number(match[2]) === input.numeric) {
    [, prefix, token] = match;
    // Keep a printed plus sign ("+2.083"), which marks direction in likelihood ratios.
    if (token.startsWith("+")) { prefix += "+"; token = token.slice(1); }
    percent ||= !!match[3];
    rest = match[4];
  } else if (/^\d+,\d+$/.test(printed) && Number(printed.replace(",", ".")) === input.numeric) {
    token = printed.replace(",", ".");
  } else {
    // Printed in a form a number cannot reproduce ("37/40 (92.5%)", "0:12:00", "1,095"): show it as printed.
    return { ...base, value: input.numeric, verbatim: printed };
  }
  const long = decimalsOf(token) > 4 || /e/i.test(token);
  if (asPercent && input.unit === "fraction" && SCALABLE_REST.test(rest)) {
    const { value, decimals } = percentOf(token);
    rest = rest.replace(/\d*\.?\d+/g, (t) => String(percentOf(t).value));
    return { ...base, value, decimals, long, prefix, suffix: "%", rest, verbatim: null };
  }
  return { ...base, value: Number(token), decimals: decimalsOf(token), long, prefix, suffix: percent ? "%" : unitSuffix(input.unit), rest, verbatim: null };
}

const significant = (value: number) => (value === 0 ? 0 : Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value)))));
const scientific = (r: Reading) => r.long && r.value !== null && r.value !== 0 && Math.abs(r.value) < 0.001;
const ownDecimals = (r: Reading) => (r.long && r.value !== null ? Math.min(r.decimals, significant(r.value)) : r.decimals);

/** Decimal places for a column: enough for its most precise value, rounding long computed values first. */
export function columnDecimals(readings: (Reading | null)[]): number | undefined {
  const shown = readings.filter((r): r is Reading => !!r && r.verbatim === null && r.value !== null && !scientific(r));
  return shown.length ? Math.max(...shown.map(ownDecimals)) : undefined;
}

const SUPERSCRIPT: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
function formatNumber(r: Reading, decimals: number) {
  const value = r.value as number;
  if (scientific(r)) {
    const [mantissa, exponent] = value.toExponential(2).split("e");
    return `${mantissa} × 10${exponent.replace("+", "").replace(/./g, (c) => SUPERSCRIPT[c] ?? c)}`;
  }
  return value.toFixed(Math.min(decimals, 20));
}

/** The text a reading shows, at the column's decimals when given, and a title with the printed value when they differ. */
export function formatReading(r: Reading, decimals?: number): { text: string; title?: string; missing: boolean } {
  const text = r.verbatim ?? `${r.prefix}${formatNumber(r, decimals ?? ownDecimals(r))}${r.suffix}${r.rest.replace(/\d+\.\d{5,}/g, (t) => String(Number(Number(t).toPrecision(3))))}`;
  // Adding the unit alone ("27.05" shown as "27.05 min") does not change what was printed.
  const printed = r.printed && text !== r.printed && text !== r.printed + r.suffix ? `Printed ${r.printed}` : "";
  const title = [printed, r.note].filter(Boolean).join(". ") || undefined;
  return { text, ...(title ? { title } : {}), missing: r.missing };
}
