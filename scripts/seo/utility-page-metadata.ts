import type { PageMetadataContract } from "./check-page-metadata";

// Keep these export expectations independent of the page components so that
// missing or changed navigation is detected against the intended hierarchy.
const pages: Omit<PageMetadataContract, "canonical">[] = [
  {
    path: "/evidence/",
    indexable: true,
    inSitemap: true,
    social: true,
    breadcrumbs: [
      { name: "Database", path: "/" },
      { name: "Evidence and sources", path: "/evidence/" },
    ],
  },
  {
    path: "/audits/",
    indexable: true,
    inSitemap: true,
    social: true,
  },
  {
    path: "/runs/mfass-v1/",
    indexable: false,
    inSitemap: false,
    social: true,
    breadcrumbs: [
      { name: "Database", path: "/" },
      { name: "Rewire evaluations", path: "/?kind=result&origin=rewire#browse" },
      { name: "MFASS v1 archive", path: "/runs/mfass-v1/" },
    ],
  },
  {
    path: "/runs/mfass-v2/",
    indexable: true,
    inSitemap: true,
    social: true,
    breadcrumbs: [
      { name: "Database", path: "/" },
      { name: "Rewire evaluations", path: "/?kind=result&origin=rewire#browse" },
      { name: "MFASS v2", path: "/runs/mfass-v2/" },
    ],
  },
  {
    path: "/contribute/",
    indexable: false,
    inSitemap: false,
    social: false,
    breadcrumbs: [
      { name: "Database", path: "/" },
      { name: "Contribute", path: "/contribute/" },
    ],
  },
];

export const utilityPageMetadataContracts: PageMetadataContract[] = pages.map(
  (page) => ({
    ...page,
    canonical: new URL(page.path, "https://benchmarks.rewirebio.io").href,
  }),
);
