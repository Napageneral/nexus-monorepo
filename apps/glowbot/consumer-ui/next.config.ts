import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "../consumer/dist",
  basePath: "/app/glowbot",
  turbopack: {
    root: "..",
  },
};

export default nextConfig;
