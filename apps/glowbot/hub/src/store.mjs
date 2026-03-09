import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE = {
  managedProfiles: [],
  productFlags: [],
  cohorts: [],
  seeds: [],
  snapshots: [],
  auditEvents: [],
};

export class GlowbotHubStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, "hub-state.json");
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.write(DEFAULT_STATE);
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        managedProfiles: Array.isArray(parsed?.managedProfiles) ? parsed.managedProfiles : [],
        productFlags: Array.isArray(parsed?.productFlags) ? parsed.productFlags : [],
        cohorts: Array.isArray(parsed?.cohorts) ? parsed.cohorts : [],
        seeds: Array.isArray(parsed?.seeds) ? parsed.seeds : [],
        snapshots: Array.isArray(parsed?.snapshots) ? parsed.snapshots : [],
        auditEvents: Array.isArray(parsed?.auditEvents) ? parsed.auditEvents : [],
      };
    } catch {
      this.write(DEFAULT_STATE);
      return structuredClone(DEFAULT_STATE);
    }
  }

  write(state) {
    fs.writeFileSync(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  update(updater) {
    const current = this.read();
    const next = updater(current);
    this.write(next);
    return next;
  }
}
