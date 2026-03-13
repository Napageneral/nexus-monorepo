import path from "node:path";
import { generateGoSdk } from "../../../nex/sdk/sdk-codegen/go.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");

generateGoSdk({
  openApiPath: path.resolve(repoRoot, "../contracts/frontdoor/openapi.yaml"),
  outputDir: path.join(repoRoot, "sdk/frontdoor-sdk-go"),
  modulePath: "github.com/Napageneral/nexus-monorepo/nexus-frontdoor/sdk/frontdoor-sdk-go",
  packageName: "frontdoorsdk",
  stripPrefix: "frontdoor",
});
