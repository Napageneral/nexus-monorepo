import process from "node:process";
import { createPasswordHash } from "./crypto.js";

const password = process.argv[2];
if (!password) {
  process.stderr.write("usage: pnpm password:hash -- '<password>'\n");
  process.exit(1);
}

process.stdout.write(`${createPasswordHash(password)}\n`);
