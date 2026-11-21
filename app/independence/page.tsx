import type { Metadata } from "next";
import { SITE } from "@/lib/agent-connect";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { INDEPENDENCE_PATH } from "@/lib/data-licence";
import { OWNER_STATEMENTS } from "@/lib/independence";
import IndependencePolicy, { releasePolicyFacts } from "./policy";

export const dynamic = "force-dynamic";

const pageMetadata = {
  title: "Independence policy | Benchmark database",
  description: "Who runs the Rewire benchmark database, what it will not take payment for, how results are labelled by who produced them, and how corrections, disputes and takedowns are handled.",
  alternates: { canonical: `${SITE}${INDEPENDENCE_PATH}` },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

export default function IndependencePage() {
  const { releaseId, facts } = releasePolicyFacts();
  return <IndependencePolicy releaseId={releaseId} statements={OWNER_STATEMENTS} facts={facts} />;
}
