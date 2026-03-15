import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FrontdoorStore } from "./frontdoor-store.js";
import { syncProductFromManifest, type ProductSyncResult } from "./product-sync.js";

export type PublishAppReleaseParams = {
  store: FrontdoorStore;
  packageRoot: string;
  tarballPath: string;
  targetOs?: string;
  targetArch?: string;
  channel?: string;
  publishedAtMs?: number;
};

export type PublishAppReleaseResult = {
  ok: true;
  package_id: string;
  version: string;
  release_id: string;
  variant_id: string;
  target_os: string;
  target_arch: string;
  tarball_path: string;
  sha256: string;
  size_bytes: number;
  product_sync: ProductSyncResult;
};

type ManifestDependencyClass = "app" | "adapter";

type AppManifestRequirementRef = {
  id?: string;
  version?: string;
};

type AppManifestRequires = {
  apps?: AppManifestRequirementRef[];
  adapters?: AppManifestRequirementRef[];
};

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

function extractReleaseDependencies(manifest: {
  id?: string;
  requires?: AppManifestRequires;
}): Array<{
  dependencyClass: ManifestDependencyClass;
  dependencyPackageId: string;
  versionConstraint: string;
  sortOrder: number;
}> {
  const packageId = String(manifest.id ?? "").trim();
  const seen = new Set<string>();
  const out: Array<{
    dependencyClass: ManifestDependencyClass;
    dependencyPackageId: string;
    versionConstraint: string;
    sortOrder: number;
  }> = [];

  const appendGroup = (dependencyClass: ManifestDependencyClass, entries: AppManifestRequirementRef[] | undefined) => {
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      const dependencyPackageId = String(entry?.id ?? "").trim();
      if (!dependencyPackageId) {
        throw new Error(`invalid dependency in requires.${dependencyClass}s: missing id`);
      }
      if (dependencyPackageId === packageId) {
        throw new Error(`invalid dependency in requires.${dependencyClass}s: self-dependency "${dependencyPackageId}"`);
      }
      const versionConstraint = String(entry?.version ?? "latest").trim() || "latest";
      const key = `${dependencyClass}:${dependencyPackageId}`;
      if (seen.has(key)) {
        throw new Error(`duplicate dependency in requires.${dependencyClass}s: "${dependencyPackageId}"`);
      }
      seen.add(key);
      out.push({
        dependencyClass,
        dependencyPackageId,
        versionConstraint,
        sortOrder: out.length,
      });
    }
  };

  appendGroup("app", manifest.requires?.apps);
  appendGroup("adapter", manifest.requires?.adapters);
  return out;
}

export async function publishAppRelease(
  params: PublishAppReleaseParams,
): Promise<PublishAppReleaseResult> {
  const packageRoot = path.resolve(params.packageRoot);
  const tarballPath = path.resolve(params.tarballPath);
  const manifestPath = path.join(packageRoot, "app.nexus.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing app manifest: ${manifestPath}`);
  }
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`missing tarball: ${tarballPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    id?: string;
    version?: string;
    displayName?: string;
    name?: string;
    description?: string;
    requires?: AppManifestRequires;
  };
  const packageId = String(manifest.id ?? "").trim();
  const version = String(manifest.version ?? "").trim();
  const displayName = String(manifest.displayName ?? manifest.name ?? packageId).trim();
  const description = String(manifest.description ?? "").trim() || undefined;
  if (!packageId || !version || !displayName) {
    throw new Error(`invalid app manifest in ${manifestPath}`);
  }

  const targetOs = params.targetOs?.trim() || process.platform;
  const targetArch = params.targetArch?.trim() || process.arch;
  const releaseId = `rel-${packageId}-${version}`;
  const variantId = `variant-${packageId}-${version}-${targetOs}-${targetArch}`;
  const stats = fs.statSync(tarballPath);
  const digest = await sha256(tarballPath);
  const dependencies = extractReleaseDependencies(manifest);

  const productSync = await syncProductFromManifest(params.store, manifestPath);
  params.store.upsertPackage({
    packageId,
    kind: "app",
    displayName,
    description,
    productId: packageId,
  });
  for (const dependency of dependencies) {
    params.store.upsertPackage({
      packageId: dependency.dependencyPackageId,
      kind: dependency.dependencyClass,
      displayName: dependency.dependencyPackageId,
    });
  }
  params.store.upsertPackageRelease({
    releaseId,
    packageId,
    version,
    manifestJson: fs.readFileSync(manifestPath, "utf8"),
    channel: params.channel || "stable",
    status: "published",
    publishedAtMs: params.publishedAtMs,
  });
  params.store.replacePackageReleaseDependencies(releaseId, dependencies);
  params.store.upsertPackageReleaseVariant({
    variantId,
    releaseId,
    targetOs,
    targetArch,
    packageFormat: "tar.gz",
    tarballPath,
    sha256: digest,
    sizeBytes: stats.size,
  });

  return {
    ok: true,
    package_id: packageId,
    version,
    release_id: releaseId,
    variant_id: variantId,
    target_os: targetOs,
    target_arch: targetArch,
    tarball_path: tarballPath,
    sha256: digest,
    size_bytes: stats.size,
    product_sync: productSync,
  };
}
