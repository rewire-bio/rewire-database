import { describe, expect, it, vi } from "vitest";
import { cloudRunConfig, deployArguments, deployCloudRun, liveService, revisionEnvironment, verifyCandidate } from "../scripts/deploy-cloud-run.mjs";

const env = {
  GCLOUD_PROJECT: "rewire-it",
  CLOUD_RUN_IMAGE_REPOSITORY: "europe-west2-docker.pkg.dev/rewire-it/web/rewire-database-web",
  CLOUD_RUN_SERVICE_ACCOUNT: "rewire-database-web@rewire-it.iam.gserviceaccount.com",
};
const pin = { schema_version: 1, repository: "rewire-bio/rewire-benchmark-data", revision: "1".repeat(40), manifest_sha256: "2".repeat(64), release_id: "2026-10-07-aaaaaaaaaaaa" };
const receipt = { schema: 3, commit: "d".repeat(40), frontend_version: "f".repeat(40), release_id: pin.release_id,
  producer_repository: pin.repository, producer_revision: pin.revision };
const liveImage = `${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"a".repeat(64)}`;
// After a failed, rolled-back candidate the service template still names the
// candidate's image, while all traffic stays on rev-old and its own image.
const failedCandidateImage = `${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"c".repeat(64)}`;
const description = { status: { url: "https://rewire-database-web-x-nw.a.run.app", traffic: [{ revisionName: "rev-old", percent: 100 }, { revisionName: "rev-failed", percent: 0, tag: "c-old" }] },
  spec: { template: { spec: { containers: [{ image: failedCandidateImage }] } } } };
const servingRevision = { metadata: { name: "rev-old" }, spec: { containers: [{ image: liveImage }] } };

function candidate({ status = 200, frontend = receipt.frontend_version, location = `https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/data/x.csv.gz` } = {}) {
  return vi.fn(async (url: URL) => {
    if (url.pathname === "/deployment.json") return new Response(JSON.stringify(receipt));
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
    expect(cloudRunConfig(env).maxInstances).toBe(3);
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
    expect(value("--max-instances")).toBe("3");
    expect(value("--region")).toBe("europe-west2");
    expect(args.join(" ")).not.toMatch(/load-balanc|--min-instances [1-9]/);
  });
  it("passes the data pin and receipt as revision environment, not image contents", () => {
    const environment = revisionEnvironment(pin, receipt);
    expect(JSON.parse(environment.REWIRE_DATA_PIN)).toEqual(pin);
    expect(JSON.parse(environment.REWIRE_DEPLOYMENT_RECEIPT)).toEqual(receipt);
  });
  it("refuses automation until one revision serves all traffic", () => {
    expect(liveService(description).revision).toBe("rev-old");
    expect(() => liveService({ ...description, status: { ...description.status, traffic: [{ revisionName: "a", percent: 50 }, { revisionName: "b", percent: 50 }] } })).toThrow("Bootstrap");
  });
  it("reuses the serving revision's image digest for a data-only release, not a rolled-back candidate's", async () => {
    const { run, calls } = gcloud();
    const fetchImpl = candidate();
    const result = await deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, pin, samples: ["/database/result/r/"], run, fetchImpl: fetchImpl as never });
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
    await expect(deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, pin, samples: [], run, fetchImpl: candidate() as never }))
      .rejects.toThrow("no image digest to reuse");
    expect(calls.some((args) => args.includes("deploy") || args.includes("update-traffic"))).toBe(false);
  });
  it("builds and pushes a new image by digest when frontend code changed", async () => {
    const { run, calls } = gcloud();
    await deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: true }, receipt, pin, samples: [], run, fetchImpl: candidate() as never });
    expect(calls.find((args) => args[1] === "build")).toContain(`REWIRE_FRONTEND_VERSION=${receipt.frontend_version}`);
    const deploy = calls.find((args) => args.includes("deploy"))!;
    expect(deploy[deploy.indexOf("--image") + 1]).toBe(`${env.CLOUD_RUN_IMAGE_REPOSITORY}@sha256:${"b".repeat(64)}`);
  });
  it.each([
    ["a failing page", { status: 500 }],
    ["another image", { frontend: "e".repeat(40) }],
    ["a download for another revision", { location: "https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/other/x.gz" }],
  ])("never shifts traffic to a candidate with %s", async (_name, change) => {
    const { run, calls } = gcloud();
    await expect(deployCloudRun({ config: cloudRunConfig(env), plan: { frontend: false }, receipt, pin, samples: ["/x/"], run, fetchImpl: candidate(change) as never })).rejects.toThrow();
    expect(calls.some((args) => args.includes("update-traffic"))).toBe(false);
  });
  it("rejects a candidate serving another receipt", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ...receipt, release_id: "other" })));
    await expect(verifyCandidate("https://c.a.run.app", { receipt, samples: [], fetchImpl: fetchImpl as never })).rejects.toThrow("receipt");
  });
});
