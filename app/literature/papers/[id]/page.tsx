import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readFileSync } from "node:fs";
import { getLiterature } from "@/lib/benchmark-literature";
import { dataPath } from "@/lib/data-pin";
import { recordHref } from "@/lib/omics";
import { buildCatalogue } from "@/lib/catalogue-build";
import LegacyCatalogueRedirect from "../../../LegacyCatalogueRedirect";

function paperDestination(id: string) {
  // Reuse the instance's validated snapshot rather than parsing it per request.
  const { catalogue } = buildCatalogue();
  const record = catalogue.records.find(
    (item) => item.kind === "source" && item.id === id,
  );
  return record ? recordHref(record) : undefined;
}
function exclusionReason(id: string) {
  const decisions = readFileSync(
    dataPath("data/omics/scope-audit.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          paper_id: string;
          decision: string;
          reason: string;
        },
    );
  return decisions.find(
    (item) => item.paper_id === id && item.decision === "excluded",
  )?.reason;
}
export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const paper = getLiterature().papers.find((item) => item.id === params.id);
  if (!paper) return { title: "Historical source" };
  const destination = paperDestination(paper.id);
  return {
    title: paper.title,
    description: destination
      ? `Source record for ${paper.title} in the benchmark database.`
      : `Historical source citation retained outside the current omics catalogue.`,
    alternates: {
      canonical: `https://benchmarks.rewirebio.io${destination || `/literature/papers/${paper.id}/`}`,
    },
    ...(destination ? {} : { robots: { index: false, follow: true } }),
  };
}
export default function LegacyPaperPage({
  params,
}: {
  params: { id: string };
}) {
  const paper = getLiterature().papers.find((item) => item.id === params.id);
  if (!paper) notFound();
  const destination = paperDestination(paper.id);
  if (destination)
    return (
      <LegacyCatalogueRedirect
        target={destination}
        label="Open the source record"
      />
    );
  const reason = exclusionReason(paper.id);
  if (!reason)
    throw new Error(
      `Legacy source ${paper.id} has neither a current record nor an explicit exclusion decision.`,
    );
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Historical source</span>
          <h1>{paper.title}</h1>
          <p className="intro">
            {paper.year} ·{" "}
            {paper.publication_status === "peer_reviewed"
              ? "Peer-reviewed"
              : "Preprint"}{" "}
            · {paper.version}
          </p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap prose-brief">
          <nav aria-label="Breadcrumb">
            <Link href="/">Benchmark database</Link>
            {" / "}
            <span>Historical source</span>
          </nav>
          <h2>Outside the current catalogue</h2>
          <p>{reason}</p>
          <p>
            This citation is retained for historical links. Its results are not
            included in the specialist omics and molecular model database.
          </p>
          <p>
            <a href={paper.source_url} rel="noopener noreferrer">
              Read the original paper &rarr;
            </a>
          </p>
          {paper.doi && <p>DOI: {paper.doi}</p>}
          {paper.arxiv_id && <p>arXiv: {paper.arxiv_id}</p>}
        </div>
      </section>
    </>
  );
}
