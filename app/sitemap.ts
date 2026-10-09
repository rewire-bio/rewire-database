import { recordIsIndexable } from "@/lib/catalogue-seo";
import type { MetadataRoute } from "next";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import { catalogueIndexPaths } from "@/lib/catalogue-index";
import { buildCatalogue } from "@/lib/catalogue-build";
import { buildUseCases } from "@/lib/use-cases-build";
// Generated from the running revision's pinned release, like every page.
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://benchmarks.rewirebio.io";
  const { catalogue, query } = buildCatalogue();
  const useCases = catalogue.coverage.use_cases ? buildUseCases().entries : [];
  return [
    { url: `${base}/` },
    { url: `${base}/runs/mfass-v2/` },
    { url: `${base}/evidence/` },
    { url: `${base}/coverage/` },
    { url: `${base}/use-cases/` },
    ...useCases.map((entry) => ({ url: `${base}/use-cases/${entry.slug}/` })),
    ...catalogueIndexPaths(query.recordsOfKind("model") as OmicsRecord[]).map((path) => ({
      url: base + path,
    })),
    ...query.recordIds().filter(recordIsIndexable).map((record) => ({
      url: base + recordHref(record),
    })),
    { url: `${base}/investigations/` },
    ...query.research().investigations.map((report) => ({ url: `${base}/investigations/${report.id}/`, lastModified: report.review.reviewed_at })),
  ];
}
