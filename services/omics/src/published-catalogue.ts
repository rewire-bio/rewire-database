// The published catalogue a curator's publication decision is checked
// against: the public catalogue API of the live website, which serves exactly
// one release (the one its image embeds). Tests substitute their own.
export interface PublishedRecord {
  kind: string;
  status: string;
}
export interface PublishedCatalogue {
  /** Each ID's record in that release, or null; throws ReleaseNotServed if the release is not live. */
  records(releaseId: string, ids: string[]): Promise<(PublishedRecord | null)[]>;
}
export class ReleaseNotServed extends Error {}

const origin = () => process.env.OMICS_CATALOGUE_ORIGIN || "https://benchmarks.rewirebio.io";

async function get(procedure: string, input: unknown) {
  const response = await fetch(
    `${origin()}/api/trpc/catalogue.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
    { signal: AbortSignal.timeout(30_000), headers: { "Cache-Control": "no-cache" } },
  );
  const body = (await response.json()) as { result?: { data?: unknown } };
  return { status: response.status, data: body.result?.data };
}

export const publicCatalogue: PublishedCatalogue = {
  async records(releaseId, ids) {
    const release = await get("release", {});
    if (release.status !== 200) throw new Error(`Public catalogue unavailable (${release.status})`);
    if ((release.data as { release_id?: string })?.release_id !== releaseId) throw new ReleaseNotServed(releaseId);
    return Promise.all(ids.map(async (id) => {
      const detail = await get("get", { release_id: releaseId, id });
      if (detail.status !== 200) throw new Error(`Public catalogue lookup failed for ${id} (${detail.status})`);
      const record = (detail.data as { record?: PublishedRecord } | null)?.record;
      return record ? { kind: record.kind, status: record.status } : null;
    }));
  },
};

let current: PublishedCatalogue = publicCatalogue;
export const publishedCatalogue = () => current;
/** For tests only. */
export function setPublishedCatalogue(catalogue: PublishedCatalogue = publicCatalogue) {
  current = catalogue;
}
