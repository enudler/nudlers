/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for minimal Docker images
  output: 'standalone',
  // Enable instrumentation hook for logging interception
  experimental: {
    instrumentationHook: true,
  },
  // Custom port
  env: {
    PORT: '6969',
  },
};

export default nextConfig;
