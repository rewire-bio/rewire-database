import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCatalogue } from "@/lib/catalogue-build";
import { getResearch } from "@/services/omics/src/research";
import ResearchInvestigation, { investigationHref } from "@/components/catalogue/ResearchInvestigation";

type Params = { id: string };
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  const reports = getResearch(buildCatalogue().catalogue).investigations;
  // Next 14 static export requires a non-empty list. This invalid record ID is
  // rendered only as notFound(), never as a report, link or sitemap entry.
  return reports.length ? reports.map((report) => ({ id: report.id })) : [{ id: "_no-reviewed-reports" }];
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const report = getResearch(buildCatalogue().catalogue).investigations.find((item) => item.id === params.id);
  if (!report) return { robots: { index: false, follow: false } };
  return { title: report.title, description: report.question, alternates: { canonical: `https://benchmarks.rewirebio.io${investigationHref(report.id)}` } };
}

export default function InvestigationPage({ params }: { params: Params }) {
  const { catalogue, query } = buildCatalogue();
  const research = getResearch(catalogue);
  const report = research.investigations.find((item) => item.id === params.id);
  if (!report) notFound();
  const manifest = research.manifests.find((item) => item.id === report.manifest_id);
  const records = manifest ? [manifest.dataset_id, manifest.protocol_id, ...manifest.evaluation_ids]
    .flatMap((id) => { const record = query.get({ id, include_comparisons: false })?.record; return record ? [record] : []; }) : [];
  return <>
    <header className="page-head"><div className="wrap"><span className="kick">Reviewed investigation</span><h1>{report.title}</h1><p className="intro">{report.question}</p></div></header>
    <section className="block first"><div className="wrap">
      <nav aria-label="Breadcrumb"><Link href="/">Benchmark database</Link> · <Link href="/investigations/">Investigations</Link></nav>
      <ResearchInvestigation report={report} records={records} />
    </div></section>
  </>;
}
