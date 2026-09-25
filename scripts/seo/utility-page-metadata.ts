import type { BreadcrumbItem } from "../../lib/catalogue-sharing";
import type { PageMetadataContract } from "./check-page-metadata";

/** Explicit contracts for the utility routes checked in the static export.
 * Keep unknown routes closed; breadcrumbs remain required and fully validated. */
export function utilityPageMetadata(path: string): PageMetadataContract {
  const database = { name: "Database", path: "/" };
  const runs = { name: "Rewire evaluations", path: "/?kind=result&origin=rewire#browse" };
  const breadcrumbs: Record<string, BreadcrumbItem[] | undefined> = {
    "/evidence/": [database, { name: "Evidence and sources", path: "/evidence/" }],
    "/audits/": undefined,
    "/runs/mfass-v1/": [database, runs, { name: "MFASS v1 archive", path: "/runs/mfass-v1/" }],
    "/runs/mfass-v2/": [database, runs, { name: "MFASS v2", path: "/runs/mfass-v2/" }],
    "/contribute/": [database, { name: "Contribute", path: "/contribute/" }],
  };
  if (!Object.hasOwn(breadcrumbs, path)) throw new Error(`Unknown utility metadata contract: ${path}`);
  const indexable = !["/runs/mfass-v1/", "/contribute/"].includes(path);
  return {
    path, canonical: `https://benchmarks.rewire.it${path}`, indexable,
    inSitemap: indexable, social: path !== "/contribute/", breadcrumbs: breadcrumbs[path],
  };
}
