import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWixCustomCodeSnippet,
  buildWixOutcomeProofChecklist,
} from "./snippet.mjs";
import { buildDevenirAestheticsWixCustomCodeSnippetFromMetadata } from "./index.mjs";
import { getDevenirAestheticsWixProfile } from "./profiles/devenir-aesthetics.mjs";

test("wix snippet builder injects runtime config and exact event coverage", () => {
  const snippet = buildWixCustomCodeSnippet({
    collector_base_url: "https://collector.example",
    web_installation_id: "install-123",
    sender_token: "token-123",
    export_namespace: "__devenirWebJourney",
    profile: getDevenirAestheticsWixProfile(),
  });

  assert.match(snippet, /https:\/\/collector\.example/);
  assert.match(snippet, /install-123/);
  assert.match(snippet, /token-123/);
  assert.match(snippet, /product_view/);
  assert.match(snippet, /cart_add/);
  assert.match(snippet, /checkout_start/);
  assert.match(snippet, /form_start/);
  assert.match(snippet, /form_submit/);
  assert.match(snippet, /gift_card/);
  assert.match(snippet, /membership/);
  assert.match(snippet, /loyalty/);
  assert.doesNotMatch(snippet, /\bkind\b/);
  assert.match(snippet, /^<script>/);
  assert.match(snippet, /<\/script>$/);
  assert.match(snippet, /BOOT_KEY/);
  assert.match(snippet, /if \(window\[BOOT_KEY\]\) return;/);
});

test("wix proof checklist expands to Devenir outcome proof coverage", () => {
  const checklist = buildWixOutcomeProofChecklist(getDevenirAestheticsWixProfile());

  assert.ok(checklist.some((line) => line.includes("booking handoff")));
  assert.ok(checklist.some((line) => line.includes("product_view / cart_add / checkout_start")));
  assert.ok(checklist.some((line) => line.includes("gift-card")));
  assert.ok(checklist.some((line) => line.includes("form_start and form_submit")));
});

test("wix snippet builder derives collector base URL from runtime metadata fields", () => {
  const fromRuntimeBase = buildWixCustomCodeSnippet({
    runtime_base_url: "https://t-example.nexushub.sh",
    web_installation_id: "install-123",
    sender_token: "token-123",
    profile: getDevenirAestheticsWixProfile(),
  });
  const fromCollectEndpoint = buildWixCustomCodeSnippet({
    collect_endpoint: "https://t-example.nexushub.sh/runtime/operations/web-signals.web-journey.collect",
    web_installation_id: "install-123",
    sender_token: "token-123",
    profile: getDevenirAestheticsWixProfile(),
  });

  assert.match(fromRuntimeBase, /https:\/\/t-example\.nexushub\.sh/);
  assert.match(fromCollectEndpoint, /https:\/\/t-example\.nexushub\.sh/);
});

test("compact Devenir snippet stays HTML-wrapped and bridge-capable", () => {
  const snippet = buildDevenirAestheticsWixCustomCodeSnippetFromMetadata({
    metadata: {
      runtime_base_url: "https://t-devenir.nexushub.sh",
      web_installation_id: "install-123",
    },
    sender_token: "token-123",
  });

  assert.match(snippet, /^<script>/);
  assert.match(snippet, /<\/script>$/);
  assert.match(snippet, /bridge_surface/);
  assert.match(snippet, /form_id/);
  assert.doesNotMatch(snippet, /\bkind\b/);
});
