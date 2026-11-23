// Small helpers for talking to the Nex runtime through ctx.nex.

export type Row = Record<string, unknown>;

export function asRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

export function asArray(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Jobs get `{ payload }` from ctx.nex; hooks and methods get the bare value. Accept both. */
export function unwrapPayload(value: unknown): Row {
  const row = asRecord(value);
  return "payload" in row ? asRecord(row.payload) : "result" in row ? asRecord(row.result) : row;
}

// jobs.list filters internal definitions after pagination, so a short page does not mean the list
// ended: read until an empty page (moonsleep-site-bridge hooks/runtime-work.mjs:18-27).
export async function listAll(call: (params: Row) => Promise<unknown>, key: string, filter: Row = {}): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = asArray(unwrapPayload(await call({ ...filter, limit: 1000, offset }))[key]);
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}

/** The runtime answers `enabled` as 0/1 from Postgres and true/false from fakes. */
export function isEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "t" || value === "true";
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
