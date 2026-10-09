import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { catalogueRouter } from "@/lib/catalogue-api";

// Public catalogue procedures (/api/trpc/catalogue.*). The Cloudflare Worker
// routes only these here; submissions and curation stay on Firebase.
export const dynamic = "force-dynamic";
const router = catalogueRouter();

export function GET(request: Request) {
  return fetchRequestHandler({ endpoint: "/api/trpc", req: request, router, createContext: () => ({}) });
}
