/** Preserve legacy filters while letting the destination define its own view. */
export function legacyCatalogueDestination(
  target: string,
  search = "",
  hash = "",
): string {
  const base = "https://benchmarks.rewire.it";
  if (!target.startsWith("/") || target.startsWith("//"))
    throw new Error("Catalogue redirects must use a local path.");
  const destination = new URL(target, base);
  if (
    destination.origin !== base ||
    destination.username ||
    destination.password
  )
    throw new Error("Catalogue redirects must stay on benchmarks.rewire.it.");
  const params = new URLSearchParams(search);
  const targetKeys = new Set(destination.searchParams.keys());
  for (const key of targetKeys) params.delete(key);
  destination.searchParams.forEach((value, key) => params.append(key, value));
  const query = params.toString();
  // Keep an explicitly requested fragment; use the destination's browse anchor otherwise.
  const fragment = hash
    ? hash.startsWith("#")
      ? hash
      : `#${hash}`
    : destination.hash;
  return `${destination.pathname}${query ? `?${query}` : ""}${fragment}`;
}
