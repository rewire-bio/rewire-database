/**
 * Use-case boards read from the pinned release's public/omics/boards/<release_id>.json. Server only.
 * Releases made before boards existed have no such file; the page then shows no board.
 */

import fs from "node:fs";
import { boardsProblems, type Board, type BoardRow, type BoardsFile, type NotRanked } from "./boards";
import { dataPath } from "./data-pin";

export type { Board, BoardRow, NotRanked };

export const boardsPath = (releaseId: string) => dataPath("public", "omics", "boards", `${releaseId}.json`);

const files = new Map<string, { file: BoardsFile; bySlug: Map<string, Board> } | null>();

function readBoards(file: string, releaseId: string): { file: BoardsFile; bySlug: Map<string, Board> } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Ignoring unreadable boards file ${file}: ${String(error)}`);
    return null;
  }
  const problems = boardsProblems(raw, releaseId);
  if (problems.length) {
    console.warn(`Ignoring invalid boards file ${file}:\n${problems.slice(0, 5).join("\n")}`);
    return null;
  }
  const parsed = raw as BoardsFile;
  return { file: parsed, bySlug: new Map(parsed.boards.map((board) => [board.use_case, board])) };
}

/** The validated boards file for the release, or null when the release has no valid boards file. */
export function releaseBoardsFile(releaseId: string): BoardsFile | null {
  const file = boardsPath(releaseId);
  if (!files.has(file)) files.set(file, readBoards(file, releaseId));
  return files.get(file)?.file ?? null;
}

/** Every board in the release by use-case slug, or null when the release has no valid boards file. */
export function releaseBoards(releaseId: string): Map<string, Board> | null {
  const file = boardsPath(releaseId);
  if (!files.has(file)) files.set(file, readBoards(file, releaseId));
  return files.get(file)?.bySlug ?? null;
}

/** The use case's board when it ranks at least two models; null otherwise. */
export function useCaseBoard(releaseId: string, slug: string): Board | null {
  const board = releaseBoards(releaseId)?.get(slug);
  return board && board.rows.length >= 2 ? board : null;
}

/** "1 to 3", or one number when the position is settled. */
export function positionText([best, worst]: BoardRow["positions"]): string {
  return best === worst ? String(best) : `${best} to ${worst}`;
}

const percent = (share: number) => Math.round(share * 100);

/** Strength as a whole percent: 0.869 is "87%". */
export function strengthText(strength: number): string {
  return `${percent(strength)}%`;
}

/** The interval as "83% to 92%", or one percent when both ends round to it. */
export function intervalText([low, high]: BoardRow["interval"]): string {
  return percent(low) === percent(high) ? `${percent(low)}%` : `${percent(low)}% to ${percent(high)}%`;
}

export const REASON_TEXT: Record<NotRanked["reason"], string> = {
  "one study": "compared in one study only",
  "not a model record": "not a model record",
  "not compared with the main group": "not compared with the main group of models",
  "no second model to rank": "no second model to rank it against",
};

export const BASIS_TEXT: Record<BoardRow["basis"], string> = {
  "several studies": "Several studies",
  "mostly one study": "Mostly one study",
};
