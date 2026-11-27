/**
 * Which use cases each model reaches, from the release's use-case boards: ranked on a board, compared but
 * not ranked, or not compared at all.
 */
import type { Board, BoardGroup, BoardRow, BoardsFile, NotRanked } from "./boards";

export type DomainGroup = { id: string; label: string; useCases: [slug: string, label: string][] };

/** Groups of use cases that ask for the same kind of skill. Used as fallback when a release's boards file
 * does not carry its own group list. A use case not listed is left out. */
export const DOMAINS: DomainGroup[] = [
  { id: "variant", label: "Variant interpretation", useCases: [
    ["missense-pp3-bp4-calibrated-evidence", "Missense PP3/BP4"],
    ["brca1-brca2-germline-interpretation", "BRCA1/BRCA2"],
    ["rare-disease-candidate-ranking", "Rare disease ranking"],
    ["somatic-small-variant-oncogenicity", "Somatic oncogenicity"],
    ["egfr-nsclc-actionability-resistance-evidence", "EGFR in NSCLC"],
    ["unresolved-rare-disease-reanalysis", "Rare disease reanalysis"],
  ] },
  { id: "protein", label: "Proteins", useCases: [
    ["protein-variant-effect-prediction", "Protein variant effects"],
    ["protein-variant-stability", "Protein stability"],
    ["protein-representation-property-prediction", "Protein probing"],
    ["protein-function-annotation", "Protein function"],
    ["protein-design-quality", "Protein design"],
    ["structural-hypotheses-experiments", "Structural hypotheses"],
    ["de-novo-binder-design", "Binder design"],
    ["rhodopsin-wavelength-transfer", "Rhodopsin wavelength"],
    ["rna-structure-prediction", "RNA structure"],
    ["glycan-property-prediction", "Glycan properties"],
    ["lead-optimisation-affinity-ranking", "Affinity ranking"],
    ["hit-discovery-virtual-screening", "Virtual screening"],
  ] },
  { id: "regulatory", label: "Regulation and splicing", useCases: [
    ["genomic-sequence-element-annotation", "Genomic annotation"],
    ["regulatory-variant-gene-follow-up", "Regulatory variants"],
    ["splicing-follow-up", "Splicing follow-up"],
    ["patient-rna-splicing-validation", "Patient RNA splicing"],
    ["plant-promoter-reporters", "Plant promoters"],
    ["utr-translation-baselines", "UTR translation"],
  ] },
  { id: "cells", label: "Cells", useCases: [
    ["cell-type-annotation-transfer", "Cell type annotation"],
    ["single-cell-data-integration", "Single-cell integration"],
    ["genetic-perturbation-response", "Perturbation response"],
    ["phenotype-perturbation-selection", "Phenotype screens"],
    ["therapeutic-target-validation", "Target validation"],
  ] },
  { id: "diagnostics", label: "Sequencing and diagnostics", useCases: [
    ["tumour-dna-somatic-variant-detection", "Somatic variant calling"],
    ["cnv-detection-characterisation", "CNV detection"],
    ["tumour-rna-fusion-detection", "RNA fusions"],
    ["diagnostic-dna-pathogen-identification", "DNA pathogens"],
    ["diagnostic-rna-pathogen-detection", "RNA pathogens"],
    ["viral-microbial-sequence-classification", "Viral & microbial"],
    ["diagnostic-genomics-model-execution", "Running models"],
    ["plasma-ctdna-fragmentomics", "ctDNA fragments"],
    ["plasma-ctdna-methylation", "ctDNA methylation"],
    ["mass-spectrum-molecule-shortlisting", "Mass spectra"],
  ] },
];

export function domainGroups(groups?: readonly BoardGroup[]): DomainGroup[] {
  if (!groups?.length) return DOMAINS;
  return groups.map((g) => ({ id: g.id, label: g.label, useCases: g.use_cases }));
}

/** A board as this view needs it: `size` is the number of ranked rows, which positions are out of. */
export type ReachBoard = {
  use_case: string;
  size: number;
  rows: Pick<BoardRow, "model_id" | "name" | "positions">[];
  not_ranked: Pick<NotRanked, "model_id" | "name" | "reason">[];
};

export const reachBoard = (board: Board): ReachBoard => ({ use_case: board.use_case, size: board.rows.length, rows: board.rows, not_ranked: board.not_ranked });

export type ReachCell =
  | { state: "ranked"; best: number; worst: number; of: number }
  | { state: "compared"; reason: NotRanked["reason"] };

export type ReachColumn = { slug: string; label: string; domain: string };
export type ReachRow = { id: string; name: string; cells: Record<string, ReachCell>; domains: string[]; ranked: number };

export const RULE = "Model records ranked on at least one use-case board and compared on boards in at least two groups of use cases, most groups first, then most boards ranked.";

/** The rows and columns of the reach view. Rows follow RULE; columns are the use cases any row reaches, by group. */
export function modelReach(
  boards: ReachBoard[],
  kindOf: (id: string) => string | null,
  groups: readonly DomainGroup[] = DOMAINS,
): { rows: ReachRow[]; columns: ReachColumn[] } {
  const domainOf = new Map(groups.flatMap((d) => d.useCases.map(([slug]) => [slug, d.id] as const)));
  const models = new Map<string, { name: string; cells: Record<string, ReachCell> }>();
  const entry = (id: string, name: string) => {
    if (!models.has(id)) models.set(id, { name, cells: {} });
    return models.get(id)!;
  };
  for (const board of boards) {
    if (!domainOf.has(board.use_case)) continue;
    for (const r of board.rows)
      entry(r.model_id, r.name).cells[board.use_case] = { state: "ranked", best: r.positions[0], worst: r.positions[1], of: board.size };
    for (const r of board.not_ranked) {
      const model = entry(r.model_id, r.name);
      if (!model.cells[board.use_case]) model.cells[board.use_case] = { state: "compared", reason: r.reason };
    }
  }
  const rows: ReachRow[] = [];
  for (const [id, { name, cells }] of models) {
    if (kindOf(id) !== "model") continue;
    const ranked = Object.values(cells).filter((c) => c.state === "ranked").length;
    const domains = groups.map((d) => d.id).filter((d) => Object.keys(cells).some((slug) => domainOf.get(slug) === d));
    if (ranked >= 1 && domains.length >= 2) rows.push({ id, name, cells, domains, ranked });
  }
  rows.sort((a, b) => b.domains.length - a.domains.length || b.ranked - a.ranked || a.name.localeCompare(b.name));
  const reached = new Set(rows.flatMap((r) => Object.keys(r.cells)));
  const columns = groups.flatMap((d) => d.useCases.filter(([slug]) => reached.has(slug)).map(([slug, label]) => ({ slug, label, domain: d.id })));
  return { rows, columns };
}

/** Top `limit` rows ordered by the number of use-case boards a model is ranked on, with only the columns they reach. */
export function homeReach(
  rows: ReachRow[],
  columns: ReachColumn[],
  limit = 8,
): { rows: ReachRow[]; columns: ReachColumn[] } {
  const chosen = [...rows]
    .sort((a, b) => b.ranked - a.ranked || b.domains.length - a.domains.length || a.name.localeCompare(b.name))
    .slice(0, limit);
  const reached = new Set(chosen.flatMap((r) => Object.keys(r.cells)));
  return { rows: chosen, columns: columns.filter((c) => reached.has(c.slug)) };
}

/** Helper to derive reach directly from a release's boards file. */
export function reachFromBoardsFile(
  file: BoardsFile | null,
  kindOf: (id: string) => string | null,
): { rows: ReachRow[]; columns: ReachColumn[]; groups: DomainGroup[] } {
  const groups = domainGroups(file?.groups);
  if (!file) return { rows: [], columns: [], groups };
  const { rows, columns } = modelReach(file.boards.map(reachBoard), kindOf, groups);
  return { rows, columns, groups };
}

/** "8 to 17 of 44", or "1 of 6" when the position is settled. */
export function positionOf(cell: Extract<ReachCell, { state: "ranked" }>): string {
  return `${cell.best === cell.worst ? cell.best : `${cell.best} to ${cell.worst}`} of ${cell.of}`;
}

/** Where a position sits on its board, from 0 (last) to 1 (first). */
export const standing = (position: number, of: number) => (of <= 1 ? 1 : 1 - (position - 1) / (of - 1));

export const COMPARED_TEXT: Record<NotRanked["reason"], string> = {
  "one study": "compared in one study only",
  "not compared with the main group": "not compared with the main group",
  "no second model to rank": "no second model ranked",
  "not a model record": "not a model record",
};

/** The `count` rows ranked on the most boards, and the use cases any of them reaches, for a small set of radars. */
export function radarSet(rows: ReachRow[], columns: ReachColumn[], count = 4): { rows: ReachRow[]; columns: ReachColumn[] } {
  const chosen = [...rows].sort((a, b) => b.ranked - a.ranked || b.domains.length - a.domains.length || a.name.localeCompare(b.name)).slice(0, count);
  return { rows: chosen, columns: columns.filter((c) => chosen.some((r) => r.cells[c.slug])) };
}
