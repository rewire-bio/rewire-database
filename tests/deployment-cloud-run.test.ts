import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cloudRunConfig, deployArguments, deployCloudRun, liveService, pruneRevisions, revisionEnvironment, SERVICE, verifyCandidate } from "../scripts/deploy-cloud-run.mjs";

const env = {
  GCLOUD_PROJECT: "rewire-it",
  CLOUD_RUN_IMAGE_REPOSITORY: "europe-west2-docker.pkg.dev/rewire-it/web/rewire-database-web",
  CLOUD_RUN_SERVICE_ACCOUNT: "rewire-database-web@rewire-it.iam.gserviceaccount.com",
};
const pin = { schema_version: 1, repository: "rewire-bio/rewire-benchmark-data", revision: "1".repeat(40), manifest_sha256: "2".repeat(64), release_id: "2026-10-07-aaaaaaaaaaaa" };
const receipt = { schema: 4, commit: "d".repeat(40), frontend_version: "f".repeat(40), release_id: pin.release_id,
  producer_repository: pin.repository, producer_revision: pin.revision };
const liveImage = `${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"a".repeat(64)}`;
// After a failed, rolled-back candidate the service template still names the
// candidate's image, while all traffic stays on rev-old and its own image.
const failedCandidateImage = `${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"c".repeat(64)}`;
const description = { status: { url: "https://rewire-database-web-x-nw.a.run.app", traffic: [{ revisionName: "rev-old", percent: 100 }, { revisionName: "rev-failed", percent: 0, tag: "c-old" }] },
  spec: { template: { spec: { containers: [{ image: failedCandidateImage }] } } } };
const servingRevision = { metadata: { name: "rev-old" }, spec: { containers: [{ image: liveImage }] } };

function candidate({ status = 200, frontend = receipt.frontend_version, location = `https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/data/x.csv.gz`, apiRelease = pin.release_id } = {}) {
  return vi.fn(async (url: URL) => {
    if (url.pathname === "/deployment.json") return new Response(JSON.stringify(receipt));
    if (url.pathname === "/api/trpc/catalogue.release") return new Response(JSON.stringify({ result: { data: { release_id: apiRelease } } }));
    if (url.pathname.startsWith("/omics/")) return new Response(null, { status: 307, headers: { location } });
    return new Response(`<h1>${pin.release_id}</h1>`, { status, headers: { "x-rewire-frontend": frontend, "x-rewire-data-release": pin.release_id } });
  });
}
function gcloud(deployed = { status: { latestCreatedRevisionName: "rev-new", traffic: [{ tag: `c-${"d".repeat(12)}`, url: "https://c---svc.a.run.app" }] } }, revision: object = servingRevision) {
  const calls: string[][] = [];
  const run = vi.fn(async (args: string[]) => {
    calls.push(args);
    if (args[0] === "docker" && args[1] === "inspect") return `${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"b".repeat(64)}\n`;
    if (args.includes("revisions") && args.includes("describe")) return JSON.stringify(revision);
    if (args.includes("describe")) return JSON.stringify(description);
    if (args.includes("deploy")) return JSON.stringify(deployed);
    return "{}";
  });
  return { run, calls };
}

describe("Cloud Run frontend deployment", () => {
  it("requires an explicit project, image repository, runtime identity and bounded maximum", () => {
    expect(cloudRunConfig(env).maxInstances).toBe(6);
    for (const change of [{ GCLOUD_PROJECT: "other" }, { CLOUD_RUN_IMAGE_REPOSITORY: "docker.io/x" }, { CLOUD_RUN_SERVICE_ACCOUNT: "x@other.iam.gserviceaccount.com" },
      { CLOUD_RUN_MAX_INSTANCES: "0" }, { CLOUD_RUN_MAX_INSTANCES: "50" }])
      expect(() => cloudRunConfig({ ...env, ...change })).toThrow();
  });
  it("deploys request-billed, scale-to-zero, bounded candidates without traffic or a load balancer", () => {
    const args = deployArguments(cloudRunConfig(env), { image: liveImage, envFile: "/tmp/env.json", tag: "c-x" });
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args).toContain("--no-traffic");
    expect(args).toContain("--cpu-throttling");
    expect(value("--min-instances")).toBe("0");
    expect(value("--max-instances")).toBe("6");
    expect(value("--region")).toBe("europe-west2");
    expect(args.join(" ")).not.toMatch(/load-balanc|--min-instances [1-9]/);
  });
  it("passes only the receipt as revision environment; the data release is in the image", () => {
    const environment = revisionEnvironment(receipt);
    expect(Object.keys(environment)).toEqual(["REWIRE_DEPLOYMENT_RECEIPT"]);
    expect(JSON.parse(environment.REWIRE_DEPLOYMENT_RECEIPT)).toEqual(receipt);
  });
  it("refuses automation until one revision serves all traffic", () => {
    expect(liveService(description).revision).toBe("rev-old");
    expect(() => liveService({ ...description, status: { ...description.status, traffic: [{ revisionName: "a", percent: 50 }, { revisionName: "b", percent: 50 }] } })).toThrow("Bootstrap");
  });
  it("reuses the serving revision's image digest for a Worker-only change, not a rolled-back candidate's", async () => {
    const { run, calls } = gcloud();
    const fetchImpl = candidate();
    const result = await deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, samples: ["/database/result/r/"], run, fetchImpl: fetchImpl as never });
    expect(calls.some((args) => args[0] === "docker")).toBe(false);
    expect(calls.find((args) => args.includes("revisions"))).toEqual(expect.arrayContaining(["describe", "rev-old"]));
    const deploy = calls.find((args) => args.includes("deploy"))!;
    expect(deploy[deploy.indexOf("--image") + 1]).toBe(liveImage);
    expect(deploy).not.toContain(failedCandidateImage);
    expect(calls.at(-1)).toContain("rev-new=100");
    expect(fetchImpl).toHaveBeenCalled();
    await result.rollback();
    expect(calls.at(-1)).toContain("rev-old=100");
  });
  it.each([
    ["a tag instead of a digest", { metadata: { name: "rev-old" }, spec: { containers: [{ image: `${env.CLOUD_RUN_IMAGE_REPOSITORY}:latest` }] } }],
    ["another revision's description", { metadata: { name: "rev-failed" }, spec: { containers: [{ image: liveImage }] } }],
  ])("never reuses an image when the serving revision reports %s", async (_name, revision) => {
    const { run, calls } = gcloud(undefined, revision);
    await expect(deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, samples: [], run, fetchImpl: candidate() as never }))
      .rejects.toThrow("no image digest to reuse");
    expect(calls.some((args) => args.includes("deploy") || args.includes("update-traffic"))).toBe(false);
  });
  it("builds and pushes a new image by digest when frontend code changed", async () => {
    const { run, calls } = gcloud();
    await deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: true }, receipt, samples: [], run, fetchImpl: candidate() as never });
    expect(calls.find((args) => args[1] === "build")).toContain(`REWIRE_FRONTEND_VERSION=${receipt.frontend_version}`);
    const deploy = calls.find((args) => args.includes("deploy"))!;
    expect(deploy[deploy.indexOf("--image") + 1]).toBe(`${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"b".repeat(64)}`);
  });
  it.each([
    ["a failing page", { status: 500 }],
    ["another image", { frontend: "e".repeat(40) }],
    ["a download for another revision", { location: "https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/other/x.gz" }],
    ["a catalogue API for another release", { apiRelease: "2000-01-01-000000000000" }],
  ])("never shifts traffic to a candidate with %s", async (_name, change) => {
    const { run, calls } = gcloud();
    await expect(deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, samples: ["/x/"], run, fetchImpl: candidate(change) as never })).rejects.toThrow();
    expect(calls.some((args) => args.includes("update-traffic"))).toBe(false);
  });
  it("rejects a candidate serving another receipt", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ...receipt, release_id: "other" })));
    await expect(verifyCandidate("https://c.a.run.app", { receipt, samples: [], fetchImpl: fetchImpl as never })).rejects.toThrow("receipt");
  });
  it("prunes every tag and revision except the serving revision and its rollback target", async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args.includes("describe")) return JSON.stringify({ status: { traffic: [
        { revisionName: "rev-new", percent: 100, tag: "c-new" }, { revisionName: "rev-old", tag: "c-old" }, { revisionName: "rev-probe", tag: "probe" }] } });
      if (args.includes("list")) return JSON.stringify(["rev-new", "rev-old", "rev-probe", "rev-ancient"].map(name => ({ metadata: { name } })));
      return "{}";
    });
    const pruned = await pruneRevisions(cloudRunConfig(env), ["rev-new", "rev-old"], { run: run as never });
    expect(pruned).toEqual({ tags: ["probe"], revisions: ["rev-probe", "rev-ancient"] });
    expect(calls.find(args => args.includes("update-traffic"))).toEqual(expect.arrayContaining(["--remove-tags", "probe"]));
    const deleted = calls.filter(args => args.includes("delete")).map(args => args[args.indexOf("delete") + 1]);
    expect(deleted).toEqual(["rev-probe", "rev-ancient"]);
  });
});

describe("frontend server heap", () => {
  it("caps the heap well under the instance memory, and the build check renders under the same cap", () => {
    const flag = /--max-old-space-size=(\d+)/;
    const image = fs.readFileSync("Dockerfile", "utf8").match(new RegExp(`^CMD \\[.*"${flag.source}"`, "m"));
    const check = fs.readFileSync("scripts/check-ssr-build.ts", "utf8").match(new RegExp(`SERVER_NODE_FLAGS = \\["${flag.source}"\\]`));
    expect(Number(image?.[1])).toBeGreaterThan(0);
    expect(Number(image?.[1]) * 2).toBeLessThanOrEqual(Number.parseInt(SERVICE.memory) * 1024);
    expect(check?.[1]).toBe(image?.[1]);
  });
});
