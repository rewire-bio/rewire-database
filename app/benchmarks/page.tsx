import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata, indexSource } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
export const metadata = indexMetadata("benchmark");
export default function BenchmarkIndexPage() {
  return <StaticIndex records={indexSource(buildCatalogue().query, "benchmark")} releaseId={buildCatalogue().catalogue.release_id} kind="benchmark" />;
}
