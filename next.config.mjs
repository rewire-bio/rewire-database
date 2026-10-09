const privateHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained Node server for Cloud Run. The image holds code only:
  // scripts/server-entry.mjs fixes the data pin at startup and every page
  // renders on request from that release (see app/layout.tsx).
  output: "standalone",
  trailingSlash: true,
  poweredByHeader: false,
  experimental: {
    cpus: 2,
    // The server reads the release only from the image's data/ directory
    // (scripts/build-web.mjs); checkout data must not be traced into the bundle.
    outputFileTracingExcludes: {
      // Patterns also match inside node_modules, so name only this checkout's data paths.
      "*": ["benchmark-data.lock.json", "public/omics/**", "public/benchmark-literature/**", "data/omics/**", "data/benchmark-literature/**",
        "data/benchmark-runs/**", "workbench/**", "services/omics/node_modules/**", "services/omics/dist/**"],
    },
  },
  async headers() {
    return [
      { source: "/contribute/:path*", headers: privateHeaders },
      {
        source: "/_analytics/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors https://benchmarks.rewire.it https://benchmarks.rewirebio.io" },
          ...privateHeaders,
        ],
      },
    ];
  },
  async rewrites() {
    // Static hosting served this directory index; the Node server needs the file named.
    return { beforeFiles: [{ source: "/_analytics/", destination: "/_analytics/index.html" }] };
  },
  webpack(config) {
    // shared/omics modules use NodeNext .js specifiers; resolve their TS
    // sources when bundling the website, while retaining real JS imports.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
