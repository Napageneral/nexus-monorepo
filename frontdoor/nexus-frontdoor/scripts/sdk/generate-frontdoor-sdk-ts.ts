import path from "node:path";
import { generateTypeScriptSdk } from "../../../nex/sdk/sdk-codegen/typescript.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");

await generateTypeScriptSdk({
  openApiPath: path.resolve(repoRoot, "../contracts/frontdoor/openapi.yaml"),
  outputDir: path.join(repoRoot, "sdk/frontdoor-sdk-ts"),
  clientName: "createFrontdoorClient",
  stripPrefix: "frontdoor",
});
