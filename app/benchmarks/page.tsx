import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
import type { OmicsRecord } from "@/lib/omics";
export const metadata = indexMetadata("benchmark");
export default function BenchmarkIndexPage() {
  return <StaticIndex records={buildCatalogue().query.recordsOfKind("benchmark") as OmicsRecord[]} releaseId={buildCatalogue().catalogue.release_id} kind="benchmark" />;
}
