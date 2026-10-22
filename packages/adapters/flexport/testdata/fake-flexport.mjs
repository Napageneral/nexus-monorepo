#!/usr/bin/env node
// A local fake of the Flexport API v2 surface this adapter uses, for tests and the runtime
// cleanroom. It binds 127.0.0.1 only, serves the JSON fixtures in the real /api/response
// envelope, and records every request so a test can prove what was (and was not) sent.
//
//   node testdata/fake-flexport.mjs [--port 0] [--host 127.0.0.1] [--fixtures <file>] [--port-file <file>]
//
// prints {"ok":true,"url":"http://127.0.0.1:<port>","port":<port>} once listening. The fake
// accepts only FAKE_CLIENT_ID / FAKE_CLIENT_SECRET (or FAKE_FLEXPORT_CLIENT_ID / _SECRET), and
// answers GET /__fake/stats (no auth) with its token, API and download counters.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FAKE_CLIENT_ID = "fake-flexport-client-id";
export const FAKE_CLIENT_SECRET = "fake-flexport-client-secret-not-real";
export const DEFAULT_FIXTURES = fileURLToPath(new URL("./fixtures/flexport.json", import.meta.url));

const CHILD_COLLECTIONS = {
  "/ocean/shipment_containers": "containers",
  "/shipment_legs": "legs",
  "/customs_entries": "customs_entries",
  "/invoices": "invoices",
  "/documents": "documents",
};
const NETWORK_COLLECTIONS = {
  "/network/company_entities": "company_entities",
  "/network/companies": "companies",
  "/network/locations": "locations",
};

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function loadFixtures(path = DEFAULT_FIXTURES) {
  const fixtures = JSON.parse(readFileSync(path, "utf8"));
  const root = dirname(resolve(path));
  const files = {};
  for (const [id, file] of Object.entries(fixtures.document_files ?? {})) {
    files[id] = { content_type: file.content_type, bytes: readFileSync(resolve(root, file.file)) };
  }
  return { ...fixtures, document_files: files };
}

/**
 * Starts the fake. Options: fixtures (object from loadFixtures), pageSize (the most rows any page
 * returns, so small fixtures still paginate), ignoreFilter (collection paths that ignore
 * f.shipment.id, modelling a filter Flexport did not apply), clientId / clientSecret.
 */
export async function startFakeFlexport(options = {}) {
  const fixtures = options.fixtures ?? loadFixtures(options.fixturesPath);
  const clientId = options.clientId ?? process.env.FAKE_FLEXPORT_CLIENT_ID ?? FAKE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.FAKE_FLEXPORT_CLIENT_SECRET ?? FAKE_CLIENT_SECRET;
  const pageSize = options.pageSize ?? 100;
  const ignoreFilter = new Set(options.ignoreFilter ?? []);
  const issuedTokens = new Set();
  const injections = [];
  const requests = [];
  const downloads = {};
  let tokenRequests = 0;
  let origin = "";

  function envelope(data, version = 2, self = "") {
    return { _object: "/api/response", self, version, data };
  }

  function send(response, status, body, headers = {}) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    response.writeHead(status, {
      "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json",
      "content-length": String(bytes.length),
      ...headers,
    });
    response.end(bytes);
  }

  function error(response, status, code, message, self) {
    send(response, status, {
      _object: "/api/response",
      self,
      version: 2,
      data: null,
      error: { _object: "/api/error", status, code, message },
    });
  }

  function page(response, url, rows) {
    const per = Math.min(Number(url.searchParams.get("per") ?? 20) || 20, 100, pageSize);
    const number = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
    const slice = rows.slice((number - 1) * per, number * per);
    const more = number * per < rows.length;
    // Like a documented Flexport sample, the next link keeps only the page: filters and per are gone.
    send(
      response,
      200,
      envelope(
        {
          _object: "/api/collections/paginated",
          prev: number > 1 ? `${origin}${url.pathname}?page=${number - 1}` : null,
          next: more ? `${origin}${url.pathname}?page=${number + 1}` : null,
          data: slice,
          total_count: rows.length,
        },
        2,
        url.href,
      ),
    );
  }

  function ownedBy(rows, url, path) {
    const shipmentId = url.searchParams.get("f.shipment.id");
    if (!shipmentId || ignoreFilter.has(path)) return rows;
    return rows.filter((row) => String(row?.shipment?.id ?? "") === shipmentId);
  }

  function parseJson(body) {
    try {
      const parsed = JSON.parse(body.toString("utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  function route(request, response, url, body) {
    const path = url.pathname;
    const method = request.method ?? "GET";
    if (method === "GET" && path === "/__fake/stats") {
      // Counters for the runtime cleanroom, which cannot read this process's memory.
      send(response, 200, {
        token_requests: tokenRequests,
        api_requests: requests.filter((entry) => entry.path !== "/oauth/token" && entry.path !== "/__fake/stats").length,
        downloads,
      });
      return;
    }
    if (method === "POST" && path === "/oauth/token") {
      tokenRequests += 1;
      const credentials = parseJson(body) ?? {};
      if (
        credentials.client_id !== clientId ||
        credentials.client_secret !== clientSecret ||
        credentials.grant_type !== "client_credentials" ||
        credentials.audience !== "https://api.flexport.com"
      ) {
        // A real error body may echo what it was sent; the adapter must never repeat it.
        error(response, 401, "access_denied", `unknown client ${credentials.client_id} ${credentials.client_secret}`, url.href);
        return;
      }
      const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      const token = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ exp, iss: "fake-flexport", n: tokenRequests })}.fake`;
      issuedTokens.add(token);
      send(response, 200, { access_token: token, token_type: "Bearer", expires_in: 86400, scope: "" });
      return;
    }
    const authorization = request.headers.authorization ?? "";
    if (!authorization.startsWith("Bearer ") || !issuedTokens.has(authorization.slice(7))) {
      error(response, 401, "unauthorized", `token ${authorization} is not valid`, url.href);
      return;
    }
    if (request.headers["flexport-version"] !== "2") {
      error(response, 400, "bad_request", "Flexport-Version 2 is required", url.href);
      return;
    }
    if (method === "GET" && path === "/shipments") {
      const rows = [...(fixtures.shipments ?? [])];
      if (url.searchParams.get("sort") === "updated_at") {
        rows.sort((left, right) => String(left.updated_at ?? "").localeCompare(String(right.updated_at ?? "")));
        if (url.searchParams.get("direction") !== "asc") rows.reverse();
      }
      page(response, url, rows);
      return;
    }
    const shipmentMatch = /^\/shipments\/([^/]+)$/.exec(path);
    if (method === "GET" && shipmentMatch) {
      const shipment = (fixtures.shipments ?? []).find((row) => String(row.id) === decodeURIComponent(shipmentMatch[1]));
      if (!shipment) error(response, 404, "not_found", "shipment not found", url.href);
      else send(response, 200, envelope(shipment, 2, url.href));
      return;
    }
    if (method === "GET" && CHILD_COLLECTIONS[path]) {
      page(response, url, ownedBy(fixtures[CHILD_COLLECTIONS[path]] ?? [], url, path));
      return;
    }
    const downloadMatch = /^\/documents\/([^/]+)\/download$/.exec(path);
    if (method === "GET" && downloadMatch) {
      const id = decodeURIComponent(downloadMatch[1]);
      const file = fixtures.document_files?.[id];
      if (!file) {
        error(response, 404, "not_found", "document not found", url.href);
        return;
      }
      downloads[id] = (downloads[id] ?? 0) + 1;
      response.writeHead(200, { "content-type": file.content_type, "content-length": String(file.bytes.length) });
      response.end(file.bytes);
      return;
    }
    if (method === "GET" && path === "/network/me/companies") {
      send(response, 200, envelope(fixtures.network?.me_company ?? null, 2, url.href));
      return;
    }
    if (method === "GET" && NETWORK_COLLECTIONS[path]) {
      page(response, url, fixtures.network?.[NETWORK_COLLECTIONS[path]] ?? []);
      return;
    }
    if ((method === "POST" || method === "PATCH") && /^\/(products|bookings|documents)(\/[^/]+)?$/.test(path)) {
      const parsed = request.headers["content-type"] === "application/json" ? parseJson(body) : undefined;
      if (!parsed) {
        error(response, 400, "invalid_param", "body must be a JSON object", url.href);
        return;
      }
      const productMatch = /^\/products\/([^/]+)$/.exec(path);
      if (method === "POST" && path === "/products") {
        send(response, 200, envelope({ _object: "/product", id: 9001, name: parsed.name ?? null, sku: parsed.sku ?? null }, 2, url.href));
      } else if (method === "PATCH" && productMatch) {
        send(response, 200, envelope({ _object: "/product", id: decodeURIComponent(productMatch[1]), name: parsed.name ?? null }, 2, url.href));
      } else if (method === "POST" && path === "/bookings") {
        send(response, 200, envelope({ _object: "/booking", id: "BK-1001", name: parsed.name ?? null, status: "submitted" }, 2, url.href));
      } else if (method === "POST" && path === "/documents") {
        // The documented document-create response wraps the new document in a list (version 3).
        send(
          response,
          200,
          envelope([{ _object: "/document", id: "DOC-2001", file_name: parsed.file_name ?? null, document_type: parsed.document_type ?? null }], 3, url.href),
        );
      } else {
        error(response, 404, "not_found", "route not found", url.href);
      }
      return;
    }
    error(response, 404, "not_found", "route not found", url.href);
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(request.url ?? "/", origin);
      requests.push({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: request.headers.authorization ?? null,
        flexport_version: request.headers["flexport-version"] ?? null,
        accept: request.headers.accept ?? null,
        body,
      });
      const injected = injections.find(
        (entry) => entry.times > 0 && entry.path === url.pathname && (!entry.method || entry.method === request.method),
      );
      if (injected) {
        injected.times -= 1;
        send(response, injected.status, injected.body ?? envelope(null), injected.headers ?? {});
        return;
      }
      try {
        route(request, response, url, body);
      } catch {
        error(response, 500, "unknown_error", "fake failure", url.href);
      }
    });
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  origin = `http://${options.host ?? "127.0.0.1"}:${port}`;

  return {
    url: origin,
    port,
    fixtures,
    requests,
    downloads,
    get tokenRequests() {
      return tokenRequests;
    },
    apiRequests() {
      return requests.filter((entry) => entry.path !== "/oauth/token" && entry.path !== "/__fake/stats");
    },
    /** One-shot (or `times`-shot) response for a path: a 302, a 429 with Retry-After, an error body. */
    inject(entry) {
      injections.push({ times: 1, ...entry });
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const fake = await startFakeFlexport({
    port: Number(readFlag(args, "--port") ?? 0),
    host: readFlag(args, "--host") ?? "127.0.0.1",
    fixturesPath: readFlag(args, "--fixtures") ?? DEFAULT_FIXTURES,
  });
  const portFile = readFlag(args, "--port-file");
  if (portFile) writeFileSync(portFile, `${fake.port}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, url: fake.url, port: fake.port })}\n`);
  const stop = async () => {
    await fake.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
