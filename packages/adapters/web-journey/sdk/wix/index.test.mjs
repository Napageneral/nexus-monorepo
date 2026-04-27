import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDevenirAestheticsWixCustomCodeSnippetFromMetadata,
  buildDevenirAestheticsWixProofChecklist,
  buildWixInstallPlan,
  buildWixProofChecklist,
  evaluateWixCompatibility,
} from "./index.mjs";

test("wix evaluator distinguishes baseline and bridge-capable lanes", () => {
  const baseline = evaluateWixCompatibility({
    site_type: "wix",
    published: true,
    connected_domain: true,
    custom_code_enabled: true,
    velo_enabled: false,
  });

  assert.equal(baseline.lane, "custom-code");
  assert.equal(baseline.baseline_capture, true);
  assert.equal(baseline.bridge_capable, false);
  assert.equal(baseline.compatibility, "baseline-capture");

  const bridgeCapable = evaluateWixCompatibility({
    site_type: "wix",
    published: true,
    connected_domain: true,
    custom_code_enabled: false,
    gtm_enabled: true,
    velo_enabled: true,
  });

  assert.equal(bridgeCapable.lane, "gtm");
  assert.equal(bridgeCapable.bridge_capable, true);
  assert.equal(bridgeCapable.compatibility, "bridge-capable");
});

test("wix plan and checklist fail clearly when the site cannot support install", () => {
  const plan = buildWixInstallPlan({
    site_type: "wix",
    published: false,
    connected_domain: true,
  });
  const checklist = buildWixProofChecklist({
    site_type: "wix",
    published: false,
    connected_domain: true,
  });

  assert.equal(plan.lane, "unsupported");
  assert.equal(plan.steps[0], "stop: wix site cannot support the requested install lane");
  assert.deepEqual(checklist, ["published site with connected domain"]);
});

test("devenir wix proof checklist includes exact outcome coverage", () => {
  const checklist = buildDevenirAestheticsWixProofChecklist({
    site_type: "wix",
    published: true,
    connected_domain: true,
    custom_code_enabled: true,
  });

  assert.ok(checklist.includes("install lane: custom-code"));
  assert.ok(checklist.some((line) => line.includes("booking handoff")));
  assert.ok(checklist.some((line) => line.includes("gift-card")));
});

test("devenir wix snippet builder accepts live installation metadata shape", () => {
  const snippet = buildDevenirAestheticsWixCustomCodeSnippetFromMetadata({
    metadata: {
      runtime_base_url: "https://t-example.nexushub.sh",
      collect_endpoint: "https://t-example.nexushub.sh/runtime/operations/web-signals.web-journey.collect",
      web_installation_id: "install-123",
    },
    sender_token: "token-123",
  });

  assert.match(snippet, /https:\/\/t-example\.nexushub\.sh/);
  assert.match(snippet, /install-123/);
  assert.match(snippet, /token-123/);
});
