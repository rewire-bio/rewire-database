/**
 * What the independence page states: the two statements only the owner can make, and the figures
 * it prints from the release. Pure: boards, counts and rule tallies are passed in, so the page and
 * its tests work from the same functions and the tests can exercise states the pinned release is
 * not in.
 */

import type { LeaderboardResult } from "./use-case-leaderboard";

/**
 * Statements on the independence page that only the owner can make. A null field is printed as
 * "not stated yet": the page must not describe funding or affiliations that nobody has stated.
 * While either is null the page says the policy is incomplete and does not call the project
 * independent in its own words.
 */
export interface OwnerStatements {
  /** Who pays for the project, in the owner's words. */
  funding: string | null;
  /** The maintainer's employment and other affiliations that bear on the models listed here. */
  affiliations: string | null;
}

export const OWNER_STATEMENTS: OwnerStatements = {
  funding: null,
  affiliations: null,
};

export const NOT_STATED = "Not stated yet.";
/** Printed under the two statements while either is missing. */
export const POLICY_INCOMPLETE = "This policy is incomplete until both are stated. Until then it makes no claim about who funds the project or what other interests its maintainer has.";
/** The conflicts section, when the owner has stated affiliations and when not. */
export const OTHER_INTERESTS_STATED = "Other interests that bear on the models listed here are given under Affiliations above.";
export const OTHER_INTERESTS_NOT_STATED = "The maintainer's affiliations and any other interests that bear on the models listed here are not stated yet, so this section is incomplete.";

export const ownerStatementsComplete = (statements: OwnerStatements) => statements.funding !== null && statements.affiliations !== null;

export const countOf = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/**
 * What follows "Release X holds" on the page. A row reads Reproduced only when it cites a run
 * receipt, so the sentence is worked out from the two counts and claims nothing beyond them.
 */
export function receiptSentence(receipts: number, receiptedRows: number): string {
  if (receipts === 0) return "no run receipts, so no row on any board reads Reproduced.";
  const held = `${countOf(receipts, "run receipt", "run receipts")}.`;
  if (receiptedRows === 0) return `${held} No ranked row cites one, so no row on any board reads Reproduced.`;
  return `${held} ${countOf(receiptedRows, "ranked row cites", "ranked rows cite")} one and ${receiptedRows === 1 ? "reads" : "read"} Reproduced.`;
}

export interface PolicyBoard {
  slug: string;
  title: string;
  href: string;
  proxy: boolean;
}

export interface PolicyFacts {
  receipts: number;
  /** Ranked rows, over every board, that cite a run receipt. */
  receiptedRows: number;
  /** Ranked rows over every board. */
  rankedRows: number;
  /** Ranked rows whose evaluation has origin "unreported": the source does not say who ran the tool. */
  unreportedRows: number;
  /** Ranked rows whose evaluation record has no origin at all. */
  noOriginRows: number;
  /** Boards that rank something, and how many of them rank on a proxy protocol. */
  rankedBoards: number;
  proxyBoards: number;
  /** The boards the homepage shows, in its order. */
  home: PolicyBoard[];
  /** Boards that meet the homepage rule and are left off by hand, with the reason the code gives. */
  leftOut: (PolicyBoard & { reason: string })[];
  /** Findings per rule, most first; null when the release has no discrepancy data. "" is a resolved finding. */
  rules: { rule: string; findings: number }[] | null;
  findings: number;
}

const policyBoard = (board: LeaderboardResult): PolicyBoard => ({
  slug: board.use_case_slug,
  title: board.use_case_title,
  href: board.use_case_href,
  proxy: board.protocol?.relevance === "proxy",
});

export function policyFacts(input: {
  /** Every use case's board. */
  boards: LeaderboardResult[];
  /** The boards the homepage shows, in its order. */
  homeBoards: LeaderboardResult[];
  /** Use-case slug to the reason it is left off the homepage. */
  leftOut: Readonly<Record<string, string>>;
  receipts: number;
  /** Findings per rule from the release's discrepancy data; null when it has none. */
  ruleCounts: Readonly<Record<string, number>> | null;
}): PolicyFacts {
  const rows = input.boards.flatMap((board) => board.rows);
  const ranked = input.boards.filter((board) => board.protocol && board.rows.length > 0);
  const bySlug = new Map(input.boards.map((board) => [board.use_case_slug, board]));
  const rules = input.ruleCounts
    ? Object.entries(input.ruleCounts)
      .map(([rule, findings]) => ({ rule, findings }))
      .sort((a, b) => b.findings - a.findings || a.rule.localeCompare(b.rule))
    : null;
  return {
    receipts: input.receipts,
    receiptedRows: rows.filter((row) => row.receipt).length,
    rankedRows: rows.length,
    unreportedRows: rows.filter((row) => row.origin === "unreported").length,
    noOriginRows: rows.filter((row) => !row.origin).length,
    rankedBoards: ranked.length,
    proxyBoards: ranked.filter((board) => board.protocol?.relevance === "proxy").length,
    home: input.homeBoards.map(policyBoard),
    leftOut: Object.entries(input.leftOut).flatMap(([slug, reason]) => {
      const board = bySlug.get(slug);
      return board ? [{ ...policyBoard(board), reason }] : [];
    }),
    rules,
    findings: rules ? rules.reduce((n, r) => n + r.findings, 0) : 0,
  };
}
