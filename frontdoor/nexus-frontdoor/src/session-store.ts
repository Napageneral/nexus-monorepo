import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { randomToken, tokenHash } from "./crypto.js";
import type { Principal, RefreshTokenRecord, SessionRecord } from "./types.js";

type RefreshLookup = {
  sessionId: string;
  refreshId: string;
};

type SessionStoreOptions = {
  sqlitePath?: string;
};

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly refreshIndex = new Map<string, RefreshLookup>();
  private readonly db: DatabaseSync | null;
  private lastPruneAtMs = 0;
  private readonly pruneIntervalMs = 60_000;

  constructor(
    private readonly sessionTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
    options: SessionStoreOptions = {},
  ) {
    const sqlitePath = options.sqlitePath?.trim();
    if (sqlitePath) {
      fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
      this.db = new DatabaseSync(sqlitePath);
      this.db.exec("PRAGMA journal_mode=WAL;");
      this.db.exec("PRAGMA foreign_keys=ON;");
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS frontdoor_sessions (
          session_id TEXT PRIMARY KEY,
          principal_json TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS frontdoor_refresh_tokens (
          refresh_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          secret_hash TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER NOT NULL,
          revoked_at_ms INTEGER,
          FOREIGN KEY(session_id) REFERENCES frontdoor_sessions(session_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_frontdoor_sessions_expires
          ON frontdoor_sessions(expires_at_ms);
        CREATE INDEX IF NOT EXISTS idx_frontdoor_refresh_session
          ON frontdoor_refresh_tokens(session_id);
        CREATE INDEX IF NOT EXISTS idx_frontdoor_refresh_expires
          ON frontdoor_refresh_tokens(expires_at_ms);
      `);
    } else {
      this.db = null;
    }
  }

  close(): void {
    this.db?.close();
  }

  createSession(principal: Principal, nowMs = Date.now()): SessionRecord {
    const sessionId = randomUUID();
    const session: SessionRecord = {
      id: sessionId,
      principal,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.sessionTtlSeconds * 1000,
      refreshTokens: new Map<string, RefreshTokenRecord>(),
    };
    if (!this.db) {
      this.sessions.set(sessionId, session);
      return session;
    }
    this.pruneIfNeeded(nowMs);
    this.db
      .prepare(
        `INSERT INTO frontdoor_sessions (session_id, principal_json, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?)`,
      )
      .run(session.id, JSON.stringify(session.principal), session.createdAtMs, session.expiresAtMs);
    return { ...session, refreshTokens: new Map() };
  }

  getSession(sessionId: string, nowMs = Date.now()): SessionRecord | null {
    if (!this.db) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return null;
      }
      if (session.expiresAtMs <= nowMs) {
        this.deleteSession(sessionId);
        return null;
      }
      return session;
    }

    this.pruneIfNeeded(nowMs);
    const row = this.db
      .prepare(
        `SELECT session_id, principal_json, created_at_ms, expires_at_ms
         FROM frontdoor_sessions
         WHERE session_id = ?`,
      )
      .get(sessionId) as
      | {
          session_id: string;
          principal_json: string;
          created_at_ms: number;
          expires_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    if (row.expires_at_ms <= nowMs) {
      this.deleteSession(sessionId);
      return null;
    }
    return {
      id: row.session_id,
      principal: JSON.parse(row.principal_json) as Principal,
      createdAtMs: row.created_at_ms,
      expiresAtMs: row.expires_at_ms,
      refreshTokens: new Map(),
    };
  }

  deleteSession(sessionId: string): void {
    if (!this.db) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return;
      }
      for (const record of session.refreshTokens.values()) {
        this.refreshIndex.delete(record.id);
      }
      this.sessions.delete(sessionId);
      return;
    }
    this.db
      .prepare(`DELETE FROM frontdoor_refresh_tokens WHERE session_id = ?`)
      .run(sessionId);
    this.db
      .prepare(`DELETE FROM frontdoor_sessions WHERE session_id = ?`)
      .run(sessionId);
  }

  updateSessionPrincipal(sessionId: string, principal: Principal): SessionRecord | null {
    const current = this.getSession(sessionId);
    if (!current) {
      return null;
    }
    const next: SessionRecord = {
      ...current,
      principal,
    };
    if (!this.db) {
      this.sessions.set(sessionId, next);
      return next;
    }
    this.db
      .prepare(
        `
        UPDATE frontdoor_sessions
        SET principal_json = ?
        WHERE session_id = ?
      `,
      )
      .run(JSON.stringify(principal), sessionId);
    return next;
  }

  issueRefreshToken(sessionId: string, nowMs = Date.now()): string {
    const session = this.getSession(sessionId, nowMs);
    if (!session) {
      throw new Error("session_not_found");
    }
    const refreshId = randomUUID();
    const secret = randomToken(24);
    const token = `rt_${refreshId}.${secret}`;
    const record: RefreshTokenRecord = {
      id: refreshId,
      hash: tokenHash(secret),
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.refreshTtlSeconds * 1000,
    };
    if (!this.db) {
      session.refreshTokens.set(refreshId, record);
      this.refreshIndex.set(refreshId, { sessionId: session.id, refreshId });
      return token;
    }
    this.db
      .prepare(
        `INSERT INTO frontdoor_refresh_tokens (
           refresh_id, session_id, secret_hash, created_at_ms, expires_at_ms, revoked_at_ms
         ) VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(record.id, session.id, record.hash, record.createdAtMs, record.expiresAtMs);
    return token;
  }

  rotateRefreshToken(token: string, nowMs = Date.now()): {
    session: SessionRecord;
    nextRefreshToken: string;
  } | null {
    const verified = this.verifyRefreshToken(token, nowMs);
    if (!verified) {
      return null;
    }
    verified.record.revokedAtMs = nowMs;
    if (!this.db) {
      const nextRefreshToken = this.issueRefreshToken(verified.session.id, nowMs);
      return {
        session: verified.session,
        nextRefreshToken,
      };
    }
    this.db
      .prepare(
        `UPDATE frontdoor_refresh_tokens
         SET revoked_at_ms = ?
         WHERE refresh_id = ?`,
      )
      .run(nowMs, verified.record.id);
    const nextRefreshToken = this.issueRefreshToken(verified.session.id, nowMs);
    return {
      session: verified.session,
      nextRefreshToken,
    };
  }

  revokeRefreshToken(token: string, nowMs = Date.now()): boolean {
    const verified = this.verifyRefreshToken(token, nowMs);
    if (!verified) {
      return false;
    }
    verified.record.revokedAtMs = nowMs;
    if (!this.db) {
      return true;
    }
    this.db
      .prepare(
        `UPDATE frontdoor_refresh_tokens
         SET revoked_at_ms = ?
         WHERE refresh_id = ?`,
      )
      .run(nowMs, verified.record.id);
    return true;
  }

  private verifyRefreshToken(
    token: string,
    nowMs: number,
  ): { session: SessionRecord; record: RefreshTokenRecord } | null {
    const [idPart, secret] = token.trim().split(".");
    if (!idPart?.startsWith("rt_") || !secret) {
      return null;
    }
    const refreshId = idPart.slice("rt_".length);
    if (!refreshId) {
      return null;
    }
    if (!this.db) {
      const lookup = this.refreshIndex.get(refreshId);
      if (!lookup) {
        return null;
      }
      const session = this.getSession(lookup.sessionId, nowMs);
      if (!session) {
        return null;
      }
      const record = session.refreshTokens.get(lookup.refreshId);
      if (!record) {
        return null;
      }
      if (record.expiresAtMs <= nowMs || record.revokedAtMs !== undefined) {
        return null;
      }
      if (record.hash !== tokenHash(secret)) {
        return null;
      }
      return { session, record };
    }

    this.pruneIfNeeded(nowMs);
    const row = this.db
      .prepare(
        `SELECT
           r.refresh_id,
           r.secret_hash,
           r.created_at_ms AS refresh_created_at_ms,
           r.expires_at_ms AS refresh_expires_at_ms,
           r.revoked_at_ms AS refresh_revoked_at_ms,
           s.session_id,
           s.principal_json,
           s.created_at_ms AS session_created_at_ms,
           s.expires_at_ms AS session_expires_at_ms
         FROM frontdoor_refresh_tokens r
         JOIN frontdoor_sessions s ON s.session_id = r.session_id
         WHERE r.refresh_id = ?`,
      )
      .get(refreshId) as
      | {
          refresh_id: string;
          secret_hash: string;
          refresh_created_at_ms: number;
          refresh_expires_at_ms: number;
          refresh_revoked_at_ms: number | null;
          session_id: string;
          principal_json: string;
          session_created_at_ms: number;
          session_expires_at_ms: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    if (row.session_expires_at_ms <= nowMs) {
      this.deleteSession(row.session_id);
      return null;
    }
    if (row.refresh_expires_at_ms <= nowMs || row.refresh_revoked_at_ms !== null) {
      return null;
    }
    if (row.secret_hash !== tokenHash(secret)) {
      return null;
    }
    return {
      session: {
        id: row.session_id,
        principal: JSON.parse(row.principal_json) as Principal,
        createdAtMs: row.session_created_at_ms,
        expiresAtMs: row.session_expires_at_ms,
        refreshTokens: new Map(),
      },
      record: {
        id: row.refresh_id,
        hash: row.secret_hash,
        createdAtMs: row.refresh_created_at_ms,
        expiresAtMs: row.refresh_expires_at_ms,
        revokedAtMs: row.refresh_revoked_at_ms ?? undefined,
      },
    };
  }

  private pruneIfNeeded(nowMs: number): void {
    if (!this.db) {
      return;
    }
    if (nowMs - this.lastPruneAtMs < this.pruneIntervalMs) {
      return;
    }
    this.lastPruneAtMs = nowMs;
    this.db
      .prepare(`DELETE FROM frontdoor_refresh_tokens WHERE expires_at_ms <= ?`)
      .run(nowMs);
    this.db
      .prepare(`DELETE FROM frontdoor_sessions WHERE expires_at_ms <= ?`)
      .run(nowMs);
  }
}
