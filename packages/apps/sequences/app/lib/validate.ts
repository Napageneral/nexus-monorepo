// A hand-written validator for the subset of JSON Schema (draft 2020-12) that this app's four
// schemas use. There is no runtime schema validation in Nex and no npm dependency here (the release
// leaves bare imports external), so methods validate their own params with this.
//
// Supported: type, enum, const, pattern, minLength, maxLength, minimum, maximum, minItems,
// maxItems, uniqueItems, required, properties, patternProperties, additionalProperties,
// propertyNames, items, prefixItems, $ref (#/$defs/<name>), allOf, anyOf, oneOf, if/then/else.
// Annotations (title, description, default, examples, $comment, $id, $schema) are ignored.

export type JsonSchema = {
  type?: string | string[];
  enum?: readonly unknown[];
  const?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  items?: JsonSchema;
  prefixItems?: readonly JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  allOf?: readonly JsonSchema[];
  anyOf?: readonly JsonSchema[];
  oneOf?: readonly JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  [annotation: string]: unknown;
};

export type SchemaError = { path: string; keyword: string; message: string };

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const patternCache = new Map<string, RegExp>();
function regex(pattern: string): RegExp {
  let found = patternCache.get(pattern);
  if (!found) {
    found = new RegExp(pattern, "u");
    patternCache.set(pattern, found);
  }
  return found;
}

export function validateSchema(schema: JsonSchema, value: unknown, root: JsonSchema = schema, path = ""): SchemaError[] {
  const errors: SchemaError[] = [];
  const push = (keyword: string, message: string, at = path) => errors.push({ path: at || "/", keyword, message });

  if (schema.$ref) {
    const name = /^#\/\$defs\/(.+)$/.exec(schema.$ref)?.[1];
    const target = name ? root.$defs?.[name] : undefined;
    if (!target) {
      push("$ref", `unresolvable $ref ${schema.$ref}`);
      return errors;
    }
    errors.push(...validateSchema(target, value, root, path));
  }

  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, actual))) {
      push("type", `must be ${types.join(" or ")}, got ${actual}`);
      return errors;
    }
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) push("const", `must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((option) => deepEqual(option, value))) {
    push("enum", `must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.pattern && !regex(schema.pattern).test(value)) push("pattern", `'${value.slice(0, 80)}' does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) push("minLength", `must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) push("maxLength", `must be at most ${schema.maxLength} characters`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) push("minimum", `must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) push("maximum", `must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push("minItems", `must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push("maxItems", `must have at most ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) push("uniqueItems", "items must be unique");
    const prefix = schema.prefixItems ?? [];
    value.forEach((item, index) => {
      const itemSchema = index < prefix.length ? prefix[index] : schema.items;
      if (itemSchema) errors.push(...validateSchema(itemSchema, item, root, pointer(path, index)));
    });
  }

  if (actual === "object") {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) push("required", `'${key}' is required`);
    }
    for (const [key, item] of Object.entries(record)) {
      const at = pointer(path, key);
      if (schema.propertyNames) {
        const nameErrors = validateSchema(schema.propertyNames, key, root, at);
        if (nameErrors.length > 0) push("propertyNames", `property name '${key}' is not allowed: ${nameErrors[0]!.message}`, at);
      }
      let matched = false;
      if (schema.properties && key in schema.properties) {
        matched = true;
        errors.push(...validateSchema(schema.properties[key]!, item, root, at));
      }
      for (const [pattern, patternSchema] of Object.entries(schema.patternProperties ?? {})) {
        if (regex(pattern).test(key)) {
          matched = true;
          errors.push(...validateSchema(patternSchema, item, root, at));
        }
      }
      if (!matched && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) push("additionalProperties", `'${key}' is not a known field here`, at);
        else if (schema.additionalProperties !== true) errors.push(...validateSchema(schema.additionalProperties, item, root, at));
      }
    }
  }

  for (const sub of schema.allOf ?? []) errors.push(...validateSchema(sub, value, root, path));
  if (schema.anyOf && !schema.anyOf.some((sub) => validateSchema(sub, value, root, path).length === 0)) {
    // Report the closest branch, so the message names the fix instead of "matched none".
    const branches = schema.anyOf.map((sub) => validateSchema(sub, value, root, path));
    errors.push(...branches.reduce((best, branch) => (branch.length < best.length ? branch : best)));
  }
  if (schema.oneOf) {
    const branches = schema.oneOf.map((sub) => validateSchema(sub, value, root, path));
    const passing = branches.filter((branch) => branch.length === 0).length;
    if (passing === 0) errors.push(...branches.reduce((best, branch) => (branch.length < best.length ? branch : best)));
    else if (passing > 1) push("oneOf", "matches more than one allowed shape");
  }
  if (schema.if) {
    const holds = validateSchema(schema.if, value, root, path).length === 0;
    const branch = holds ? schema.then : schema.else;
    if (branch) errors.push(...validateSchema(branch, value, root, path));
  }
  return errors;
}

/** Every key named `kind`, anywhere (NX-P17): the step-type field is `do`. */
export function findKindFields(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findKindFields(item, pointer(path, index)));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
    ...(key === "kind" ? [pointer(path, key)] : []),
    ...findKindFields(item, pointer(path, key)),
  ]);
}

/** YAML 1.1 (PyYAML) reads a bare `on:`/`off:`/`yes:`/`no:` key as a boolean; JSON then says "true". */
export function findBooleanKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findBooleanKeys(item, pointer(path, index)));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
    ...(key === "true" || key === "false" || key === "True" || key === "False" ? [pointer(path, key)] : []),
    ...findBooleanKeys(item, pointer(path, key)),
  ]);
}

/** A definition never carries SQL: sources are named routes of the ops sources API. */
export function findSql(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findSql(item, pointer(path, index)));
  if (typeof value === "string") {
    const sql = [/\bselect\b[\s\S]{1,400}\bfrom\s+[a-z_"]/i, /\binsert\s+into\b/i, /\bupdate\s+[a-z_."]+\s+set\b/i, /\bdelete\s+from\b/i];
    return sql.some((re) => re.test(value)) ? [path] : [];
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => findSql(item, pointer(path, key)));
}
