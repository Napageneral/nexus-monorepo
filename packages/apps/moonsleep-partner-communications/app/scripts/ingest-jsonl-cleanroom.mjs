import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [sourcePath, token] = process.argv.slice(2);
if (!sourcePath || !token) throw new Error("usage: ingest-jsonl-cleanroom.mjs SOURCE TOKEN");

const maximumInFlight = 8;
const inFlight = new Set();
const counts = { completed: 0, skipped: 0, other: 0, total: 0 };

async function ingest(line, lineNumber) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`line ${lineNumber} is not valid JSON`);
  }
  if (value?.operation !== "record.ingest" || !value.routing || !value.payload) {
    throw new Error(`line ${lineNumber} is not an exact record.ingest envelope`);
  }
  const response = await fetch("http://127.0.0.1:18789/runtime/operations/record.ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ routing: value.routing, payload: value.payload }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(`record.ingest failed at line ${lineNumber} with HTTP ${response.status}`);
  }
  const status = result.status ?? result.payload?.status;
  if (status === "completed") counts.completed += 1;
  else if (status === "skipped") counts.skipped += 1;
  else counts.other += 1;
  counts.total += 1;
}

const input = createInterface({ input: createReadStream(sourcePath, { encoding: "utf8" }), crlfDelay: Infinity });
let lineNumber = 0;
for await (const line of input) {
  lineNumber += 1;
  if (!line) continue;
  const promise = ingest(line, lineNumber).finally(() => inFlight.delete(promise));
  inFlight.add(promise);
  if (inFlight.size >= maximumInFlight) await Promise.race(inFlight);
}
await Promise.all(inFlight);
process.stdout.write(`${JSON.stringify(counts)}\n`);
