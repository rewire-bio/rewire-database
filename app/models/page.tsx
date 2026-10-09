import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
import type { OmicsRecord } from "@/lib/omics";

const models = () => buildCatalogue().query.recordsOfKind("model") as OmicsRecord[];
export const metadata = indexMetadata("model");
export default function ModelIndexPage() {
  return <StaticIndex records={models()} releaseId={buildCatalogue().catalogue.release_id} kind="model" />;
}
