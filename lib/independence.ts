/**
 * Statements on the independence page that only the owner can make. A null field is printed as
 * "not stated yet": the page must not describe funding or affiliations that nobody has stated.
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
