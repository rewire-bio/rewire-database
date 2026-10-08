import { notFound } from "next/navigation";
import { localRecordPage } from "../../lib/record-page-local";
import type { RecordPageKind } from "../../lib/record-page";

/** vi.mock factory: page routes read the mocked local catalogue through the
 * importer's page builder instead of the production API. */
export async function localRecordPages(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as typeof import("../../lib/record-page");
  return {
    ...actual,
    loadRecordPage: async (kind: RecordPageKind, id: string) => {
      const page = localRecordPage(kind, id);
      if (!page) notFound();
      return page;
    },
  };
}
