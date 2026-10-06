import { socialMetadata } from "@/lib/catalogue-sharing";
import { recordSearchMetadata } from "@/lib/catalogue-seo";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordRouteKinds } from "@/lib/omics";
import { getDetailOr404 } from "@/lib/entity-detail";
import { filterIdsForSmoke } from "@/lib/smoke-selection";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";

type Params = { id: string };
const KIND = "service" as const;

export function generateStaticParams() {
  const { catalogue } = buildCatalogue();
  const ids = catalogue.records
    .filter((record) => record.kind === KIND)
    .map((record) => record.id);
  return filterIdsForSmoke(KIND, ids).map((id) => ({ id }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const { catalogue, query } = buildCatalogue();
  const record = query.record(params.id);
  if (!record || !recordRouteKinds(record).includes(KIND)) return {};
  const metadata = recordSearchMetadata(record, catalogue.records);
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
  return <PredictiveEntityDetail detail={detail} />;
}
