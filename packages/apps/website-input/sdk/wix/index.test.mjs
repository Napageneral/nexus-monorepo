import test from "node:test";
import assert from "node:assert/strict";
import { buildWixInstallPlan, buildWixProofChecklist, evaluateWixCompatibility } from "./index.mjs";

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

