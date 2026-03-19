import fs from "node:fs";
import path from "node:path";
import { generateGoSdk } from "../../../../nex/sdk/sdk-codegen/go.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outputDir = path.resolve(repoRoot, "../../artifacts/sdk/go/platform/frontdoor-sdk-go");

generateGoSdk({
  openApiPath: path.resolve(repoRoot, "../../api/frontdoor/openapi.yaml"),
  outputDir,
  modulePath: "github.com/Napageneral/nexus-monorepo/artifacts/sdk/go/platform/frontdoor-sdk-go",
  packageName: "frontdoorsdk",
  stripPrefix: "frontdoor",
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "README.md"),
  `# \`frontdoor-sdk-go\`

Generated Go SDK for the canonical Frontdoor API.

Source OpenAPI:

- \`api/frontdoor/openapi.yaml\`

Generate and validate it from the owning Frontdoor repo:

\`\`\`bash
pnpm sdk:build:go
\`\`\`
`,
  "utf8",
);
