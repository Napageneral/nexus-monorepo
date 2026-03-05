"use strict";

const {
  envConfig,
  enforceBrowserOrigin,
  loadSession,
  persistSession,
  publicSessionView,
  readJsonBody,
  requireSession,
  resolveSpikeConfig,
  callSpike,
  sendJson,
} = require("./_shared");

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeTreeID(value, fallback) {
  const out = String(value || "").trim();
  return out || String(fallback || "oracle-deep").trim() || "oracle-deep";
}

function validateOrigin(raw) {
  const value = trimTrailingSlash(raw);
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

module.exports = async function handler(req, res) {
  const cfg = envConfig();

  if (req.method === "GET") {
    const session = requireSession(req, res, cfg);
    if (!session) {
      return;
    }
    const spike = resolveSpikeConfig(session, cfg);
    return sendJson(res, 200, {
      ok: true,
      spike: {
        origin: spike.origin,
        tree_id: spike.treeID,
        has_token: Boolean(spike.authToken),
      },
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!enforceBrowserOrigin(req, res)) {
    return;
  }

  const session = requireSession(req, res, cfg);
  if (!session) {
    return;
  }
  if (!cfg.appSessionSecret) {
    return sendJson(res, 500, { ok: false, error: "server_missing_app_session_secret" });
  }

  const body = await readJsonBody(req);
  if (body === null || typeof body !== "object") {
    return sendJson(res, 400, { ok: false, error: "invalid_json" });
  }

  const originFromInput = validateOrigin(body.origin);
  const existingOrigin = validateOrigin(session?.spike?.origin);
  const origin = originFromInput || existingOrigin || cfg.defaultSpikeOrigin;
  const existingToken = String(session?.spike?.auth_token || "").trim();
  const authToken = String(body.auth_token || "").trim() || existingToken || cfg.defaultSpikeToken;
  const treeID = normalizeTreeID(body.tree_id, cfg.defaultTreeID);

  if (!origin) {
    return sendJson(res, 400, { ok: false, error: "spike_origin_required" });
  }
  if (!authToken) {
    return sendJson(res, 400, { ok: false, error: "spike_auth_token_required" });
  }

  const nextSession = {
    ...loadSession(req, cfg),
    profile: session.profile,
    github: session.github,
    spike: {
      origin,
      auth_token: authToken,
      tree_id: treeID,
    },
  };

  persistSession(req, res, cfg, nextSession);

  const probe = await callSpike(cfg, nextSession, "/status", "GET", null);
  return sendJson(res, probe.ok ? 200 : 502, {
    ok: probe.ok,
    session: publicSessionView(nextSession, cfg),
    status_probe: {
      ok: probe.ok,
      status: probe.status,
      body: probe.body,
    },
  });
};
