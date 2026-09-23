import type { MetadataRoute } from "next";
import { readFileSync } from "node:fs";
import { parseCatalogue, recordHref } from "@/lib/omics";
import { catalogueIndexPaths } from "@/lib/catalogue-index";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://benchmarks.rewire.it";
  const catalogue = parseCatalogue(
    JSON.parse(readFileSync("public/omics/catalogue.json", "utf8")),
  );
  return [
    { url: `${base}/`, lastModified: catalogue.released_at },
    { url: `${base}/runs/mfass-v2/` },
    { url: `${base}/evidence/`, lastModified: catalogue.released_at },
    { url: `${base}/audits/`, lastModified: catalogue.released_at },
    ...catalogueIndexPaths(catalogue.records).map((path) => ({ url: base + path, lastModified: catalogue.released_at })),
    ...catalogue.records
      .filter((record) => record.kind !== "claim")
      .map((record) => ({
        url: base + recordHref(record),
        lastModified: catalogue.released_at,
      })),
  ];
}
