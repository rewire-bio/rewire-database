import { computeRendererEpoch } from "./scripts/detail-cache/renderer-epoch.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Enables static export for the app.
   * This generates a completely static site in the 'out' folder,
   * which can be deployed to any static hosting service like Cloudflare Workers Static Assets.
   * @see https://nextjs.org/docs/app/building-your-application/deploying/static-exports
   */
  output: "export",
  // Each worker holds the reviewed catalogue; keep builds within laptop/CI memory.
  experimental: { cpus: 2 },
  trailingSlash: true,
  // Only pin buildId when the detail-page cache (issue #89 prototype) is in
  // use: a previously-cached page's HTML is only a valid reference into a
  // later build's static chunks if buildId (and therefore chunk hashing) is
  // reproducible across builds with unchanged renderer code. Default builds,
  // including the PR smoke build, are unaffected and keep Next's normal
  // random buildId.
  ...(process.env.DETAIL_CACHE === "1"
    ? { generateBuildId: () => process.env.DETAIL_CACHE_EPOCH || computeRendererEpoch() }
    : {}),
  webpack(config) {
    // Shared Firebase modules use NodeNext .js specifiers; resolve their TS
    // sources when bundling the static website, while retaining real JS imports.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
