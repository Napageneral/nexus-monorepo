const el = (id) => document.getElementById(id);

function sanitizeQueryToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

const pageParams = new URLSearchParams(window.location.search);
const requestedFlavor = sanitizeQueryToken(pageParams.get("flavor"));
const requestedProduct = sanitizeQueryToken(pageParams.get("product")) || requestedFlavor;
const requestedEntry = sanitizeQueryToken(pageParams.get("entry"));
const authReturn = pageParams.get("auth_return") === "1";

const FLAVOR_CONFIGS = {
  default: {
    key: "default",
    eyebrow: "NexusHub Shell",
    headline: "Build and launch AI workspaces",
    lead: "Authenticate, then launch the workspace and app package provisioned for your team.",
    signInTitle: "Sign in",
    signinBlurb: "Use your Google account to access your NexusHub workspace.",
    offerTitle: "NexusHub infrastructure + app package",
    offerDescription: "NexusHub provisions dedicated server capacity and routes you into your workspace control plane.",
    infraDescription:
      "Your plan combines server footprint with the app flavor package you selected (GlowBot, Spike, or another build).",
    pricingLabel: "Pricing is quote-based: server count + app flavor package.",
    preferredAppId: "control",
    launchButtonLabel: "Open workspace",
  },
  glowbot: {
    key: "glowbot",
    eyebrow: "GlowBot on NexusHub",
    headline: "Launch your GlowBot workspace",
    lead: "Sign in to provision or open your GlowBot tenant and route directly into the clinic growth workspace.",
    signInTitle: "Sign in to GlowBot",
    signinBlurb: "Continue with Google to access your GlowBot workspace on NexusHub.",
    offerTitle: "GlowBot package + dedicated infrastructure",
    offerDescription:
      "NexusHub provides the shared onboarding, tenancy, and runtime routing while GlowBot provides the clinic app flavor.",
    infraDescription:
      "You purchase server capacity for your tenant and attach the GlowBot runtime package for operations and reporting.",
    pricingLabel: "GlowBot pricing is quote-based by server footprint and package tier.",
    preferredAppId: "glowbot",
    launchButtonLabel: "Open GlowBot workspace",
  },
  spike: {
    key: "spike",
    eyebrow: "Spike on NexusHub",
    headline: "Launch your Spike workspace",
    lead: "Authenticate once, then open your Spike tenant workspace through NexusHub routing.",
    signInTitle: "Sign in to Spike",
    signinBlurb: "Continue with Google to access your Spike workspace on NexusHub.",
    offerTitle: "Spike package + dedicated infrastructure",
    offerDescription:
      "NexusHub handles onboarding, auth, and workspace routing while Spike provides the market and execution app flavor.",
    infraDescription:
      "Your subscription combines server capacity with the Spike runtime package chosen for your team.",
    pricingLabel: "Spike pricing is quote-based by server footprint and package tier.",
    preferredAppId: "spike",
    launchButtonLabel: "Open Spike workspace",
  },
};

function resolveFlavorConfig(flavorKey) {
  if (!flavorKey) {
    return FLAVOR_CONFIGS.default;
  }
  return FLAVOR_CONFIGS[flavorKey] || FLAVOR_CONFIGS.default;
}

const state = {
  session: null,
  workspaces: [],
  activeWorkspaceId: "",
  workspaceApps: [],
  workspaceAppsError: "",
  launchDiagnostics: null,
  launchBlocker: "",
  activeAppId: "",
  provisioningStatus: "",
  provisioningRequest: null,
  frontdoorOrigin: "",
  operatorWorkspaces: [],
  flavor: resolveFlavorConfig(requestedFlavor),
  productId: requestedProduct,
  entry: requestedEntry,
};
const operatorMode = pageParams.get("operator") === "1";

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

function setTextContent(id, value) {
  const node = el(id);
  if (!node) {
    return;
  }
  node.textContent = String(value || "");
}

function applyFlavorCopy() {
  const flavor = state.flavor;
  setTextContent("heroEyebrow", flavor.eyebrow);
  setTextContent("heroHeadline", flavor.headline);
  setTextContent("heroLead", flavor.lead);
  setTextContent("signInTitle", flavor.signInTitle);
  setTextContent("signInBlurb", flavor.signinBlurb);
  setTextContent("offerTitle", flavor.offerTitle);
  setTextContent("offerDescription", flavor.offerDescription);
  setTextContent("infraDescription", flavor.infraDescription);
  setTextContent("pricingLabel", flavor.pricingLabel);
  setTextContent("openTenantAppBtn", flavor.launchButtonLabel);

  const entryContext = el("entryContext");
  if (!entryContext) {
    return;
  }
  if (state.entry) {
    entryContext.hidden = false;
    entryContext.textContent = `Entry source: ${state.entry}`;
    syncProductProvisionSelection();
    return;
  }
  entryContext.hidden = true;
  entryContext.textContent = "";
  syncProductProvisionSelection();
}

function preferredAppId() {
  return String(state.flavor?.preferredAppId || "").trim();
}

function preferredProductId() {
  const fromState = sanitizeQueryToken(state.productId);
  if (fromState) {
    return fromState;
  }
  const flavorKey = sanitizeQueryToken(state.flavor?.key || "");
  if (flavorKey && flavorKey !== "default") {
    return flavorKey;
  }
  return "";
}

function setAuthWarning(message = "") {
  const node = el("authWarning");
  if (!node) {
    return;
  }
  const text = String(message || "").trim();
  if (!text) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = text;
}

function setProvisioningSummary(message = "", tone = "") {
  const node = el("provisioningSummary");
  if (!node) {
    return;
  }
  const text = String(message || "").trim();
  if (!text) {
    node.hidden = true;
    node.textContent = "";
    node.className = "muted";
    return;
  }
  node.hidden = false;
  node.textContent = text;
  node.className = tone === "err" ? "warn" : "muted";
}

function setProductProvisionSummary(message = "", tone = "") {
  const node = el("productProvisionSummary");
  if (!node) {
    return;
  }
  const text = String(message || "").trim();
  node.textContent = text;
  node.className = tone === "err" ? "warn" : "muted";
}

function syncProductProvisionSelection() {
  const select = el("productProvisionSelect");
  if (!select) {
    return;
  }
  const preferred = preferredProductId();
  if (preferred && Array.from(select.options).some((option) => option.value === preferred)) {
    select.value = preferred;
    return;
  }
  if (select.options.length > 0) {
    select.value = select.options[0].value;
  }
}

function summarizeProvisioning(status, request) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "disabled") {
    return { message: "", tone: "" };
  }
  if (normalized === "failed") {
    const stage = String(request?.stage || "").trim();
    const error = String(request?.error || "provision_failed").trim();
    return {
      message: `Provisioning failed${stage ? ` (${stage})` : ""}: ${error}`,
      tone: "err",
    };
  }
  if (normalized === "ready") {
    const tenantId = String(request?.tenant_id || "").trim();
    if (tenantId) {
      return {
        message: `Provisioning complete for ${tenantId}. Refresh workspaces if launch options are missing.`,
        tone: "",
      };
    }
    return {
      message: "Provisioning complete. Refresh workspaces if launch options are missing.",
      tone: "",
    };
  }
  const stage = String(request?.stage || "").trim();
  return {
    message: `Provisioning in progress${stage ? ` (${stage})` : ""}.`,
    tone: "",
  };
}

function summarizeLaunchBlocker(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") {
    return "";
  }
  const appCatalog =
    diagnostics.app_catalog && typeof diagnostics.app_catalog === "object" ? diagnostics.app_catalog : null;
  const runtimeHealth =
    diagnostics.runtime_health && typeof diagnostics.runtime_health === "object"
      ? diagnostics.runtime_health
      : null;
  const provisioning =
    diagnostics.provisioning && typeof diagnostics.provisioning === "object" ? diagnostics.provisioning : null;

  if (provisioning) {
    const status = String(provisioning.status || "").trim().toLowerCase();
    const stage = String(provisioning.stage || "").trim();
    if (status && status !== "ready") {
      return `provisioning ${status}${stage ? ` (${stage})` : ""}`;
    }
  }
  if (runtimeHealth && runtimeHealth.ok === false) {
    const code = String(runtimeHealth.error || runtimeHealth.http_status || "runtime_unavailable").trim();
    return `runtime health unavailable (${code})`;
  }
  if (appCatalog && appCatalog.ok === false) {
    const code = String(appCatalog.error || appCatalog.http_status || "app_catalog_unavailable").trim();
    return `runtime app catalog unavailable (${code})`;
  }
  const appCount = Number(appCatalog?.app_count || 0);
  if (Number.isFinite(appCount) && appCount <= 0) {
    return "runtime returned no launchable /app entries";
  }
  return "";
}

function clearAuthReturnQueryFlag() {
  if (!authReturn) {
    return;
  }
  const next = new URL(window.location.href);
  next.searchParams.delete("auth_return");
  const relative = `${next.pathname}${next.search}${next.hash}`;
  window.history.replaceState(null, "", relative);
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

function renderAppSelect() {
  const select = el("appSelect");
  if (!select) {
    return;
  }
  const items = state.workspaceApps;
  select.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No apps available";
    select.appendChild(empty);
    select.value = "";
    state.activeAppId = "";
    return;
  }
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.app_id;
    option.textContent = item.display_name || item.app_id;
    select.appendChild(option);
  }
  const preferredId = preferredAppId();
  const selected =
    state.activeAppId && items.some((item) => item.app_id === state.activeAppId)
      ? state.activeAppId
      : preferredId && items.some((item) => item.app_id === preferredId)
        ? preferredId
      : items[0].app_id;
  state.activeAppId = selected;
  select.value = selected;
}

function updateAppSummary() {
  const summary = el("appSummary");
  if (!summary) {
    return;
  }
  const selected = state.workspaceApps.find((item) => item.app_id === state.activeAppId);
  if (!selected) {
    if (state.launchBlocker) {
      summary.textContent = `Launch blocked: ${state.launchBlocker}`;
      return;
    }
    if (state.workspaceAppsError) {
      summary.textContent = `App catalog unavailable: ${state.workspaceAppsError}`;
      return;
    }
    if (state.workspaceApps.length === 0 && state.activeWorkspaceId) {
      summary.textContent = "No launchable app is registered for this workspace.";
      return;
    }
    summary.textContent = "No app selected.";
    return;
  }
  summary.textContent = `Active app: ${selected.display_name || selected.app_id}`;
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
  el("openTenantAppBtn").disabled = !authenticated || !state.activeWorkspaceId || !state.activeAppId;
  el("provisionProductWorkspaceBtn").disabled = !authenticated;
  el("workspacePanel").hidden = !authenticated;
  el("invitePanel").hidden = !authenticated;
  el("ownerInsightsPanel").hidden = !workspaceAdminAllowed;
  el("operatorWorkspacePanel").hidden = !operatorAllowed;
  el("operatorPanel").hidden = !(operatorMode && operatorAllowed);

  if (authenticated) {
    setAuthWarning("");
    clearAuthReturnQueryFlag();
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
  state.workspaceApps = [];
  state.activeAppId = "";
  state.launchBlocker = "";
  state.provisioningStatus = "";
  state.provisioningRequest = null;
  setProvisioningSummary("");
  setProductProvisionSummary("");
  renderWorkspaceSelect();
  updateWorkspaceSummary();
  renderAppSelect();
  updateAppSummary();
  el("workspaceCount").textContent = "0";
  resetOwnerInsights();
  renderOperatorWorkspaceInventory([]);
  el("ownerInsightsPanel").hidden = true;
  el("operatorWorkspacePanel").hidden = true;
  el("operatorPanel").hidden = true;
  if (authReturn) {
    setPill("Not signed in after OAuth return", "err");
    setAuthWarning(
      "OAuth completed but no shared session cookie was available on shell.nexushub.sh. " +
        "Set FRONTDOOR_SESSION_COOKIE_DOMAIN=.nexushub.sh on frontdoor and redeploy.",
    );
  } else {
    setPill("Not signed in", "err");
    setAuthWarning("");
  }
}

function currentWorkspaceId() {
  const select = el("workspaceSelect");
  const value = String(select?.value || state.activeWorkspaceId || "").trim();
  return value || "";
}

function currentAppId() {
  const select = el("appSelect");
  const value = String(select?.value || state.activeAppId || "").trim();
  return value || "";
}

function currentAppDescriptor() {
  const appId = currentAppId();
  return state.workspaceApps.find((item) => item.app_id === appId) || null;
}

async function loadProvisioningStatus(options = {}) {
  const silent = options.silent === true;
  if (!state.session) {
    state.provisioningStatus = "";
    state.provisioningRequest = null;
    setProvisioningSummary("");
    return null;
  }
  const result = await api("/api/workspaces/provisioning/status", {
    method: "GET",
  });
  if (!result.ok) {
    state.provisioningStatus = "";
    state.provisioningRequest = null;
    if (!silent && result.status !== 404 && result.status !== 401) {
      setProvisioningSummary("Provisioning status unavailable.", "err");
    }
    return null;
  }
  state.provisioningStatus = String(result.body?.status || "").trim().toLowerCase();
  state.provisioningRequest =
    result.body?.request && typeof result.body.request === "object" ? result.body.request : null;
  const summary = summarizeProvisioning(state.provisioningStatus, state.provisioningRequest);
  const shouldShow = summary.message && (state.workspaces.length === 0 || state.provisioningStatus !== "ready");
  setProvisioningSummary(shouldShow ? summary.message : "", summary.tone);
  return {
    status: state.provisioningStatus,
    request: state.provisioningRequest,
  };
}

async function loadWorkspaceApps() {
  if (!state.session) {
    state.workspaceApps = [];
    state.workspaceAppsError = "";
    state.launchDiagnostics = null;
    state.launchBlocker = "";
    state.activeAppId = "";
    renderAppSelect();
    updateAppSummary();
    el("openTenantAppBtn").disabled = true;
    return;
  }
  const workspaceId = currentWorkspaceId();
  if (!workspaceId) {
    state.workspaceApps = [];
    state.workspaceAppsError = "";
    state.launchDiagnostics = null;
    state.launchBlocker = "";
    state.activeAppId = "";
    renderAppSelect();
    updateAppSummary();
    el("openTenantAppBtn").disabled = true;
    return;
  }
  const result = await api(`/api/runtime/apps?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
  if (!result.ok || !Array.isArray(result.body?.items)) {
    state.workspaceApps = [];
    const code = String(result.body?.error || "").trim();
    state.workspaceAppsError = code || `runtime_apps_request_failed_${result.status}`;
    const diagnostics = await loadWorkspaceLaunchDiagnostics(workspaceId);
    const blocker = summarizeLaunchBlocker(diagnostics);
    state.launchBlocker = blocker;
    state.activeAppId = "";
    renderAppSelect();
    updateAppSummary();
    el("openTenantAppBtn").disabled = true;
    if (blocker) {
      setPill(`Workspace launch blocked: ${blocker}`, "err");
    }
    return;
  }
  state.workspaceAppsError = "";
  state.launchDiagnostics = null;
  state.launchBlocker = "";
  state.workspaceApps = result.body.items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      app_id: String(item.app_id || "").trim(),
      display_name: String(item.display_name || item.app_id || "").trim(),
      entry_path: String(item.entry_path || "").trim(),
    }))
    .filter((item) => item.app_id && item.entry_path.startsWith("/app/"));
  if (state.workspaceApps.length < 1) {
    const diagnostics = await loadWorkspaceLaunchDiagnostics(workspaceId);
    const blocker = summarizeLaunchBlocker(diagnostics) || "runtime returned no launchable /app entries";
    state.launchBlocker = blocker;
    setPill(`Workspace launch blocked: ${blocker}`, "err");
  }
  renderAppSelect();
  updateAppSummary();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId || !state.activeAppId;
}

async function loadWorkspaceLaunchDiagnostics(workspaceId) {
  if (!workspaceId) {
    state.launchDiagnostics = null;
    return null;
  }
  const result = await api(`/api/workspace-launch-diagnostics?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
  if (!result.ok || !result.body || typeof result.body !== "object") {
    state.launchDiagnostics = null;
    return null;
  }
  state.launchDiagnostics = result.body;
  return result.body;
}

async function loadWorkspaces() {
  if (!state.session) {
    state.workspaces = [];
    state.activeWorkspaceId = "";
    renderWorkspaceSelect();
    updateWorkspaceSummary();
    state.workspaceApps = [];
    state.workspaceAppsError = "";
    state.launchDiagnostics = null;
    state.launchBlocker = "";
    state.activeAppId = "";
    state.provisioningStatus = "";
    state.provisioningRequest = null;
    setProvisioningSummary("");
    renderAppSelect();
    updateAppSummary();
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
    state.workspaceApps = [];
    state.workspaceAppsError = "";
    state.launchDiagnostics = null;
    state.launchBlocker = "";
    state.activeAppId = "";
    setProvisioningSummary("Workspace list unavailable.", "err");
    renderAppSelect();
    updateAppSummary();
    el("workspaceCount").textContent = "0";
    resetOwnerInsights();
    setPill("Workspace list unavailable", "err");
    return;
  }
  state.workspaces = result.body.items;
  const requestedProductId = preferredProductId();
  const productMatchedWorkspaces = requestedProductId
    ? state.workspaces.filter(
        (item) => sanitizeQueryToken(item?.product_id || "") === requestedProductId,
      )
    : [];
  const activeFromSession = String(state.session.active_workspace_id || "").trim();
  if (
    requestedProductId &&
    productMatchedWorkspaces.length > 0 &&
    activeFromSession &&
    productMatchedWorkspaces.some((item) => item.workspace_id === activeFromSession)
  ) {
    state.activeWorkspaceId = activeFromSession;
  } else if (requestedProductId && productMatchedWorkspaces.length > 0) {
    const defaultProductWorkspace = productMatchedWorkspaces.find((item) => item.is_default);
    state.activeWorkspaceId =
      defaultProductWorkspace?.workspace_id || productMatchedWorkspaces[0]?.workspace_id || "";
  } else if (activeFromSession && state.workspaces.some((item) => item.workspace_id === activeFromSession)) {
    state.activeWorkspaceId = activeFromSession;
  } else {
    const defaultWorkspace = state.workspaces.find((item) => item.is_default);
    state.activeWorkspaceId = defaultWorkspace?.workspace_id || state.workspaces[0]?.workspace_id || "";
  }
  renderWorkspaceSelect();
  updateWorkspaceSummary();
  el("workspaceCount").textContent = String(state.workspaces.length);
  if (state.workspaces.length > 0) {
    if (requestedProductId && productMatchedWorkspaces.length === 0) {
      setProvisioningSummary(
        `No ${requestedProductId} workspace found for this account. Use \"Provision product workspace\" below.`,
        "err",
      );
    } else {
      setProvisioningSummary("");
    }
  } else {
    await loadProvisioningStatus({ silent: true });
  }
  if (requestedProductId && productMatchedWorkspaces.length === 0) {
    setProductProvisionSummary(
      `Provision a ${requestedProductId} workspace to launch the ${requestedProductId} app.`,
      "err",
    );
  } else {
    setProductProvisionSummary("");
  }
  await loadWorkspaceApps();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId || !state.activeAppId;
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
    await loadProvisioningStatus({ silent: true });
    await loadWorkspaces();
    await loadOperatorInventory();
  } else {
    updateUiFromSession(null);
  }
}

function beginProductOidcRedirect(productId) {
  const normalizedProduct = sanitizeQueryToken(productId);
  const returnToUrl = new URL(window.location.href || "/", window.location.origin);
  returnToUrl.searchParams.set("auth_return", "1");
  if (normalizedProduct) {
    returnToUrl.searchParams.set("product", normalizedProduct);
    returnToUrl.searchParams.set("flavor", normalizedProduct);
  }

  const query = new URLSearchParams();
  query.set("provider", "google");
  query.set("return_to", returnToUrl.toString());
  if (normalizedProduct) {
    query.set("product", normalizedProduct);
    query.set("flavor", normalizedProduct);
  } else if (requestedFlavor) {
    query.set("flavor", requestedFlavor);
  }
  window.location.href = `/api/oidc-start?${query.toString()}`;
}

function startProductProvisioning() {
  if (!state.session) {
    setPill("Sign in first", "err");
    return;
  }
  const selectedProduct = sanitizeQueryToken(el("productProvisionSelect")?.value || "");
  if (!selectedProduct) {
    setPill("Select a product first", "err");
    setProductProvisionSummary("Select GlowBot or Spike to continue.", "err");
    return;
  }
  state.productId = selectedProduct;
  state.flavor = resolveFlavorConfig(selectedProduct);
  applyFlavorCopy();
  setPill(`Provisioning ${selectedProduct} workspace...`);
  setProductProvisionSummary(`Redirecting to Google to provision/select ${selectedProduct} workspace.`);
  beginProductOidcRedirect(selectedProduct);
}

function startGoogle() {
  const productId =
    sanitizeQueryToken(state.productId) || (state.flavor?.key === "default" ? "" : state.flavor?.key);
  beginProductOidcRedirect(productId);
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
    await loadProvisioningStatus({ silent: true });
    const summary = String(el("provisioningSummary")?.textContent || "").trim();
    if (summary) {
      setPill(`Workspace not ready: ${summary}`, "err");
    } else {
      setPill("Select a workspace first", "err");
    }
    return;
  }
  const app = currentAppDescriptor();
  if (!app) {
    await loadWorkspaceApps();
    const refreshed = currentAppDescriptor();
    if (!refreshed) {
      const diagnostics = await loadWorkspaceLaunchDiagnostics(workspaceId);
      const blocker = summarizeLaunchBlocker(diagnostics);
      if (blocker) {
        setPill(`Workspace launch blocked: ${blocker}`, "err");
        return;
      }
      if (state.workspaceAppsError) {
        setPill(`Workspace app discovery failed (${state.workspaceAppsError})`, "err");
      } else {
        setPill("No launchable app is registered for this workspace.", "err");
      }
      return;
    }
    state.activeAppId = refreshed.app_id;
  }
  const activeApp = currentAppDescriptor();
  if (!activeApp) {
    const diagnostics = await loadWorkspaceLaunchDiagnostics(workspaceId);
    const blocker = summarizeLaunchBlocker(diagnostics);
    if (blocker) {
      setPill(`Workspace launch blocked: ${blocker}`, "err");
      return;
    }
    if (state.workspaceAppsError) {
      setPill(`Workspace app discovery failed (${state.workspaceAppsError})`, "err");
    } else {
      setPill("No launchable app is registered for this workspace.", "err");
    }
    return;
  }
  const openButton = el("openTenantAppBtn");
  openButton.disabled = true;
  setPill("Preparing workspace launch...");
  let launched = false;
  try {
    const selected = await api("/api/workspaces-select", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
      }),
    });
    if (!selected.ok) {
      const code = String(selected.body?.error || `workspace_select_failed_${selected.status}`);
      setPill(`Workspace selection failed (${code})`, "err");
      return;
    }
    const originResp = await api("/api/frontdoor-origin", {
      method: "GET",
    });
    if (!originResp.ok || !originResp.body?.frontdoor_origin) {
      const code = String(originResp.body?.error || `frontdoor_origin_unavailable_${originResp.status}`);
      setPill(`Workspace launch unavailable (${code})`, "err");
      return;
    }
    const frontdoorOrigin = String(originResp.body.frontdoor_origin || "").replace(/\/+$/, "");
    state.frontdoorOrigin = frontdoorOrigin;
    const launch = new URL(activeApp.entry_path || "/app/control/chat", frontdoorOrigin);
    launch.searchParams.set("workspace_id", workspaceId);
    setPill(
      `Opening ${(activeApp.display_name || activeApp.app_id || "workspace app").trim()}...`,
      "ok",
    );
    launched = true;
    window.location.href = launch.toString();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setPill(`Workspace launch failed (${detail})`, "err");
  } finally {
    if (!launched) {
      openButton.disabled = !state.session || !state.activeWorkspaceId || !state.activeAppId;
    }
  }
}

async function handleWorkspacePickerChange() {
  state.activeWorkspaceId = currentWorkspaceId();
  updateWorkspaceSummary();
  await loadWorkspaceApps();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId || !state.activeAppId;
  loadWorkspaceInsights().catch(() => {
    resetOwnerInsights();
  });
}

function handleAppPickerChange() {
  state.activeAppId = currentAppId();
  updateAppSummary();
  el("openTenantAppBtn").disabled = !state.session || !state.activeWorkspaceId || !state.activeAppId;
}

applyFlavorCopy();

el("googleBtn").addEventListener("click", startGoogle);
el("logoutBtn").addEventListener("click", logout);
el("openTenantAppBtn").addEventListener("click", openTenantControlUi);
el("loginBtn").addEventListener("click", loginPassword);
el("workspaceSelect").addEventListener("change", () => {
  void handleWorkspacePickerChange();
});
el("appSelect").addEventListener("change", handleAppPickerChange);
el("refreshWorkspacesBtn").addEventListener("click", loadWorkspaces);
el("selectWorkspaceBtn").addEventListener("click", selectWorkspace);
el("provisionProductWorkspaceBtn").addEventListener("click", startProductProvisioning);
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
