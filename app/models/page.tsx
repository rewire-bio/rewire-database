import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata, indexSource } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";

const models = () => indexSource(buildCatalogue().query, "model");
export const metadata = indexMetadata("model");
export default function ModelIndexPage() {
  return <StaticIndex records={models()} releaseId={buildCatalogue().catalogue.release_id} kind="model" />;
}
