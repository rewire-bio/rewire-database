import fs from "node:fs";
import { dataPath } from "@/lib/data-pin";

// The pinned release's manifest bytes, exactly as the producer published them.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(fs.readFileSync(dataPath("public/omics/manifest.json")), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
