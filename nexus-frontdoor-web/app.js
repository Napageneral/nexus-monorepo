const el = (id) => document.getElementById(id);

const state = {
  session: null,
  workspaces: [],
  activeWorkspaceId: "",
  frontdoorOrigin: "",
  operatorWorkspaces: [],
};
const operatorMode = new URLSearchParams(window.location.search).get("operator") === "1";

function hasOperatorAccess(session) {
  if (!session || !Array.isArray(session.roles)) {
    return false;
  }
  return session.roles.some((role) => String(role || "").trim() === "operator");
}

function hasWorkspaceAdminAccess(session) {
  if (!session || !Array.isArray(session.roles)) {
    return false;
  }
  const allowed = new Set(["workspace_owner", "workspace_admin", "operator"]);
  return session.roles.some((role) => allowed.has(String(role || "").trim()));
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

function formatDate(valueMs) {
  if (typeof valueMs !== "number" || !Number.isFinite(valueMs) || valueMs <= 0) {
    return "-";
  }
  try {
    return new Date(valueMs).toLocaleDateString();
  } catch {
    return "-";
  }
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

function resetOwnerInsights() {
  el("usageRequests30d").textContent = "0";
  el("usageTokensIn30d").textContent = "0";
  el("usageTokensOut30d").textContent = "0";
  el("usageActiveMembers").textContent = "0";
  el("billingPlan").textContent = "-";
  el("billingStatus").textContent = "-";
  el("billingProvider").textContent = "-";
  el("billingPeriodEnd").textContent = "-";
  el("billingInvoiceList").innerHTML = "";
}

function renderOperatorWorkspaceInventory(items) {
  const list = el("operatorWorkspaceList");
  list.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No workspaces.";
    list.appendChild(empty);
    el("operatorWorkspaceCount").textContent = "0";
    return;
  }
  el("operatorWorkspaceCount").textContent = String(items.length);
  for (const item of items) {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = `${item.display_name || item.workspace_id} (${item.workspace_id})`;
    const meta = document.createElement("span");
    meta.className = "meta";
    const requests = formatNumber(item?.usage_30d?.requests_total || 0);
    const members = formatNumber(item?.member_count || 0);
    const plan = String(item?.billing?.plan_id || "starter");
    const status = String(item?.status || "active");
    meta.textContent = `${status} • ${members} members • ${requests} requests/30d • plan ${plan}`;
    li.appendChild(title);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

function updateUiFromSession(session, options = {}) {
  const authenticated = Boolean(session && session.authenticated);
  state.session = authenticated ? session : null;
  const keepStatus = options.keepStatus === true;
  const operatorAllowed = authenticated && hasOperatorAccess(session);
  const workspaceAdminAllowed = authenticated && hasWorkspaceAdminAccess(session);

  el("googleBtn").hidden = authenticated;
  el("logoutBtn").hidden = !authenticated;
  el("openTenantAppBtn").disabled = !authenticated || !state.activeWorkspaceId;
  el("workspacePanel").hidden = !authenticated;
  el("invitePanel").hidden = !authenticated;
  el("ownerInsightsPanel").hidden = !workspaceAdminAllowed;
  el("operatorWorkspacePanel").hidden = !operatorAllowed;
  el("operatorPanel").hidden = !(operatorMode && operatorAllowed);

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
  resetOwnerInsights();
  renderOperatorWorkspaceInventory([]);
  el("ownerInsightsPanel").hidden = true;
  el("operatorWorkspacePanel").hidden = true;
  el("operatorPanel").hidden = true;
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
    resetOwnerInsights();
    return;
  }
  const result = await api("/api/workspaces", { method: "GET" });
  if (!result.ok || !Array.isArray(result.body.items)) {
    state.workspaces = [];
    state.activeWorkspaceId = "";
    renderWorkspaceSelect();
    updateWorkspaceSummary();
    el("workspaceCount").textContent = "0";
    resetOwnerInsights();
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
  await loadWorkspaceInsights();
}

async function loadWorkspaceInsights() {
  if (!state.session || !hasWorkspaceAdminAccess(state.session)) {
    resetOwnerInsights();
    return;
  }
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    resetOwnerInsights();
    return;
  }
  const usageResp = await api(`/api/workspace-usage?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
  if (usageResp.ok) {
    el("usageRequests30d").textContent = formatNumber(usageResp.body.requests_total || 0);
    el("usageTokensIn30d").textContent = formatNumber(usageResp.body.tokens_in || 0);
    el("usageTokensOut30d").textContent = formatNumber(usageResp.body.tokens_out || 0);
    el("usageActiveMembers").textContent = formatNumber(usageResp.body.active_members || 0);
  } else {
    el("usageRequests30d").textContent = "-";
    el("usageTokensIn30d").textContent = "-";
    el("usageTokensOut30d").textContent = "-";
    el("usageActiveMembers").textContent = "-";
  }
  const billingResp = await api(`/api/billing-subscription?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
  if (billingResp.ok) {
    el("billingPlan").textContent = String(billingResp.body?.plan_id || "-");
    el("billingStatus").textContent = String(billingResp.body?.status || "-");
    el("billingProvider").textContent = String(billingResp.body?.provider || "-");
    el("billingPeriodEnd").textContent = formatDate(billingResp.body?.period_end_ms);
    const selectedPlan = String(billingResp.body?.plan_id || "").trim();
    if (selectedPlan) {
      el("billingPlanSelect").value = selectedPlan;
    }
  } else if (billingResp.status === 403) {
    el("billingPlan").textContent = "restricted";
    el("billingStatus").textContent = "restricted";
    el("billingProvider").textContent = "restricted";
    el("billingPeriodEnd").textContent = "restricted";
  } else {
    el("billingPlan").textContent = "-";
    el("billingStatus").textContent = "-";
    el("billingProvider").textContent = "-";
    el("billingPeriodEnd").textContent = "-";
  }
  await loadWorkspaceInvoices();
}

function renderBillingInvoices(items) {
  const list = el("billingInvoiceList");
  list.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No invoices yet.";
    list.appendChild(empty);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.className = "title";
    const amount = formatNumber(item.amount_due || 0);
    const currency = String(item.currency || "usd").toUpperCase();
    title.textContent = `${item.invoice_id} • ${currency} ${amount}`;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${item.status || "unknown"} • ${formatDate(item.created_at_ms)}`;
    li.appendChild(title);
    li.appendChild(meta);
    if (item.hosted_invoice_url) {
      const link = document.createElement("a");
      link.href = String(item.hosted_invoice_url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open invoice";
      li.appendChild(link);
    }
    list.appendChild(li);
  }
}

async function loadWorkspaceInvoices() {
  if (!state.session || !hasWorkspaceAdminAccess(state.session)) {
    renderBillingInvoices([]);
    return;
  }
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    renderBillingInvoices([]);
    return;
  }
  const invoicesResp = await api(`/api/billing-invoices?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
  if (!invoicesResp.ok || !Array.isArray(invoicesResp.body?.items)) {
    renderBillingInvoices([]);
    return;
  }
  renderBillingInvoices(invoicesResp.body.items);
}

async function startCheckout() {
  if (!state.session || !hasWorkspaceAdminAccess(state.session)) {
    setPill("Billing access denied", "err");
    return;
  }
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    setPill("Select a workspace first", "err");
    return;
  }
  const planId = String(el("billingPlanSelect").value || "").trim() || "starter";
  const result = await api("/api/billing-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: workspaceId,
      plan_id: planId,
    }),
  });
  if (!result.ok || !result.body?.checkout_url) {
    setPill("Checkout launch failed", "err");
    return;
  }
  window.open(String(result.body.checkout_url), "_blank", "noopener,noreferrer");
  setPill("Checkout session ready", "ok");
}

async function loadOperatorInventory() {
  if (!state.session || !hasOperatorAccess(state.session)) {
    state.operatorWorkspaces = [];
    renderOperatorWorkspaceInventory([]);
    return;
  }
  const result = await api("/api/operator-workspaces", { method: "GET" });
  if (!result.ok || !Array.isArray(result.body?.items)) {
    state.operatorWorkspaces = [];
    renderOperatorWorkspaceInventory([]);
    return;
  }
  state.operatorWorkspaces = result.body.items;
  renderOperatorWorkspaceInventory(state.operatorWorkspaces);
}

async function refreshSession() {
  const result = await api("/api/session", { method: "GET" });
  if (result.ok && result.body.authenticated) {
    updateUiFromSession(result.body);
    await loadWorkspaces();
    await loadOperatorInventory();
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
  await loadWorkspaceInsights();
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
  const selected = await api("/api/workspaces-select", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: workspaceId,
    }),
  });
  if (!selected.ok) {
    setPill("Workspace selection failed", "err");
    return;
  }
  const originResp = await api("/api/frontdoor-origin", {
    method: "GET",
  });
  if (!originResp.ok || !originResp.body?.frontdoor_origin) {
    setPill("Workspace launch unavailable", "err");
    return;
  }
  const frontdoorOrigin = String(originResp.body.frontdoor_origin || "").replace(/\/+$/, "");
  state.frontdoorOrigin = frontdoorOrigin;
  const launch = new URL("/app/chat", frontdoorOrigin);
  launch.searchParams.set("session", "main");
  launch.searchParams.set("workspace_id", workspaceId);
  window.location.href = launch.toString();
}

function handleWorkspacePickerChange() {
  state.activeWorkspaceId = currentWorkspaceId();
  updateWorkspaceSummary();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId;
  loadWorkspaceInsights().catch(() => {
    resetOwnerInsights();
  });
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
el("refreshInsightsBtn").addEventListener("click", loadWorkspaceInsights);
el("refreshOperatorBtn").addEventListener("click", loadOperatorInventory);
el("startCheckoutBtn").addEventListener("click", startCheckout);
el("operatorPanel").hidden = true;

refreshSession().catch(() => {
  updateUiFromSession(null);
  setPill("Session unavailable", "err");
});
