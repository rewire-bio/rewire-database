import Link from "next/link";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { recordSearchMetadata } from "@/lib/catalogue-seo";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordRouteKinds } from "@/lib/omics";
import { getDetailOr404, relatedRecords } from "@/lib/entity-detail";

type Params = { id: string };
const KIND = "use_case" as const;

export function generateMetadata({ params }: { params: Params }): Metadata {
  const { query } = buildCatalogue();
  const record = query.record(params.id);
  if (!record || !recordRouteKinds(record).includes(KIND)) return {};
  const metadata = recordSearchMetadata(record, relatedRecords(query, record));
  return { ...metadata, ...socialMetadata({ title: metadata.title, description: metadata.description, path: metadata.alternates.canonical }) };
}

/** A use case's record in the database. Its evidence is shown on the use-case page. */
export default function Page({ params }: { params: Params }) {
  const { query } = buildCatalogue();
  const { record } = getDetailOr404(query, KIND, params.id);
  const slug = typeof record.attributes.slug === "string" ? record.attributes.slug : "";
  return <>
    <PageHeader breadcrumbs={[{ name: "Database", path: "/" }, { name: record.name, path: `/database/use_case/${record.id}/` }]} eyebrow={["Use case"]} title={record.name} intro={record.description} />
    <div className="wrap"><div className="content">
      {slug && <p><Link href={`/use-cases/${slug}/`}>Open the use case and its evidence</Link></p>}
      <p>Record <code>{record.id}</code></p>
    </div></div>
  </>;
}
