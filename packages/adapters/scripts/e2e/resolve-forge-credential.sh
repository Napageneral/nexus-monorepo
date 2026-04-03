#!/usr/bin/env bash
set -euo pipefail

: "${FORGE_SERVICE:?FORGE_SERVICE is required}"
: "${NEX_ROOT_ENV:?NEX_ROOT_ENV is required}"
: "${NEXUS_WORKSPACE_ROOT_ENV:?NEXUS_WORKSPACE_ROOT_ENV is required}"

cd "$NEX_ROOT_ENV"
pnpm exec tsx - <<'JS'
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const vaultModulePath = pathToFileURL(
  path.join(process.env.NEX_ROOT_ENV ?? "", "src/runtime/domains/identity/vault.ts"),
).href;
const { retrieveVaultEntry } = await import(vaultModulePath);

const db = new DatabaseSync(
  path.join(process.env.NEXUS_WORKSPACE_ROOT_ENV ?? "", "state", "data", "identity.db"),
  { readOnly: true },
);

try {
  const service = (process.env.FORGE_SERVICE ?? "").trim();
  const explicitId = (process.env.FORGE_CREDENTIAL_ID ?? "").trim();

  let row = null;
  if (explicitId) {
    row = db.prepare(
      "select id, service, account, storage_pointer from credentials where id = ? and revoked_at is null limit 1",
    ).get(explicitId);
  }
  if (!row) {
    row = db.prepare(
      `select id, service, account, storage_pointer
         from credentials
        where service = ?
          and revoked_at is null
        order by updated_at desc
        limit 1`,
    ).get(service);
  }
  if (!row?.storage_pointer) {
    process.stdout.write("");
    process.exit(0);
  }

  const plaintext = retrieveVaultEntry(db, {
    id: row.storage_pointer,
    env: process.env,
  });
  const value = JSON.parse(plaintext);
  const host = `${value.host ?? process.env.FORGE_DEFAULT_HOST ?? ""}`.trim();
  process.stdout.write(
    JSON.stringify({
      host,
      token: `${value.token ?? ""}`.trim(),
      username: `${value.username ?? ""}`.trim(),
    }),
  );
} finally {
  db.close();
}
JS
