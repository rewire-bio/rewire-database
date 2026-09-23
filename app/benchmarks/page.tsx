import { buildCatalogue } from "@/lib/catalogue-build";
import { indexMetadata } from "@/lib/catalogue-index";
import StaticIndex from "@/components/catalogue/StaticIndex";
export const metadata = indexMetadata("benchmark");
export default function BenchmarkIndexPage() {
  return <StaticIndex catalogue={buildCatalogue().catalogue} kind="benchmark" />;
}
