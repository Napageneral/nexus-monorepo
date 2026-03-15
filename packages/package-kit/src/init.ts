import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  packageDisplayName,
  renderTemplate,
  type PackageKind,
  type PackageLanguage,
  writeFile,
} from "./shared.js";

type InitOptions = {
  kind: PackageKind;
  language: PackageLanguage;
  id: string;
  dir?: string;
};

function resolveTemplateRoot(): string {
  let current = import.meta.dirname;
  while (true) {
    const candidate = path.join(current, "packages", "package-kit", "templates");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(`Unable to locate package-kit/templates from ${import.meta.dirname}`);
}

const TEMPLATE_ROOT = resolveTemplateRoot();

function normalizeLanguage(kind: PackageKind, language: PackageLanguage): PackageLanguage {
  if (kind === "app" && language === "go") {
    throw new Error("app scaffolds currently support ts only in the first package-kit cut");
  }
  return language;
}

function packageTemplateName(kind: PackageKind, language: PackageLanguage): string {
  return `${kind}-${language}`;
}

export async function initPackage(opts: InitOptions): Promise<{ targetDir: string }> {
  const language = normalizeLanguage(opts.kind, opts.language);
  const targetDir = path.resolve(opts.dir ? opts.dir : path.join(process.cwd(), opts.id));
  const templateDir = path.join(TEMPLATE_ROOT, packageTemplateName(opts.kind, language));
  await fsp.access(templateDir);

  const existing = await fsp.readdir(targetDir).catch(() => []);
  if (existing.length > 0) {
    throw new Error(`target directory is not empty: ${targetDir}`);
  }

  const values = {
    PACKAGE_ID: opts.id,
    DISPLAY_NAME: packageDisplayName(opts.id),
    COMMAND_NAME: opts.id.replace(/^nexus-/, ""),
    GO_MODULE: `github.com/nexus-project/${opts.id}`,
  };

  await fsp.mkdir(targetDir, { recursive: true });

  async function copyTemplate(currentTemplateDir: string, currentTargetDir: string): Promise<void> {
    const entries = await fsp.readdir(currentTemplateDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(currentTemplateDir, entry.name);
      let outputName = entry.name.replace(/\.tmpl$/, "");
      outputName = renderTemplate(outputName, values);
      const targetPath = path.join(currentTargetDir, outputName);
      if (entry.isDirectory()) {
        await fsp.mkdir(targetPath, { recursive: true });
        await copyTemplate(sourcePath, targetPath);
        continue;
      }
      const raw = await fsp.readFile(sourcePath, "utf8");
      const rendered = renderTemplate(raw, values);
      const mode = outputName.endsWith(".sh") || outputName.startsWith("bin/") ? 0o755 : undefined;
      await writeFile(targetPath, rendered, mode);
    }
  }

  await copyTemplate(templateDir, targetDir);
  return { targetDir };
}
