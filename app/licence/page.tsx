import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SITE } from "@/lib/agent-connect";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { DATA_LICENCE, INDEPENDENCE_PATH, LICENCE_PATH, TAKEDOWN_CONTACT, releaseCitation } from "@/lib/data-licence";
import { dataPin } from "@/lib/data-pin";
import styles from "@/app/database/database.module.css";

export const dynamic = "force-dynamic";

const pageMetadata = {
  title: "Data licence | Benchmark database",
  description: "What you may reuse from the Rewire benchmark database, what stays under the terms of the publications it cites, and how to cite a release.",
  alternates: { canonical: `${SITE}${LICENCE_PATH}` },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

const SOURCE_POLICY = "https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/source-preservation.md";

const covered = [
  "the selection and arrangement of the records, and their identifiers;",
  "the links between records: which configuration belongs to which model, which evaluation used which protocol and dataset, and which protocols bear on which use case;",
  "use-case definitions, relevance judgements, review statuses and origin labels;",
  "findings that studies disagree, and the follow-up recorded on each;",
  "summaries and notes written for the database;",
  "the results of runs Rewire carried out itself.",
];

const notCovered = [
  "Values reported by a publication: scores, sample counts and facts about a model or dataset. Rewire records each one with a citation and the place in the source it was read from. The value is the source's, and the source is what you credit for it.",
  "Text quoted from a source, and titles, names and trade marks.",
  "The terms shown on a model's page. They are the licence of that model's weights or code as its developers state it. They are not terms for this data.",
  "The cited papers, supplements and repositories themselves. This site links to them and serves no copy of a third-party source document.",
];

export default function LicencePage() {
  const releaseId = dataPin().release_id;
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Data licence", path: LICENCE_PATH }]}
      eyebrow={["Licence", `Release ${releaseId}`]}
      title="Data licence"
      intro="What Rewire compiled and wrote is free to reuse with attribution. What it copied from a publication stays under that publication's terms."
    />
    <section className="block first">
      <div className="wrap">
        <section className={styles.section} aria-labelledby="licence-heading">
          <h2 id="licence-heading">The licence</h2>
          <p>
            Rewire&apos;s compiled data and annotations are offered under the{" "}
            <a href={DATA_LICENCE.compilation.url} rel="license">{DATA_LICENCE.compilation.name} licence</a> (<code>{DATA_LICENCE.compilation.spdx_id}</code>).
            You may copy, share and adapt them for any purpose, including commercially, if you give credit and say what you changed.
          </p>
          <p>This covers what Rewire made:</p>
          <ul className={styles.list}>
            {covered.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>
            It applies wherever that material appears: in the release files, the <Link href="/agents/api/">JSON API</Link> and on this site. Every API answer repeats the position in its <code>licence</code> field. There, <code>licence.spdx_id</code> is null, because no single licence covers an answer that is mostly values from sources; the identifier above is in <code>licence.compilation</code>, beside what it covers and what it excludes.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="not-covered-heading">
          <h2 id="not-covered-heading">What the licence does not cover</h2>
          <p>Rewire can license only what is its own. The licence above does not reach:</p>
          <ul className={styles.list}>
            {notCovered.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>
            If you reuse a value, cite the publication it came from as well as this database. If you reuse quoted text or a source document, check that source&apos;s own terms first; some of them do not allow commercial use.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="sources-heading">
          <h2 id="sources-heading">Source documents</h2>
          <p>
            The data repository keeps a copy of each source file it could fetch, so that a recorded value can be checked against the bytes it was read from. A licence decides only whether that copy is published:
          </p>
          <ul className={styles.list}>
            <li>A source whose licence allows redistribution may be published as a release asset of the data repository, unchanged.</li>
            <li>A source under a restrictive licence, or with no licence determined, is kept privately and is not redistributed. Its record still carries the citation and the address of the source.</li>
            <li>A source under a non-commercial licence may be published only on the premise that this data is never sold: Rewire does not sell the benchmark data or the graph, license them to a partner or put them behind a paywall, in whole or in part. If that ever changed, those sources would be assessed again from their licence text.</li>
          </ul>
          <p>
            One exception is on record. Some sources under restrictive licences were committed to the public data repository before this rule existed. Their files have been taken out of the current tree, but they remain in the repository&apos;s git history, which cannot be rewritten for everyone who has already copied it. The policy names each of them.
          </p>
          <p>
            The rules, the licence each source was read as carrying and the counts are in the data repository&apos;s <a href={SOURCE_POLICY}>source preservation policy</a>.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="takedown-heading">
          <h2 id="takedown-heading">Takedown</h2>
          <p>
            If you hold the rights to a source and want the stored copy removed, write to <a href={`mailto:${TAKEDOWN_CONTACT}`}>{TAKEDOWN_CONTACT}</a>. The copy is removed from the release assets, the private store and the working caches, and it is not fetched again. The record keeps the citation, the address and the hash of the file, which describe the work and are not the work.
          </p>
          <p id="takedown-limit">
            One limit applies. A file that was committed to the public data repository cannot be removed from that repository&apos;s git history, or from copies of it that other people already hold. This is the case for the sources named as the exception under <a href="#sources-heading">source documents</a>. A request about one of them is still acted on everywhere else the copy is held, and the request and the removal are recorded.
          </p>
          <p>
            To report a wrong value or a wrong attribution, see <Link href={`${INDEPENDENCE_PATH}#corrections`}>corrections and disputes</Link>.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="cite-heading" id="cite">
          <h2 id="cite-heading">How to cite</h2>
          <p><cite>{releaseCitation(releaseId, SITE)}</cite></p>
          <p>
            The data changes with each release, so name the release. Use-case and model pages give a citation for the page itself. The <a href="/release-manifest.json">release manifest</a> lists the files of release <code>{releaseId}</code> with their checksums.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="scope-heading">
          <h2 id="scope-heading">What this page is not</h2>
          <p>
            This page is about data. It grants nothing in the software of this site or of the tools that build the release. The data is offered as it is, for research, with no warranty; it is not clinical advice.
          </p>
        </section>
      </div>
    </section>
  </>;
}
