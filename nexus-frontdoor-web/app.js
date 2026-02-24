const el = (id) => document.getElementById(id);

const state = {
  session: null,
  workspaces: [],
  activeWorkspaceId: "",
};
const operatorMode = new URLSearchParams(window.location.search).get("operator") === "1";

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
  let body = {};
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

function renderWorkspaceSelect() {
  const select = el("workspaceSelect");
  if (!select) {
    return;
  }
  const items = state.workspaces;
  select.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No workspace access";
    select.appendChild(empty);
    select.value = "";
    return;
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.workspace_id;
    option.textContent = item.display_name || item.workspace_id;
    select.appendChild(option);
  }
  const selected =
    state.activeWorkspaceId && items.some((item) => item.workspace_id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : items[0].workspace_id;
  state.activeWorkspaceId = selected;
  select.value = selected;
}

function updateWorkspaceSummary() {
  const summary = el("workspaceSummary");
  if (!summary) {
    return;
  }
  const selected = state.workspaces.find((item) => item.workspace_id === state.activeWorkspaceId);
  if (!selected) {
    summary.textContent = "No active workspace selected.";
    return;
  }
  summary.textContent = `Active workspace: ${selected.display_name || selected.workspace_id}`;
}

function updateUiFromSession(session, options = {}) {
  const authenticated = Boolean(session && session.authenticated);
  state.session = authenticated ? session : null;
  const keepStatus = options.keepStatus === true;

  el("googleBtn").hidden = authenticated;
  el("logoutBtn").hidden = !authenticated;
  el("openTenantAppBtn").disabled = !authenticated || !state.activeWorkspaceId;
  el("workspacePanel").hidden = !authenticated;
  el("invitePanel").hidden = !authenticated;

  if (authenticated) {
    const who =
      session.display_name ||
      session.email ||
      session.username ||
      session.entity_id ||
      "authenticated user";
    if (!keepStatus) {
      setPill(`Signed in as ${who}`, "ok");
    }
    return;
  }

  state.workspaces = [];
  state.activeWorkspaceId = "";
  renderWorkspaceSelect();
  updateWorkspaceSummary();
  el("workspaceCount").textContent = "0";
  setPill("Not signed in", "err");
}

function currentWorkspaceId() {
  const select = el("workspaceSelect");
  const value = String(select?.value || state.activeWorkspaceId || "").trim();
  return value || "";
}

async function loadWorkspaces() {
  if (!state.session) {
    state.workspaces = [];
    state.activeWorkspaceId = "";
    renderWorkspaceSelect();
    updateWorkspaceSummary();
    el("workspaceCount").textContent = "0";
    return;
  }
  const result = await api("/api/workspaces", { method: "GET" });
  if (!result.ok || !Array.isArray(result.body.items)) {
    state.workspaces = [];
    state.activeWorkspaceId = "";
    renderWorkspaceSelect();
    updateWorkspaceSummary();
    el("workspaceCount").textContent = "0";
    setPill("Workspace list unavailable", "err");
    return;
  }
  state.workspaces = result.body.items;
  const activeFromSession = String(state.session.active_workspace_id || "").trim();
  if (activeFromSession && state.workspaces.some((item) => item.workspace_id === activeFromSession)) {
    state.activeWorkspaceId = activeFromSession;
  } else {
    const defaultWorkspace = state.workspaces.find((item) => item.is_default);
    state.activeWorkspaceId = defaultWorkspace?.workspace_id || state.workspaces[0]?.workspace_id || "";
  }
  renderWorkspaceSelect();
  updateWorkspaceSummary();
  el("workspaceCount").textContent = String(state.workspaces.length);
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId;
}

async function refreshSession() {
  const result = await api("/api/session", { method: "GET" });
  if (result.ok && result.body.authenticated) {
    updateUiFromSession(result.body);
    await loadWorkspaces();
  } else {
    updateUiFromSession(null);
  }
}

function startGoogle() {
  const query = new URLSearchParams({
    provider: "google",
    return_to: "/",
  });
  window.location.href = `/api/oidc-start?${query.toString()}`;
}

async function loginPassword(event) {
  event.preventDefault();
  const username = String(el("username").value || "").trim();
  const password = String(el("password").value || "");
  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!result.ok) {
    setPill("Operator login failed", "err");
    return;
  }
  await refreshSession();
}

async function logout() {
  await api("/api/logout", {
    method: "POST",
    body: "{}",
  });
  await refreshSession();
}

async function selectWorkspace() {
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    setPill("Select a workspace first", "err");
    return;
  }
  const result = await api("/api/workspaces-select", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!result.ok) {
    setPill("Workspace selection failed", "err");
    return;
  }
  state.activeWorkspaceId = workspaceId;
  await refreshSession();
  setPill("Workspace selected", "ok");
}

async function redeemInvite() {
  const token = String(el("inviteToken").value || "").trim();
  if (!token) {
    setPill("Invite token is required", "err");
    return;
  }
  const result = await api("/api/invites-redeem", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!result.ok) {
    setPill("Invite redemption failed", "err");
    return;
  }
  el("inviteToken").value = "";
  await refreshSession();
  setPill("Invite redeemed", "ok");
}

async function createWorkspace(event) {
  event.preventDefault();
  const displayName = String(el("workspaceName").value || "").trim();
  const runtimeUrl = String(el("workspaceRuntimeUrl").value || "").trim();
  const workspaceId = String(el("workspaceId").value || "").trim();
  if (!displayName || !runtimeUrl) {
    setPill("Workspace name + runtime URL are required", "err");
    return;
  }
  const payload = {
    display_name: displayName,
    runtime_url: runtimeUrl,
    runtime_public_base_url: runtimeUrl,
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
  };
  const result = await api("/api/workspaces-create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!result.ok) {
    setPill("Workspace creation failed", "err");
    return;
  }
  const createdId = String(result.body?.workspace?.workspace_id || "");
  await refreshSession();
  if (createdId) {
    const select = el("workspaceSelect");
    if (select) {
      select.value = createdId;
    }
    state.activeWorkspaceId = createdId;
    await selectWorkspace();
  } else {
    setPill("Workspace created", "ok");
  }
  el("workspaceName").value = "";
  el("workspaceRuntimeUrl").value = "";
  el("workspaceId").value = "";
}

async function openTenantControlUi() {
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    setPill("Select a workspace first", "err");
    return;
  }
  const result = await api("/api/runtime-token", {
    method: "POST",
    body: JSON.stringify({
      client_id: "nexus-frontdoor-web",
      workspace_id: workspaceId,
    }),
  });
  if (!result.ok || !result.body?.access_token || !result.body?.runtime?.http_base_url) {
    setPill("Workspace launch unavailable", "err");
    return;
  }
  const httpBaseUrl = String(result.body.runtime.http_base_url).replace(/\/+$/, "");
  const wsUrl = String(result.body.runtime.ws_url || "");
  const launch = new URL(`${httpBaseUrl}/app/chat`);
  launch.searchParams.set("session", "main");
  launch.searchParams.set("token", result.body.access_token);
  if (wsUrl) {
    launch.searchParams.set("runtimeUrl", wsUrl);
  }
  window.location.href = launch.toString();
}

function handleWorkspacePickerChange() {
  state.activeWorkspaceId = currentWorkspaceId();
  updateWorkspaceSummary();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId;
}

el("googleBtn").addEventListener("click", startGoogle);
el("logoutBtn").addEventListener("click", logout);
el("openTenantAppBtn").addEventListener("click", openTenantControlUi);
el("loginBtn").addEventListener("click", loginPassword);
el("workspaceSelect").addEventListener("change", handleWorkspacePickerChange);
el("refreshWorkspacesBtn").addEventListener("click", loadWorkspaces);
el("selectWorkspaceBtn").addEventListener("click", selectWorkspace);
el("redeemInviteBtn").addEventListener("click", redeemInvite);
el("createWorkspaceBtn").addEventListener("click", createWorkspace);
el("operatorPanel").hidden = !operatorMode;

refreshSession().catch(() => {
  updateUiFromSession(null);
  setPill("Session unavailable", "err");
});
