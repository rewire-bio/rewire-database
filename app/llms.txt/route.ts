import { dataPin } from "@/lib/data-pin";
import { generateLlmsTxt } from "@/lib/llm-discoverability";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(generateLlmsTxt(dataPin().release_id), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
