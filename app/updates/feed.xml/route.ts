import { buildCatalogue } from "@/lib/catalogue-build";
import { readRefresh } from "@/lib/refresh-build";
import { publicationFeed } from "@/lib/refresh";

// Generated from the running revision's pinned release, like every page.
export const dynamic = "force-dynamic";

export function GET() {
  const { catalogue } = buildCatalogue();
  return new Response(publicationFeed(readRefresh(undefined, catalogue.release_id)), {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
