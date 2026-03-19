import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FrontdoorStore } from "./frontdoor-store.js";

export type PublishAdapterReleaseParams = {
  store: FrontdoorStore;
  packageRoot: string;
  tarballPath: string;
  targetOs?: string;
  targetArch?: string;
  channel?: string;
  publishedAtMs?: number;
};

export type PublishAdapterReleaseResult = {
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

function validateHostingPolicy(
  hosting: { required_server_class?: unknown; deployment_class?: unknown } | undefined,
  manifestPath: string,
): void {
  if (!hosting) {
    return;
  }
  if (
    hosting.required_server_class !== undefined &&
    hosting.required_server_class !== "standard" &&
    hosting.required_server_class !== "compliant"
  ) {
    throw new Error(`invalid hosting.required_server_class in ${manifestPath}`);
  }
  if (
    hosting.deployment_class !== undefined &&
    hosting.deployment_class !== "customer_server" &&
    hosting.deployment_class !== "product_control_plane"
  ) {
    throw new Error(`invalid hosting.deployment_class in ${manifestPath}`);
  }
}

export async function publishAdapterRelease(
  params: PublishAdapterReleaseParams,
): Promise<PublishAdapterReleaseResult> {
  const packageRoot = path.resolve(params.packageRoot);
  const tarballPath = path.resolve(params.tarballPath);
  const manifestPath = path.join(packageRoot, "adapter.nexus.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing adapter manifest: ${manifestPath}`);
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
    hosting?: {
      required_server_class?: unknown;
      deployment_class?: unknown;
    };
  };
  const packageId = String(manifest.id ?? "").trim();
  const version = String(manifest.version ?? "").trim();
  const displayName = String(manifest.displayName ?? manifest.name ?? packageId).trim();
  const description = String(manifest.description ?? "").trim() || undefined;
  if (!packageId || !version || !displayName) {
    throw new Error(`invalid adapter manifest in ${manifestPath}`);
  }
  validateHostingPolicy(manifest.hosting, manifestPath);

  const targetOs = params.targetOs?.trim() || process.platform;
  const targetArch = params.targetArch?.trim() || process.arch;
  const releaseId = `rel-${packageId}-${version}`;
  const variantId = `variant-${packageId}-${version}-${targetOs}-${targetArch}`;
  const stats = fs.statSync(tarballPath);
  const digest = await sha256(tarballPath);

  params.store.upsertPackage({
    packageId,
    kind: "adapter",
    displayName,
    description,
  });
  params.store.upsertPackageRelease({
    releaseId,
    packageId,
    version,
    manifestJson: fs.readFileSync(manifestPath, "utf8"),
    channel: params.channel || "stable",
    status: "published",
    publishedAtMs: params.publishedAtMs,
  });
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
  };
}
