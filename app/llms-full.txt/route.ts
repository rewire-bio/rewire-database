import { dataPin } from "@/lib/data-pin";
import { allUseCaseLeaderboards } from "@/lib/release-leaderboard";
import { generateLlmsFullText } from "@/lib/llm-discoverability";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(generateLlmsFullText(dataPin().release_id, allUseCaseLeaderboards()), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
