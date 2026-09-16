/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Enables static export for the app.
   * This generates a completely static site in the 'out' folder,
   * which can be deployed to any static hosting service like Cloudflare Workers Static Assets.
   * @see https://nextjs.org/docs/app/building-your-application/deploying/static-exports
   */
  output: "export",
  trailingSlash: true,
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
