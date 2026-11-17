import { dataPin } from "@/lib/data-pin";
import { generateAgentsMd } from "@/lib/llm-discoverability";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(generateAgentsMd(dataPin().release_id), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
