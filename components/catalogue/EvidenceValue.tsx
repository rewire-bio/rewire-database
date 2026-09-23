import { Fragment } from "react";
import { catalogueText } from "@/lib/catalogue-text";

const readableFields = new Set([
  "name",
  "description",
  "attributes.comparison.inputs",
]);
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <>Not reported</>;
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    ) : (
      <>None recorded</>
    );
  if (typeof value === "object")
    return Object.keys(value).length ? (
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <Fragment key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>
              <Value value={item} />
            </dd>
          </Fragment>
        ))}
      </dl>
    ) : (
      <>None recorded</>
    );
  return <>{String(value)}</>;
}

/** value_json preserves the original type. Never interpret a source string as
 * another JSON document, or change executable instructions and audit values.
 */
export default function EvidenceValue({
  valueJson,
  fallback,
  fieldPath,
}: {
  valueJson: string;
  fallback: string;
  fieldPath: string;
}) {
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    value = fallback;
  }
  if (typeof value === "string")
    return (
      <>
        {(readableFields.has(fieldPath) ? catalogueText(value) : value) ||
          "No value recorded"}
      </>
    );
  if (value !== null && typeof value === "object") {
    const size = Array.isArray(value)
      ? value.length
      : Object.keys(value).length;
    if (!size) return <>None recorded</>;
    const narrative =
      /(?:\.diagram\.steps|\.gaps)$/.test(fieldPath) && Array.isArray(value);
    return narrative ? (
      <Value value={value} />
    ) : (
      <details>
        <summary>
          {size} {Array.isArray(value) ? "values" : "fields"}
        </summary>
        <Value value={value} />
      </details>
    );
  }
  return <Value value={value} />;
}
