import { recordIsIndexable } from "@/lib/catalogue-seo";
import type { MetadataRoute } from "next";
import { readFileSync } from "node:fs";
import { parseCatalogue, recordHref } from "@/lib/omics";
import { catalogueIndexPaths } from "@/lib/catalogue-index";
import { buildUseCases } from "@/lib/use-cases-build";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://benchmarks.rewire.it";
  const catalogue = parseCatalogue(JSON.parse(readFileSync("public/omics/catalogue.json", "utf8")));
  const useCases = catalogue.coverage.use_cases ? buildUseCases().entries : [];
  return [
    { url: `${base}/` },
    { url: `${base}/runs/mfass-v2/` },
    { url: `${base}/evidence/` },
    { url: `${base}/audits/` },
    { url: `${base}/use-cases/` },
    ...useCases.map((entry) => ({ url: `${base}/use-cases/${entry.slug}/` })),
    ...catalogueIndexPaths(catalogue.records).map((path) => ({
      url: base + path,
    })),
    ...catalogue.records.filter(recordIsIndexable).map((record) => ({
      url: base + recordHref(record),
    })),
  ];
}
