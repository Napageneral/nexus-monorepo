import fs from "node:fs";
import path from "node:path";
import { FrontdoorStore } from "./frontdoor-store.js";

// ── Manifest Types (inline — we don't import from nex package) ─────

interface ManifestPlan {
  id: string;
  displayName: string;
  priceMonthly: number;
  priceYearly?: number;
  isDefault?: boolean;
  sortOrder?: number;
  features?: string[];
  limits?: Record<string, string>;
}

interface ManifestProduct {
  tagline?: string;
  accentColor?: string;
  logoSvg?: string;
  homepageUrl?: string;
  onboardingOrigin?: string;
  plans?: ManifestPlan[];
}

interface AppManifest {
  id: string;
  version: string;
  displayName: string;
  description?: string;
  icon?: string;
  product?: ManifestProduct;
}

// ── Result Type ────────────────────────────────────────────────────

export interface ProductSyncResult {
  appId: string;
  productsUpserted: number;
  plansUpserted: number;
  plansArchived: number;
  changes: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

const MANIFEST_FILENAME = "app.nexus.json";

function readManifest(manifestPath: string): AppManifest {
  const absolutePath = path.resolve(manifestPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Manifest file not found: ${absolutePath}`);
  }
  const raw = fs.readFileSync(absolutePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse manifest JSON at ${absolutePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Manifest at ${absolutePath} is not a JSON object`);
  }
  return parsed as AppManifest;
}

function tryReadSvg(packageDir: string, relativePath: string | undefined): string | undefined {
  if (!relativePath) {
    return undefined;
  }
  const absolutePath = path.resolve(packageDir, relativePath);
  try {
    if (!fs.existsSync(absolutePath)) {
      return undefined;
    }
    const content = fs.readFileSync(absolutePath, "utf-8");
    // Basic sanity check — SVG files should not be excessively large
    if (content.length > 100_000) {
      console.warn(`Warning: SVG file is very large (${content.length} bytes): ${absolutePath}`);
    }
    return content;
  } catch {
    return undefined;
  }
}

// ── Core Sync Function ─────────────────────────────────────────────

export async function syncProductFromManifest(
  store: FrontdoorStore,
  manifestPath: string,
): Promise<ProductSyncResult> {
  const resolvedManifestPath = path.resolve(manifestPath);
  const packageDir = path.dirname(resolvedManifestPath);

  // 1. Parse manifest
  const manifest = readManifest(resolvedManifestPath);

  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error("Manifest is missing required 'id' field");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("Manifest is missing required 'version' field");
  }
  if (!manifest.displayName || typeof manifest.displayName !== "string") {
    throw new Error("Manifest is missing required 'displayName' field");
  }

  const result: ProductSyncResult = {
    appId: manifest.id,
    productsUpserted: 0,
    plansUpserted: 0,
    plansArchived: 0,
    changes: [],
  };

  // 2. Check for product section
  if (!manifest.product) {
    result.changes.push(`${manifest.id}: no product section in manifest, skipping`);
    return result;
  }

  const product = manifest.product;

  // 3. Read SVG files
  const logoSvg = tryReadSvg(packageDir, product.logoSvg);
  const iconSvg = tryReadSvg(packageDir, manifest.icon);

  if (product.logoSvg && !logoSvg) {
    result.changes.push(`${manifest.id}: logo SVG not found at ${product.logoSvg}`);
  }
  if (manifest.icon && !iconSvg) {
    result.changes.push(`${manifest.id}: icon SVG not found at ${manifest.icon}`);
  }

  // 4. Upsert product record
  store.upsertProduct({
    productId: manifest.id,
    displayName: manifest.displayName,
    tagline: product.tagline,
    accentColor: product.accentColor,
    logoSvg: logoSvg,
    iconSvg: iconSvg,
    manifestVersion: manifest.version,
    homepageUrl: product.homepageUrl,
    onboardingOrigin: product.onboardingOrigin,
  });
  result.productsUpserted = 1;
  result.changes.push(`${manifest.id}: upserted product "${manifest.displayName}" (v${manifest.version})`);

  // 5. Upsert plans
  const manifestPlanIds = new Set<string>();
  const plans = product.plans ?? [];

  for (const plan of plans) {
    if (!plan.id || typeof plan.id !== "string") {
      result.changes.push(`${manifest.id}: skipping plan with missing 'id'`);
      continue;
    }
    if (!plan.displayName || typeof plan.displayName !== "string") {
      result.changes.push(`${manifest.id}: skipping plan "${plan.id}" with missing 'displayName'`);
      continue;
    }

    manifestPlanIds.add(plan.id);

    store.upsertProductPlan({
      planId: plan.id,
      productId: manifest.id,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly ?? 0,
      priceYearly: plan.priceYearly,
      isDefault: plan.isDefault ?? false,
      sortOrder: plan.sortOrder ?? 0,
      featuresJson: plan.features ? JSON.stringify(plan.features) : undefined,
      limitsJson: plan.limits ? JSON.stringify(plan.limits) : undefined,
      // NOTE: stripePriceIdMonthly and stripePriceIdYearly are NOT set here.
      // They are operator config and are preserved by the upsert's COALESCE logic.
    });
    result.plansUpserted++;
    result.changes.push(`${manifest.id}: upserted plan "${plan.id}" (${plan.displayName})`);
  }

  // 6. Archive plans that are in the database but NOT in the manifest
  const existingPlanIds = store.getProductPlanIds(manifest.id);
  for (const existingPlanId of existingPlanIds) {
    if (!manifestPlanIds.has(existingPlanId)) {
      // Check if it's already archived
      const existingPlan = store.getProductPlan(existingPlanId);
      if (existingPlan && existingPlan.status !== "archived") {
        store.archiveProductPlan(existingPlanId);
        result.plansArchived++;
        result.changes.push(`${manifest.id}: archived plan "${existingPlanId}" (no longer in manifest)`);
      }
    }
  }

  return result;
}

// ── CLI Entry Point ────────────────────────────────────────────────

export async function runProductSyncCli(args: string[]): Promise<void> {
  let packagePath: string | undefined;
  let databasePath: string | undefined;

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--database" || arg === "-d") {
      databasePath = args[++i];
      if (!databasePath) {
        console.error("Error: --database requires a path argument");
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      packagePath = arg;
    }
  }

  if (!packagePath) {
    console.error("Error: no app package path provided\n");
    printUsage();
    process.exit(1);
  }

  if (!databasePath) {
    console.error("Error: --database <path> is required\n");
    printUsage();
    process.exit(1);
  }

  // Resolve the manifest path
  const resolvedPackagePath = path.resolve(packagePath);
  let manifestPath: string;

  try {
    const stat = fs.statSync(resolvedPackagePath);
    if (stat.isDirectory()) {
      manifestPath = path.join(resolvedPackagePath, MANIFEST_FILENAME);
    } else {
      manifestPath = resolvedPackagePath;
    }
  } catch {
    console.error(`Error: path does not exist: ${resolvedPackagePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  // Open the database
  const resolvedDbPath = path.resolve(databasePath);
  const store = new FrontdoorStore(resolvedDbPath);

  try {
    const result = await syncProductFromManifest(store, manifestPath);

    console.log(`\nProduct sync complete for "${result.appId}":`);
    console.log(`  Products upserted: ${result.productsUpserted}`);
    console.log(`  Plans upserted:    ${result.plansUpserted}`);
    console.log(`  Plans archived:    ${result.plansArchived}`);
    if (result.changes.length > 0) {
      console.log(`\nChanges:`);
      for (const change of result.changes) {
        console.log(`  - ${change}`);
      }
    }
  } finally {
    store.close();
  }
}

function printUsage(): void {
  console.log(`Usage: npx tsx src/product-sync.ts <path-to-app-package> --database <path-to-frontdoor.db>

Syncs product data from an app.nexus.json manifest into the frontdoor product registry.

Arguments:
  <path-to-app-package>   Path to the app package directory (containing app.nexus.json)
                          or direct path to the manifest file

Options:
  --database, -d <path>   Path to the frontdoor SQLite database (required)
  --help, -h              Show this help message`);
}

// ── Auto-run when executed directly ────────────────────────────────

// Detect if this file is being run directly (not imported)
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("product-sync.ts") || process.argv[1].endsWith("product-sync.js"));

if (isMainModule) {
  // Skip the first two args (node/tsx and the script path)
  runProductSyncCli(process.argv.slice(2)).catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
