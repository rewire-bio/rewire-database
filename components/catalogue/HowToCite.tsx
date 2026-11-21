import { SITE } from "@/lib/agent-connect";
import { DATA_LICENCE, LICENCE_PATH, pageCitation } from "@/lib/data-licence";

/**
 * How to cite one page of the release: the citation string, the release id and the licence
 * position. Server-rendered text only, in the styles of the page it sits on. `compact` is one
 * paragraph, for a page whose release id is already printed beside it.
 */
export default function HowToCite({ title, path, releaseId, className, compact = false }: {
  /** The page's title as it should appear in a citation. */
  title: string;
  /** The page's site path, with both slashes. */
  path: string;
  releaseId: string;
  className?: string;
  compact?: boolean;
}) {
  const citation = <cite>{pageCitation(title, path, releaseId, SITE)}</cite>;
  if (compact) return <p id="cite" className={className}>
    How to cite: {citation} Keep the release id, <code>{releaseId}</code>, in the citation. <a href={LICENCE_PATH}>Data licence</a>
  </p>;
  return <section id="cite" className={className}>
    <h2>How to cite</h2>
    <p>{citation}</p>
    <p>
      Release <code>{releaseId}</code>. Rankings and values change between releases, so keep the release id in the citation. Cite the original publication as well for any value you reuse: each result links its source.
    </p>
    <p>{DATA_LICENCE.statement} <a href={LICENCE_PATH}>Data licence</a></p>
  </section>;
}
