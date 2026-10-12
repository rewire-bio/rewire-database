import { dataPin } from "@/lib/data-pin";
import { kgManifestUrl } from "@/lib/agent-connect";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.redirect(kgManifestUrl(dataPin().release_id), 302);
}
