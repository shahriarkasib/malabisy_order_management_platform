import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Shopify hosts product images on a CDN — whitelist it for next/image
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.shopifycdn.com" },
    ],
  },
};

export default nextConfig;
