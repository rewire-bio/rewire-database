import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { ModelReachMatrix } from "@/components/catalogue/ModelReach";
import { buildCatalogue } from "@/lib/catalogue-build";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { reachFromBoardsFile, RULE } from "@/lib/model-reach";
import { releaseBoardsFile } from "@/lib/use-case-boards";
import styles from "@/app/database/database.module.css";

const title = "Models across use cases | rewirebio.io";
const description =
  "Where each biological AI model places on use-case boards across multiple groups of biological tasks, from head-to-head study comparisons.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "https://benchmarks.rewirebio.io/models/reach/" },
  ...socialMetadata({ title, description, path: "/models/reach/" }),
};

export default function ModelsReachPage() {
  const { catalogue, query } = buildCatalogue();
  const { rows, columns, groups } = reachFromBoardsFile(
    releaseBoardsFile(catalogue.release_id),
    (id) => query.record(id)?.kind ?? null,
  );
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { name: "Database", path: "/" },
          { name: "Models", path: "/models/" },
          { name: "Across use cases", path: "/models/reach/" },
        ]}
        eyebrow={["Models", `Release ${catalogue.release_id}`]}
        title="Models across use cases"
        intro="Each column is a use-case board built from head-to-head comparisons inside studies. Bars show the range of positions a model holds on that board, with first on the left."
      />
      <div className="wrap content">
        {rows.length > 0 ? (
          <section className={styles.leaderboardSection} aria-labelledby="reach-table-heading">
            <h2 id="reach-table-heading">Model reach across boards ({rows.length} models)</h2>
            <p className={styles.sectionIntro}>{RULE}</p>
            <ModelReachMatrix rows={rows} columns={columns} groups={groups} />
            <p className={styles.inlineLinks}>
              <a href="/models/">Browse all model records</a> · <a href="/use-cases/">Browse all use cases</a>
            </p>
          </section>
        ) : (
          <section className={styles.leaderboardSection}>
            <h2>No cross-use-case board data in this release</h2>
            <p>Release {catalogue.release_id} does not include use-case boards yet.</p>
            <p className={styles.inlineLinks}>
              <a href="/models/">Browse all model records</a> · <a href="/use-cases/">Browse all use cases</a>
            </p>
          </section>
        )}
      </div>
    </>
  );
}
