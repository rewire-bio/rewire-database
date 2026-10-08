import type { Metadata } from "next";
import { loadRecordPage, recordPageMetadata } from "@/lib/record-page";
import { EvaluationDetail } from "./detail";

type Params = { id: string };

// Rendered on request from the pinned release's prepared page document. The
// edge cache serves repeat reads; this server keeps no page cache of its own.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return recordPageMetadata(await loadRecordPage("evaluation", params.id));
}

export default async function Page({ params }: { params: Params }) {
  return <EvaluationDetail page={await loadRecordPage("evaluation", params.id)} />;
}
