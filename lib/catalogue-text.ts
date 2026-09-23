/** Render legacy embedded BEELINE conditions without changing reviewed records.
 * The known flat condition shape and empty condition placeholders are recognised. Other JSON (including
 * nested objects), malformed text and condition values are left unchanged.
 * Use on display text, never on source downloads, IDs or executable examples.
 */
export function catalogueText(text: string): string {
  // Empty generated condition groups add no distinguishing information to names.
  if (text.trim() === "{}") return "None recorded";
  text = text
    .replace(/(BEELINE[^{}\n]*?) · \{\}/g, "$1")
    .replaceAll(
      "Input conditions: {}.",
      "No additional input conditions recorded.",
    );
  if (
    !text.includes('"reference_network"') &&
    !text.includes('"gene_selection"')
  )
    return text;
  let output = "",
    start = 0,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!depth) {
      if (char !== "{") {
        output += char;
        continue;
      }
      start = i;
      depth = 1;
      quoted = false;
      escaped = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      const fragment = text.slice(start, i + 1);
      try {
        const value = JSON.parse(fragment) as Record<string, unknown>;
        const keys = Object.keys(value);
        output +=
          keys.length &&
          keys.every(
            (key) =>
              ["reference_network", "gene_selection"].includes(key) &&
              typeof value[key] === "string",
          )
            ? keys
                .map(
                  (key) =>
                    `${key === "reference_network" ? "Reference network" : "Gene selection"}: ${value[key]}`,
                )
                .join("; ")
            : fragment;
      } catch {
        output += fragment;
      }
    }
  }
  return output + (depth ? text.slice(start) : "");
}
