import readline from "node:readline";

export function writeJSONLine(stdout: NodeJS.WriteStream, payload: unknown): void {
  stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function* readJSONLines(stream: NodeJS.ReadableStream): AsyncIterable<unknown> {
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    const trimmed = String(line).trim();
    if (!trimmed) {
      continue;
    }
    yield JSON.parse(trimmed) as unknown;
  }
}

