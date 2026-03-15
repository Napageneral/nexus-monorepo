"use strict";

const { access, mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function ensureFile(filePath) {
  await access(filePath);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const requiredFiles = [
    "index.html",
    "app.js",
    "styles.css",
    "vercel.json",
    "api/login.js",
    "api/logout.js",
    "api/session.js",
    "api/workspaces.js",
    "api/workspaces-create.js",
    "api/workspaces-select.js",
    "api/operator-workspaces.js",
    "api/workspace-usage.js",
    "api/workspace-billing-summary.js",
    "api/billing-checkout-session.js",
    "api/billing-subscription.js",
    "api/billing-invoices.js",
    "api/runtime-token.js",
    "api/runtime-token-refresh.js",
    "api/runtime-token-revoke.js",
    "api/invites-redeem.js",
    "api/frontdoor-origin.js",
    "api/runtime-health.js",
    "api/oidc-start.js",
  ];
  for (const rel of requiredFiles) {
    await ensureFile(path.join(root, rel));
  }

  const [indexHtml, vercelJsonRaw] = await Promise.all([
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "vercel.json"), "utf8"),
  ]);
  const vercelJson = JSON.parse(vercelJsonRaw);
  if (!String(indexHtml).includes("app.js")) {
    throw new Error("index.html must load app.js");
  }
  if (!String(indexHtml).includes("styles.css")) {
    throw new Error("index.html must load styles.css");
  }
  if (!vercelJson || typeof vercelJson !== "object") {
    throw new Error("vercel.json must parse to an object");
  }
  if (!vercelJson.$schema) {
    throw new Error("vercel.json must include $schema");
  }

  // Vercel project is configured with Output Directory=public.
  // Keep source-of-truth files at repo root and mirror deploy artifacts here.
  const publicDir = path.join(root, "public");
  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "index.html"), indexHtml, "utf8"),
    writeFile(path.join(publicDir, "app.js"), await readFile(path.join(root, "app.js"), "utf8"), "utf8"),
    writeFile(
      path.join(publicDir, "styles.css"),
      await readFile(path.join(root, "styles.css"), "utf8"),
      "utf8",
    ),
  ]);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
