/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for minimal Docker images
  output: 'standalone',
  // Custom port
  env: {
    PORT: '6969',
  },
  serverExternalPackages: ['puppeteer', 'israeli-bank-scrapers', 'bufferutil', 'utf-8-validate'],
};

export default nextConfig;
