import { measureDeploymentStage as measure } from "./deployment-metrics.mjs";
import { spawn } from "node:child_process";
import { createHash } from 'node:crypto';
import { readFile } from "node:fs/promises";
import { deployCatalogue, hostingVersion } from "./deployment-transaction.mjs";
import { contributionProbeMode } from "./contribution-deployment.mjs";
import { assertPublishedBase, classify, fingerprints, liveAcceptanceProfile, publishedReceipt, publicBytes, validReceipt } from "./deployment-plan.mjs";
import { assertHistoricalDownloadsPresent, deployWebHosting } from "./hosting-web-deploy.mjs";
import { assertNotSmokeExport } from "./assert-not-smoke-export.mjs";
const contributionProbeArgument = `--contributions=${contributionProbeMode()}`;

assertNotSmokeExport();

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
const manifestBytes = await readFile('public/omics/manifest.json');
const plan = JSON.parse(await readFile('workbench/deployment-plan.json', 'utf8'));
const receipt = JSON.parse(await readFile('out/deployment.json', 'utf8'));
if (!['full', 'web'].includes(plan.mode) || !validReceipt(receipt) ||
    JSON.stringify(await fingerprints()) !== JSON.stringify(plan.fingerprints) ||
    JSON.stringify(receipt.fingerprints) !== JSON.stringify(plan.fingerprints) ||
    receipt.commit !== plan.commit || receipt.release_id !== manifest.release_id ||
    receipt.manifest_sha256 !== createHash('sha256').update(manifestBytes).digest('hex'))
  throw new Error('Deployment plan does not match checked source and output');
if (plan.mode === 'web' && classify(plan.fingerprints, plan.previous, plan.force_full).mode !== 'web')
  throw new Error('The checked inputs require a full publication');
if (!plan.backend) {
  const live = await publishedReceipt();
  if (!live || JSON.stringify(live) !== JSON.stringify(plan.previous))
    throw new Error('Backend deployment base changed; rebuild before publishing');
}
const acceptanceArgument = `--acceptance=${liveAcceptanceProfile(plan)}`;
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
async function currentHostingVersion() {
  const listing = JSON.parse(await run('npx', ['--no-install', 'firebase', 'hosting:channel:list',
    '--site', site, '--project', project, '--non-interactive', '--json'], true));
  return hostingVersion(listing, project, site);
}
await deployCatalogue({
  async capture() {
    const current = JSON.parse(
      await measure("catalogue.capture", () => run(
        "node",
        ["--import", "tsx", "services/omics/src/import-cli.ts", "--current"],
        true,
      )),
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
  async canReuseCatalogue(previous) {
    if (plan.mode === 'web') {
      await assertPublishedBase(plan, manifestBytes);
      if (previous.release_id !== manifest.release_id) throw new Error('Live API release differs from the UI build');
      if (await currentHostingVersion() !== previous.hosting_version) throw new Error('Hosting changed during capture');
      return true;
    }
    await assertHistoricalDownloadsPresent({ previousVersion: previous.hosting_version });
    if (previous.release_id !== manifest.release_id) return false;
    const liveManifest = await publicBytes('omics/manifest.json');
    if (!liveManifest.equals(manifestBytes)) throw new Error('Same release ID has different published manifest bytes');
    return true;
  },
  importRelease: () =>
    measure("catalogue.import", () => importer("public/omics/catalogue.json", "public/omics/manifest.json")),
  activate: () => measure("catalogue.activation", () => importer("--activate", manifest.release_id)),
  verifyApi: () =>
    measure("catalogue.api_verification", () => run("node", [
      "scripts/check-live-catalogue.mjs",
      "https://europe-west2-rewire-it.cloudfunctions.net/contributions",
      contributionProbeArgument,
      acceptanceArgument,
    ])),
  async publishHosting(previous, markReleaseAttempt) {
    if (plan.mode === 'full') {
      markReleaseAttempt();
      return measure("hosting.full_publication", () => firebase('deploy', '--only', 'hosting'));
    }
    await assertPublishedBase(plan, manifestBytes);
    return deployWebHosting({
      previousVersion: previous.hosting_version,
      onReleaseAttempt: markReleaseAttempt,
      async beforeRelease() {
        await assertPublishedBase(plan, manifestBytes);
        if (await currentHostingVersion() !== previous.hosting_version)
          throw new Error('Hosting changed while preparing the UI deployment; no live changes made');
      },
    });
  },
  verifyWebsite: () =>
    measure("hosting.website_verification", () => run("node", [
      "scripts/check-live-catalogue.mjs",
      "https://rewire-it.web.app",
      contributionProbeArgument,
      acceptanceArgument,
      "--website",
    ])),
  restoreHosting: (version) =>
    measure("hosting.rollback", () => firebase("hosting:clone", `${site}@${version}`, `${site}:live`)),
  restoreRelease: (release) => measure("catalogue.rollback", () => importer("--activate", release)),
});
