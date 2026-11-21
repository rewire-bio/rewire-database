/**
 * How a record's own review status is worded. No imports, so client components can use it.
 *
 * The release marks some of Rewire's own reruns `reproduced` without a run receipt, and a Rewire
 * run is not independent (lib/result-origin.ts). The site says "Reproduced" only where a run
 * receipt is cited (reviewOf in lib/use-case-ranking.ts), so the record's own status is never
 * printed as that word: it reads as a recorded rerun, which is true with or without a receipt.
 */
export const REPRODUCED_STATUS_LABEL = "Rerun recorded";

/** A record status in running text: "source checked", "needs review", and "rerun recorded" for `reproduced`. */
export const statusText = (status: string) => (status === "reproduced" ? REPRODUCED_STATUS_LABEL.toLowerCase() : status.replace(/_/g, " "));
