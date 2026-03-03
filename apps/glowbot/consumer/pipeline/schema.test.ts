import { describe, expect, test } from "vitest";
import { GLOWBOT_LEDGER_SCHEMA_SQL, GLOWBOT_LEDGER_TABLES } from "./schema";

describe("GLOWBOT_LEDGER_SCHEMA_SQL", () => {
  test("locks required table names from DATA_PIPELINE spec", () => {
    const tableNames = Object.values(GLOWBOT_LEDGER_TABLES);
    for (const tableName of tableNames) {
      expect(GLOWBOT_LEDGER_SCHEMA_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  test("includes key unique constraints used by pipeline writes", () => {
    expect(GLOWBOT_LEDGER_SCHEMA_SQL).toContain(
      "UNIQUE(date, adapter_id, metric_name, metadata_key)",
    );
    expect(GLOWBOT_LEDGER_SCHEMA_SQL).toContain("UNIQUE(period_start, period_end, step_name)");
    expect(GLOWBOT_LEDGER_SCHEMA_SQL).toContain("UNIQUE(period, clinic_profile, metric_name)");
  });
});
