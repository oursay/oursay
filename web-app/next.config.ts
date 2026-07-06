import type { NextConfig } from "next";

/** Backend origin for `/v1/*` rewrites. Override with OURSAY_API_URL when not on :6173. */
const API_ORIGIN = process.env.OURSAY_API_URL ?? "http://localhost:6173";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_ORIGIN}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
