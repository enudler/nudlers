/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for minimal Docker images
  output: 'standalone',
  // Custom port
  env: {
    PORT: '6969',
  },
};

export default nextConfig;
