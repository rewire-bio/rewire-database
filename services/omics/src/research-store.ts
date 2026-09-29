import { createHash } from "node:crypto";
// Keep the website's pure archive tests independent of the service SDK.
interface ResearchDocumentReference {
  collection(name: string): { orderBy(field: string): { get(): Promise<{
    size: number;
    docs: Array<{ data(): Record<string, unknown> }>;
  }> } };
}
import { researchDataSchema, type ResearchData } from "./research.js";

export function researchDigest(data: ResearchData): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
/** Separate bounded documents keep research growth below Firestore's document cap. */
export function researchChunks(data: ResearchData): string[] {
  const items = [
    ...data.manifests.map(value => ({ kind: "manifest", value })),
    ...data.investigations.map(value => ({ kind: "investigation", value })),
    ...(data.readiness || []).map(value => ({ kind: "readiness", value })),
  ];
  const chunks: string[] = [];
  let group: typeof items = [], size = 2;
  for (const item of items) {
    const bytes = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (bytes > 700_000) throw new Error("Research item exceeds serving limit");
    if (group.length && size + bytes > 700_000) { chunks.push(JSON.stringify(group)); group = []; size = 2; }
    group.push(item); size += bytes;
  }
  if (group.length) chunks.push(JSON.stringify(group));
  return chunks;
}
export async function readResearchChunks(ref: ResearchDocumentReference, meta: Record<string, unknown>): Promise<ResearchData | undefined> {
  if (meta.research_schema_version === undefined) {
    if ((meta.coverage as Record<string, unknown> | undefined)?.research_schema_version)
      throw new Error("Research import must complete before serving or publication");
    return undefined;
  }
  if (meta.research_schema_version !== "1.0" || !Number.isInteger(meta.research_chunks))
    throw new Error("Invalid research serving metadata");
  const response = await ref.collection("researchChunks").orderBy("index").get();
  if (response.size !== meta.research_chunks) throw new Error("Incomplete research serving snapshot");
  const data: ResearchData = { schema_version: "1.0", manifests: [], investigations: [] };
  if (meta.research_frozen_readiness === true) data.readiness = [];
  response.docs.forEach((doc, index) => {
    if (doc.data().index !== index) throw new Error("Non-contiguous research serving chunks");
    const bytes = doc.data().items_json;
    if (typeof bytes !== "string") throw new Error("Invalid research serving chunk");
    for (const item of JSON.parse(bytes)) {
      if (item.kind === "manifest") data.manifests.push(item.value);
      else if (item.kind === "investigation") data.investigations.push(item.value);
      else if (item.kind === "readiness" && data.readiness) data.readiness.push(item.value);
      else throw new Error("Invalid research serving item");
    }
  });
  researchDataSchema.parse(data);
  if (researchDigest(data) !== meta.research_digest) throw new Error("Research serving snapshot integrity failure");
  return data;
}
