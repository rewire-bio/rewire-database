import { downloadRedirect } from "@/lib/download-map";

// Release exports live on GitHub; this redirects to the pinned exact file.
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: { path: string[] } }) {
  return downloadRedirect(`/omics/${params.path.join("/")}`, request);
}
export const HEAD = GET;
