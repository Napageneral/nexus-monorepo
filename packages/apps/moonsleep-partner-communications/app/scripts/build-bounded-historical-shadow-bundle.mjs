#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({
  options: {
    output: { type: "string" },
  },
  strict: true,
});
if (!values.output) throw new Error("--output is required");

const parent = realpathSync(dirname(resolve(values.output)));
const parentStat = statSync(parent);
if (!parentStat.isDirectory() || (parentStat.mode & 0o022) !== 0) {
  throw new Error("bundle output parent must not be group/world writable");
}
const output = resolve(parent, basename(values.output));
const temporary = `${output}.tmp`;
if (existsSync(output) || existsSync(temporary)) {
  throw new Error("bundle output path must be fresh");
}

try {
  const result = await build({
    entryPoints: [
      new URL("./run-bounded-historical-shadow.ts", import.meta.url).pathname,
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
    sourcemap: false,
    write: false,
    logLevel: "silent",
  });
  if (result.outputFiles.length !== 1) {
    throw new Error("bounded shadow build must emit exactly one bundle");
  }
  const bytes = result.outputFiles[0].contents;
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o500 });
  chmodSync(temporary, 0o500);
  renameSync(temporary, output);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      output,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      runtime_external: "pg@8.22.0",
    })}\n`,
  );
} catch (error) {
  rmSync(temporary, { force: true });
  throw error;
}
