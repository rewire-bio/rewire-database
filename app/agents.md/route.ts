import { dataPin } from "@/lib/data-pin";
import { agentGuide } from "@/lib/agent-connect";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(agentGuide(dataPin().release_id), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
