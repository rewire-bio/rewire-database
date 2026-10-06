import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref, displayValue } from "@/lib/omics";
import {
  singularKindLabels,
  statusLabel,
  explorerPrintedScore,
  researchAreaLabel,
  countLabel,
  supportsEvaluationSummary,
} from "@/lib/omics-browse";
import { ResearchReadinessSummary } from "@/components/catalogue/ResearchReadiness";
import styles from "./database.module.css";
import ui from "./Explorer.module.css";
import type { ExplorerState } from "./useCatalogueExplorer";

export function ExplorerRows({
  data,
  loading,
  selected,
  setSelected,
  returnTo,
}: Pick<
  ExplorerState,
  "data" | "loading" | "selected" | "setSelected" | "returnTo"
>) {
  return (
    <div className={ui.rows} aria-busy={loading}>
      {data.items.map((record) => (
        <article className={ui.row} key={record.id}>
          <span className={styles.tag}>
            {singularKindLabels[record.kind]} · {statusLabel(record.status)}
          </span>
          <h3>
            <Link
              href={`${recordHref(record)}?return_to=${encodeURIComponent(returnTo)}`}
            >
              {catalogueText(record.name)}
            </Link>
          </h3>
          <p className={ui.description}>
            {catalogueText(
              (record.attributes.profile as { summary?: string } | undefined)
                ?.summary || record.description,
            )}
          </p>
          {record.kind === "result" && (
            <>
              <p>
                <strong>
                  {explorerPrintedScore(
                    record.attributes.printed_value,
                    record.attributes.unit,
                  )}
                </strong>{" "}
                · {displayValue(record.attributes.metric)}
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={selected.includes(record.id)}
                  disabled={
                    !selected.includes(record.id) && selected.length >= 20
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, record.id]
                        : selected.filter((id) => id !== record.id),
                    )
                  }
                />
                Include in compatibility check
              </label>
            </>
          )}
          <p className={styles.muted}>
            {(record.facets.areas || []).map(researchAreaLabel).join(" · ")}
            {record.facets.areas?.length ? " · " : ""}
            {countLabel(record.source_ids.length, "source")}
          </p>
          {supportsEvaluationSummary(record.kind) &&
            data.evaluation_summaries?.[record.id] && (
              <p className={ui.counts}>
                {data.evaluation_summaries[record.id].evaluation_count > 0
                  ? `${countLabel(data.evaluation_summaries[record.id].evaluation_count, "evaluation")} · ${countLabel(data.evaluation_summaries[record.id].result_count, "result")}`
                  : "No evaluations linked in this release"}
              </p>
            )}
          {data.research_readiness?.find(
            (item) => item.record_id === record.id,
          ) && (
            <ResearchReadinessSummary
              assessment={data.research_readiness.find(
                (item) => item.record_id === record.id,
              )!}
              href={recordHref(record)}
            />
          )}
        </article>
      ))}
    </div>
  );
}
