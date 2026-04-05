#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const providerConfigPath = path.join(rootDir, "raw", "provider.config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function descriptionForField(rootType, field) {
  if (rootType === "query") {
    if (["order", "product", "customer"].includes(field)) {
      return `Read one Shopify ${field} from the Admin GraphQL ${field} query field.`;
    }
    return `Read Shopify ${field} from the Admin GraphQL ${field} query field.`;
  }
  return `Execute Shopify ${field} through the Admin GraphQL ${field} mutation field.`;
}

function normalizeNotes(notes) {
  return Array.isArray(notes)
    ? notes.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
    : [];
}

function documentationForField(field, spec) {
  const defaultSelection = Array.isArray(spec.defaultSelection) ? spec.defaultSelection : [];
  const notes = normalizeNotes(spec.notes);
  const domain = typeof spec.domain === "string" && spec.domain.trim() ? spec.domain.trim() : field;
  return {
    domain,
    ...(defaultSelection.length > 0 ? { default_selection: defaultSelection } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

function materializeQueryField(namespace, field, spec) {
  return {
    name: `${namespace}.query.${field}`,
    description: descriptionForField("query", field),
    rootType: "query",
    field,
    args: Array.isArray(spec.args) ? spec.args : [],
    selection: Array.isArray(spec.defaultSelection) ? spec.defaultSelection : [],
    documentation: documentationForField(field, spec),
  };
}

function materializeMutationField(namespace, field, spec) {
  return {
    name: `${namespace}.mutation.${field}`,
    description: descriptionForField("mutation", field),
    rootType: "mutation",
    field,
    args: Array.isArray(spec.args) ? spec.args : [],
    selection: Array.isArray(spec.defaultSelection) ? spec.defaultSelection : [],
    documentation: documentationForField(field, spec),
  };
}

function genericGraphqlResponse() {
  return {
    type: "object",
    properties: {
      data: {
        type: "object",
        additionalProperties: true,
      },
      extensions: {
        type: "object",
        additionalProperties: true,
      },
    },
    required: ["data"],
  };
}

function genericGraphqlParams(rootType) {
  return {
    type: "object",
    properties: {
      document: {
        type: "string",
      },
      variables: {
        type: "object",
        additionalProperties: true,
      },
      operationName: {
        type: "string",
      },
    },
    required: ["document"],
  };
}

function materializeGenericBackbone(namespace, genericBackbone) {
  const methods = [];
  if (genericBackbone?.query === true) {
    methods.push({
      name: `${namespace}.graphql.query`,
      description: "Execute a Shopify Admin GraphQL query document against the pinned provider schema.",
      rootType: "query",
      field: "*",
      action: "read",
      params: genericGraphqlParams("query"),
      response: genericGraphqlResponse(),
      connection_required: true,
      mutates_remote: false,
      documentation: {
        domain: "graphql_backbone",
        notes: [
          "Use this method for long-tail Shopify fields that do not justify a dedicated convenience alias.",
          "Prefer a named operation and request only the fields you actually need.",
          "For connection fields, include pageInfo and cursors explicitly in the document.",
          "Inspect extensions.cost.throttleStatus to understand current GraphQL budget and restore rate.",
        ],
        example_payload: {
          document: "query ShopIdentity { shop { id name myshopifyDomain primaryDomain { host url } } }",
          operationName: "ShopIdentity",
        },
      },
    });
  }
  if (genericBackbone?.mutation === true) {
    methods.push({
      name: `${namespace}.graphql.mutate`,
      description: "Execute a Shopify Admin GraphQL mutation document against the pinned provider schema.",
      rootType: "mutation",
      field: "*",
      action: "write",
      params: genericGraphqlParams("mutation"),
      response: genericGraphqlResponse(),
      connection_required: true,
      mutates_remote: true,
      documentation: {
        domain: "graphql_backbone",
        notes: [
          "Use this method for provider-native Shopify mutations when there is no dedicated convenience alias.",
          "Treat mutations as bounded and deliberate; inspect userErrors before assuming success.",
          "Prefer cleanup-safe probes and reversible operational actions when validating write posture.",
        ],
        example_payload: {
          document: "mutation BulkProbe($query: String!) { bulkOperationRunQuery(query: $query) { bulkOperation { id status type } userErrors { field message } } }",
          operationName: "BulkProbe",
          variables: {
            query: "{ orders { edges { node { id } } } }",
          },
        },
      },
    });
  }
  return methods;
}

function main() {
  const providerConfig = readJson(providerConfigPath);
  const namespace = providerConfig.namespace || "shopify";
  const upstreamDocument = path.resolve(rootDir, providerConfig.upstreamDocument || "raw/upstream-graphql-roots.json");
  const outputDocument = path.resolve(rootDir, providerConfig.outputDocument || "api/graphql.catalog.json");
  const upstream = readJson(upstreamDocument);

  const methods = materializeGenericBackbone(namespace, providerConfig.genericBackbone);
  for (const [field, spec] of Object.entries(upstream.queryRoot || {})) {
    methods.push(materializeQueryField(namespace, field, spec));
  }
  for (const [field, spec] of Object.entries(upstream.mutationRoot || {})) {
    if (spec?.materialize !== true) {
      continue;
    }
    methods.push(materializeMutationField(namespace, field, spec));
  }

  const catalog = {
    source: "graphql",
    upstreamDocument: path.relative(rootDir, upstreamDocument).replaceAll("\\", "/"),
    namespace,
    methods,
  };

  ensureDir(path.dirname(outputDocument));
  fs.writeFileSync(outputDocument, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputDocument}\n`);
}

main();
