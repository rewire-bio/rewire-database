/** Search spellings for model families, not equivalence of checkpoints or protocols. */
const MODEL_ALIASES: readonly (readonly string[])[] = [
  ["Nucleotide Transformer v2", "NT-v2", "NucleotideTransformer v2"],
  ["AutoDock Vina", "Vina"],
  ["RNA-FM", "RNAFM"],
  ["mRNA-FM", "mRNAFM"],
];

function normalizeModelName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NORMALIZED_ALIASES = MODEL_ALIASES.map((aliases) => aliases.map(normalizeModelName));

/**
 * Add to ordinary full-text matching for catalog model links and model-name queries.
 * Token boundaries handle EVO2 / Evo 2 and DNABERT2-Enhancer / DNABERT-2 while
 * preserving distinctions such as Evo 2 / Evo 20 and RNA-FM / mRNA-FM.
 * Version-specific queries do not expand to unspecified or other model versions.
 */
export function matchesBenchmarkModelQuery(modelLabel: string, query: string): boolean {
  const normalizedQuery = normalizeModelName(query);
  if (!normalizedQuery) return false;
  const aliases = NORMALIZED_ALIASES.find((group) => group.includes(normalizedQuery)) ?? [normalizedQuery];
  const normalizedLabel = ` ${normalizeModelName(modelLabel)} `;
  return aliases.some((alias) => normalizedLabel.includes(` ${alias} `));
}
