import { dataPin } from "@/lib/data-pin";
import { kgArchiveUrl } from "@/lib/agent-connect";

// A stable address for MCP clients: the knowledge-graph bundle of the release this revision serves.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.redirect(kgArchiveUrl(dataPin().release_id), 302);
}
