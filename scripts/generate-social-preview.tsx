/** Deterministic static PNG using Next's already installed renderer and bundled font.
 * Run: npx tsx scripts/generate-social-preview.tsx
 * No network, scientific data, release writes, or extra packages.
 */
import React from "react";
import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

async function main() {
  const image = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#111f25", color: "#f5f4ed", padding: "56px 64px", borderBottom: "18px solid #7dd3be" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 27, color: "#7dd3be" }}><span>rewirebio.io</span><span>benchmarks.rewirebio.io</span></div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 68, lineHeight: 1.12, letterSpacing: -2 }}>Biological model</div>
        <div style={{ fontSize: 68, lineHeight: 1.12, letterSpacing: -2 }}>benchmark database</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        <div style={{ fontSize: 29 }}>Models · Benchmarks · Source-linked evidence</div>
        <div style={{ fontSize: 24, color: "#b1c3c7" }}>Inspect evaluation conditions, results and sources.</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
  const target = path.resolve("public/images/social/catalogue.png");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await image.arrayBuffer()));
  console.log(target);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
