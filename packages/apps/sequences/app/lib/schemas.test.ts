import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCHEMAS, SEQUENCE_SCHEMA, SERIES_SCHEMA } from "./schemas.js";
import { findBooleanKeys, findKindFields, findSql, validateSchema } from "./validate.js";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(APP, "test/fixtures/october", name), "utf8"));

// SEQUENCES_WRITE_SCHEMAS=1 rewrites schema/*.json from the values (then the pin below holds).
if (process.env.SEQUENCES_WRITE_SCHEMAS === "1") {
  for (const [file, value] of Object.entries(SCHEMAS)) {
    fs.writeFileSync(path.join(APP, "schema", file), `${JSON.stringify(value, null, 2)}\n`);
  }
}

describe("schemas", () => {
  it("schema/*.json are exactly the values the handler carries", () => {
    for (const [file, value] of Object.entries(SCHEMAS)) {
      const onDisk = JSON.parse(fs.readFileSync(path.join(APP, "schema", file), "utf8"));
      expect(onDisk, file).toEqual(JSON.parse(JSON.stringify(value)));
    }
  });

  it("no schema declares a property named kind (NX-P17)", () => {
    for (const [file, value] of Object.entries(SCHEMAS)) {
      const named: string[] = [];
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        if (record.properties && typeof record.properties === "object" && "kind" in (record.properties as object)) named.push(file);
        Object.values(record).forEach(walk);
      };
      walk(value);
      expect(named, file).toEqual([]);
    }
  });

  it("the October definitions and series validate", () => {
    expect(validateSchema(SEQUENCE_SCHEMA, fixture("review-group-giveaway.json"))).toEqual([]);
    expect(validateSchema(SEQUENCE_SCHEMA, fixture("prize-claim.json"))).toEqual([]);
    expect(validateSchema(SERIES_SCHEMA, fixture("review-giveaway-2026-10.json"))).toEqual([]);
  });

  it("names the field and the rule when a step is wrong", () => {
    const body = fixture("review-group-giveaway.json");
    body.steps[3].pick.winnerz = 10;
    body.steps[0].do = "asert";
    const errors = validateSchema(SEQUENCE_SCHEMA, body);
    expect(errors).toContainEqual({ path: "/steps/3/pick/winnerz", keyword: "additionalProperties", message: "'winnerz' is not a known field here" });
    expect(errors.some((error) => error.path === "/steps/0/do" && error.keyword === "enum")).toBe(true);
  });

  it("finds kind fields, YAML 1.1 boolean keys and SQL", () => {
    expect(findKindFields({ steps: [{ id: "a", kind: "x" }] })).toEqual(["/steps/0/kind"]);
    expect(findBooleanKeys({ code: { true: "lunair_cover", false: "50%" } })).toEqual(["/code/true", "/code/false"]);
    expect(findSql({ sources: { a: { from: "select email from customers" } } })).toEqual(["/sources/a/from"]);
    expect(findSql({ title: "Set this up, then update the list from Friday" })).toEqual([]);
  });
});
