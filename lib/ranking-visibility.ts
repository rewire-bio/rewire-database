/**
 * Whether pages show the per-use-case leaderboard, takeaways and hardware telemetry built from
 * the hand-written rows in lib/use-case-leaderboard.ts and lib/operational-telemetry.ts.
 *
 * Off because those rows are not from the evidence store: their source_record_id values do not
 * resolve, eight are badged "reproduced" with no run receipt, and the baselines and telemetry
 * are not sourced (#229). The components and modules stay in place so the UI comes back as soon
 * as the rows are generated from the release (#218). The state as first shipped is tagged
 * antigravity-leaderboards-20261118.
 */
export const SHOW_UNSOURCED_RANKINGS = false;
