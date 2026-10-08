import { notFound } from "next/navigation";
import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata, validModelPage } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
export function generateMetadata({ params }: { params: { page: string } }) {
  if (!validModelPage(params.page, buildCatalogue().catalogue.records)) notFound();
  return indexMetadata("model", Number(params.page));
}
export default function ModelIndexPage({ params }: { params: { page: string } }) {
  const { catalogue } = buildCatalogue();
  if (!validModelPage(params.page, catalogue.records)) notFound();
  return <StaticIndex catalogue={catalogue} kind="model" page={Number(params.page)} />;
}
