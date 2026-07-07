import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const webAppDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(webAppDir, "..");

// Match @oursay/api: repo-root .env first, then web-app overrides.
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(webAppDir, ".env") });
dotenv.config({ path: path.join(webAppDir, ".env.local") });

/** Backend origin for `/v1/*` rewrites. Override with OURSAY_API_URL when not on :6173. */
const API_ORIGIN = process.env.OURSAY_API_URL ?? "http://localhost:6173";

const mockOnly =
  process.env.NEXT_PUBLIC_MOCK_ONLY !== "0" &&
  process.env.NEXT_PUBLIC_MOCK_ONLY !== "false";

if (mockOnly) {
  console.warn(
    "[web-app] Mock mode (NEXT_PUBLIC_MOCK_ONLY unset) — register/login skip the API; OTP is not sent.",
  );
} else {
  console.log(`[web-app] Live mode — /v1/* proxied to ${API_ORIGIN}`);
}

const extensionAlias = {
  ".js": [".ts", ".tsx", ".js", ".jsx"],
};

const nextConfig: NextConfig = {
  transpilePackages: ["@oursay/identity", "@oursay/public-record"],
  // Workspace packages use Node/Bundler ESM specifiers (import "./foo.js" → foo.ts).
  // Webpack resolves these via extensionAlias; Turbopack (Next 16 dev default) does not yet.
  experimental: {
    extensionAlias,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ...extensionAlias,
    };
    return config;
  },
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
