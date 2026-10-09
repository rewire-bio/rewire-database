import { notFound } from "next/navigation";
import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata, validModelPage } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
import type { OmicsRecord } from "@/lib/omics";

const models = () => buildCatalogue().query.recordsOfKind("model") as OmicsRecord[];
export function generateMetadata({ params }: { params: { page: string } }) {
  if (!validModelPage(params.page, models())) notFound();
  return indexMetadata("model", Number(params.page));
}
export default function ModelIndexPage({ params }: { params: { page: string } }) {
  const records = models();
  if (!validModelPage(params.page, records)) notFound();
  return <StaticIndex records={records} releaseId={buildCatalogue().catalogue.release_id} kind="model" page={Number(params.page)} />;
}
