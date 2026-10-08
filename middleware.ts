import { NextResponse, type NextRequest } from "next/server";
import { publicRequest } from "./cloudflare/page-cache.mjs";

/**
 * Every response names the image and data release it was rendered from, so
 * the edge cache can key on them. Anonymous public GETs are explicitly opted
 * in to edge caching; everything else keeps Next's own private headers. The
 * values come from the container entrypoint at startup, not from the build.
 * Next removes RSC request headers before middleware runs, so RSC responses
 * also carry the opt-in; the Worker refuses them by request header and by
 * their text/x-component type.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Rewire-Frontend", process.env.REWIRE_FRONTEND_VERSION || "");
  response.headers.set("X-Rewire-Data-Release", process.env.REWIRE_DATA_RELEASE || "");
  if (publicRequest({ method: request.method, url: request.nextUrl, header: (name: string) => request.headers.get(name) }))
    response.headers.set("X-Rewire-Edge-Cache", "public");
  return response;
}
