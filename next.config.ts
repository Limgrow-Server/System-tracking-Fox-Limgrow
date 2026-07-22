import type { NextConfig } from "next";

const systemTrackingApiUrl =
  process.env.SYSTEM_TRACKING_API_URL ||
  process.env.SYSTEM_TRACKING_FUNCTIONS_BASE_URL ||
  `http://127.0.0.1:${process.env.SYSTEM_TRACKING_API_PORT || "2156"}`;

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${systemTrackingApiUrl.replace(/\/+$/, "")}/api/:path*`,
        },
        {
          source: "/functions/v1/:path*",
          destination: `${systemTrackingApiUrl.replace(/\/+$/, "")}/functions/v1/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
