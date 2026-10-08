import { githubDownloadUrl } from "@/lib/downloads";
import styles from "@/app/database/database.module.css";

export function CatalogueDownloads({
  releaseId,
  releasedAt,
}: {
  releaseId: string;
  releasedAt: string;
}) {
  const release = `/omics/releases/${releaseId}`;
  return (
    <section id="downloads" className={styles.information}>
      <h2>Download the database</h2>
      <p className={styles.muted}>
        Release {releaseId} · {releasedAt.slice(0, 10)}
      </p>
      <p>Downloads are hosted on GitHub at the pinned data revision and compressed with gzip.</p>
      <div className={styles.downloads}>
        <a href={githubDownloadUrl(`${release}/records.jsonl`)}>
          JSONL (gzip)
        </a>
        <a href={githubDownloadUrl(`${release}/records.csv`)}>
          CSV (gzip)
        </a>
        <a href={githubDownloadUrl(`${release}/evidence.csv`)}>
          Evidence table (CSV) (gzip)
        </a>
        <a href={githubDownloadUrl(`${release}/evidence.jsonl`)}>
          Evidence table (JSONL) (gzip)
        </a>
        <a href="/evidence/">Evidence and review methods</a>
        <a href={githubDownloadUrl(`${release}/manifest.json`)}>Checksums and release manifest (gzip)</a>
      </div>
      <details>
        <summary>Original literature downloads</summary>
        <p>
          The original 100-paper collection is retained for citation history.
          These files include six result rows excluded from the current omics
          scope; use the database release above for the reviewed collection.
        </p>
        <div className={styles.downloads}>
          <a href={githubDownloadUrl("/benchmark-literature/results.csv")}>
            Original results CSV (gzip)
          </a>
          <a href={githubDownloadUrl("/benchmark-literature/papers.json")}>
            Original papers JSON (gzip)
          </a>
        </div>
      </details>
    </section>
  );
}
