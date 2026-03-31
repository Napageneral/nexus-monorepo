import { createWebsiteInputCore } from "./sdk/core/index.mjs";

const STORAGE_KEY = "website-input-demo-config";

function qs(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing element: ${id}`);
  }
  return element;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function currentQueryConfig() {
  const params = new URLSearchParams(window.location.search);
  return {
    collectorBaseUrl: asText(params.get("collector")) || "",
    installationId: asText(params.get("installation")) || "",
    senderToken: asText(params.get("token")) || "",
  };
}

function loadStoredConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      collectorBaseUrl: asText(parsed.collectorBaseUrl),
      installationId: asText(parsed.installationId),
      senderToken: asText(parsed.senderToken),
    };
  } catch {
    return null;
  }
}

function saveConfig(config) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function readFormConfig() {
  return {
    collectorBaseUrl: asText(qs("collectorBaseUrl").value).replace(/\/$/, ""),
    installationId: asText(qs("installationId").value),
    senderToken: asText(qs("senderToken").value),
  };
}

function writeFormConfig(config) {
  qs("collectorBaseUrl").value = config.collectorBaseUrl || "";
  qs("installationId").value = config.installationId || "";
  qs("senderToken").value = config.senderToken || "";
}

function logResult(value) {
  const area = qs("log");
  area.value = `${JSON.stringify(value, null, 2)}\n`;
}

function requireConfig() {
  const config = readFormConfig();
  if (!config.collectorBaseUrl || !config.installationId || !config.senderToken) {
    throw new Error("collector base URL, installation id, and sender token are all required");
  }
  return config;
}

function buildTracker(config) {
  return createWebsiteInputCore({
    website_installation_id: config.installationId,
    consent_state: "granted",
    storage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    document,
    navigator,
    window,
  });
}

async function sendEvent(event) {
  const config = requireConfig();
  const response = await fetch(`${config.collectorBaseUrl}/runtime/operations/website-input.collect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.senderToken}`,
    },
    body: JSON.stringify({
      event,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: "response_was_not_json" };
  }

  logResult({
    request: event,
    response: {
      status: response.status,
      ok: response.ok,
      payload,
    },
  });
}

function bindUi() {
  const merged = {
    collectorBaseUrl: "http://127.0.0.1:18789",
    installationId: "",
    senderToken: "",
    ...(loadStoredConfig() || {}),
    ...currentQueryConfig(),
  };
  writeFormConfig(merged);

  qs("saveConfig").addEventListener("click", () => {
    const config = readFormConfig();
    saveConfig(config);
    logResult({ ok: true, saved: config });
  });

  qs("clearConfig").addEventListener("click", () => {
    clearConfig();
    writeFormConfig({
      collectorBaseUrl: "http://127.0.0.1:18789",
      installationId: "",
      senderToken: "",
    });
    logResult({ ok: true, cleared: true });
  });

  qs("emitPageView").addEventListener("click", async () => {
    try {
      const tracker = buildTracker(requireConfig());
      await sendEvent(
        tracker.pageView({
          surface_id: "demo_page",
          surface_label: "Demo page",
          surface_category: "demo",
          target_type: "page",
          target_id: "website-input-demo",
          target_label: "Website Input Demo",
        }),
      );
    } catch (error) {
      logResult({ ok: false, error: String(error) });
    }
  });

  qs("heroCta").addEventListener("click", async () => {
    try {
      const tracker = buildTracker(requireConfig());
      await sendEvent(
        tracker.ctaClick({
          surface_id: "hero_primary",
          surface_label: "Hero CTA",
          surface_category: "hero",
          target_type: "service",
          target_id: "consult",
          target_label: "Book consult",
        }),
      );
    } catch (error) {
      logResult({ ok: false, error: String(error) });
    }
  });

  qs("pricingCta").addEventListener("click", async () => {
    try {
      const tracker = buildTracker(requireConfig());
      await sendEvent(
        tracker.ctaClick({
          surface_id: "pricing_primary",
          surface_label: "Pricing CTA",
          surface_category: "pricing",
          target_type: "service",
          target_id: "deposit",
          target_label: "Start deposit",
        }),
      );
    } catch (error) {
      logResult({ ok: false, error: String(error) });
    }
  });

  qs("handoff").addEventListener("click", async () => {
    try {
      const tracker = buildTracker(requireConfig());
      await sendEvent(
        tracker.handoffStart({
          page_url: `${window.location.origin}/handoff`,
          page_path: "/handoff",
          host: window.location.host,
          bridge: {
            bridge_surface: "form",
            handoff_id: `handoff_${Date.now()}`,
            form_id: "demo_form",
            lead_external_id: `lead_${Date.now()}`,
          },
        }),
      );
    } catch (error) {
      logResult({ ok: false, error: String(error) });
    }
  });
}

bindUi();
