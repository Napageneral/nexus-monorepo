function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createMetaStub(windowRef, log) {
  if (typeof windowRef.fbq === "function") {
    return windowRef.fbq;
  }
  const fbq = (...args) => {
    log.push({
      vendor: "meta",
      args,
      timestamp: Date.now(),
    });
  };
  windowRef.fbq = fbq;
  return fbq;
}

function createGoogleStub(windowRef, log) {
  if (typeof windowRef.gtag === "function") {
    return windowRef.gtag;
  }
  if (!Array.isArray(windowRef.dataLayer)) {
    windowRef.dataLayer = [];
  }
  const gtag = (...args) => {
    windowRef.dataLayer.push(args);
    log.push({
      vendor: "google",
      args,
      timestamp: Date.now(),
    });
  };
  windowRef.gtag = gtag;
  return gtag;
}

function createTikTokStub(windowRef, log) {
  const existing = windowRef.ttq;
  if (existing && typeof existing.track === "function") {
    return existing;
  }
  const ttq = {
    track(name, payload) {
      log.push({
        vendor: "tiktok",
        args: [name, payload],
        timestamp: Date.now(),
      });
    },
  };
  windowRef.ttq = ttq;
  return ttq;
}

function defaultDispatchName(vendor, eventName) {
  if (vendor === "meta") {
    if (eventName === "page_view") {
      return { mode: "track", name: "PageView" };
    }
    if (eventName === "handoff_confirmed") {
      return { mode: "track", name: "Lead" };
    }
    return { mode: "trackCustom", name: eventName };
  }
  if (vendor === "google") {
    if (eventName === "page_view") {
      return { mode: "event", name: "page_view" };
    }
    if (eventName === "handoff_confirmed") {
      return { mode: "event", name: "generate_lead" };
    }
    return { mode: "event", name: eventName };
  }
  if (eventName === "page_view") {
    return { mode: "track", name: "PageView" };
  }
  if (eventName === "handoff_confirmed") {
    return { mode: "track", name: "CompleteRegistration" };
  }
  return { mode: "track", name: eventName };
}

function buildPixelPayload(event) {
  return {
    event_id: optionalText(event.event_id) ?? optionalText(event.eventId),
    event_name: optionalText(event.event_name) ?? optionalText(event.eventName),
    page_url: optionalText(event.page_url) ?? optionalText(event.pageUrl),
    page_path: optionalText(event.page_path) ?? optionalText(event.pagePath),
    host: optionalText(event.host),
    surface_id: optionalText(event.surface_id) ?? optionalText(event.surfaceId),
    surface_label: optionalText(event.surface_label) ?? optionalText(event.surfaceLabel),
    target_type: optionalText(event.target_type) ?? optionalText(event.targetType),
    target_id: optionalText(event.target_id) ?? optionalText(event.targetId),
    target_label: optionalText(event.target_label) ?? optionalText(event.targetLabel),
    bridge_surface: optionalText(event.bridge_surface) ?? optionalText(event.bridgeSurface),
    handoff_id: optionalText(event.handoff_id) ?? optionalText(event.handoffId),
    form_id: optionalText(event.form_id) ?? optionalText(event.formId),
    form_submission_id: optionalText(event.form_submission_id) ?? optionalText(event.formSubmissionId),
    booking_id: optionalText(event.booking_id) ?? optionalText(event.bookingId),
    lead_external_id: optionalText(event.lead_external_id) ?? optionalText(event.leadExternalId),
  };
}

export function createCompanionPixels(options = {}) {
  const windowRef = options.window ?? globalThis.window;
  if (!windowRef) {
    throw new Error("window is required for companion pixels");
  }
  const ownerPath =
    typeof options.owner_path === "string" && options.owner_path.trim()
      ? options.owner_path.trim()
      : "custom_code";
  const enabled = {
    meta: options.meta !== false,
    google: options.google !== false,
    tiktok: options.tiktok !== false,
  };
  const log = Array.isArray(windowRef.__websiteInputCompanionPixelLog)
    ? windowRef.__websiteInputCompanionPixelLog
    : Array.isArray(options.seed_log)
      ? [...options.seed_log]
      : [];
  windowRef.__websiteInputCompanionPixelLog = log;
  const seen = new Set(
    Array.isArray(windowRef.__websiteInputCompanionPixelSeen)
      ? windowRef.__websiteInputCompanionPixelSeen
      : [],
  );
  windowRef.__websiteInputCompanionPixelSeen = [...seen];

  const sinks = {
    meta: enabled.meta ? createMetaStub(windowRef, log) : null,
    google: enabled.google ? createGoogleStub(windowRef, log) : null,
    tiktok: enabled.tiktok ? createTikTokStub(windowRef, log) : null,
  };

  function dispatch(event) {
    const eventId = optionalText(event?.event_id) ?? optionalText(event?.eventId);
    const eventName = optionalText(event?.event_name) ?? optionalText(event?.eventName);
    if (!eventId || !eventName) {
      throw new Error("event_id and event_name are required for companion pixel dispatch");
    }

    const payload = buildPixelPayload(event);
    const fired = [];

    for (const vendor of ["meta", "google", "tiktok"]) {
      if (!enabled[vendor]) {
        continue;
      }
      const dedupeKey = `${ownerPath}:${vendor}:${eventId}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      windowRef.__websiteInputCompanionPixelSeen = [...seen];
      const dispatchShape = defaultDispatchName(vendor, eventName);
      if (vendor === "meta" && typeof sinks.meta === "function") {
        sinks.meta(dispatchShape.mode, dispatchShape.name, payload);
      } else if (vendor === "google" && typeof sinks.google === "function") {
        sinks.google("event", dispatchShape.name, payload);
      } else if (vendor === "tiktok" && sinks.tiktok && typeof sinks.tiktok.track === "function") {
        sinks.tiktok.track(dispatchShape.name, payload);
      }
      fired.push({
        vendor,
        owner_path: ownerPath,
        dispatch_name: dispatchShape.name,
        event_id: eventId,
        event_name: eventName,
      });
    }

    return {
      owner_path: ownerPath,
      fired,
      log: [...log],
    };
  }

  function readLog() {
    return [...log];
  }

  return {
    owner_path: ownerPath,
    enabled: { ...enabled },
    dispatch,
    readLog,
  };
}
