import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

export default defineConfig(() => {
  const envBase = process.env.NEXUS_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    plugins: [tailwindcss()],
    base,
    publicDir: path.resolve(here, "public"),
    resolve: {
      alias: {
        "~": path.resolve(here, "../../nex-operator-chat/app/src"),
      },
    },
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "dist"),
      emptyOutDir: true,
      sourcemap: true,
    },
    worker: {
      format: "es",
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      headers: {
        // Allow embedding in frontdoor shell iframe during development
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*",
      },
    },
  };
});
