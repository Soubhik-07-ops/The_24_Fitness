import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // SEO and Performance optimizations
  compress: true,
  poweredByHeader: false, // Remove X-Powered-By header for security
  // Ensure proper image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    domains: [], // Add any external image domains if needed
  },
};

export default nextConfig;
