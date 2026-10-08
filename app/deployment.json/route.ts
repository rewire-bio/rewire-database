// The publication receipt of this revision: its image commit and data pin.
// The entrypoint has already checked it against the running image and pin.
export const dynamic = "force-dynamic";

export function GET() {
  const receipt = process.env.REWIRE_DEPLOYMENT_RECEIPT;
  if (!receipt) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(JSON.stringify(JSON.parse(receipt), null, 2) + "\n", {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
