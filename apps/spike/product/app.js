const DEFAULT_FRONTDOOR_ORIGIN = "https://frontdoor.nexushub.sh";
const urlState = new URL(window.location.href);
const FRONTDOOR_ORIGIN = resolveFrontdoorOrigin(urlState);
const hintedWorkspaceId = (urlState.searchParams.get("workspace_id") || "").trim();

function qs(id) {
  return document.getElementById(id);
}

function resolveFrontdoorOrigin(url) {
  const override = (url.searchParams.get("frontdoor_origin") || "").trim();
  if (!override) {
    return DEFAULT_FRONTDOOR_ORIGIN;
  }
  try {
    const parsed = new URL(override);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_FRONTDOOR_ORIGIN;
    }
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_FRONTDOOR_ORIGIN;
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function frontdoorStartUrl() {
  const url = new URL("/api/auth/oidc/start", FRONTDOOR_ORIGIN);
  url.searchParams.set("provider", "google");
  url.searchParams.set("return_to", "/");
  url.searchParams.set("product", "spike");
  return url.toString();
}

function frontdoorBillingUrl(planId) {
  const url = new URL("/", FRONTDOOR_ORIGIN);
  url.searchParams.set("section", "billing");
  url.searchParams.set("product", "spike");
  if (planId) {
    url.searchParams.set("plan", planId);
  }
  if (hintedWorkspaceId) {
    url.searchParams.set("workspace_id", hintedWorkspaceId);
  }
  return url.toString();
}

function goToSignIn() {
  window.location.href = frontdoorStartUrl();
}

function openBilling(planId) {
  window.location.href = frontdoorBillingUrl(planId);
}

function setStatusLine(kind, message) {
  const el = qs("statusLine");
  if (!el) return;
  el.classList.remove("ok", "err");
  if (kind) {
    el.classList.add(kind);
  }
  el.textContent = message;
}

function formatLimit(value) {
  const text = asText(String(value ?? ""));
  if (!text) return "n/a";
  if (text === "-1") return "unlimited";
  return text;
}

function applyCurrentPlanState(planId) {
  const normalized = asText(planId).toLowerCase();
  const ctas = [
    { id: "freePlanCta", matches: normalized === "spike-free", label: "Current plan" },
    { id: "proPlanCta", matches: normalized === "spike-pro", label: "Current plan" },
    { id: "teamPlanCta", matches: normalized === "spike-team", label: "Current plan" },
  ];
  for (const cta of ctas) {
    const button = qs(cta.id);
    if (!button || !cta.matches) continue;
    button.disabled = true;
    button.classList.add("btn-disabled");
    button.textContent = cta.label;
  }
}

function renderPlanSummary(planBody, entitlementsBody) {
  const summaryEl = qs("planSummary");
  if (!summaryEl) return;
  const plan = asObject(planBody) || {};
  const entitlementsPayload = asObject(entitlementsBody) || {};
  const entitlements = asObject(entitlementsPayload.entitlements) || {};
  const usage = asObject(entitlementsPayload.usage) || {};

  const planDisplay = asText(plan.plan_display_name) || asText(plan.plan_id) || "Unknown";
  const status = asText(plan.billing_status) || "unknown";
  const hydration = `${formatLimit(usage["hydration.monthly_count"])} / ${formatLimit(entitlements["hydration.max_monthly"])}`;
  const asks = `${formatLimit(usage["ask.monthly_count"])} / ${formatLimit(entitlements["ask.max_monthly"])}`;
  const repos = `${formatLimit(usage["repos.count"])} / ${formatLimit(entitlements["repos.max_count"])}`;

  summaryEl.hidden = false;
  summaryEl.textContent = `Workspace ${hintedWorkspaceId} · Plan ${planDisplay} (${status}) · Repos ${repos} · Hydrations ${hydration} · Asks ${asks}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body: asObject(body) };
}

async function loadBillingSnapshot() {
  if (!hintedWorkspaceId) {
    return;
  }
  setStatusLine("ok", `Checking billing for workspace ${hintedWorkspaceId}…`);
  const encodedWorkspace = encodeURIComponent(hintedWorkspaceId);
  try {
    const [planResult, entitlementsResult] = await Promise.all([
      fetchJson(`${FRONTDOOR_ORIGIN}/api/billing/${encodedWorkspace}/plan`),
      fetchJson(`${FRONTDOOR_ORIGIN}/api/billing/${encodedWorkspace}/entitlements`),
    ]);
    if (!planResult.ok || !planResult.body?.ok) {
      if (planResult.status === 401 || planResult.status === 403) {
        setStatusLine("err", `Sign in to view billing for workspace ${hintedWorkspaceId}.`);
        return;
      }
      setStatusLine("err", "Unable to load billing status right now.");
      return;
    }
    const planBody = asObject(planResult.body) || {};
    const planDisplay = asText(planBody.plan_display_name) || asText(planBody.plan_id) || "current plan";
    setStatusLine("ok", `Spike billing linked. Workspace ${hintedWorkspaceId} is on ${planDisplay}.`);
    applyCurrentPlanState(asText(planBody.plan_id));
    renderPlanSummary(planBody, entitlementsResult.body);
  } catch {
    setStatusLine("err", "Unable to reach Frontdoor billing right now.");
  }
}

function wireButtons() {
  const heroCta = qs("heroCta");
  const topCta = qs("topCta");
  const bottomCta = qs("bottomCta");
  const dashLink = qs("dashLink");
  const freePlanCta = qs("freePlanCta");
  const proPlanCta = qs("proPlanCta");
  const teamPlanCta = qs("teamPlanCta");
  const pricingDashCta = qs("pricingDashCta");

  if (heroCta) heroCta.addEventListener("click", goToSignIn);
  if (topCta) topCta.addEventListener("click", goToSignIn);
  if (bottomCta) bottomCta.addEventListener("click", goToSignIn);
  if (freePlanCta) freePlanCta.addEventListener("click", goToSignIn);
  if (proPlanCta) proPlanCta.addEventListener("click", () => openBilling("spike-pro"));
  if (teamPlanCta) teamPlanCta.addEventListener("click", () => openBilling("spike-team"));
  if (dashLink) dashLink.href = FRONTDOOR_ORIGIN + "/";
  if (pricingDashCta) pricingDashCta.href = frontdoorBillingUrl();
}

function renderStatus() {
  if (hintedWorkspaceId) {
    setStatusLine("ok", `Workspace hint detected: ${hintedWorkspaceId}`);
    return;
  }
  setStatusLine("ok", "Spike billing and auth routed via " + FRONTDOOR_ORIGIN.replace("https://", ""));
}

wireButtons();
renderStatus();
void loadBillingSnapshot();
