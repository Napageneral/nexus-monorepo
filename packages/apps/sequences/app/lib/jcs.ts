// RFC 8785 JSON Canonicalization Scheme. Numbers use the ECMAScript Number-to-String rules (which
// JSON.stringify applies), strings use JSON.stringify's escaping (the RFC's rules), and object keys
// sort by UTF-16 code units, which is JavaScript's default string order.

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("jcs: numbers must be finite");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(",")}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
    }
    default:
      throw new Error(`jcs: cannot canonicalize a ${typeof value}`);
  }
}
