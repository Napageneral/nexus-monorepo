import fs from "node:fs/promises";
import path from "node:path";

const adminDir = new URL(".", import.meta.url).pathname;
const uiDir = path.join(adminDir, "ui");
const distDir = path.join(adminDir, "dist");

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
for (const fileName of ["index.html", "styles.css", "app.js"]) {
  await fs.copyFile(path.join(uiDir, fileName), path.join(distDir, fileName));
}
