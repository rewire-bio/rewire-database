import { handlePublicApi } from "@/lib/public-api";

// The keyless read-only JSON API (lib/public-api.ts). The Cloudflare Worker routes /api/v1 here
// and every other /api path to Firebase. GET only: nothing under this path writes.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handlePublicApi(request);
}
