import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const adapterSourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "adapter.ts");

test("web-journey adapter uses only web-journey naming", () => {
  const source = fs.readFileSync(adapterSourcePath, "utf8");

  assert.match(source, /web_installation_id/);
  assert.match(source, /web_event/);
  assert.ok(source.includes("metadata: {"));
  assert.ok(source.includes("row,"));
  assert.ok(source.includes("web_event: webEvent"));
  assert.equal(source.includes("website"), false, "legacy website-* naming should not appear in adapter.ts");
});
