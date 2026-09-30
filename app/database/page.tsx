import type { Metadata } from "next";
import LegacyCatalogueRedirect from "../LegacyCatalogueRedirect";
export const metadata: Metadata = {
  title: "Benchmark database",
  alternates: { canonical: "https://benchmarks.rewirebio.io/" },
  robots: { index: false, follow: true },
};
export default function DatabaseAlias() {
  return <LegacyCatalogueRedirect target="/" />;
}
