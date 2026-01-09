/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation hook for running migrations on startup
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
