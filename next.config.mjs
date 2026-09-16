/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Enables static export for the app.
   * This generates a completely static site in the 'out' folder,
   * which can be deployed to any static hosting service like Google Cloud Storage.
   * @see https://nextjs.org/docs/app/building-your-application/deploying/static-exports
   */
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
