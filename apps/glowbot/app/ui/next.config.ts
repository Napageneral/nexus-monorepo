import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  distDir: "../dist",
  basePath: "/app/glowbot",
  turbopack: {
    root: path.resolve(packageRoot),
  },
};

export default nextConfig;
