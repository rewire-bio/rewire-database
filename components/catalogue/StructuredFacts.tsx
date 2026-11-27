import type { ReactNode } from "react";
import { Evidence } from "./Profile";
import { catalogueText } from "@/lib/catalogue-text";
import { safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { NOT_RECORDED } from "@/lib/operational-telemetry";
import {
  formatParameters,
  recordBenchmarkTasks,
  recordCheckpoints,
  type BenchmarkTask,
  type Checkpoint,
} from "@/lib/structured-facts";
import styles from "@/app/database/database.module.css";

export const SHOWN_TASKS = 12;

const orUnknown = (value: string | null) => value ?? NOT_RECORDED;

function amount(value: number | null, unit: string | null): string {
  if (value === null) return NOT_RECORDED;
  return unit ? `${value.toLocaleString("en-GB")} ${unit}` : value.toLocaleString("en-GB");
}

function LinkList({ links, row }: { links: [string, string | null][]; row: string }) {
  const safe = links.flatMap(([label, url]) => {
    const href = safeSourceUrl(url);
    return href ? [[label, href] as const] : [];
  });
  if (!safe.length) return <>{NOT_RECORDED}</>;
  return (
    <>
      {safe.map(([label, href], index) => (
        <span key={label}>
          {index > 0 ? " · " : ""}
          <a href={href} aria-label={`${label}: ${row}`}>
            {label}
          </a>
        </span>
      ))}
    </>
  );
}

function SourceList({ ids, locator, sources }: { ids: string[]; locator: string; sources: OmicsRecord[] }) {
  return (
    <details className={styles.factSources}>
      <summary>Sources ({ids.length})</summary>
      <Evidence ids={ids} locator={locator} sources={sources} />
    </details>
  );
}

function FactTable({ label, caption, columns, children }: { label: string; caption: string; columns: string[]; children: ReactNode }) {
  return (
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={label}>
      <table className={styles.resultTable}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

function CheckpointRow({ item, sources }: { item: Checkpoint; sources: OmicsRecord[] }) {
  return (
    <tr>
      <th scope="row">
        {item.checkpoint}
        {item.gated === true && <span className={styles.muted}> · Gated</span>}
      </th>
      <td className={styles.numericValue}>{item.parameters === null ? NOT_RECORDED : formatParameters(item.parameters)}</td>
      <td>{amount(item.context_length, item.context_unit)}</td>
      <td>{orUnknown(item.weights_licence)}</td>
      <td>{orUnknown(item.code_licence)}</td>
      <td>{orUnknown(item.released)}</td>
      <td>
        <LinkList
          row={item.checkpoint}
          links={[
            ["Weights", item.weights_url],
            ["Code", item.code_url],
          ]}
        />
      </td>
      <td>
        <SourceList ids={item.source_ids} locator={item.source_locator} sources={sources} />
      </td>
    </tr>
  );
}

/** The released checkpoints of a model, shown only when the record carries a valid list. */
export function ReleasedCheckpoints({ record, sources }: { record: OmicsRecord; sources: OmicsRecord[] }) {
  const checkpoints = recordCheckpoints(record);
  if (!checkpoints) return null;
  return (
    <section id="checkpoints" className={`${styles.section} ${styles.factTable}`} aria-labelledby="checkpoints-title">
      <h3 id="checkpoints-title">Released checkpoints</h3>
      <p>Each row is one released checkpoint, as stated in the cited sources.</p>
      <FactTable
        label="Released checkpoints"
        caption={`Checkpoints of ${catalogueText(record.name)}`}
        columns={["Checkpoint", "Parameters", "Context", "Weights licence", "Code licence", "Released", "Links", "Sources"]}
      >
        <tbody>
          {checkpoints.map((item, i) => (
            <CheckpointRow key={i} item={item} sources={sources} />
          ))}
        </tbody>
      </FactTable>
    </section>
  );
}

function metric(item: BenchmarkTask): string {
  if (item.primary_metric === null) return NOT_RECORDED;
  if (item.metric_direction === null) return item.primary_metric;
  return `${item.primary_metric} (${item.metric_direction} is better)`;
}

function TaskRow({ item, sources }: { item: BenchmarkTask; sources: OmicsRecord[] }) {
  return (
    <tr>
      <th scope="row">{item.task}</th>
      <td>{orUnknown(item.dataset)}</td>
      <td>{amount(item.size, item.size_unit)}</td>
      <td>{orUnknown(item.split)}</td>
      <td>{metric(item)}</td>
      <td>
        <LinkList
          row={item.task}
          links={[
            ["Data", item.data_url],
            ["Code", item.code_url],
            ["Results", item.results_url],
          ]}
        />
      </td>
      <td>
        <SourceList ids={item.source_ids} locator={item.source_locator} sources={sources} />
      </td>
    </tr>
  );
}

/** The tasks of a benchmark, shown only when the record carries a valid list. */
export function BenchmarkTasks({ record, sources }: { record: OmicsRecord; sources: OmicsRecord[] }) {
  const tasks = recordBenchmarkTasks(record);
  if (!tasks) return null;
  const long = tasks.length > SHOWN_TASKS;
  const row = (item: BenchmarkTask, i: number) => <TaskRow key={i} item={item} sources={sources} />;
  return (
    <section id="tasks" className={`${styles.section} ${styles.factTable}`} aria-labelledby="tasks-title">
      <h2 id="tasks-title">Tasks</h2>
      <p>Each row is one task of this benchmark, as stated in the cited sources.</p>
      <FactTable
        label="Benchmark tasks"
        caption={`Tasks in ${catalogueText(record.name)}`}
        columns={["Task", "Dataset", "Size", "Split", "Metric", "Links", "Sources"]}
      >
        <tbody>{(long ? tasks.slice(0, SHOWN_TASKS) : tasks).map(row)}</tbody>
        {long && <tbody className={styles.extraRows}>{tasks.slice(SHOWN_TASKS).map((item, i) => row(item, i + SHOWN_TASKS))}</tbody>}
      </FactTable>
      {long && (
        <details className={styles.showAll}>
          <summary>
            <span className={styles.showMore}>Show all {tasks.length} tasks</span>
            <span className={styles.showFewer}>Show the first {SHOWN_TASKS} tasks only</span>
          </summary>
        </details>
      )}
    </section>
  );
}
