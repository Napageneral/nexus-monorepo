import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWebsiteInputCore } from "../../sdk/core/index.mjs";
import { mapGtmDataLayerEvent } from "../../sdk/gtm/index.mjs";
import { buildWixInstallPlan } from "../../sdk/wix/index.mjs";
import { buildHiddenFieldBridgePayload } from "../../sdk/bridge/index.mjs";
import {
  buildShopifyCheckoutAttributes,
  parseShopifyCheckoutAttributes,
} from "../../sdk/shopify-bridge/index.mjs";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "../..");
const artifactDir = path.resolve(packageDir, "app/docs/validation/artifacts");
const artifactPath = path.join(artifactDir, "latest-proof.json");

const localStorage = createMemoryStorage();
const sessionStorage = createMemoryStorage();
const core = createWebsiteInputCore({
  website_installation_id: "proof_installation_1",
  consent_state: "granted",
  storage: localStorage,
  sessionStorage,
  location: {
    href: "https://example.com/landing?utm_source=google&utm_medium=cpc&gclid=gclid_1",
    pathname: "/landing",
    host: "example.com",
  },
  document: {
    title: "Landing",
    referrer: "https://www.google.com/",
  },
  navigator: {
    userAgent: "WebsiteInputProof/1.0",
  },
  window: {
    innerWidth: 1440,
    innerHeight: 900,
  },
  randomUUID: (() => {
    const values = ["browser_proof_1", "session_proof_1", "event_proof_1", "event_proof_2"];
    return () => values.shift() ?? `proof_${Date.now()}`;
  })(),
  now: (() => {
    let tick = 1700000000000;
    return () => {
      tick += 1000;
      return tick;
    };
  })(),
});

const pageView = core.pageView({
  surface_id: "hero_primary",
  surface_label: "Book consult",
  surface_category: "hero",
  target_type: "service",
  target_id: "consult",
  target_label: "Consult",
  utm_source: "google",
  utm_medium: "cpc",
  gclid: "gclid_1",
});

const handoff = core.handoffStart({
  page_url: "https://example.com/book",
  page_path: "/book",
  host: "example.com",
  bridge: {
    bridge_surface: "form",
    handoff_id: "handoff_1",
    form_id: "form_1",
    lead_external_id: "lead_1",
  },
});

const gtmMapped = mapGtmDataLayerEvent({
  event: "purchase",
  page_location: "https://example.com/thank-you",
  page_path: "/thank-you",
  host: "example.com",
  checkout_id: "checkout_1",
});

const wixPlan = buildWixInstallPlan({
  site_type: "wix",
  published: true,
  connected_domain: true,
  custom_code_enabled: true,
  velo_enabled: true,
});

const hiddenFieldPayload = buildHiddenFieldBridgePayload(handoff.bridge, { prefix: "bridge_" });
const shopifyAttributes = buildShopifyCheckoutAttributes({
  ...handoff,
  website_installation_id: pageView.website_installation_id,
  browser_id: pageView.browser_id,
  session_id: pageView.session_id,
  event_id: handoff.event_id,
});
const parsedShopifyAttributes = parseShopifyCheckoutAttributes(shopifyAttributes);

const sdkTest = runCommand(
  "node",
  [
    "--test",
    "sdk/core/index.test.mjs",
    "sdk/gtm/index.test.mjs",
    "sdk/wix/index.test.mjs",
    "sdk/bridge/index.test.mjs",
    "sdk/shopify-bridge/index.test.mjs",
  ],
  packageDir,
);
const collectorStoreTest = runCommand(
  "node",
  [
    "--experimental-strip-types",
    "--test",
    "app/methods/store.test.ts",
    "app/methods/journal.test.ts",
    "app/methods/index.test.ts",
  ],
  packageDir,
);

const artifact = {
  generated_at: Date.now(),
  package_dir: packageDir,
  tests: {
    sdk: sdkTest,
    collector_store: collectorStoreTest,
  },
  samples: {
    page_view: pageView,
    handoff_start: handoff,
    gtm_mapped: gtmMapped,
    wix_plan: wixPlan,
    hidden_field_payload: hiddenFieldPayload,
    shopify_attributes: shopifyAttributes,
    parsed_shopify_attributes: parsedShopifyAttributes,
  },
  summary: {
    passed:
      sdkTest.status === 0 &&
      collectorStoreTest.status === 0 &&
      pageView.browser_id === "browser_proof_1" &&
      handoff.form_id === "form_1" &&
      parsedShopifyAttributes.bridge_surface === "form",
  },
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`wrote ${artifactPath}`);
