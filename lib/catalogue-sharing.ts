import type { Metadata } from "next";
import { catalogueText } from "./catalogue-text";
import { recordHref, type OmicsRecord } from "./omics";

const ORIGIN = "https://benchmarks.rewirebio.io";
export const SOCIAL_IMAGE = {
  url: `${ORIGIN}/images/social/catalogue.png`,
  width: 1200,
  height: 630,
  alt: "rewire.it biological model benchmark database: models, benchmarks and source-linked evidence",
};

/** Share the page's existing factual snippet, never invent a second description. */
export function socialMetadata({ title, description, path }: { title: string; description: string; path: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "rewire.it benchmark database",
      title,
      description,
      url: new URL(path, ORIGIN).href,
      images: [{ ...SOCIAL_IMAGE, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
    },
  };
}

export interface BreadcrumbItem { name: string; path: string }
export function recordBreadcrumbs(record: OmicsRecord): BreadcrumbItem[] {
  const items = [{ name: "Database", path: "/" }];
  if (record.kind === "model") items.push({ name: "Models", path: "/models/" });
  if (record.kind === "benchmark") items.push({ name: "Benchmarks", path: "/benchmarks/" });
  items.push({ name: catalogueText(record.name), path: recordHref(record) });
  return items;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, ORIGIN).href,
    })),
  };
}

// Catalogue licensing is unestablished: this describes the website, not a Dataset.
export const catalogueWebsiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${ORIGIN}/#website`,
  url: `${ORIGIN}/`,
  name: "Biological model benchmark database",
};

/** JSON remains valid while untrusted record strings cannot close the script. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
