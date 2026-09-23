import { displayValue } from "./omics";

// Presentation only. Never use the rounded string for sorting or calculation.
// Match a complete scalar so source annotations and compound values stay intact.
const scalar = /^([<>≤≥~≈]?\s*)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(\s*%?)$/i;

export function formatScore(value: unknown): string {
  const text = displayValue(value);
  const match = text.match(scalar);
  if (!match) return text;
  const number = Number(match[2]);
  if (!Number.isFinite(number)) return text;
  // Preserve numbers outside JavaScript's range instead of turning them into 0.
  if (number === 0 && /[1-9]/.test(match[2].split(/e/i)[0])) return text;
  return `${match[1]}${Number(number.toPrecision(3))}${match[3]}`;
}
