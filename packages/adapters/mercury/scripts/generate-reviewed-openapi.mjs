#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "internal", "catalog", "operations.catalog.json");
const outputPath = join(root, "api", "openapi.yaml");
const operations = JSON.parse(readFileSync(catalogPath, "utf8"));

if (!Array.isArray(operations) || operations.length !== 84) {
  throw new Error(`expected 84 Mercury operations, received ${operations.length}`);
}

let publicCount = 0;
let internalCount = 0;
const paths = {};

for (const operation of operations) {
  const operationId = operation.operation_id;
  const method = operation.http_method.toLowerCase();
  const path = operation.path;
  const visibility = operation.visibility;

  if (
    typeof operationId !== "string" ||
    typeof path !== "string" ||
    !["get", "post", "put", "patch", "delete"].includes(method) ||
    !["public", "internal"].includes(visibility)
  ) {
    throw new Error(`invalid Mercury operation catalog row: ${JSON.stringify(operation)}`);
  }

  if (visibility === "public") {
    publicCount += 1;
  } else {
    internalCount += 1;
  }

  paths[path] ??= {};
  if (paths[path][method]) {
    throw new Error(`duplicate Mercury path and method: ${method.toUpperCase()} ${path}`);
  }
  paths[path][method] = {
    operationId,
    responses: {
      200: {
        description:
          "Provider response bytes are retained as immutable evidence and interpreted by reviewed adapter code.",
      },
    },
    summary: `${method.toUpperCase()} ${path}`,
    "x-mercury-visibility": visibility,
  };
}

if (publicCount !== 72 || internalCount !== 12) {
  throw new Error(
    `expected 72 public and 12 internal operations, received ${publicCount}/${internalCount}`,
  );
}

const document = {
  openapi: "3.1.0",
  info: {
    title: "Mercury reviewed operation index",
    version: "1.0.0",
    description:
      "Exact operation identity index for the read-only Nex adapter. Provider payload schemas are deliberately excluded.",
  },
  servers: [{ url: "https://api.mercury.com/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
  paths,
};

const encoded = `${JSON.stringify(document)}\n`;
if (encoded.includes('"kind"')) {
  throw new Error("reviewed Mercury operation index contains a prohibited schema field");
}
writeFileSync(outputPath, encoded, { encoding: "utf8", mode: 0o644 });
process.stdout.write(`${createHash("sha256").update(encoded).digest("hex")}\n`);
