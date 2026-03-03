import path from "node:path";
import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

/**
 * GlowBot Upgrade Hook
 *
 * Called when the app is upgraded to a new version.
 * Runs database migrations and version-specific upgrade logic.
 */
export default async function onUpgrade(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Upgrading app to version ${ctx.app.version}...`);

  const dbPath = path.join(ctx.app.dataDir, "glowbot.db");

  try {
    // Dynamically import better-sqlite3
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);

    // Get current schema version
    let currentVersion = "1.0.0";
    try {
      const versionTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
      if (versionTable) {
        const versionRow = db.prepare("SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1").get() as { version: string } | undefined;
        if (versionRow) {
          currentVersion = versionRow.version;
        }
      } else {
        // Create schema_version table if it doesn't exist
        db.exec(`
          CREATE TABLE IF NOT EXISTS schema_version (
            version TEXT NOT NULL,
            applied_at TEXT NOT NULL
          );
          INSERT INTO schema_version (version, applied_at) VALUES ('1.0.0', datetime('now'));
        `);
      }
    } catch (err) {
      console.warn("[GlowBot] Could not read schema version, assuming 1.0.0");
    }

    console.log(`[GlowBot] Current schema version: ${currentVersion}`);
    console.log(`[GlowBot] Target app version: ${ctx.app.version}`);

    // Run migrations based on version
    const migrations = getMigrations(currentVersion, ctx.app.version);

    if (migrations.length === 0) {
      console.log("[GlowBot] No migrations needed");
    } else {
      console.log(`[GlowBot] Running ${migrations.length} migration(s)...`);

      for (const migration of migrations) {
        console.log(`[GlowBot] Applying migration: ${migration.version} - ${migration.description}`);

        db.exec(migration.sql);

        // Record migration
        db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))").run(migration.version);

        console.log(`[GlowBot] Migration ${migration.version} applied successfully`);
      }
    }

    db.close();

    // Log upgrade via audit
    try {
      ctx.nex.audit.log("glowbot.upgrade", {
        fromVersion: currentVersion,
        toVersion: ctx.app.version,
        migrationsApplied: migrations.length,
      });
    } catch (err) {
      // Expected to fail in Phase 1 stub
      console.log("[GlowBot] Audit log not available (Phase 1 stub)");
    }

    console.log("[GlowBot] Upgrade complete");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module")) {
      console.warn("[GlowBot] better-sqlite3 not available, skipping database migration");
    } else {
      console.error("[GlowBot] Upgrade failed:", error);
      throw error;
    }
  }
}

/**
 * Migration descriptor
 */
interface Migration {
  version: string;
  description: string;
  sql: string;
}

/**
 * Get migrations to apply between two versions.
 *
 * @param fromVersion - Current schema version
 * @param toVersion - Target app version
 * @returns Array of migrations to apply, in order
 */
function getMigrations(fromVersion: string, toVersion: string): Migration[] {
  // Version-based migration registry
  // Add new migrations here as the schema evolves
  const allMigrations: Migration[] = [
    // Example future migration:
    // {
    //   version: "1.1.0",
    //   description: "Add performance_metrics table",
    //   sql: `
    //     CREATE TABLE IF NOT EXISTS performance_metrics (
    //       id TEXT PRIMARY KEY,
    //       metric_type TEXT NOT NULL,
    //       value REAL NOT NULL,
    //       recorded_at TEXT NOT NULL
    //     );
    //   `
    // },
  ];

  // Filter migrations that need to be applied
  const migrations = allMigrations.filter(m => {
    return compareVersions(m.version, fromVersion) > 0 &&
           compareVersions(m.version, toVersion) <= 0;
  });

  return migrations;
}

/**
 * Simple semantic version comparison.
 *
 * @param v1 - First version
 * @param v2 - Second version
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) {return 1;}
    if (p1 < p2) {return -1;}
  }

  return 0;
}
