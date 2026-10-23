// Browser-safe: OverdueMark imports this without the server-side reader.

/** Whether a follow-up's next check date has passed. Dates are ISO (YYYY-MM-DD) and compare as text.
 * Pages are cached at the edge for days, so they decide this in the browser (OverdueMark). */
export function overdue(nextCheck: string | null, today: string | Date): boolean {
  if (!nextCheck || !/^\d{4}-\d{2}-\d{2}/.test(nextCheck)) return false;
  const day = typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return nextCheck.slice(0, 10) < day;
}
