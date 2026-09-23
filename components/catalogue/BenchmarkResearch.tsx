import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { recordHref, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import styles from "@/app/database/database.module.css";
import type { BenchmarkResearchData } from "@/services/omics/src/benchmark-research";
export type { BenchmarkResearchData };
export default function BenchmarkResearch({
  research,
  sources,
  results = 0,
}: {
  research: BenchmarkResearchData;
  sources: OmicsRecord[];
  /** Result rows the catalogue holds for this benchmark now, which may post-date
   * the literature check below. */
  results?: number;
}) {
  const papers = research.primary_sources.flatMap((id) =>
    sources.filter((source) => source.id === id),
  );
  return (
    <section id="papers" className={styles.section}>
      <h2>Papers and result coverage</h2>
      <p>
        Last literature check: {research.review_date}. {research.claim_scope}
      </p>
      {papers.length > 0 ? (
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label="Benchmark papers"
        >
          <table className={styles.resultTable}>
            <thead>
              <tr>
                <th scope="col">Paper or primary resource</th>
                <th scope="col">Version</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((source) => (
                <tr key={source.id}>
                  <th scope="row">
                    <Link href={recordHref(source)}>{catalogueText(source.name)}</Link>
                  </th>
                  <td>{String(source.attributes.version || "Not recorded")}</td>
                  <td>
                    {safeSourceUrl(source.attributes.url) && (
                      <a href={safeSourceUrl(source.attributes.url)}>
                        Read source
                      </a>
                    )}
                    {source.attributes.doi ? (
                      <div>DOI: {String(source.attributes.doi)}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No primary reference was verified in this search pass.</p>
      )}
      {research.gaps.length > 0 && (
        <details>
          <summary>Historical gaps recorded on {research.review_date}</summary>
          {results > 0 && (
            <p>
              The catalogue now holds {results.toLocaleString()} result rows for
              this benchmark. A note below about pending extraction describes
              the state on {research.review_date} and may since have been
              answered by a later batch. The result rows and their sources are
              the current record.
            </p>
          )}
          <ul>
            {research.gaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>Search and extraction details</summary>
        <p>{research.status.replace(/_/g, " ")}</p>
        <h4>Searches</h4>
        <ul>
          {research.searched_queries.map((query, i) => (
            <li key={i}>{query}</li>
          ))}
        </ul>
        <h4>Evidence locations</h4>
        <ul>
          {research.inspected_locators.map((locator, i) => (
            <li key={i}>{locator}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
