import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SaveManager } from "../src/persistence/SaveManager";
import { StorageAdapter } from "../src/core/StorageAdapter";

describe("Empirical Challenger Stage 1: SaveManager.getMostRecentSave()", () => {
  const slots = ["autosave", "slot_1", "slot_2", "slot_3"];

  beforeEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  afterEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  it("Scenario 1: Unsorted timestamps across slots", () => {
    const createSaveRaw = (slotId: string, timestamp: number, level: number) => {
      const json = JSON.stringify({
        version: 1,
        timestamp,
        slotId,
        data: {
          player: { level, activeArchetypeId: "rogue" },
          inventory: { gold: 100 },
        },
      });
      (StorageAdapter as any).setItem(SaveManager.getSaveKey(slotId), json);
    };

    createSaveRaw("autosave", 1000, 1);
    createSaveRaw("slot_1", 5000, 5); // Highest timestamp
    createSaveRaw("slot_2", 3000, 3);
    createSaveRaw("slot_3", 4000, 4);

    const recent = SaveManager.getMostRecentSave();
    expect(recent).not.toBeNull();
    expect(recent?.slotId).toBe("slot_1");
    expect(recent?.metadata.timestamp).toBe(5000);
    expect(recent?.metadata.level).toBe(5);
  });

  it("Scenario 2: Autosave vs slot_1 timestamps (autosave newer)", () => {
    const createSaveRaw = (slotId: string, timestamp: number) => {
      const json = JSON.stringify({
        version: 1,
        timestamp,
        slotId,
        data: {
          player: { level: 10, activeArchetypeId: "mage" },
          inventory: { gold: 500 },
        },
      });
      (StorageAdapter as any).setItem(SaveManager.getSaveKey(slotId), json);
    };

    createSaveRaw("slot_1", 10000);
    createSaveRaw("autosave", 20000); // Newer

    const recent = SaveManager.getMostRecentSave();
    expect(recent?.slotId).toBe("autosave");
    expect(recent?.metadata.timestamp).toBe(20000);
  });

  it("Scenario 3: Missing slot metadata / corrupted player object", () => {
    const json = JSON.stringify({
      version: 1,
      timestamp: 30000,
      slotId: "slot_2",
      data: {}, // Missing player/inventory objects
    });
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("slot_2"), json);

    const recent = SaveManager.getMostRecentSave();
    expect(recent).not.toBeNull();
    expect(recent?.slotId).toBe("slot_2");
    expect(recent?.metadata.level).toBe(1); // Default fallback
    expect(recent?.metadata.archetype).toBe("tank"); // Default fallback
    expect(recent?.metadata.gold).toBe(0); // Default fallback
  });

  it("Scenario 4: Corrupted main slot JSON with valid .bak backup file", () => {
    // Primary slot file is corrupted JSON
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("slot_1"), "{corrupted_json_data...");

    // Backup slot file is valid JSON with timestamp 50000
    const backupJson = JSON.stringify({
      version: 1,
      timestamp: 50000,
      slotId: "slot_1",
      data: {
        player: { level: 20, activeArchetypeId: "tank" },
        inventory: { gold: 999 },
      },
    });
    (StorageAdapter as any).setItem(`${SaveManager.getSaveKey("slot_1")}_bak`, backupJson);

    // Also put an older valid save in autosave
    const autosaveJson = JSON.stringify({
      version: 1,
      timestamp: 10000,
      slotId: "autosave",
      data: {
        player: { level: 2, activeArchetypeId: "mage" },
        inventory: { gold: 50 },
      },
    });
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("autosave"), autosaveJson);

    const metadata = SaveManager.getMetadata("slot_1");
    const recent = SaveManager.getMostRecentSave();

    // Verify whether getMetadata and getMostRecentSave properly fall back to .bak when primary file is corrupted JSON
    expect(metadata).not.toBeNull();
    expect(recent?.slotId).toBe("slot_1");
    expect(recent?.metadata.timestamp).toBe(50000);
  });

  it("Scenario 5: Non-numeric or missing timestamps", () => {
    // Slot 1: Missing timestamp
    const json1 = JSON.stringify({
      version: 1,
      slotId: "slot_1",
      data: { player: { level: 5 } },
    });
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("slot_1"), json1);

    // Slot 2: String timestamp
    const json2 = JSON.stringify({
      version: 1,
      timestamp: "100000",
      slotId: "slot_2",
      data: { player: { level: 5 } },
    });
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("slot_2"), json2);

    // Slot 3: Valid timestamp
    const json3 = JSON.stringify({
      version: 1,
      timestamp: 500,
      slotId: "slot_3",
      data: { player: { level: 5 } },
    });
    (StorageAdapter as any).setItem(SaveManager.getSaveKey("slot_3"), json3);

    const recent = SaveManager.getMostRecentSave();
    expect(recent?.slotId).toBe("slot_3");
    expect(recent?.metadata.timestamp).toBe(500);
  });
});
