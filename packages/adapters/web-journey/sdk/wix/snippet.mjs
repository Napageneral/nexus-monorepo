function requireText(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function deriveCollectorBaseUrl(input = {}) {
  const explicitBaseUrl = optionalText(input.collector_base_url) ?? optionalText(input.runtime_base_url);
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }
  const collectEndpoint = parseUrl(input.collect_endpoint);
  if (!collectEndpoint) {
    return null;
  }
  const pathName = optionalText(collectEndpoint.pathname) ?? "";
  const normalizedPath = pathName.replace(/\/runtime\/operations\/web-signals\.web-journey\.collect$/i, "");
  return `${collectEndpoint.origin}${normalizedPath}`;
}

function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLabel(value) {
  const text = optionalText(value);
  return text ? text.replace(/\s+/g, " ").trim().toLowerCase() : null;
}

function parseUrl(value, fallbackOrigin = null) {
  const text = optionalText(value);
  if (!text) {
    return null;
  }
  try {
    if (fallbackOrigin) {
      return new URL(text, fallbackOrigin);
    }
    return new URL(text);
  } catch (_error) {
    return null;
  }
}

function getSupportedLocales(profile = {}) {
  return Array.isArray(profile.supported_locales)
    ? profile.supported_locales.filter((value) => typeof value === "string" && value.trim())
    : [];
}

function splitLocalizedPath(pathname, supportedLocales = []) {
  const rawPath = optionalText(pathname) ?? "/";
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const segments = normalizedPath.split("/").filter(Boolean);
  const firstSegment = segments[0] ?? null;
  if (firstSegment && supportedLocales.includes(firstSegment)) {
    const remainder = segments.slice(1);
    return {
      raw_path: normalizedPath,
      canonical_path: remainder.length > 0 ? `/${remainder.join("/")}` : "/",
      locale_code: firstSegment,
    };
  }
  return {
    raw_path: normalizedPath,
    canonical_path: normalizedPath,
    locale_code: null,
  };
}

export function matchWixRouteFamily(profile = {}, pathname = "/") {
  const localized = splitLocalizedPath(pathname, getSupportedLocales(profile));
  const routeFamilies = Array.isArray(profile.route_families) ? profile.route_families : [];
  for (const routeFamily of routeFamilies) {
    const exactPaths = Array.isArray(routeFamily.exact_paths) ? routeFamily.exact_paths : [];
    if (exactPaths.includes(localized.canonical_path)) {
      return {
        page_family: routeFamily.page_family,
        page_event_name: routeFamily.page_event_name ?? "page_view",
        surface_category: routeFamily.surface_category ?? "page",
        raw_path: localized.raw_path,
        canonical_path: localized.canonical_path,
        locale_code: localized.locale_code,
      };
    }
    const prefixes = Array.isArray(routeFamily.path_prefixes) ? routeFamily.path_prefixes : [];
    if (prefixes.some((prefix) => localized.canonical_path.startsWith(prefix))) {
      return {
        page_family: routeFamily.page_family,
        page_event_name: routeFamily.page_event_name ?? "page_view",
        surface_category: routeFamily.surface_category ?? "page",
        raw_path: localized.raw_path,
        canonical_path: localized.canonical_path,
        locale_code: localized.locale_code,
      };
    }
  }
  return {
    page_family: "generic",
    page_event_name: "page_view",
    surface_category: "page",
    raw_path: localized.raw_path,
    canonical_path: localized.canonical_path,
    locale_code: localized.locale_code,
  };
}

function hasExactLabel(candidates = [], label = null) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    return false;
  }
  return candidates.some((candidate) => normalizeLabel(candidate) === normalizedLabel);
}

function hasLabelContaining(candidates = [], label = null) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    return false;
  }
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeLabel(candidate);
    return normalizedCandidate ? normalizedLabel.includes(normalizedCandidate) : false;
  });
}

function extractBookingCenterId(targetPath = null) {
  const text = optionalText(targetPath);
  if (!text) {
    return null;
  }
  const match = text.match(/\/webstoreNew\/services\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function buildBridge(bridge = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(bridge)) {
    const text = optionalText(value);
    if (text) {
      normalized[key] = text;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeClassificationShape({
  event_name,
  surface_category,
  surface_id,
  surface_label,
  target_type,
  target_id,
  target_label,
  metadata,
  bridge,
}) {
  return {
    event_name,
    surface_category,
    surface_id: optionalText(surface_id),
    surface_label: optionalText(surface_label),
    target_type: optionalText(target_type),
    target_id: optionalText(target_id),
    target_label: optionalText(target_label),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    bridge,
  };
}

export function classifyWixPage(input = {}) {
  const profile = input.profile ?? {};
  const pageUrl = parseUrl(input.page_url, profile.website_origin ?? null);
  const pathName = pageUrl?.pathname ?? optionalText(input.page_path) ?? "/";
  const route = matchWixRouteFamily(profile, pathName);
  const pageTitle = optionalText(input.page_title) ?? null;
  return normalizeClassificationShape({
    event_name: route.page_event_name,
    surface_category: route.surface_category,
    surface_id: `${route.page_family}:${route.canonical_path}`,
    surface_label: pageTitle,
    target_type: "page",
    target_id: pageUrl?.href ?? pathName,
    target_label: pageTitle,
    metadata: {
      page_family: route.page_family,
      page_locale: route.locale_code,
      page_canonical_path: route.canonical_path,
      target_family: route.page_family,
      target_locale: route.locale_code,
      target_canonical_path: route.canonical_path,
      target_host: pageUrl?.host ?? null,
      target_path: pageUrl?.pathname ?? pathName,
      control_origin: "page",
    },
  });
}

function inferControlOriginTag(control_origin, tag_name) {
  return optionalText(control_origin) ?? optionalText(tag_name) ?? "click";
}

export function classifyWixClick(input = {}) {
  const profile = input.profile ?? {};
  const pageUrl = parseUrl(input.page_url, profile.website_origin ?? null);
  const pageRoute = matchWixRouteFamily(profile, pageUrl?.pathname ?? "/");
  const targetUrl = parseUrl(input.target_url, pageUrl?.href ?? profile.website_origin ?? null);
  const targetRoute = matchWixRouteFamily(profile, targetUrl?.pathname ?? "/");
  const label = optionalText(input.label) ?? optionalText(input.target_label) ?? optionalText(input.target_url) ?? "click";
  const bookingHosts = Array.isArray(profile.booking_targets?.hosts) ? profile.booking_targets.hosts : [];
  const bookingPathPrefixes = Array.isArray(profile.booking_targets?.path_prefixes)
    ? profile.booking_targets.path_prefixes
    : [];
  const bookingControlLabels = Array.isArray(profile.booking_targets?.control_labels)
    ? profile.booking_targets.control_labels
    : [];
  const controlLabels = profile.control_labels ?? {};
  const controlOrigin = inferControlOriginTag(input.control_origin, input.tag_name);
  const pageFamily = pageRoute.page_family;
  const targetFamily = targetRoute.page_family;
  const targetHost = optionalText(targetUrl?.host);
  const targetPath = optionalText(targetUrl?.pathname);
  const bookingPathMatch = bookingPathPrefixes.some((prefix) => targetPath?.startsWith(prefix));
  const bookingHostMatch = bookingHosts.includes(targetHost);
  const bookingLabelMatch =
    hasExactLabel(bookingControlLabels, label) || hasLabelContaining(bookingControlLabels, label);
  const bookingTargetMatch =
    bookingHostMatch || bookingPathMatch || targetFamily === "booking" || bookingLabelMatch;
  if (bookingTargetMatch) {
    return normalizeClassificationShape({
      event_name: "booking_start",
      surface_category: "booking",
      surface_id: `booking:${targetRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? targetPath ?? label,
      target_label: label,
      bridge: buildBridge({ bridge_surface: "booking" }),
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: "booking",
        target_locale: targetRoute.locale_code,
        target_canonical_path: bookingPathMatch ? targetPath : targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
        provider_hint: bookingHostMatch ? "zenoti" : null,
        booking_center_id: extractBookingCenterId(targetPath),
      },
    });
  }

  if (
    hasExactLabel(controlLabels.cart_add, label) &&
    (pageFamily === "product" || pageFamily === "storefront")
  ) {
    return normalizeClassificationShape({
      event_name: "cart_add",
      surface_category: "commerce",
      surface_id: `cart_add:${pageRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? label,
      target_label: label,
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: targetFamily,
        target_locale: targetRoute.locale_code,
        target_canonical_path: targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
      },
    });
  }

  if (
    hasExactLabel(controlLabels.checkout_start, label) &&
    ["storefront", "product", "gift_card"].includes(pageFamily)
  ) {
    return normalizeClassificationShape({
      event_name: "checkout_start",
      surface_category: "commerce",
      surface_id: `checkout:${pageRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? label,
      target_label: label,
      bridge: buildBridge({ bridge_surface: "checkout" }),
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: targetFamily,
        target_locale: targetRoute.locale_code,
        target_canonical_path: targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
      },
    });
  }

  if (
    hasExactLabel(controlLabels.gift_card_buy_now, label) &&
    (pageFamily === "gift_card" || targetFamily === "gift_card")
  ) {
    return normalizeClassificationShape({
      event_name: "checkout_start",
      surface_category: "gift_card",
      surface_id: `gift_card:${pageRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? label,
      target_label: label,
      bridge: buildBridge({ bridge_surface: "checkout" }),
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: targetFamily === "generic" ? "gift_card" : targetFamily,
        target_locale: targetRoute.locale_code,
        target_canonical_path: targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
      },
    });
  }

  if (targetFamily === "membership") {
    return normalizeClassificationShape({
      event_name: "cta_click",
      surface_category: "membership",
      surface_id: `membership:${targetRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? label,
      target_label: label,
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: "membership",
        target_locale: targetRoute.locale_code,
        target_canonical_path: targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
      },
    });
  }

  if (targetFamily === "loyalty") {
    return normalizeClassificationShape({
      event_name: "cta_click",
      surface_category: "loyalty",
      surface_id: `loyalty:${targetRoute.canonical_path}`,
      surface_label: label,
      target_type: optionalText(input.tag_name) ?? "click",
      target_id: targetUrl?.href ?? label,
      target_label: label,
      metadata: {
        page_family: pageFamily,
        page_locale: pageRoute.locale_code,
        page_canonical_path: pageRoute.canonical_path,
        target_family: "loyalty",
        target_locale: targetRoute.locale_code,
        target_canonical_path: targetRoute.canonical_path,
        target_host: targetHost,
        target_path: targetPath,
        control_origin: controlOrigin,
        control_label: label,
      },
    });
  }

  const fallbackFamily = targetFamily === "generic" ? pageFamily : targetFamily;
  return normalizeClassificationShape({
    event_name: "cta_click",
    surface_category: fallbackFamily === "generic" ? "click" : fallbackFamily,
    surface_id: `${fallbackFamily}:${targetRoute.canonical_path}`,
    surface_label: label,
    target_type: optionalText(input.tag_name) ?? "click",
    target_id: targetUrl?.href ?? label,
    target_label: label,
    metadata: {
      page_family: pageFamily,
      page_locale: pageRoute.locale_code,
      page_canonical_path: pageRoute.canonical_path,
      target_family: fallbackFamily,
      target_locale: targetRoute.locale_code,
      target_canonical_path: targetRoute.canonical_path,
      target_host: targetHost,
      target_path: targetPath,
      control_origin: controlOrigin,
      control_label: label,
    },
  });
}

export function classifyWixForm(input = {}) {
  const profile = input.profile ?? {};
  const pageUrl = parseUrl(input.page_url, profile.website_origin ?? null);
  const pageRoute = matchWixRouteFamily(profile, pageUrl?.pathname ?? "/");
  const formRules = profile.form_rules ?? {};
  const trackedPageFamilies = Array.isArray(formRules.tracked_page_families)
    ? formRules.tracked_page_families
    : [];
  if (!trackedPageFamilies.includes(pageRoute.page_family)) {
    return null;
  }

  const formRole = normalizeLabel(input.form_role);
  if (Array.isArray(formRules.exclude_roles) && formRules.exclude_roles.includes(formRole)) {
    return null;
  }

  const formActionUrl = parseUrl(input.form_action, pageUrl?.href ?? profile.website_origin ?? null);
  const actionPath = optionalText(formActionUrl?.pathname);
  if (
    Array.isArray(formRules.exclude_actions) &&
    formRules.exclude_actions.includes(actionPath)
  ) {
    return null;
  }

  const testId = normalizeLabel(input.form_testid);
  if (Array.isArray(formRules.exclude_testids) && formRules.exclude_testids.includes(testId)) {
    return null;
  }

  const className = optionalText(input.form_class_name) ?? "";
  const includeClassTokens = Array.isArray(formRules.include_class_tokens)
    ? formRules.include_class_tokens
    : [];
  const classMatched =
    includeClassTokens.length === 0 ||
    includeClassTokens.some((token) => className.toLowerCase().includes(token.toLowerCase()));
  if (!classMatched && pageRoute.page_family !== "contact") {
    return null;
  }

  const eventName = input.event_type === "submit" ? "form_submit" : "form_start";
  const formId = optionalText(input.form_id) ?? actionPath ?? `${pageRoute.page_family}-form`;
  const submitLabel = optionalText(input.submit_label);
  return normalizeClassificationShape({
    event_name: eventName,
    surface_category: "form",
    surface_id: `form:${formId}`,
    surface_label: submitLabel ?? formRules.form_family ?? "lead form",
    target_type: "form",
    target_id: formId,
    target_label: submitLabel ?? formRules.form_family ?? "lead form",
    bridge: buildBridge({
      bridge_surface: "form",
      form_id: formId,
    }),
    metadata: {
      page_family: pageRoute.page_family,
      page_locale: pageRoute.locale_code,
      page_canonical_path: pageRoute.canonical_path,
      target_family: "form",
      target_locale: pageRoute.locale_code,
      target_canonical_path: pageRoute.canonical_path,
      target_host: pageUrl?.host ?? null,
      target_path: actionPath ?? pageUrl?.pathname ?? null,
      control_origin: "form",
      control_label: submitLabel,
      form_family: formRules.form_family ?? "lead_capture",
      form_action_path: actionPath,
    },
  });
}

export function buildWixOutcomeProofChecklist(profile = {}) {
  const proofUrls = Array.isArray(profile.proof_urls) ? profile.proof_urls : [];
  return [
    `crawl published sitemap for ${profile.website_origin ?? "the Wix site"}`,
    "verify homepage and services booking handoff surfaces",
    "verify /bookonline route-change and localized booking path coverage",
    "verify storefront and representative product page product_view / cart_add / checkout_start",
    "verify gift-card page_view and Buy Now classification",
    "verify memberships and loyalty route classification",
    "verify homepage or contact-page form_start and form_submit",
    "verify specials, referral, and event routes still fall back truthfully",
    ...proofUrls.map((url) => `representative proof URL: ${url}`),
  ];
}

function buildRuntimeFunctionSource(functions) {
  return functions.map((fn) => fn.toString()).join("\n\n");
}

export function buildWixCustomCodeSnippet(options = {}) {
  const collectorBaseUrl = requireText(
    deriveCollectorBaseUrl(options),
    "collector_base_url",
  );
  const webInstallationId = requireText(options.web_installation_id, "web_installation_id");
  const senderToken = requireText(options.sender_token, "sender_token");
  const profile = options.profile && typeof options.profile === "object" ? options.profile : {};
  const exportNamespace = optionalText(options.export_namespace) ?? "__nexusWixWebJourney";
  const initialConsentState = optionalText(options.initial_consent_state) ?? "unknown";
  const storagePrefix =
    optionalText(options.storage_prefix) ?? `${profile.profile_id ?? "wix"}.web_journey`;
  const runtimeFunctions = buildRuntimeFunctionSource([
    optionalText,
    normalizeLabel,
    parseUrl,
    getSupportedLocales,
    splitLocalizedPath,
    matchWixRouteFamily,
    hasExactLabel,
    hasLabelContaining,
    extractBookingCenterId,
    buildBridge,
    normalizeClassificationShape,
    classifyWixPage,
    classifyWixClick,
    classifyWixForm,
  ]);
  const source = `(function() {
  var CONFIG = ${JSON.stringify({
    collector_base_url: collectorBaseUrl,
    web_installation_id: webInstallationId,
    sender_token: senderToken,
    export_namespace: exportNamespace,
    initial_consent_state: initialConsentState,
    storage_prefix: storagePrefix,
  }, null, 2)};
  var PROFILE = ${JSON.stringify(profile, null, 2)};
  var BOOT_KEY = CONFIG.export_namespace + ":booted:" + CONFIG.web_installation_id;
  if (window[BOOT_KEY]) return;
  window[BOOT_KEY] = true;
  var CONSENT_STATE = CONFIG.initial_consent_state === "granted" ? "granted" : CONFIG.initial_consent_state === "denied" ? "denied" : "unknown";
  var BROWSER_STORAGE_KEY = CONFIG.storage_prefix + ".browser_id";
  var SESSION_STORAGE_KEY = CONFIG.storage_prefix + ".session_id";
  var LAST_URL_KEY = CONFIG.storage_prefix + ".last_url";
  var STARTED_FORM_ATTRIBUTE = "data-nexus-form-started";

${runtimeFunctions}

  function randomId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return (prefix || "wj") + "_" + window.crypto.randomUUID();
    }
    return (prefix || "wj") + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function getBrowserId() {
    if (CONSENT_STATE !== "granted") return null;
    try {
      var existing = optionalText(window.localStorage.getItem(BROWSER_STORAGE_KEY));
      if (existing) return existing;
      var created = randomId("browser");
      window.localStorage.setItem(BROWSER_STORAGE_KEY, created);
      return created;
    } catch (_error) {
      return null;
    }
  }

  function getSessionId() {
    try {
      var existing = optionalText(window.sessionStorage.getItem(SESSION_STORAGE_KEY));
      if (existing) return existing;
      var created = randomId("session");
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
      return created;
    } catch (_error) {
      return randomId("session");
    }
  }

  function getAttribution() {
    var params = new URLSearchParams(window.location.search || "");
    return {
      utm_source: optionalText(params.get("utm_source")),
      utm_medium: optionalText(params.get("utm_medium")),
      utm_campaign: optionalText(params.get("utm_campaign")),
      utm_content: optionalText(params.get("utm_content")),
      utm_term: optionalText(params.get("utm_term")),
      fbclid: optionalText(params.get("fbclid")),
      gclid: optionalText(params.get("gclid")),
      gbraid: optionalText(params.get("gbraid")),
      wbraid: optionalText(params.get("wbraid")),
      ttclid: optionalText(params.get("ttclid")),
      msclkid: optionalText(params.get("msclkid"))
    };
  }

  function currentUrlKey() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function mergeMetadata(primary, secondary) {
    return Object.assign({}, primary || {}, secondary || {});
  }

  function emitClassification(classification, extra) {
    if (!classification || !classification.event_name) return Promise.resolve();
    var href = window.location.href;
    var attribution = getAttribution();
    var metadata = mergeMetadata(classification.metadata, extra && extra.metadata);
    var payload = {
      web_installation_id: CONFIG.web_installation_id,
      event: {
        event_id: randomId("evt"),
        captured_at: Date.now(),
        event_name: classification.event_name,
        consent_state: CONSENT_STATE,
        browser_id: getBrowserId(),
        session_id: getSessionId(),
        page_url: href,
        page_path: window.location.pathname + window.location.search,
        host: window.location.host,
        referrer: document.referrer || null,
        event_source_url: href,
        page_title: document.title || null,
        user_agent: navigator.userAgent || null,
        viewport_width: window.innerWidth || null,
        viewport_height: window.innerHeight || null,
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        utm_term: attribution.utm_term,
        fbclid: attribution.fbclid,
        gclid: attribution.gclid,
        gbraid: attribution.gbraid,
        wbraid: attribution.wbraid,
        ttclid: attribution.ttclid,
        msclkid: attribution.msclkid,
        surface_id: classification.surface_id || null,
        surface_label: classification.surface_label || null,
        surface_category: classification.surface_category || null,
        target_type: extra && extra.target_type ? extra.target_type : classification.target_type || null,
        target_id: extra && extra.target_id ? extra.target_id : classification.target_id || null,
        target_label: extra && extra.target_label ? extra.target_label : classification.target_label || null,
        metadata: metadata
      }
    };
    var bridge = classification.bridge && typeof classification.bridge === "object" ? classification.bridge : null;
    if (bridge) {
      for (var bridgeKey in bridge) {
        payload.event[bridgeKey] = bridge[bridgeKey];
      }
    }

    return fetch(CONFIG.collector_base_url + "/runtime/operations/web-signals.web-journey.collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + CONFIG.sender_token
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(error) {
      console.warn("wix web-signals collect failed", error);
    });
  }

  function trackCurrentPage(reason) {
    return emitClassification(classifyWixPage({
      profile: PROFILE,
      page_url: window.location.href,
      page_title: document.title
    }), {
      metadata: {
        navigation_reason: reason || "navigation"
      }
    });
  }

  function maybeTrackCurrentPage(reason) {
    try {
      var nextKey = currentUrlKey();
      var previousKey = window.sessionStorage.getItem(LAST_URL_KEY);
      if (previousKey === nextKey) return;
      window.sessionStorage.setItem(LAST_URL_KEY, nextKey);
    } catch (_error) {}
    trackCurrentPage(reason);
  }

  function inferControlOrigin(target) {
    if (!target || !target.closest) return "click";
    if (target.closest("form")) return "form";
    if (target.closest("nav")) return "nav";
    if (target.closest("header")) return "header";
    if (target.closest("footer")) return "footer";
    return "content";
  }

  function inferTargetLabel(target, href) {
    return optionalText(target.getAttribute("aria-label")) ||
      optionalText(target.innerText) ||
      optionalText(target.textContent) ||
      optionalText(href) ||
      "click";
  }

  function inferSubmitLabel(form, submitter) {
    if (submitter) {
      return optionalText(submitter.getAttribute("aria-label")) ||
        optionalText(submitter.innerText) ||
        optionalText(submitter.textContent) ||
        optionalText(submitter.value);
    }
    var candidate = form && form.querySelector ? form.querySelector("button[type='submit'],input[type='submit']") : null;
    if (!candidate) return null;
    return optionalText(candidate.getAttribute("aria-label")) ||
      optionalText(candidate.innerText) ||
      optionalText(candidate.textContent) ||
      optionalText(candidate.value);
  }

  document.addEventListener("click", function(event) {
    var target = event.target && event.target.closest ? event.target.closest("a,button,[role='button']") : null;
    if (!target) return;
    var href = optionalText(target.getAttribute("href")) || optionalText(target.href) || null;
    var label = inferTargetLabel(target, href);
    var classification = classifyWixClick({
      profile: PROFILE,
      page_url: window.location.href,
      target_url: href,
      label: label,
      tag_name: target.tagName ? target.tagName.toLowerCase() : null,
      control_origin: inferControlOrigin(target)
    });
    emitClassification(classification, {
      target_type: target.tagName ? target.tagName.toLowerCase() : null,
      target_id: href || optionalText(target.id) || label,
      target_label: label,
      metadata: {
        dom_id: optionalText(target.id),
        dom_class_name: optionalText(target.className)
      }
    });
  }, true);

  document.addEventListener("focusin", function(event) {
    var field = event.target && event.target.closest ? event.target.closest("input,textarea,select") : null;
    if (!field) return;
    var form = field.form || (field.closest ? field.closest("form") : null);
    if (!form) return;
    if (form.getAttribute(STARTED_FORM_ATTRIBUTE) === "true") return;
    var classification = classifyWixForm({
      profile: PROFILE,
      page_url: window.location.href,
      form_id: optionalText(form.id),
      form_action: optionalText(form.getAttribute("action")),
      form_class_name: optionalText(form.className),
      form_role: optionalText(form.getAttribute("role")),
      form_testid: optionalText(form.getAttribute("data-testid")),
      event_type: "start"
    });
    if (!classification) return;
    form.setAttribute(STARTED_FORM_ATTRIBUTE, "true");
    emitClassification(classification, {
      target_type: "form",
      target_id: classification.target_id,
      target_label: classification.target_label
    });
  }, true);

  document.addEventListener("submit", function(event) {
    var form = event.target && event.target.closest ? event.target.closest("form") : null;
    if (!form) return;
    var classification = classifyWixForm({
      profile: PROFILE,
      page_url: window.location.href,
      form_id: optionalText(form.id),
      form_action: optionalText(form.getAttribute("action")),
      form_class_name: optionalText(form.className),
      form_role: optionalText(form.getAttribute("role")),
      form_testid: optionalText(form.getAttribute("data-testid")),
      submit_label: inferSubmitLabel(form, event.submitter || null),
      event_type: "submit"
    });
    if (!classification) return;
    emitClassification(classification, {
      target_type: "form",
      target_id: classification.target_id,
      target_label: classification.target_label
    });
  }, true);

  var originalPushState = history.pushState;
  history.pushState = function() {
    var result = originalPushState.apply(this, arguments);
    setTimeout(function() { maybeTrackCurrentPage("pushState"); }, 50);
    return result;
  };

  var originalReplaceState = history.replaceState;
  history.replaceState = function() {
    var result = originalReplaceState.apply(this, arguments);
    setTimeout(function() { maybeTrackCurrentPage("replaceState"); }, 50);
    return result;
  };

  window.addEventListener("popstate", function() { maybeTrackCurrentPage("popstate"); });
  window.addEventListener("hashchange", function() { maybeTrackCurrentPage("hashchange"); });

  window[CONFIG.export_namespace] = {
    setConsentState: function(nextState) {
      CONSENT_STATE = nextState === "granted" ? "granted" : nextState === "denied" ? "denied" : "unknown";
      if (CONSENT_STATE !== "granted") {
        try { window.localStorage.removeItem(BROWSER_STORAGE_KEY); } catch (_error) {}
      }
    },
    trackPageView: trackCurrentPage,
    classifyPage: function(input) { return classifyWixPage(Object.assign({ profile: PROFILE }, input || {})); },
    classifyClick: function(input) { return classifyWixClick(Object.assign({ profile: PROFILE }, input || {})); },
    classifyForm: function(input) { return classifyWixForm(Object.assign({ profile: PROFILE }, input || {})); },
    webInstallationId: CONFIG.web_installation_id
  };

  maybeTrackCurrentPage("initial-load");
})();`;
  return `<script>\n${source}\n</script>`;
}

export function buildCompactDevenirAestheticsWixCustomCodeSnippet(options = {}) {
  const collectorBaseUrl = requireText(
    deriveCollectorBaseUrl(options),
    "collector_base_url",
  );
  const webInstallationId = requireText(options.web_installation_id, "web_installation_id");
  const senderToken = requireText(options.sender_token, "sender_token");
  const exportNamespace = optionalText(options.export_namespace) ?? "__devenirWebJourney";
  const initialConsentState = optionalText(options.initial_consent_state) ?? "unknown";
  const storagePrefix = optionalText(options.storage_prefix) ?? "devenir.web_journey";

  const source = `!function(){var w=window,d=document,h=history,l=location,n=navigator,b=${JSON.stringify(collectorBaseUrl)},i=${JSON.stringify(webInstallationId)},t=${JSON.stringify(senderToken)},ns=${JSON.stringify(exportNamespace)},cs=${JSON.stringify(initialConsentState)},bk=ns+":booted:"+i;if(w[bk])return;w[bk]=1;var B=${JSON.stringify(`${storagePrefix}.browser_id`)},S=${JSON.stringify(`${storagePrefix}.session_id`)},K=${JSON.stringify(`${storagePrefix}.last_url`)},F="data-nexus-form-started",O="/runtime/operations/web-signals.web-journey.collect",SHOP=",/shop,/shop-1,/isdinproducts,/skinbetterproducts,/alastinproducts,/epionceproducts,/revision-skincare,/skinceuticals,/elta-md-1,",ATTR="utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,gbraid,wbraid,ttclid,msclkid".split(",");function x(v){return"string"==typeof v&&(v=v.trim())?v:null}function u(v,b){v=x(v);if(!v)return null;try{return new URL(v,b)}catch(e){return null}}function j(p){return(p||"w")+"_"+(w.crypto&&w.crypto.randomUUID?w.crypto.randomUUID():Date.now()+"_"+Math.random().toString(36).slice(2,10))}function bi(){if("granted"!==cs)return null;try{var v=x(localStorage.getItem(B));if(v)return v;v=j("browser");localStorage.setItem(B,v);return v}catch(e){return null}}function si(){try{var v=x(sessionStorage.getItem(S));if(v)return v;v=j("session");sessionStorage.setItem(S,v);return v}catch(e){return j("session")}}function at(){var q=new URLSearchParams(l.search||""),o={},k;for(k=0;k<ATTR.length;k++)o[ATTR[k]]=x(q.get(ATTR[k]));return o}function lp(p){p=x(p)||"/";"/"!==p.charAt(0)&&(p="/"+p);var s=p.split("/"),e="es"===s[1];return p=e?"/"+s.slice(2).join("/"):p,p&&"//"!==p||(p="/"),[p,e?"es":null]}function fm(p){var a=lp(p),c=a[0],o=a[1];return"/"===c?["home",o,c,"page_view","page"]:"/services"===c?["services",o,c,"page_view","services"]:"/bookonline"===c?["booking",o,c,"page_view","booking"]:0===c.indexOf("/product-page/")?["product",o,c,"product_view","product"]:"/gift-card"===c?["gift_card",o,c,"page_view","gift_card"]:SHOP.indexOf(","+c+",")>-1?["storefront",o,c,"page_view","storefront"]:"/memberships"===c?["membership",o,c,"page_view","membership"]:"/loyalty"===c?["loyalty",o,c,"page_view","loyalty"]:"/contact"===c?["contact",o,c,"page_view","contact"]:"/specials"===c||"/specials-1"===c?["specials",o,c,"page_view","specials"]:"/refer-friends"===c||"/referral"===c?["referral",o,c,"page_view","referral"]:0===c.indexOf("/event-details/")?["event",o,c,"page_view","event"]:["generic",o,c,"page_view","page"]}function bc(p){var m=(p||"").match(/\\/webstoreNew\\/services\\/([^/?#]+)/i);return m?m[1]:null}function sd(c,e){if(!c||!c.n)return Promise.resolve();var a=at(),href=l.href,ev={event_id:j("evt"),captured_at:Date.now(),event_name:c.n,consent_state:cs,browser_id:bi(),session_id:si(),page_url:href,page_path:l.pathname+l.search,host:l.host,referrer:d.referrer||null,event_source_url:href,page_title:d.title||null,user_agent:n.userAgent||null,viewport_width:w.innerWidth||null,viewport_height:w.innerHeight||null,surface_id:c.si||null,surface_label:c.sl||null,surface_category:c.sc||null,target_type:e&&e.tt||c.tt||null,target_id:e&&e.ti||c.ti||null,target_label:e&&e.tl||c.tl||null,metadata:Object.assign({},c.md||{},e&&e.md||{})},k,bridge=c.b&&"object"==typeof c.b?c.b:null;for(k in a)ev[k]=a[k];if(bridge)for(k in bridge)ev[k]=bridge[k];return fetch(b+O,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+t},body:JSON.stringify({web_installation_id:i,event:ev}),keepalive:!0}).catch(function(e){console.warn("wix web-signals collect failed",e)})}function pv(r){var f=fm(l.pathname);return sd({n:f[3],sc:f[4],si:f[0]+":"+f[2],sl:d.title||null,tt:"page",ti:l.href,tl:d.title||null,md:{page_family:f[0],page_locale:f[1],page_canonical_path:f[2],target_host:l.host,target_path:l.pathname,control_origin:"page",navigation_reason:r||"navigation"}})}function mp(r){try{var nkey=l.pathname+l.search+l.hash,p=sessionStorage.getItem(K);if(p===nkey)return;sessionStorage.setItem(K,nkey)}catch(e){}pv(r)}function og(t){return t&&t.closest&&t.closest("form")?"form":t&&t.closest&&t.closest("nav")?"nav":"content"}function lb(t,href){return x(t.getAttribute("aria-label"))||x(t.innerText)||x(t.textContent)||x(href)||"click"}function ck(href,lab,tag,o){var p=fm(l.pathname),tu=u(href,l.href),th=tu&&x(tu.host),tp=tu&&x(tu.pathname),f=tu?fm(tu.pathname):["generic",null,"/","page_view","page"],bm="deveniratx.zenoti.com"===th||tp&&0===tp.indexOf("/webstoreNew/services/")||"booking"===f[0]||/^(book|book now|book online|book your appointment)$/i.test(lab);if(bm)return{n:"booking_start",sc:"booking",si:"booking:"+f[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||tp||lab,tl:lab,b:{bridge_surface:"booking"},md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:"booking",target_locale:f[1],target_canonical_path:tp&&0===tp.indexOf("/webstoreNew/services/")?tp:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab,provider_hint:"deveniratx.zenoti.com"===th?"zenoti":null,booking_center_id:bc(tp)}};if("Add to Cart"===lab&&("product"===p[0]||"storefront"===p[0]))return{n:"cart_add",sc:"commerce",si:"cart_add:"+p[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:f[0],target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}};if("Checkout"===lab&&("storefront"===p[0]||"product"===p[0]||"gift_card"===p[0]))return{n:"checkout_start",sc:"commerce",si:"checkout:"+p[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,b:{bridge_surface:"checkout"},md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:f[0],target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}};if("Buy Now"===lab&&("gift_card"===p[0]||"gift_card"===f[0]))return{n:"checkout_start",sc:"gift_card",si:"gift_card:"+p[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,b:{bridge_surface:"checkout"},md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:"generic"===f[0]?"gift_card":f[0],target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}};if("membership"===f[0])return{n:"cta_click",sc:"membership",si:"membership:"+f[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:"membership",target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}};if("loyalty"===f[0])return{n:"cta_click",sc:"loyalty",si:"loyalty:"+f[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:"loyalty",target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}};var ff="generic"===f[0]?p[0]:f[0];return{n:"cta_click",sc:"generic"===ff?"click":ff,si:ff+":"+f[2],sl:lab,tt:tag||"click",ti:tu&&tu.href||lab,tl:lab,md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:ff,target_locale:f[1],target_canonical_path:f[2],target_host:th,target_path:tp,control_origin:o,control_label:lab}}}function sl(f,s){var t=s||f&&f.querySelector&&f.querySelector("button[type='submit'],input[type='submit']");return t&&(x(t.getAttribute("aria-label"))||x(t.innerText)||x(t.textContent)||x(t.value))||null}function cf(f,ty,slb){var p=fm(l.pathname),role=(x(f.getAttribute("role"))||"").toLowerCase(),tid=(x(f.getAttribute("data-testid"))||"").toLowerCase(),act=x(f.getAttribute("action")),ap=u(act,l.href),path=ap&&x(ap.pathname),cls=(x(f.className)||"").toLowerCase();if(("home"!==p[0]&&"contact"!==p[0])||"search"===role||"search-box-form"===tid||"/search"===path||"contact"!==p[0]&&cls.indexOf("wixui-form")<0)return null;var fid=x(f.id)||path||p[0]+"-form";return{n:"submit"===ty?"form_submit":"form_start",sc:"form",si:"form:"+fid,sl:slb||"lead form",tt:"form",ti:fid,tl:slb||"lead form",b:{bridge_surface:"form",form_id:fid},md:{page_family:p[0],page_locale:p[1],page_canonical_path:p[2],target_family:"form",target_host:l.host,target_path:path||l.pathname,control_origin:"form",control_label:slb,form_family:"lead_capture",form_action_path:path||null}}}d.addEventListener("click",function(e){var t=e.target&&e.target.closest?e.target.closest("a,button,[role='button']"):null;if(!t)return;var href=x(t.getAttribute("href"))||x(t.href)||null,lab=lb(t,href),c=ck(href,lab,t.tagName?t.tagName.toLowerCase():null,og(t));sd(c,{tt:t.tagName?t.tagName.toLowerCase():null,ti:href||x(t.id)||lab,tl:lab,md:{dom_id:x(t.id),dom_class_name:x(t.className)}})},!0);d.addEventListener("focusin",function(e){var f=e.target&&e.target.closest?e.target.closest("input,textarea,select"):null,fo;if(!f)return;fo=f.form||(f.closest?f.closest("form"):null);if(!fo||"true"===fo.getAttribute(F))return;var c=cf(fo,"start");c&&(fo.setAttribute(F,"true"),sd(c,{tt:"form",ti:c.ti,tl:c.tl}))},!0);d.addEventListener("submit",function(e){var f=e.target&&e.target.closest?e.target.closest("form"):null,c;if(!f)return;c=cf(f,"submit",sl(f,e.submitter||null));c&&sd(c,{tt:"form",ti:c.ti,tl:c.tl})},!0);var ps=h.pushState;h.pushState=function(){var r=ps.apply(this,arguments);return setTimeout(function(){mp("pushState")},50),r};var rs=h.replaceState;h.replaceState=function(){var r=rs.apply(this,arguments);return setTimeout(function(){mp("replaceState")},50),r};w.addEventListener("popstate",function(){mp("popstate")});w.addEventListener("hashchange",function(){mp("hashchange")});w[ns]={setConsentState:function(v){cs="granted"===v?"granted":"denied"===v?"denied":"unknown";if("granted"!==cs)try{localStorage.removeItem(B)}catch(e){}},webInstallationId:i,trackPageView:pv};mp("initial-load")}();`;
  return `<script>\n${source}\n</script>`;
}
