const el = (id) => document.getElementById(id);

const state = {
  session: null,
  runtimeToken: null,
  ws: null,
};

function log(message, payload) {
  const logs = el("logs");
  const stamp = new Date().toISOString();
  const line =
    payload === undefined ? `[${stamp}] ${message}` : `[${stamp}] ${message}\n${JSON.stringify(payload, null, 2)}`;
  logs.textContent = `${line}\n\n${logs.textContent}`.slice(0, 22000);
}

function setPill(label, cls = "") {
  const pill = el("statusPill");
  pill.className = `pill ${cls}`.trim();
  pill.textContent = label;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return {
    ok: res.ok,
    status: res.status,
    body,
  };
}

async function refreshSession() {
  const result = await api("/api/session", { method: "GET" });
  if (result.ok && result.body.authenticated) {
    state.session = result.body;
    setPill(`session: ${result.body.username || result.body.email || result.body.entity_id}`, "ok");
  } else {
    state.session = null;
    setPill("session: not authenticated", "err");
  }
  log("session", result.body);
  return result;
}

async function loginPassword() {
  const username = String(el("username").value || "").trim();
  const password = String(el("password").value || "");
  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  log("password login", result.body);
  await refreshSession();
}

async function logout() {
  const result = await api("/api/logout", { method: "POST", body: "{}" });
  log("logout", result.body);
  state.runtimeToken = null;
  if (state.ws) {
    try {
      state.ws.close(1000, "logout");
    } catch {
      // noop
    }
    state.ws = null;
  }
  await refreshSession();
}

function startGoogle(intent) {
  const query = new URLSearchParams({
    provider: "google",
    intent: intent || "login",
    return_to: "/app/",
  });
  window.location.href = `/api/oidc-start?${query.toString()}`;
}

async function openTenantControlUi() {
  const result = await api("/api/frontdoor-origin", { method: "GET" });
  log("frontdoor origin", result.body);
  if (!result.ok || !result.body?.app_url) {
    return;
  }
  window.location.href = String(result.body.app_url);
}

async function mintRuntimeToken() {
  const result = await api("/api/runtime-token", {
    method: "POST",
    body: JSON.stringify({ client_id: "nexus-frontdoor-web" }),
  });
  log("runtime token mint", result.body);
  if (result.ok) {
    state.runtimeToken = result.body;
  }
}

function wsConnectDebug() {
  if (!state.runtimeToken?.runtime?.ws_url || !state.runtimeToken?.access_token) {
    log("ws connect skipped", { error: "mint runtime token first" });
    return;
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    log("ws", { status: "already connected" });
    return;
  }
  const ws = new WebSocket(state.runtimeToken.runtime.ws_url);
  state.ws = ws;
  ws.addEventListener("open", () => {
    log("ws open", { url: state.runtimeToken.runtime.ws_url });
    ws.send(
      JSON.stringify({
        type: "req",
        id: `connect-${Date.now()}`,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "webchat-ui",
            version: "0.1.0",
            platform: "web",
            mode: "webchat",
          },
          auth: {
            token: state.runtimeToken.access_token,
          },
        },
      }),
    );
  });
  ws.addEventListener("message", (event) => {
    try {
      const json = JSON.parse(String(event.data));
      log("ws message", json);
    } catch {
      log("ws message", { raw: String(event.data) });
    }
  });
  ws.addEventListener("close", (event) => {
    log("ws close", { code: event.code, reason: event.reason });
    state.ws = null;
  });
  ws.addEventListener("error", () => {
    log("ws error");
  });
}

el("googleSignupBtn").addEventListener("click", () => startGoogle("signup"));
el("googleLoginBtn").addEventListener("click", () => startGoogle("login"));
el("loginBtn").addEventListener("click", loginPassword);
el("logoutBtn").addEventListener("click", logout);
el("sessionBtn").addEventListener("click", refreshSession);
el("openTenantAppBtn").addEventListener("click", openTenantControlUi);
el("mintBtn").addEventListener("click", mintRuntimeToken);
el("wsConnectBtn").addEventListener("click", wsConnectDebug);

refreshSession().catch((error) => {
  log("session bootstrap failed", { error: String(error) });
});
