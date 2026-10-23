import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDomain } from "@/lib/benchmark-catalog";
import LegacyCatalogueRedirect from "../LegacyCatalogueRedirect";
type Props = { params: { domain: string } };
export function generateMetadata({ params }: Props): Metadata {
  const domain = getDomain(params.domain);
  if (!domain) {
    return {
      title: "Page not found | Benchmark database",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${domain.name} | Benchmark database`,
    alternates: { canonical: "https://benchmarks.rewirebio.io/" },
    robots: { index: false, follow: true },
  };
}
export default function DomainAlias({ params }: Props) {
  const domain = getDomain(params.domain);
  if (!domain) notFound();
  return (
    <LegacyCatalogueRedirect
      target={`/?kind=model&area=${encodeURIComponent(domain.id)}#browse`}
      label={`Browse ${domain.name} models`}
    />
  );
}
