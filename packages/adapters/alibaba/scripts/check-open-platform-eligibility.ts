#!/usr/bin/env -S node --experimental-strip-types
import {
  assessAlibabaOpenPlatformEligibility,
  probeAlibabaOpenPlatformReadAccess,
  readAlibabaOpenPlatformInputs,
  type AlibabaOpenPlatformInputs,
} from "../src/open-platform.ts";

const inputs = readAlibabaOpenPlatformInputs(process.env);
const assessment = assessAlibabaOpenPlatformEligibility(inputs);
const live = process.argv.slice(2).includes("--live-read-probe");

if (!live || assessment.state !== "ready_for_read_probe") {
  process.stdout.write(`${JSON.stringify(assessment)}\n`);
  process.exit(assessment.state === "ready_for_read_probe" || !live ? 0 : 2);
}

const result = await probeAlibabaOpenPlatformReadAccess({
  credentials: inputs as AlibabaOpenPlatformInputs,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.state === "eligible" ? 0 : 3);
