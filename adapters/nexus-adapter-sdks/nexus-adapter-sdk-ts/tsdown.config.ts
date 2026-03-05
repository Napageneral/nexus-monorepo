import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  outDir: "dist",
  platform: "node",
  fixedExtension: false,
  env: {
    NODE_ENV: "production",
  },
});

