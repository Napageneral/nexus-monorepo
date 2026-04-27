import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DeclaredAdapterMethod, DefinedAdapterContext } from "./define.js";
import type { AdapterMethodContextHints } from "./protocol.js";
import type { AdapterMethodInvokeRequest } from "./run.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head"] as const;
type OpenApiHttpMethod = (typeof HTTP_METHODS)[number];
type OpenApiObject = Record<string, unknown>;
const require = createRequire(import.meta.url);

type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  explode: boolean;
  style?: string;
};

type OpenApiOperationDefinition = {
  name: string;
  method: OpenApiHttpMethod;
  path: string;
  description: string | null;
  action: "read" | "write";
  paramsSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  requestBodyRequired: boolean;
  requestBodyContentTypes: string[];
  parameters: OpenApiParameter[];
};

export type OpenApiMethodBuilderConfig<TClient> = {
  packageRootDir: string;
  document: string;
  namespace: string;
  defaultConnectionRequired?: boolean;
  transformOperationName?: (params: {
    namespace: string;
    upstreamOperationId: string;
    path: string;
    method: OpenApiHttpMethod;
    operation: OpenApiObject;
  }) => string;
  excludeOperationNames?: ReadonlySet<string>;
  resolveBaseUrl: (
    ctx: DefinedAdapterContext<TClient>,
    operation: OpenApiOperationDefinition,
  ) => string | Promise<string>;
  resolveHeaders?: (
    ctx: DefinedAdapterContext<TClient>,
    operation: OpenApiOperationDefinition,
  ) => Record<string, string | undefined> | Promise<Record<string, string | undefined>>;
  resolveContextHints?: (
    operation: OpenApiOperationDefinition,
  ) => AdapterMethodContextHints | undefined;
};

function asRecord(value: unknown): OpenApiObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as OpenApiObject)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readOpenApiDocument(filePath: string): OpenApiObject {
  const raw = fs.readFileSync(filePath, "utf8");
  const trimmed = raw.trim();
  const parsed = filePath.endsWith(".json")
    ? (JSON.parse(raw) as unknown)
    : (require("yaml").parse(raw) as unknown);
  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`OpenAPI document is not an object: ${filePath}`);
  }
  if (!trimmed) {
    throw new Error(`OpenAPI document is empty: ${filePath}`);
  }
  return record;
}

function resolveDocumentPath(packageRootDir: string, document: string): string {
  const resolved = path.resolve(packageRootDir, document.trim() || "api/openapi.yaml");
  if (!fs.existsSync(resolved)) {
    throw new Error(`OpenAPI document not found: ${resolved}`);
  }
  return resolved;
}

function getJsonPointer(root: OpenApiObject, pointer: string): unknown {
  const parts = pointer
    .replace(/^#\//, "")
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = root;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !(part in record)) {
      return undefined;
    }
    current = record[part];
  }
  return current;
}

function materializeSchema(
  schema: unknown,
  root: OpenApiObject,
  seenRefs = new Set<string>(),
): Record<string, unknown> | null {
  const record = asRecord(schema);
  if (!record) {
    return null;
  }
  if (typeof record.$ref === "string") {
    const ref = record.$ref.trim();
    if (!ref.startsWith("#/")) {
      throw new Error(`Only local OpenAPI refs are supported: ${ref}`);
    }
    if (seenRefs.has(ref)) {
      throw new Error(`Cyclic OpenAPI ref detected: ${ref}`);
    }
    seenRefs.add(ref);
    const resolved = getJsonPointer(root, ref);
    const materialized = materializeSchema(resolved, root, seenRefs);
    seenRefs.delete(ref);
    return materialized;
  }

  const next: Record<string, unknown> = { ...record };
  if (next.items) {
    next.items = materializeSchema(next.items, root, seenRefs) ?? next.items;
  }
  if (next.additionalProperties && typeof next.additionalProperties === "object") {
    next.additionalProperties =
      materializeSchema(next.additionalProperties, root, seenRefs) ?? next.additionalProperties;
  }
  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties as Record<string, unknown>).map(([key, value]) => [
        key,
        materializeSchema(value, root, seenRefs) ?? value,
      ]),
    );
  }
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(next[key])) {
      next[key] = next[key].map((entry) => materializeSchema(entry, root, seenRefs) ?? entry);
    }
  }
  return next;
}

function actionFromMethod(method: OpenApiHttpMethod): "read" | "write" {
  return method === "get" || method === "head" || method === "options" ? "read" : "write";
}

function pickContentSchema(content: unknown, root: OpenApiObject): Record<string, unknown> | null {
  const record = asRecord(content);
  if (!record) {
    return null;
  }
  const preferred = ["application/json", "application/*+json", "multipart/form-data", "text/plain"];
  for (const key of preferred) {
    const mediaType = asRecord(record[key]);
    const schema = materializeSchema(mediaType?.schema, root);
    if (schema) {
      return schema;
    }
  }
  for (const value of Object.values(record)) {
    const mediaType = asRecord(value);
    const schema = materializeSchema(mediaType?.schema, root);
    if (schema) {
      return schema;
    }
  }
  return null;
}

function buildParametersSchema(
  parameters: OpenApiParameter[],
  root: OpenApiObject,
): Record<string, unknown> | null {
  const properties: Record<string, unknown> = {};
  const required = new Set<string>();
  for (const parameter of parameters) {
    const schema = parameter.schema ?? pickContentSchema(parameter.content, root) ?? { type: "string" };
    properties[parameter.name] = schema;
    if (parameter.required) {
      required.add(parameter.name);
    }
  }
  if (Object.keys(properties).length === 0) {
    return null;
  }
  return {
    type: "object",
    ...(required.size > 0 ? { required: [...required] } : {}),
    properties,
  };
}

function mergeObjectSchemas(
  base: Record<string, unknown> | null,
  extra: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!base) {
    return extra;
  }
  if (!extra) {
    return base;
  }
  const baseProperties = asRecord(base.properties) ?? {};
  const extraProperties = asRecord(extra.properties) ?? {};
  const required = new Set<string>([
    ...(Array.isArray(base.required) ? base.required.filter((v): v is string => typeof v === "string") : []),
    ...(Array.isArray(extra.required) ? extra.required.filter((v): v is string => typeof v === "string") : []),
  ]);
  return {
    type: "object",
    properties: {
      ...baseProperties,
      ...extraProperties,
    },
    ...(required.size > 0 ? { required: [...required] } : {}),
  };
}

function combineInputSchema(params: {
  parametersSchema: Record<string, unknown> | null;
  requestBodySchema: Record<string, unknown> | null;
  requestBodyRequired: boolean;
}): Record<string, unknown> | null {
  const body = params.requestBodySchema;
  if (!body) {
    return params.parametersSchema;
  }
  const bodyLooksObject =
    body.type === "object" ||
    body.properties != null ||
    Array.isArray(body.allOf) ||
    Array.isArray(body.anyOf) ||
    Array.isArray(body.oneOf);
  if (bodyLooksObject) {
    return mergeObjectSchemas(params.parametersSchema, body);
  }
  const wrappedBody = {
    type: "object",
    ...(params.requestBodyRequired ? { required: ["body"] } : {}),
    properties: {
      body,
    },
  };
  return mergeObjectSchemas(params.parametersSchema, wrappedBody);
}

function pickResponseSchema(responses: unknown, root: OpenApiObject): Record<string, unknown> | null {
  const record = asRecord(responses);
  if (!record) {
    return null;
  }
  const candidateKeys = Object.keys(record).sort((left, right) => {
    const leftWeight = left === "default" ? 999 : Number(left);
    const rightWeight = right === "default" ? 999 : Number(right);
    return leftWeight - rightWeight;
  });
  for (const key of candidateKeys) {
    if (key !== "default" && !/^2\d\d$/.test(key)) {
      continue;
    }
    const response = asRecord(record[key]);
    const schema = pickContentSchema(response?.content, root);
    if (schema) {
      return schema;
    }
  }
  return null;
}

function normalizeOperationName(params: {
  namespace: string;
  upstreamOperationId: string;
  path: string;
  method: OpenApiHttpMethod;
  operation: OpenApiObject;
}): string {
  const normalized = params.upstreamOperationId.trim();
  if (!normalized) {
    throw new Error(`OpenAPI operation missing operationId: ${params.method.toUpperCase()} ${params.path}`);
  }
  if (normalized.includes(".")) {
    return normalized;
  }
  return `${params.namespace}.${normalized}`;
}

function resolveParameterList(
  pathLevelParameters: unknown[],
  operationParameters: unknown[],
  root: OpenApiObject,
): OpenApiParameter[] {
  const parameters: OpenApiParameter[] = [];
  for (const parameter of [...pathLevelParameters, ...operationParameters]) {
    const record = asRecord(parameter);
    const resolved = record?.$ref ? materializeSchema(record, root) : record;
    const item = asRecord(resolved);
    const name = asString(item?.name);
    const location = asString(item?.in);
    if (!name || !location) {
      continue;
    }
    if (!["path", "query", "header", "cookie"].includes(location)) {
      continue;
    }
    const next: OpenApiParameter = {
      name,
      in: location as OpenApiParameter["in"],
      required: item?.required === true,
      schema: materializeSchema(item?.schema, root),
      content: asRecord(item?.content),
      explode: item?.explode === undefined ? true : item.explode === true,
      ...(asString(item?.style) ? { style: asString(item?.style) } : {}),
    };
    parameters.push(next);
  }
  return parameters;
}

function loadOperations<TClient>(
  config: OpenApiMethodBuilderConfig<TClient>,
): OpenApiOperationDefinition[] {
  const documentPath = resolveDocumentPath(config.packageRootDir, config.document);
  const document = readOpenApiDocument(documentPath);
  const paths = asRecord(document.paths);
  if (!paths) {
    throw new Error(`OpenAPI document missing paths object: ${documentPath}`);
  }

  const operations: OpenApiOperationDefinition[] = [];
  for (const [openApiPath, pathItemValue] of Object.entries(paths)) {
    const pathItem = asRecord(pathItemValue);
    if (!pathItem) {
      continue;
    }
    const pathLevelParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const operation = asRecord(pathItem[method]);
      if (!operation) {
        continue;
      }
      const upstreamOperationId = asString(operation.operationId);
      if (!upstreamOperationId) {
        throw new Error(`OpenAPI operation missing operationId: ${method.toUpperCase()} ${openApiPath}`);
      }
      const name = (config.transformOperationName ?? normalizeOperationName)({
        namespace: config.namespace,
        upstreamOperationId,
        path: openApiPath,
        method,
        operation,
      });
      if (config.excludeOperationNames?.has(name)) {
        continue;
      }
      const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      const parameters = resolveParameterList(pathLevelParameters, operationParameters, document);
      const parametersSchema = buildParametersSchema(parameters, document);
      const requestBody = asRecord(operation.requestBody);
      const requestBodySchema = pickContentSchema(requestBody?.content, document);
      const requestBodyContentTypes = Object.keys(asRecord(requestBody?.content) ?? {});
      operations.push({
        name,
        method,
        path: openApiPath,
        description: asString(operation.summary) ?? asString(operation.description) ?? null,
        action: actionFromMethod(method),
        paramsSchema: combineInputSchema({
          parametersSchema,
          requestBodySchema,
          requestBodyRequired: requestBody?.required === true,
        }),
        responseSchema: pickResponseSchema(operation.responses, document),
        requestBodyRequired: requestBody?.required === true,
        requestBodyContentTypes,
        parameters,
      });
    }
  }

  return operations.toSorted((left, right) => left.name.localeCompare(right.name));
}

function encodePrimitive(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value);
}

function joinUrlPath(baseUrl: string, resourcePath: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/u, "");
  const nextPath = resourcePath.replace(/^\/+/u, "");
  url.pathname = `${basePath}/${nextPath}`.replace(/\/{2,}/gu, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function applyPathParams(rawPath: string, params: Record<string, unknown>): string {
  return rawPath.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    if (!(name in params)) {
      throw new Error(`Missing required path parameter: ${name}`);
    }
    return encodeURIComponent(encodePrimitive(params[name]));
  });
}

function appendQueryValue(url: URL, name: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      appendQueryValue(url, name, entry);
    }
    return;
  }
  url.searchParams.append(name, encodePrimitive(value));
}

function looksLikeFileRef(value: unknown): value is {
  local_path?: string;
  path?: string;
  filename?: string;
  mime_type?: string;
  content_base64?: string;
} {
  const record = asRecord(value);
  return Boolean(record && (record.local_path || record.path || record.content_base64));
}

function toBlobFromFileRef(value: {
  local_path?: string;
  path?: string;
  filename?: string;
  mime_type?: string;
  content_base64?: string;
}): { blob: Blob; filename?: string } {
  if (value.local_path || value.path) {
    const filePath = path.resolve(value.local_path ?? value.path ?? "");
    const data = fs.readFileSync(filePath);
    const filename = value.filename ?? path.basename(filePath);
    return {
      blob: new Blob([data], { type: value.mime_type || "application/octet-stream" }),
      filename,
    };
  }
  const base64 = value.content_base64 ?? "";
  return {
    blob: new Blob([Buffer.from(base64, "base64")], {
      type: value.mime_type || "application/octet-stream",
    }),
    filename: value.filename,
  };
}

function appendFormData(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      appendFormData(form, key, entry);
    }
    return;
  }
  if (looksLikeFileRef(value)) {
    const { blob, filename } = toBlobFromFileRef(value);
    if (filename) {
      form.append(key, blob, filename);
    } else {
      form.append(key, blob);
    }
    return;
  }
  if (value instanceof Blob) {
    form.append(key, value);
    return;
  }
  if (typeof value === "object") {
    form.append(key, JSON.stringify(value));
    return;
  }
  form.append(key, encodePrimitive(value));
}

function buildJsonBody(
  payload: Record<string, unknown>,
  consumedKeys: Set<string>,
  required: boolean,
): string | undefined {
  const bodyValue = payload.body;
  if (bodyValue !== undefined) {
    consumedKeys.add("body");
    return JSON.stringify(bodyValue);
  }
  const remainingEntries = Object.entries(payload).filter(([key]) => !consumedKeys.has(key));
  if (remainingEntries.length === 0) {
    if (required) {
      throw new Error("Request body is required");
    }
    return undefined;
  }
  return JSON.stringify(Object.fromEntries(remainingEntries));
}

function buildMultipartBody(
  payload: Record<string, unknown>,
  consumedKeys: Set<string>,
  required: boolean,
): FormData | undefined {
  const source =
    payload.body !== undefined
      ? payload.body
      : Object.fromEntries(Object.entries(payload).filter(([key]) => !consumedKeys.has(key)));
  if (payload.body !== undefined) {
    consumedKeys.add("body");
  }
  const record = asRecord(source);
  if (!record) {
    if (required) {
      throw new Error("Multipart request body must be an object");
    }
    return undefined;
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(record)) {
    appendFormData(form, key, value);
  }
  return form;
}

function buildBinaryBody(
  payload: Record<string, unknown>,
  consumedKeys: Set<string>,
  required: boolean,
): Buffer | string | undefined {
  if (typeof payload.body_base64 === "string") {
    consumedKeys.add("body_base64");
    return Buffer.from(payload.body_base64, "base64");
  }
  if (typeof payload.local_path === "string") {
    consumedKeys.add("local_path");
    return fs.readFileSync(path.resolve(payload.local_path));
  }
  if (typeof payload.body === "string") {
    consumedKeys.add("body");
    return payload.body;
  }
  if (required) {
    throw new Error("Binary request body is required");
  }
  return undefined;
}

function pickRequestContentType(contentTypes: string[]): string | undefined {
  if (contentTypes.includes("application/json")) {
    return "application/json";
  }
  if (contentTypes.includes("application/*+json")) {
    return "application/json";
  }
  if (contentTypes.includes("multipart/form-data")) {
    return "multipart/form-data";
  }
  return contentTypes[0];
}

function sanitizeHeaders(
  headers: Record<string, string | undefined>,
  extra: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    [...Object.entries(headers), ...Object.entries(extra)].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : {};
  }
  if (contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("html")) {
    return {
      status: response.status,
      content_type: contentType || null,
      text: await response.text(),
    };
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    content_type: contentType || null,
    size: bytes.length,
    body_base64: bytes.toString("base64"),
  };
}

function collectHeaderParams(
  payload: Record<string, unknown>,
  parameters: OpenApiParameter[],
  consumedKeys: Set<string>,
): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const parameter of parameters) {
    if (parameter.in !== "header" || !(parameter.name in payload)) {
      continue;
    }
    consumedKeys.add(parameter.name);
    const value = payload[parameter.name];
    if (Array.isArray(value)) {
      headers[parameter.name] = value.map((entry) => encodePrimitive(entry)).join(",");
      continue;
    }
    if (value !== undefined && value !== null) {
      headers[parameter.name] = encodePrimitive(value);
    }
  }
  return headers;
}

export function createOpenApiMethods<TClient>(
  config: OpenApiMethodBuilderConfig<TClient>,
): Record<string, DeclaredAdapterMethod<TClient>> {
  const operations = loadOperations(config);
  return Object.fromEntries(
    operations.map((operation) => [
      operation.name,
      {
        description: operation.description,
        action: operation.action,
        params: operation.paramsSchema,
        response: operation.responseSchema,
        connection_required: config.defaultConnectionRequired ?? true,
        mutates_remote: operation.action === "write",
        ...(config.resolveContextHints
          ? { context_hints: config.resolveContextHints(operation) }
          : {}),
        handler: async (
          ctx: DefinedAdapterContext<TClient>,
          req: AdapterMethodInvokeRequest,
        ): Promise<unknown> => {
          const payload = req.payload ?? {};
          const consumedKeys = new Set<string>();
          const pathParams: Record<string, unknown> = {};
          const queryParams: Array<[string, unknown]> = [];
          for (const parameter of operation.parameters) {
            if (!(parameter.name in payload)) {
              if (parameter.in === "path" && parameter.required) {
                throw new Error(`Missing required path parameter: ${parameter.name}`);
              }
              continue;
            }
            consumedKeys.add(parameter.name);
            const value = payload[parameter.name];
            if (parameter.in === "path") {
              pathParams[parameter.name] = value;
            } else if (parameter.in === "query") {
              queryParams.push([parameter.name, value]);
            }
          }

          const baseUrl = await config.resolveBaseUrl(ctx, operation);
          const url = joinUrlPath(baseUrl, applyPathParams(operation.path, pathParams));
          for (const [name, value] of queryParams) {
            appendQueryValue(url, name, value);
          }

          const contentType = pickRequestContentType(operation.requestBodyContentTypes);
          const dynamicHeaders = config.resolveHeaders ? await config.resolveHeaders(ctx, operation) : {};
          const headerParams = collectHeaderParams(payload, operation.parameters, consumedKeys);
          let body: RequestInit["body"] | undefined;
          const bodyHeaders: Record<string, string | undefined> = {
            Accept: "application/json",
          };
          if (contentType === "application/json") {
            const json = buildJsonBody(payload, consumedKeys, operation.requestBodyRequired);
            if (json !== undefined) {
              body = json;
              bodyHeaders["Content-Type"] = "application/json";
            }
          } else if (contentType === "multipart/form-data") {
            body = buildMultipartBody(payload, consumedKeys, operation.requestBodyRequired);
          } else if (contentType) {
            body = buildBinaryBody(payload, consumedKeys, operation.requestBodyRequired);
            if (body !== undefined) {
              bodyHeaders["Content-Type"] = contentType;
            }
          }

          const headers = sanitizeHeaders(bodyHeaders, {
            ...dynamicHeaders,
            ...headerParams,
          });
          const response = await fetch(url, {
            method: operation.method.toUpperCase(),
            headers,
            ...(body !== undefined ? { body } : {}),
            signal: ctx.signal,
          });
          const parsed = await parseResponse(response);
          if (!response.ok) {
            const details =
              typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed) : String(parsed);
            throw new Error(
              `OpenAPI request failed (${response.status} ${response.statusText}) for ${operation.name}: ${details}`,
            );
          }
          return parsed;
        },
      } satisfies DeclaredAdapterMethod<TClient>,
    ]),
  );
}
