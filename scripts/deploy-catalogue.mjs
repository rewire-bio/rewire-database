import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { deployCatalogue, hostingVersion } from "./deployment-transaction.mjs";
import { contributionProbeMode } from "./contribution-deployment.mjs";
const contributionProbeArgument = `--contributions=${contributionProbeMode()}`;

// Run only from the reviewed deployment workflow with WIF/ADC. Tests exercise
// deployment-transaction.mjs using injected operations and never contact production.
const project = process.env.GCLOUD_PROJECT;
if (project !== "rewire-it" || process.env.NODE_ENV !== "production")
  throw new Error(
    "Catalogue deployment requires the explicit production project and environment.",
  );
const site = "rewire-it";
const manifest = JSON.parse(
  await readFile(
    new URL("../public/omics/manifest.json", import.meta.url),
    "utf8",
  ),
);
async function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    let output = "";
    child.stdout?.on("data", (data) => {
      output += data;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} ${args[0]} failed (${code})`)),
    );
  });
}
const firebase = (...args) =>
  run("npx", [
    "--no-install",
    "firebase",
    ...args,
    "--project",
    project,
    "--non-interactive",
  ]);
const importer = (...args) =>
  run("node", ["--import", "tsx", "services/omics/src/import-cli.ts", ...args]);
await deployCatalogue({
  async capture() {
    const current = JSON.parse(
      await run(
        "node",
        ["--import", "tsx", "services/omics/src/import-cli.ts", "--current"],
        true,
      ),
    );
    const listing = JSON.parse(
      await run(
        "npx",
        [
          "--no-install",
          "firebase",
          "hosting:channel:list",
          "--site",
          site,
          "--project",
          project,
          "--non-interactive",
          "--json",
        ],
        true,
      ),
    );
    const version = hostingVersion(listing, project, site);
    const previous = {
      release_id: current.release_id,
      hosting_version: version,
    };
    console.log("Rollback target:", JSON.stringify(previous));
    return previous;
  },
  importRelease: () =>
    importer("public/omics/catalogue.json", "public/omics/manifest.json"),
  activate: () => importer("--activate", manifest.release_id),
  verifyApi: () =>
    run("node", [
      "scripts/check-live-catalogue.mjs",
      "https://europe-west2-rewire-it.cloudfunctions.net/contributions",
      contributionProbeArgument,
    ]),
  deployHosting: () => firebase("deploy", "--only", "hosting"),
  verifyWebsite: () =>
    run("node", [
      "scripts/check-live-catalogue.mjs",
      "https://benchmarks.rewire.it",
      contributionProbeArgument,
      "--website",
    ]),
  restoreHosting: (version) =>
    firebase("hosting:clone", `${site}@${version}`, `${site}:live`),
  restoreRelease: (release) => importer("--activate", release),
});
