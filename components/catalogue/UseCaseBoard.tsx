import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import { recordHref } from "@/lib/omics";
import { catalogueText } from "@/lib/catalogue-text";
import {
  BASIS_TEXT,
  REASON_TEXT,
  intervalText,
  positionText,
  strengthText,
  type Board,
  type BoardRow,
} from "@/lib/use-case-boards";
import styles from "./UseCases.module.css";
import chart from "./comparison.module.css";

type Lookup = (id: string) => CatalogueRecord | null;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function RecordName({ id, name, record, returnTo }: { id: string; name: string; record: Lookup; returnTo: string }) {
  const found = record(id);
  if (!found) return <>{catalogueText(name)}</>;
  return <a href={`${recordHref(found)}?return_to=${encodeURIComponent(returnTo)}`}>{catalogueText(name)}</a>;
}

/** The chart's 0 to 100 percent axis, inside the track's 3 percent margins. */
const along = (share: number) => 3 + 94 * share;

function StrengthBar({ row }: { row: BoardRow }) {
  const [low, high] = row.interval;
  return (
    <div className={styles.boardStrength}>
      <span className={styles.score}>{strengthText(row.strength)}</span>
      <div
        className={`${chart.track} ${styles.boardTrack}`}
        role="img"
        aria-label={`${catalogueText(row.name)}: ${strengthText(row.strength)} chance of beating an average model; ${intervalText(row.interval)} with any one study left out`}
      >
        <span className={chart.interval} style={{ left: `${along(low)}%`, width: `${along(high) - along(low)}%` }} />
        <span className={chart.dot} style={{ left: `${along(row.strength)}%` }} />
      </div>
      <span className={styles.muted} aria-hidden="true">{intervalText(row.interval)}</span>
    </div>
  );
}

function Studies({ row, board, record }: { row: BoardRow; board: Board; record: Lookup }) {
  const studies = Object.entries(row.studies).sort(([, a], [, b]) => b - a);
  return (
    <details className={styles.boardStudies}>
      <summary>{plural(studies.length, "study", "studies")}</summary>
      <ul>
        {studies.map(([id, comparisons]) => {
          const study = board.studies[id];
          return (
            <li key={id}>
              {study.source_ids.map((sourceId, i) => {
                const source = record(sourceId);
                return (
                  <span key={sourceId}>
                    {i > 0 && ", "}
                    {source ? <a href={recordHref(source)}>{catalogueText(source.name)}</a> : <code>{sourceId}</code>}
                  </span>
                );
              })}
              {study.dois.map((doi) => (
                <span key={doi}>
                  {" · "}
                  <a href={`https://doi.org/${doi}`}>doi:{doi}</a>
                </span>
              ))}
              <span className={styles.muted}> ({plural(comparisons, "comparison")})</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Row({ row, board, record, returnTo }: { row: BoardRow; board: Board; record: Lookup; returnTo: string }) {
  return (
    <tr>
      <td className={styles.score}>{positionText(row.positions)}</td>
      <th scope="row">
        <RecordName id={row.model_id} name={row.name} record={record} returnTo={returnTo} />
      </th>
      <td>
        <StrengthBar row={row} />
      </td>
      <td>
        <Studies row={row} board={board} record={record} />
      </td>
      <td className={styles.score}>{row.opponents}</td>
      <td className={styles.score}>{row.comparisons}</td>
      <td>{row.basis === "mostly one study" ? <strong>{BASIS_TEXT[row.basis]}</strong> : BASIS_TEXT[row.basis]}</td>
    </tr>
  );
}

/** The order across studies for one use case. The page renders it only for a board with two or more rows. */
export function UseCaseBoard({ board, record, returnTo }: { board: Board; record: Lookup; returnTo: string }) {
  const { counts } = board;
  return (
    <div className={styles.board} data-testid="use-case-board">
      <p>
        This order combines what each study shows about the models it tested side by side: which did better on the
        same data and metric. It gives no score, and it does not say what would happen if every model were run on one
        test. Each row pools a model&apos;s versions and sizes.
      </p>
      <p className={styles.muted}>
        {board.summary} Based on {plural(counts.models, "model")} in {plural(counts.groups, "comparison group")} from{" "}
        {plural(counts.studies, "study", "studies")}.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`Order across studies for ${board.title}`}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>Models for {board.title}, ordered by the comparisons studies made between them</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Model</th>
              <th scope="col">Chance of beating an average model, and its range with any one study left out</th>
              <th scope="col">Studies</th>
              <th scope="col">Opponents</th>
              <th scope="col">Comparisons</th>
              <th scope="col">Basis</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((item) => (
              <Row key={item.model_id} row={item} board={board} record={record} returnTo={returnTo} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.legend}>
        A position such as 1 to 3 means the studies do not settle the order between the models that share it. Opponents are the other models a model was compared with directly. Comparisons count each time a study
        scored it and another model on the same test. Basis says Mostly one study when one study gives 80 percent or
        more of its comparisons.
      </p>
      {board.not_ranked.length > 0 && (
        <details className={styles.disclosure} data-testid="use-case-board-not-ranked">
          <summary>Not ranked ({plural(board.not_ranked.length, "model")})</summary>
          <ul>
            {board.not_ranked.map((item) => (
              <li key={item.model_id}>
                <RecordName id={item.model_id} name={item.name} record={record} returnTo={returnTo} />: {REASON_TEXT[item.reason]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
