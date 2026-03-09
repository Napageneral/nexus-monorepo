import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadClinicProfile, saveClinicProfile } from "./store.js";

const tempDirs: string[] = [];

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glowbot-clinic-profile-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("clinic profile store", () => {
  test("returns null when no clinic profile has been saved", () => {
    expect(loadClinicProfile(makeDataDir())).toBeNull();
  });

  test("saves and loads canonical clinic profiles with unknown defaults", () => {
    const dataDir = makeDataDir();

    const saved = saveClinicProfile({
      dataDir,
      clinicId: "clinic-123",
      updates: {
        specialty: "med-spa",
      },
    });

    expect(saved.clinicId).toBe("clinic-123");
    expect(saved.specialty).toBe("med-spa");
    expect(saved.monthlyAdSpendBand).toBe("unknown");
    expect(saved.patientVolumeBand).toBe("unknown");
    expect(saved.locationCountBand).toBe("unknown");
    expect(saved.source.version).toBe(1);

    const loaded = loadClinicProfile(dataDir);
    expect(loaded).toEqual(saved);
  });

  test("increments version when the profile is updated", () => {
    const dataDir = makeDataDir();

    saveClinicProfile({
      dataDir,
      clinicId: "clinic-123",
      updates: {
        specialty: "med-spa",
        monthlyAdSpendBand: "10k-25k",
      },
    });

    const updated = saveClinicProfile({
      dataDir,
      clinicId: "clinic-123",
      updates: {
        specialty: "med-spa",
        patientVolumeBand: "100-250",
      },
    });

    expect(updated.source.version).toBe(2);
    expect(updated.monthlyAdSpendBand).toBe("10k-25k");
    expect(updated.patientVolumeBand).toBe("100-250");
  });
});
