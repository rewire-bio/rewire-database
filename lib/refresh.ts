import { z } from "zod";

const date = z.string().datetime({ offset: true });
const text = z.string().trim().min(1);
const id = text.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const releaseId = z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const href = text.refine((value) => {
  if (/[\s\\\u0000-\u001f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Expected a safe HTTP(S) or site-relative URL");

const runSchema = z.object({
  id, cycle_id: id, attempt: count.min(1),
  status: z.enum(["running", "completed", "blocked", "failed"]),
  started_at: date, finished_at: date.nullable(), baseline_release_id: releaseId,
  outcome: z.enum(["no_change", "review_required"]).nullable(),
  coverage: z.object({ target_ids: z.array(id), checked_ids: z.array(id), gaps: z.array(text) }).strict(),
  counts: z.object({ added: count, revised: count, excluded: count, blocked: count }).strict(),
  report_url: href.nullable(), pr_url: href.nullable(),
}).strict().superRefine((run, context) => {
  const problem = (message: string) => context.addIssue({ code: "custom", message });
  if (run.status === "running" ? run.finished_at !== null : run.finished_at === null)
    problem("Only running attempts may lack a finish time");
  if (run.finished_at && Date.parse(run.finished_at) < Date.parse(run.started_at))
    problem("Run finishes before it starts");
  if (run.status === "completed" ? run.outcome === null : run.outcome !== null)
    problem("Only completed attempts have a final outcome");
  for (const entries of [run.coverage.target_ids, run.coverage.checked_ids])
    if (new Set(entries).size !== entries.length) problem("Duplicate coverage ID");
  if (run.coverage.checked_ids.some((entry) => !run.coverage.target_ids.includes(entry)))
    problem("Checked coverage must belong to the declared target scope");
});

const updateSchema = z.object({
  release_id: releaseId, manifest_sha256: hash,
  commit: z.string().regex(/^[a-f0-9]{40}$/), published_at: date,
  time_basis: z.enum(["observed", "deployment"]),
  maintenance_run_id: id.nullable(), summary: z.array(text).min(1),
  links: z.array(z.object({ label: text, url: href }).strict()), receipt_url: href,
}).strict();

const refreshSchema = z.object({
  schema_version: z.literal("1.0"), generated_at: date,
  schedule: z.object({ status: z.enum(["planned", "active", "paused"]),
    timezone: z.literal("Europe/London"), description: text, next_due_at: date,
    maintainer: text.nullable() }).strict(),
  runs: z.array(runSchema), updates: z.array(updateSchema),
}).strict().superRefine((value, context) => {
  const runs = new Set(value.runs.map((run) => run.id));
  if (runs.size !== value.runs.length)
    context.addIssue({ code: "custom", message: "Duplicate maintenance run ID" });
  const attempts = value.runs.map((run) => `${run.cycle_id}:${run.attempt}`);
  if (new Set(attempts).size !== attempts.length)
    context.addIssue({ code: "custom", message: "Duplicate cycle attempt" });
  const updates = value.updates.map((update) => `${update.release_id}:${update.commit}`);
  if (new Set(updates).size !== updates.length)
    context.addIssue({ code: "custom", message: "Duplicate publication receipt" });
  for (const update of value.updates)
    if (update.maintenance_run_id && !runs.has(update.maintenance_run_id))
      context.addIssue({ code: "custom", message: "Publication references an unknown maintenance run" });
});

export type RefreshData = z.infer<typeof refreshSchema>;
export type RefreshRun = RefreshData["runs"][number];
export type RefreshUpdate = RefreshData["updates"][number];

export function parseRefresh(value: unknown): RefreshData {
  return refreshSchema.parse(value);
}

/** Only publication receipts bound to the adopted catalogue become live entries. */
export function adoptRefresh(data: RefreshData, release: string, manifestSha256: string,
  archivedManifests: Readonly<Record<string, string>> = {}): RefreshData {
  // The loader vets archive chronology from released_at, not hash suffixes.
  const updates = data.updates.filter((update) => update.release_id === release ||
    Object.prototype.hasOwnProperty.call(archivedManifests, update.release_id));
  if (updates.some((update) => update.manifest_sha256 !==
    (update.release_id === release ? manifestSha256 : archivedManifests[update.release_id])))
    throw new Error("Refresh publication receipt does not match its adopted or archived release manifest");
  return { ...data, updates: updates.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)) };
}

export function lastCompletedSweep(data: RefreshData): RefreshRun | undefined {
  return data.runs.filter((run) => run.status === "completed" && !run.cycle_id.startsWith("correction-")).sort(
    (a, b) => Date.parse(b.finished_at!) - Date.parse(a.finished_at!),
  )[0];
}

export function reviewOverdue(data: RefreshData, now: number): boolean {
  const due = Date.parse(data.schedule.next_due_at);
  // The producer owns cycle accounting. A late retry can finish after another
  // monthly review is due without satisfying that newer cycle.
  return data.schedule.status !== "paused" && now > due;
}

export function refreshDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(value));
}

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function publicationFeed(data: RefreshData | null): string {
  const origin = "https://benchmarks.rewirebio.io";
  const updates = [...(data?.updates ?? [])].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  // A fixed empty-feed date avoids falsely announcing a publication on build.
  const updated = updates[0]?.published_at ?? "1970-01-01T00:00:00Z";
  const entries = updates.map((update) => {
    const link = `${origin}/updates/#release-${update.release_id}-${update.commit}`;
    return `<entry><id>${xml(link)}</id><title>${xml(`Database update ${update.release_id}`)}</title><updated>${xml(update.published_at)}</updated><published>${xml(update.published_at)}</published><link href="${xml(link)}"/><summary>${xml(update.summary.join("\n"))}</summary></entry>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>${origin}/updates/</id><title>Rewire database published updates</title><updated>${xml(updated)}</updated><author><name>Rewire</name></author><link href="${origin}/updates/"/><link rel="self" href="${origin}/updates/feed.xml" type="application/atom+xml"/>${entries}</feed>\n`;
}
