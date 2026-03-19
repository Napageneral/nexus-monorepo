import fs from "node:fs";
import path from "node:path";
import { generateTypeScriptSdk } from "../../../../nex/sdk/sdk-codegen/typescript.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outputDir = path.resolve(repoRoot, "../../artifacts/sdk/ts/platform/frontdoor-sdk-ts");

await generateTypeScriptSdk({
  openApiPath: path.resolve(repoRoot, "../../api/frontdoor/openapi.yaml"),
  outputDir,
  clientName: "createFrontdoorClient",
  stripPrefix: "frontdoor",
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "package.json"),
  `${JSON.stringify(
    {
      name: "@nexus-project/frontdoor-sdk-ts",
      version: "0.1.0",
      type: "module",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      exports: {
        ".": {
          import: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(outputDir, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        declaration: true,
        outDir: "dist",
        rootDir: "src",
        strict: true,
        skipLibCheck: true,
        lib: ["ES2022", "DOM"],
        types: [],
      },
      include: ["src/**/*.ts"],
    },
    null,
    2,
  )}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(outputDir, "README.md"),
  `# \`@nexus-project/frontdoor-sdk-ts\`

Generated TypeScript SDK for the canonical Frontdoor API.

Source OpenAPI:

- \`api/frontdoor/openapi.yaml\`

Build this package from the owning Frontdoor repo:

\`\`\`bash
pnpm sdk:build:ts
\`\`\`
`,
  "utf8",
);
