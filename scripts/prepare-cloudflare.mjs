import { readdir, lstat, mkdir, link, copyFile, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isProxied } from "../cloudflare/routing.mjs";

export async function prepareCloudflare(root = process.cwd()) {
  const input = path.join(root, "out");
  const output = path.join(root, ".cloudflare/assets");
  await readFile(path.join(input, "index.html"));
  await readFile(path.join(input, "404.html"));
  const files = [];
  let omitted = 0;
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(input, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (isProxied(`/${name}`)) { omitted++; continue; }
      const stat = await lstat(path.join(input, name));
      if (stat.isSymbolicLink()) throw new Error(`Refusing exported symlink: ${name}`);
      if (stat.isDirectory()) await walk(name);
      else if (stat.isFile()) {
        if (stat.size > 25 * 1024 * 1024) throw new Error(`Cloudflare asset exceeds 25 MiB: ${name}`);
        files.push(name);
      }
    }
  }
  await walk();
  if (files.length + 1 > 20_000) throw new Error(`Cloudflare Free asset limit exceeded: ${files.length + 1}; no upload prepared`);
  await rm(output, { force: true, recursive: true });
  await mkdir(output, { recursive: true });
  for (const name of files) {
    const target = path.join(output, name);
    await mkdir(path.dirname(target), { recursive: true });
    try { await link(path.join(input, name), target); }
    catch (error) { if (error.code !== "EXDEV") throw error; await copyFile(path.join(input, name), target); }
  }
  await writeFile(path.join(output, "_headers"), `/icon
  Content-Type: image/png
/apple-icon
  Content-Type: image/png
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
/contribute
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
/contribute/*
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
/_analytics
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
/_analytics/*
  Content-Security-Policy: frame-ancestors https://benchmarks.rewire.it https://benchmarks.rewirebio.io
  Cache-Control: no-store
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
`);
  const inventory = { static_files: files.length + 1, proxied_roots: omitted };
  await writeFile(path.join(root, ".cloudflare/inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
  return inventory;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await prepareCloudflare(), null, 2));
}
