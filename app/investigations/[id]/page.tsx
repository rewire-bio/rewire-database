import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { buildCatalogue } from "@/lib/catalogue-build";
import ResearchInvestigation, { investigationHref } from "@/components/catalogue/ResearchInvestigation";

type Params = { id: string };

export function generateMetadata({ params }: { params: Params }): Metadata {
  const report = buildCatalogue().query.research().investigations.find((item) => item.id === params.id);
  if (!report) return { robots: { index: false, follow: false } };
  const canonical = `https://benchmarks.rewirebio.io${investigationHref(report.id)}`;
  return {
    title: report.title,
    description: report.question,
    alternates: { canonical },
    ...socialMetadata({ title: report.title, description: report.question, path: canonical }),
  };
}

export default function InvestigationPage({ params }: { params: Params }) {
  const { query } = buildCatalogue();
  const research = query.research();
  const report = research.investigations.find((item) => item.id === params.id);
  if (!report) notFound();
  const manifest = research.manifests.find((item) => item.id === report.manifest_id);
  const records = manifest ? [manifest.dataset_id, manifest.protocol_id, ...manifest.evaluation_ids]
    .flatMap((id) => { const record = query.get({ id, include_comparisons: false })?.record; return record ? [record] : []; }) : [];
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Investigations", path: "/investigations/" }, { name: report.title, path: investigationHref(report.id) }]} />
      <span className="kick">Reviewed investigation</span><h1>{report.title}</h1><p className="intro">{report.question}</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <ResearchInvestigation report={report} records={records} />
    </div></section>
  </>;
}
