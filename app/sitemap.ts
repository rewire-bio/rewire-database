import { MetadataRoute } from "next";
import { DOMAINS } from "@/lib/benchmark-catalog";
import { getLiterature } from "@/lib/benchmark-literature";
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/literature/", "/runs/mfass-v2/", ...DOMAINS.map((domain) => `/${domain.id}/`), ...getLiterature().papers.map((paper) => `/literature/papers/${paper.id}/`)];
  return routes.map((route) => ({ url: `https://benchmarks.rewire.it${route}` }));
}
