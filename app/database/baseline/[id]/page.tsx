import { socialMetadata } from "@/lib/catalogue-sharing";
import { recordSearchMetadata } from "@/lib/catalogue-seo";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordRouteKinds } from "@/lib/omics";
import { getDetailOr404, relatedRecords } from "@/lib/entity-detail";
import { BaselineDetail } from "./detail";

type Params = { id: string };
const KIND = "baseline" as const;

export function generateMetadata({ params }: { params: Params }): Metadata {
  const { query } = buildCatalogue();
  const record = query.record(params.id);
  if (!record || !recordRouteKinds(record).includes(KIND)) return {};
  const metadata = recordSearchMetadata(record, relatedRecords(query, record));
  return {
    ...metadata,
    ...socialMetadata({
      title: metadata.title,
      description: metadata.description,
      path: metadata.alternates.canonical,
    }),
  };
}

export default function Page({ params }: { params: Params }) {
  const { query } = buildCatalogue();
  const detail = getDetailOr404(query, KIND, params.id);
  return <BaselineDetail detail={detail} />;
}
