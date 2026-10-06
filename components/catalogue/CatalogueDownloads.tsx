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
      <div className={styles.downloads}>
        <a href={`${release}/records.jsonl`} download>
          JSONL
        </a>
        <a href={`${release}/records.csv`} download>
          CSV
        </a>
        <a href={`${release}/evidence.csv`} download>
          Evidence table (CSV)
        </a>
        <a href={`${release}/evidence.jsonl`} download>
          Evidence table (JSONL)
        </a>
        <a href="/evidence/">Evidence and review methods</a>
        <a href={`${release}/manifest.json`}>Checksums and release manifest</a>
      </div>
      <details>
        <summary>Original literature downloads</summary>
        <p>
          The original 100-paper collection is retained for citation history.
          These files include six result rows excluded from the current omics
          scope; use the database release above for the reviewed collection.
        </p>
        <div className={styles.downloads}>
          <a href="/benchmark-literature/results.csv" download>
            Original results CSV
          </a>
          <a href="/benchmark-literature/papers.json" download>
            Original papers JSON
          </a>
        </div>
      </details>
    </section>
  );
}
