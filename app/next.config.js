/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation hook for running migrations on startup
  experimental: {
    instrumentationHook: true,
  },
  // Standalone output for minimal Docker images
  output: 'standalone',
};

export default nextConfig;
