/** Read-only discovery refresh. Writes a review report, never modifies catalogue records. */
import fs from "node:fs";
import path from "node:path";
const input = [
  "data/omics/discovery.jsonl",
  "data/omics/migrated.jsonl",
].flatMap((p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l)),
);
const sources = input.filter(
  (r) =>
    r.kind === "source" &&
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\//.test(
      r.attributes.url,
    ),
);
async function main() {
  const updates = [];
  for (const r of sources) {
    const u = new URL(r.attributes.url);
    const [, owner, repo, , revision] = u.pathname.split("/");
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/HEAD`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            ...(process.env.GITHUB_TOKEN
              ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
              : {}),
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      updates.push({
        source_id: r.id,
        checked_at: new Date().toISOString(),
        pinned_revision: revision,
        current_revision: data.sha,
        status: revision === data.sha ? "unchanged" : "review_required",
        url: data.html_url,
      });
    } catch (error) {
      updates.push({
        source_id: r.id,
        status: "blocked",
        reason: String(error),
      });
    }
  }
  const target = process.argv[2] ?? "workbench/omics-update-report.json";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        scope:
          "Pinned GitHub project heads only; publication/retraction checks and unversioned websites require the documented manual source sweep.",
        updates,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Checked ${updates.length} pinned project sources. Review report: ${target}`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
