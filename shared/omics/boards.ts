/** The use-case boards file a release publishes at public/omics/boards/<release_id>.json.
 * kb/board.py writes it; docs/boards.md describes it for readers. A release made before
 * boards existed has no such file, so a reader treats a missing file as "no boards". */

export const BOARDS_SCHEMA_VERSION = 1;
export const NOT_RANKED_REASONS = ["not a model record", "one study", "not compared with the main group", "no second model to rank"] as const;
export const BASES = ["several studies", "mostly one study"] as const;

export type BoardRow = {
  model_id: string;
  /** Every record merged into this row; model_id is the lowest model record among them. */
  record_ids: string[];
  name: string;
  /** Best and worst position the comparisons support; equal when the position is settled. */
  positions: [number, number];
  /** Chance of beating an average model on the board, 0 to 1. */
  strength: number;
  /** Lowest and highest strength across the refits with one study left out. */
  interval: [number, number];
  /** Study id to the number of comparisons this model took part in there. Keys index Board.studies. */
  studies: Record<string, number>;
  opponents: number;
  comparisons: number;
  basis: (typeof BASES)[number];
};

export type NotRanked = { model_id: string; name: string; reason: (typeof NOT_RANKED_REASONS)[number]; study_ids: string[] };

export type BoardCounts = {
  studies: number; groups: number; models: number; ranked: number;
  one_study: number; not_a_model: number; not_connected: number; too_few: number;
};

export type Board = {
  use_case: string;
  use_case_id: string;
  title: string;
  release_id: string;
  released_at: string | null;
  method: string;
  summary: string;
  counts: BoardCounts;
  rows: BoardRow[];
  not_ranked: NotRanked[];
  /** Each study a row or a not-ranked model cites: its source records and their DOIs. */
  studies: Record<string, { source_ids: string[]; dois: string[] }>;
};

export type BoardsFile = { schema_version: number; release_id: string; released_at: string | null; method: string; boards: Board[] };

const COUNT_KEYS = ["studies", "groups", "models", "ranked", "one_study", "not_a_model", "not_connected", "too_few"] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isShare = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);

/** Every way the value fails to be a boards file, as messages; empty when it is one. */
export function boardsProblems(raw: unknown, releaseId?: string): string[] {
  const problems: string[] = [];
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);
  if (!isObject(raw)) return ["file: not an object"];
  if (raw.schema_version !== BOARDS_SCHEMA_VERSION) fail("file", `schema_version is not ${BOARDS_SCHEMA_VERSION}`);
  if (!isText(raw.release_id)) fail("file", "release_id missing");
  if (releaseId !== undefined && raw.release_id !== releaseId) fail("file", `release_id is ${String(raw.release_id)}, not ${releaseId}`);
  if (raw.released_at !== null && !isText(raw.released_at)) fail("file", "released_at is neither a date nor null");
  if (!isText(raw.method)) fail("file", "method missing");
  if (!Array.isArray(raw.boards)) return [...problems, "file: boards is not a list"];
  const slugs = new Set<string>();
  raw.boards.forEach((b: unknown, i: number) => {
    const where = `board ${i}`;
    if (!isObject(b)) return fail(where, "not an object");
    const at = isText(b.use_case) ? b.use_case : where;
    if (!isText(b.use_case)) fail(where, "use_case missing");
    else if (slugs.has(b.use_case)) fail(at, "use case appears twice");
    else slugs.add(b.use_case);
    for (const key of ["use_case_id", "title", "method", "summary"]) if (!isText(b[key])) fail(at, `${key} missing`);
    if (b.release_id !== raw.release_id) fail(at, "release_id differs from the file's");
    if (b.released_at !== raw.released_at) fail(at, "released_at differs from the file's");
    const counts = isObject(b.counts) ? b.counts : {};
    for (const key of COUNT_KEYS) if (!isCount(counts[key])) fail(at, `counts.${key} is not a count`);
    const rows = Array.isArray(b.rows) ? b.rows : (fail(at, "rows is not a list"), []);
    const notRanked = Array.isArray(b.not_ranked) ? b.not_ranked : (fail(at, "not_ranked is not a list"), []);
    const studies = isObject(b.studies) ? b.studies : (fail(at, "studies is not an object"), {});
    if (rows.length === 1) fail(at, "a board has no rows or at least two");
    if (counts.ranked !== rows.length) fail(at, "counts.ranked differs from the number of rows");
    const listed = COUNT_KEYS.slice(3).reduce((sum, key) => sum + (isCount(counts[key]) ? counts[key] : 0), 0);
    if (counts.models !== listed) fail(at, "counts.models is not the sum of ranked and not-ranked counts");
    if (notRanked.length !== listed - rows.length) fail(at, "not_ranked length differs from the not-ranked counts");
    const cited = new Set<string>();
    let previous = Infinity;
    rows.forEach((r: unknown, j: number) => {
      const row = `${at} row ${j + 1}`;
      if (!isObject(r)) return fail(row, "not an object");
      if (!isText(r.model_id) || !isText(r.name)) fail(row, "model_id or name missing");
      if (!isTexts(r.record_ids) || !r.record_ids.includes(r.model_id as string)) fail(row, "record_ids must list model_id");
      const [best, worst] = Array.isArray(r.positions) && r.positions.length === 2 ? r.positions : [NaN, NaN];
      if (!Number.isInteger(best) || !Number.isInteger(worst) || best < 1 || best > worst || worst > rows.length)
        fail(row, "positions must be [best, worst] within the board");
      else if (best > j + 1 || worst < j + 1) fail(row, "positions do not contain the row's place");
      if (!isShare(r.strength)) fail(row, "strength is not between 0 and 1");
      else if (r.strength > previous) fail(row, "rows are not in order of strength");
      else previous = r.strength;
      const [low, high] = Array.isArray(r.interval) && r.interval.length === 2 ? r.interval : [NaN, NaN];
      if (!isShare(low) || !isShare(high) || low > (r.strength as number) || high < (r.strength as number))
        fail(row, "interval must contain the strength");
      const perStudy = isObject(r.studies) ? Object.entries(r.studies) : [];
      if (perStudy.length < 2) fail(row, "a ranked row rests on at least two studies");
      if (!perStudy.every(([, n]) => isCount(n) && n > 0)) fail(row, "studies must map to comparison counts");
      if (perStudy.reduce((sum, [, n]) => sum + (n as number), 0) !== r.comparisons) fail(row, "comparisons is not the sum over studies");
      if (!isCount(r.opponents) || r.opponents < 1) fail(row, "opponents is not a positive count");
      if (!(BASES as readonly unknown[]).includes(r.basis)) fail(row, `basis ${String(r.basis)} is not one of ${BASES.join(", ")}`);
      for (const [study] of perStudy) cited.add(study);
    });
    notRanked.forEach((x: unknown, j: number) => {
      const entry = `${at} not_ranked ${j}`;
      if (!isObject(x)) return fail(entry, "not an object");
      if (!isText(x.model_id) || !isText(x.name)) fail(entry, "model_id or name missing");
      if (!(NOT_RANKED_REASONS as readonly unknown[]).includes(x.reason)) fail(entry, `reason ${String(x.reason)} is unknown`);
      if (!isTexts(x.study_ids) || !x.study_ids.length) fail(entry, "study_ids missing");
      else for (const study of x.study_ids) cited.add(study);
    });
    for (const study of cited) {
      const entry = studies[study];
      if (!isObject(entry) || !isTexts(entry.source_ids) || !isTexts(entry.dois)) fail(at, `study ${study} has no source list`);
    }
  });
  return problems;
}

/** The boards file, checked; throws with every problem found. */
export function parseBoards(raw: unknown, releaseId?: string): BoardsFile {
  const problems = boardsProblems(raw, releaseId);
  if (problems.length) throw new Error(`Invalid boards file (${problems.length} problems):\n${problems.slice(0, 20).join("\n")}`);
  return raw as BoardsFile;
}
