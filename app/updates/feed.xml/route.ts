import { buildCatalogue } from "@/lib/catalogue-build";
import { readRefresh } from "@/lib/refresh-build";
import { publicationFeed } from "@/lib/refresh";

export const dynamic = "force-static";

export function GET() {
  const { catalogue } = buildCatalogue();
  return new Response(publicationFeed(readRefresh(process.cwd(), catalogue.release_id)), {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
