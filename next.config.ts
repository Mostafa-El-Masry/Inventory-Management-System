import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev output isolated so `next build` can run while a dev server is open.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
