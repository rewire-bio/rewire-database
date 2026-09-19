/**
 * Build run recipes from each benchmark project's own published instructions.
 *
 * Every snippet is cut from a README pinned to a commit, by line range, and the
 * artifact's hash is checked before anything is read. Nothing is retyped, so a
 * reader can open that file at that commit and see the same lines. Nothing is
 * executed here either, which is why every instruction is recorded as
 * source_reviewed_not_executed: claiming otherwise would need a receipt.
 *
 * The generated entries are rewritten in full on each run and the hand-written
 * ones are left alone, so re-running after a project updates its README
 * replaces the quotes rather than accumulating them.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS, type Project } from "./projects";

const ROOT = "data/omics/reviewed/run-recipes";
const PREFIX = "project-recipe-";
const DATE = "2026-09-19";
const REVIEWER = "Codex research agent; no human review claimed";

const sourceId = (project: Project) =>
  `${PREFIX}${project.key}-${project.commit.slice(0, 8)}`;

const COMMAND =
  /^\s*(pip|conda|git|python|python3|Rscript|bash|sh|export|cd|wget|curl|docker|podman|uv|mamba|from |import |>>> |\$ |[A-Za-z_][A-Za-z0-9_]* *=)/;

/**
 * The exact lines the instruction cites, with the file's own indentation.
 *
 * A range that catches a fence marker or a sentence is a mistake in the range,
 * not something to publish: the point of quoting by line is that the reader
 * sees code the project wrote. Both are refused here so the range gets fixed.
 */
function quote(readme: string, [from, to]: [number, number]) {
  const lines = readme.split("\n");
  if (from < 1 || to > lines.length || to < from)
    throw new Error(`Line range ${from}-${to} is outside the file`);
  const body = lines.slice(from - 1, to);
  const code = body.join("\n").replace(/\s+$/, "");
  if (!code.trim()) throw new Error(`Line range ${from}-${to} is blank`);
  if (/^\s*(```|~~~)/m.test(code))
    throw new Error(`Line range ${from}-${to} crosses a code fence`);
  if (!body.some((line) => COMMAND.test(line)))
    throw new Error(`Line range ${from}-${to} contains no command`);
  return code;
}

function build(dir: string) {
  const sources: Record<string, unknown>[] = [];
  const overlays: Record<string, unknown>[] = [];

  for (const project of PROJECTS) {
    const file = path.join(dir, `${project.key}.README`);
    const bytes = fs.readFileSync(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== project.sha256)
      throw new Error(
        `${project.key}: artifact hash ${digest} does not match the pinned ${project.sha256}`,
      );
    const readme = bytes.toString("utf8");
    const id = sourceId(project);
    const blob = `https://github.com/${project.repo}/blob/${project.commit}/README.md`;

    sources.push({
      id,
      kind: "source",
      name: `${project.name}: repository README`,
      description:
        "Pinned copy of the project's own instructions. Quoted, not executed.",
      status: "source_checked",
      facets: {},
      source_ids: [],
      links: [],
      attributes: {
        url: blob,
        version: project.commit,
        retrieved_at: DATE,
        artifact_sha256: digest,
        hash_scope: "complete file bytes",
        artifact_format: "text",
        source_locator: "README.md",
        review_method:
          "Commands quoted by line range from the pinned file; not executed",
      },
    });

    const locator = `README.md at ${project.commit.slice(0, 8)}`;
    overlays.push({
      id: project.benchmarkId,
      source_ids: [id],
      run_recipes: [
        {
          id: `${project.key}-official`,
          protocol_id: project.benchmarkId,
          version: project.commit,
          title: project.recipe.title,
          purpose: "generate_and_evaluate",
          summary: project.recipe.summary,
          inputs: project.recipe.inputs,
          outputs: project.recipe.outputs,
          requirements: {
            data: project.recipe.data,
            weights: project.recipe.weights,
            licence: `Project licence: ${project.licence}. Upstream data licences are separate and unreported here.`,
            software: project.recipe.software,
            hardware: project.recipe.hardware,
          },
          instructions: project.instructions.map((instruction) => ({
            runtime: instruction.runtime,
            title: instruction.title,
            code: quote(readme, instruction.lines),
            status: "source_reviewed_not_executed",
            source_ids: [id],
            source_locator: `${locator}, ${instruction.heading}, lines ${instruction.lines[0]}-${instruction.lines[1]}`,
          })),
          limitations: [
            "Quoted from the project's README and not executed by rewire, so the commands are evidence of what the project documents rather than a verified run.",
            "The project may have changed since the pinned commit.",
            ...project.recipe.limitations,
          ],
          source_ids: [id],
          source_locator: locator,
        },
      ],
    });
  }

  const keep = <T extends { id: string }>(items: T[]) =>
    items.filter((item) => !item.id.startsWith(PREFIX));
  const existingRecords = fs
    .readFileSync(`${ROOT}/records.jsonl`, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const existingOverlays = JSON.parse(
    fs.readFileSync(`${ROOT}/overlays.json`, "utf8"),
  );
  const generated = new Set(overlays.map((overlay) => overlay.id));

  fs.writeFileSync(
    `${ROOT}/records.jsonl`,
    [...keep(existingRecords), ...sources]
      .map((record) => JSON.stringify(record))
      .join("\n") + "\n",
  );
  fs.writeFileSync(
    `${ROOT}/overlays.json`,
    JSON.stringify(
      [
        ...existingOverlays.filter(
          (overlay: { id: string }) => !generated.has(overlay.id),
        ),
        ...overlays,
      ],
      null,
      2,
    ) + "\n",
  );

  const review = JSON.parse(fs.readFileSync(`${ROOT}/review.json`, "utf8"));
  review.date = DATE;
  review.reviewer = REVIEWER;
  review.method =
    "AI-assisted source review. Runner recipes from implementation inspection; project recipes quoted by line range from each project's pinned README. No human review implied.";
  review.execution_claims =
    "Source review only. No instruction snippet is claimed executed. Local scoring receipts for the runner's own protocols are maintained in the runner repository.";
  for (const name of ["records.jsonl", "overlays.json"])
    review.files[`${ROOT}/${name}`] = createHash("sha256")
      .update(fs.readFileSync(`${ROOT}/${name}`))
      .digest("hex");
  fs.writeFileSync(`${ROOT}/review.json`, JSON.stringify(review, null, 2) + "\n");

  console.log(
    `${sources.length} project sources, ${overlays.length} benchmark recipes, ${overlays.reduce(
      (total, overlay) =>
        total +
        (overlay.run_recipes as { instructions: unknown[] }[])[0].instructions
          .length,
      0,
    )} quoted instructions`,
  );
}

if (process.argv[1]?.endsWith("build.ts")) build(process.argv[2]);
