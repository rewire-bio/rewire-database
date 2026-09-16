import type { Metadata } from "next";
import LegacyCatalogueRedirect from "../LegacyCatalogueRedirect";

export const metadata: Metadata = {
  title: "Published results in the benchmark database",
  description:
    "Published biological model results are part of the unified benchmark database.",
  alternates: { canonical: "https://benchmarks.rewire.it/" },
};
export default function LiteraturePage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Published results have moved</h1>
        </div>
      </header>
      <LegacyCatalogueRedirect
        target="/?kind=result&origin=literature#browse"
        label="Browse published benchmark results"
      />
    </>
  );
}
