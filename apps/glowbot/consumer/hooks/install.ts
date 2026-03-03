import path from "node:path";
import type { NexAppHookContext } from "../../../../nex/src/apps/context.js";

/**
 * GlowBot Installation Hook
 *
 * Called when the app is first installed on a server/tenant.
 * Creates the SQLite database and initializes schema.
 */
export default async function onInstall(ctx: NexAppHookContext): Promise<void> {
  console.log(`[GlowBot] Installing app version ${ctx.app.version}...`);
  console.log(`[GlowBot] Data directory: ${ctx.app.dataDir}`);

  const dbPath = path.join(ctx.app.dataDir, "glowbot.db");

  try {
    // Dynamically import better-sqlite3
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath);

    console.log(`[GlowBot] Created database at ${dbPath}`);

    // Create schema tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS metrics_daily (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metadata_key TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON metrics_daily(date);
      CREATE INDEX IF NOT EXISTS idx_metrics_daily_adapter ON metrics_daily(adapter_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_daily_metric ON metrics_daily(metric_name);

      CREATE TABLE IF NOT EXISTS funnel_snapshots (
        id TEXT PRIMARY KEY,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        step_name TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        step_value REAL NOT NULL,
        prev_step_value REAL,
        conversion_rate REAL,
        peer_median REAL,
        delta_vs_peer REAL,
        source_breakdown TEXT,
        computed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_funnel_snapshots_period ON funnel_snapshots(period_start, period_end);
      CREATE INDEX IF NOT EXISTS idx_funnel_snapshots_step ON funnel_snapshots(step_name);

      CREATE TABLE IF NOT EXISTS recommendations (
        id TEXT PRIMARY KEY,
        rank INTEGER NOT NULL,
        title TEXT NOT NULL,
        delta_value REAL NOT NULL,
        delta_unit TEXT NOT NULL,
        description TEXT,
        confidence TEXT NOT NULL,
        category TEXT NOT NULL,
        reasoning TEXT,
        action_data TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations(created_at);
      CREATE INDEX IF NOT EXISTS idx_recommendations_rank ON recommendations(rank);

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        phase TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        metrics_computed INTEGER DEFAULT 0,
        recommendations_generated INTEGER DEFAULT 0,
        duration INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at);
      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);

      CREATE TABLE IF NOT EXISTS modeling_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        period_label TEXT NOT NULL,
        period_start TEXT NOT NULL,
        your_value REAL NOT NULL,
        peer_median REAL,
        peer_band_low REAL,
        peer_band_high REAL
      );

      CREATE INDEX IF NOT EXISTS idx_modeling_series_model ON modeling_series(model_name);
      CREATE INDEX IF NOT EXISTS idx_modeling_series_period ON modeling_series(period_start);
    `);

    console.log("[GlowBot] Database schema created successfully");

    // Seed initial demo data if configured
    const seedDemo = ctx.app.config.seedDemoData === true;
    if (seedDemo) {
      console.log("[GlowBot] Seeding demo data...");

      // Insert sample pipeline run
      db.prepare(`
        INSERT INTO pipeline_runs (id, status, phase, started_at, completed_at, metrics_computed, recommendations_generated, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'demo-run-001',
        'completed',
        'recommendations',
        new Date().toISOString(),
        new Date().toISOString(),
        5,
        3,
        1500
      );

      console.log("[GlowBot] Demo data seeded");
    }

    db.close();

    // Log installation via audit (stub in Phase 1, but good to call)
    try {
      ctx.nex.audit.log("glowbot.install", {
        version: ctx.app.version,
        dataDir: ctx.app.dataDir,
        dbPath,
        seedDemo,
      });
    } catch (err) {
      // Expected to fail in Phase 1 stub
      console.log("[GlowBot] Audit log not available (Phase 1 stub)");
    }

    console.log("[GlowBot] Installation complete");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module")) {
      console.warn("[GlowBot] better-sqlite3 not available, skipping database creation");
      console.warn("[GlowBot] Install better-sqlite3 to enable full functionality");
    } else {
      console.error("[GlowBot] Installation failed:", error);
      throw error;
    }
  }
}
