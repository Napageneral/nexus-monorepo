import { getDevenirAestheticsWixProfile } from "./profiles/devenir-aesthetics.mjs";
import {
  buildCompactDevenirAestheticsWixCustomCodeSnippet,
  buildWixCustomCodeSnippet,
  buildWixOutcomeProofChecklist,
  classifyWixClick,
  classifyWixForm,
  classifyWixPage,
} from "./snippet.mjs";

function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function cleanArray(values) {
  return values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
}

export function evaluateWixCompatibility(input = {}) {
  const siteType = optionalText(input.site_type) ?? "wix";
  const customCodeEnabled = normalizeBoolean(input.custom_code_enabled);
  const gtmEnabled = normalizeBoolean(input.gtm_enabled);
  const veloEnabled = normalizeBoolean(input.velo_enabled);
  const published = normalizeBoolean(input.published);
  const connectedDomain = normalizeBoolean(input.connected_domain);

  if (siteType !== "wix") {
    return {
      lane: "unsupported",
      compatibility: "unsupported",
      reasons: [`unsupported_site_type:${siteType}`],
      baseline_capture: false,
      bridge_capable: false,
    };
  }

  if (!published || !connectedDomain) {
    return {
      lane: "unsupported",
      compatibility: "unsupported",
      reasons: [
        !published ? "site_not_published" : null,
        !connectedDomain ? "domain_not_connected" : null,
      ].filter(Boolean),
      baseline_capture: false,
      bridge_capable: false,
    };
  }

  if (customCodeEnabled) {
    return {
      lane: "custom-code",
      compatibility: veloEnabled ? "bridge-capable" : "baseline-capture",
      reasons: [],
      baseline_capture: true,
      bridge_capable: veloEnabled,
    };
  }

  if (gtmEnabled) {
    return {
      lane: "gtm",
      compatibility: veloEnabled ? "bridge-capable" : "baseline-capture",
      reasons: [],
      baseline_capture: true,
      bridge_capable: veloEnabled,
    };
  }

  if (veloEnabled) {
    return {
      lane: "velo-bridge",
      compatibility: "bridge-capable",
      reasons: [],
      baseline_capture: true,
      bridge_capable: true,
    };
  }

  return {
    lane: "unsupported",
    compatibility: "unsupported",
    reasons: ["no_supported_install_lane"],
    baseline_capture: false,
    bridge_capable: false,
  };
}

export function buildWixInstallPlan(input = {}) {
  const evaluation = evaluateWixCompatibility(input);
  const steps = [];

  if (evaluation.lane === "unsupported") {
    return {
      ...evaluation,
      steps: ["stop: wix site cannot support the requested install lane"],
    };
  }

  steps.push(`install first-party bootstrap using ${evaluation.lane}`);
  steps.push("verify page_view and cta_click capture");

  if (evaluation.bridge_capable) {
    steps.push("wire the Wix bridge extension for forms, bookings, or intake");
    steps.push("confirm handoff identifiers survive the backend transition");
  }

  return {
    ...evaluation,
    steps,
  };
}

export function buildWixProofChecklist(input = {}) {
  const evaluation = evaluateWixCompatibility(input);
  const baseChecklist = [
    "published site with connected domain",
    evaluation.lane === "unsupported" ? null : `install lane: ${evaluation.lane}`,
    evaluation.baseline_capture ? "page_view capture confirmed" : null,
    evaluation.baseline_capture ? "cta_click capture confirmed" : null,
    evaluation.bridge_capable ? "handoff identifiers confirmed" : null,
    evaluation.bridge_capable ? "backend bridge path confirmed" : null,
  ];
  if (input.site_profile && evaluation.lane !== "unsupported") {
    return cleanArray([...baseChecklist, ...buildWixOutcomeProofChecklist(input.site_profile)]);
  }
  return cleanArray(baseChecklist);
}

export function buildDevenirAestheticsWixCustomCodeSnippet(input = {}) {
  return buildCompactDevenirAestheticsWixCustomCodeSnippet({
    ...input,
    export_namespace: input.export_namespace ?? "__devenirWebJourney",
  });
}

export function buildWixCustomCodeSnippetFromInstallationMetadata(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return buildWixCustomCodeSnippet({
    ...metadata,
    ...input,
    profile: input.profile ?? metadata.profile,
    sender_token: input.sender_token,
  });
}

export function buildDevenirAestheticsWixCustomCodeSnippetFromMetadata(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return buildCompactDevenirAestheticsWixCustomCodeSnippet({
    ...metadata,
    ...input,
    export_namespace: input.export_namespace ?? "__devenirWebJourney",
    sender_token: input.sender_token,
  });
}

export function buildDevenirAestheticsWixProofChecklist(input = {}) {
  return buildWixProofChecklist({
    ...input,
    site_profile: getDevenirAestheticsWixProfile(),
  });
}

export function classifyDevenirAestheticsWixPage(input = {}) {
  return classifyWixPage({
    ...input,
    profile: getDevenirAestheticsWixProfile(),
  });
}

export function classifyDevenirAestheticsWixClick(input = {}) {
  return classifyWixClick({
    ...input,
    profile: getDevenirAestheticsWixProfile(),
  });
}

export function classifyDevenirAestheticsWixForm(input = {}) {
  return classifyWixForm({
    ...input,
    profile: getDevenirAestheticsWixProfile(),
  });
}

export {
  buildWixCustomCodeSnippet,
  buildWixOutcomeProofChecklist,
  classifyWixClick,
  classifyWixForm,
  classifyWixPage,
  getDevenirAestheticsWixProfile,
};
