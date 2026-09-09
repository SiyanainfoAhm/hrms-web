import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Next.js 16 removed buildActivity; false hides the on-screen route indicator.
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**"
      }
    ]
  }
};

export default nextConfig;
