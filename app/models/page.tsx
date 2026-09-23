import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
export const metadata = indexMetadata("model");
export default function ModelIndexPage() {
  return <StaticIndex catalogue={buildCatalogue().catalogue} kind="model" />;
}
