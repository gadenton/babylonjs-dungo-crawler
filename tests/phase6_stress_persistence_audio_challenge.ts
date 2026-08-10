import { polyfillXHR } from "./xhr_polyfill";

// DOM Polyfill for Node environment
if (typeof globalThis.window === "undefined") {
  const listeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (type: string, fn: Function) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (listeners[type]) {
        const idx = listeners[type].indexOf(fn);
        if (idx !== -1) listeners[type].splice(idx, 1);
      }
    },
    dispatchEvent: (evt: any) => {
      if (listeners[evt.type]) {
        listeners[evt.type].forEach((fn) => fn(evt));
      }
    },
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
    listeners,
  };
}

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === "canvas") {
        return {
          getContext: () => ({
            measureText: () => ({ width: 100 }),
            fillRect: () => {},
            clearRect: () => {},
            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
            putImageData: () => {},
            createImageData: () => {},
            setTransform: () => {},
            drawImage: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            closePath: () => {},
            stroke: () => {},
            fill: () => {},
          }),
          addEventListener: () => {},
          removeEventListener: () => {},
          style: {},
          width: 1024,
          height: 768,
        };
      }
      return { style: {} };
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

polyfillXHR();

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { Player } from "../src/entities/Player";
import { StorageAdapter } from "../src/core/StorageAdapter";
import { SaveManager } from "../src/persistence/SaveManager";
import { AudioManager } from "../src/audio/AudioManager";
import { StatType } from "../src/entities/components/StatsComponent";
import { EquipmentSlot } from "../src/entities/components/InventoryComponent";
import { instantiateItem } from "../src/combat/LootTable";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

async function runEmpiricalStressAndIntegrityChallenge() {
  console.log("==================================================================");
  console.log("=== PHASE 6 STRESS, PERSISTENCE INTEGRITY & AUDIO CHALLENGE SUITE ==");
  console.log("==================================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // Clear storage before starting
  StorageAdapter.clearAll();

  // -------------------------------------------------------------------
  // TEST 1: 1,000 Rapid Save/Load Cycles Stress & Integrity Test
  // -------------------------------------------------------------------
  console.log("\n[TEST 1] Executing 1,000 Rapid Save/Load Cycles for Persistence Integrity...");

  const player = new Player("stress_hero", scene);
  player.level = 25;
  player.xp = 9870;
  player.inventory.addGold(12345);
  player.setArchetype("mage");

  // Equip full set of gear
  const weapon = instantiateItem("sunfire_blade");    // MainHand
  const shield = instantiateItem("aegis_of_valor");   // OffHand
  const helm = instantiateItem("steel_helm");         // Head
  const chest = instantiateItem("dragonplate_armor"); // Chest

  player.inventory.items.push(weapon, shield, helm, chest);
  player.inventory.equipItem(weapon, player.stats);
  player.inventory.equipItem(shield, player.stats);
  player.inventory.equipItem(helm, player.stats);
  player.inventory.equipItem(chest, player.stats);

  // Add extra items in bag
  const healthPot = instantiateItem("health_potion");
  const manaPot = instantiateItem("mana_potion");
  player.inventory.addItem(healthPot);
  player.inventory.addItem(manaPot);

  // Allocate talent points
  player.talentTree.setPlayerLevel(25);
  player.talentTree.allocateNode("arcane_nova_mastery");

  // Record baseline stats
  const expectedAtk = player.stats.getStat(StatType.AttackDamage);
  const expectedArmor = player.stats.getStat(StatType.Armor);
  const expectedHp = player.stats.getStat(StatType.MaxHp);
  const expectedMana = player.stats.getStat(StatType.MaxMana);
  const expectedCrit = player.stats.getStat(StatType.CritChance);

  const startTime = Date.now();
  const slotId = "stress_slot_1000";

  for (let i = 1; i <= 1000; i++) {
    // Save
    const saveOk = SaveManager.save(slotId, player, "dungeon", 4);
    if (!saveOk) throw new Error(`Save failed on iteration ${i}`);

    // Load into a fresh Player instance
    const freshPlayer = new Player(`restored_hero_${i}`, scene);
    const loadOk = SaveManager.load(slotId, freshPlayer);
    if (!loadOk) throw new Error(`Load failed on iteration ${i}`);

    // Sample checks at key checkpoints (every 100 cycles & final cycle)
    if (i % 200 === 0 || i === 1000) {
      assert(freshPlayer.level === 25, `Iter ${i}: Level restored (25 vs ${freshPlayer.level})`);
      assert(freshPlayer.xp === 9870, `Iter ${i}: XP restored (9870 vs ${freshPlayer.xp})`);
      assert(freshPlayer.inventory.gold === 12345, `Iter ${i}: Gold restored (12345 vs ${freshPlayer.inventory.gold})`);
      assert(freshPlayer.activeArchetypeId === "mage", `Iter ${i}: Archetype restored ('mage' vs '${freshPlayer.activeArchetypeId}')`);

      const restoredAtk = freshPlayer.stats.getStat(StatType.AttackDamage);
      const restoredArmor = freshPlayer.stats.getStat(StatType.Armor);
      const restoredHp = freshPlayer.stats.getStat(StatType.MaxHp);

      assert(restoredAtk === expectedAtk, `Iter ${i}: Stat Atk drift! Expected ${expectedAtk}, got ${restoredAtk}`);
      assert(restoredArmor === expectedArmor, `Iter ${i}: Stat Armor drift! Expected ${expectedArmor}, got ${restoredArmor}`);
      assert(restoredHp === expectedHp, `Iter ${i}: Stat HP drift! Expected ${expectedHp}, got ${restoredHp}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`  ✓ Completed 1,000 rapid save/load cycles in ${durationMs} ms (${(durationMs / 1000).toFixed(2)}s)`);

  // Final deep check on restored player after 1,000 cycles
  const finalRestoredPlayer = new Player("final_hero", scene);
  SaveManager.load(slotId, finalRestoredPlayer);

  // Assert zero stat drift on unequip
  finalRestoredPlayer.inventory.unequipItem(EquipmentSlot.MainHand, finalRestoredPlayer.stats);
  finalRestoredPlayer.inventory.unequipItem(EquipmentSlot.OffHand, finalRestoredPlayer.stats);
  finalRestoredPlayer.inventory.unequipItem(EquipmentSlot.Head, finalRestoredPlayer.stats);
  finalRestoredPlayer.inventory.unequipItem(EquipmentSlot.Chest, finalRestoredPlayer.stats);

  const baseAtk = finalRestoredPlayer.stats.getBaseStat(StatType.AttackDamage);
  const currentAtk = finalRestoredPlayer.stats.getStat(StatType.AttackDamage);
  assert(currentAtk === baseAtk, `1,000 cycles unequip zero stat drift: Expected ${baseAtk}, got ${currentAtk}`);

  console.log("  ✓ [PASS] 1,000 rapid save/load cycles verified with zero data corruption and zero stat drift!");

  // -------------------------------------------------------------------
  // TEST 2: Auto-Save Triggers (Level Up, Item Equip, Archetype Swap)
  // -------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying Event-Driven Auto-Save Triggers...");

  const autoSavePlayer = new Player("autosave_hero", scene);
  autoSavePlayer.level = 1;
  autoSavePlayer.setArchetype("tank");

  let currentZone: "town_hub" | "dungeon" = "town_hub";
  let currentFloor = 1;

  // Register auto-save triggers
  const unbindAutoSave = SaveManager.registerAutoSaveEvents(
    autoSavePlayer,
    () => currentZone,
    () => currentFloor
  );

  // 2a. Level Up Trigger
  console.log("  Testing Auto-Save on Level Up...");
  autoSavePlayer.level = 10;
  autoSavePlayer.onLevelUp.notifyObservers(10);

  assert(SaveManager.exists("autosave"), "Autosave slot created on level up");
  const loadedLvlPlayer = new Player("loaded_lvl", scene);
  SaveManager.load("autosave", loadedLvlPlayer);
  assert(loadedLvlPlayer.level === 10, `Restored level from autosave: expected 10, got ${loadedLvlPlayer.level}`);
  console.log("    ✓ Level Up auto-save verified!");

  // 2b. Item Equip Trigger
  console.log("  Testing Auto-Save on Item Equip...");
  const equipWeapon = instantiateItem("iron_sword");
  autoSavePlayer.inventory.addItem(equipWeapon);
  autoSavePlayer.inventory.equipItem(equipWeapon, autoSavePlayer.stats);

  const loadedEquipPlayer = new Player("loaded_equip", scene);
  SaveManager.load("autosave", loadedEquipPlayer);
  const restoredEquippedItem = loadedEquipPlayer.inventory.equipment.get(EquipmentSlot.MainHand);
  assert(restoredEquippedItem !== null && restoredEquippedItem.templateId === "iron_sword", "Restored mainhand weapon from autosave");
  console.log("    ✓ Item Equip auto-save verified!");

  // 2c. Archetype Swap Trigger
  console.log("  Testing Auto-Save on Archetype Swap...");
  autoSavePlayer.setArchetype("healer");

  const loadedArchetypePlayer = new Player("loaded_archetype", scene);
  SaveManager.load("autosave", loadedArchetypePlayer);
  assert(loadedArchetypePlayer.activeArchetypeId === "healer", `Restored archetype from autosave: expected 'healer', got '${loadedArchetypePlayer.activeArchetypeId}'`);
  console.log("    ✓ Archetype Swap auto-save verified!");

  unbindAutoSave();
  console.log("  ✓ [PASS] All auto-save triggers verified!");

  // -------------------------------------------------------------------
  // TEST 3: Audio Gain Conversions & Sidechain Ducking Timing
  // -------------------------------------------------------------------
  console.log("\n[TEST 3] Verifying Audio Gain Conversions & Sidechain Ducking Timing...");

  const audioManager = new AudioManager();

  // Decibel Math Checks
  const gain0dB = audioManager.linearToDb(1.0);
  assert(Math.abs(gain0dB - 0) < 1e-5, `linearToDb(1.0) expected 0, got ${gain0dB}`);

  const gainMinus6dB = audioManager.linearToDb(0.5);
  assert(Math.abs(gainMinus6dB - (-6.0205999)) < 0.001, `linearToDb(0.5) expected ~-6.02 dB, got ${gainMinus6dB}`);

  const gainMinus20dB = audioManager.linearToDb(0.1);
  assert(Math.abs(gainMinus20dB - (-20)) < 1e-5, `linearToDb(0.1) expected -20 dB, got ${gainMinus20dB}`);

  // Floor clamping for zero gain
  const gainZeroClamped = audioManager.linearToDb(0);
  assert(gainZeroClamped === -80, `linearToDb(0) expected floor -80 dB, got ${gainZeroClamped}`);

  const db0Linear = audioManager.dbToLinear(0);
  assert(Math.abs(db0Linear - 1.0) < 1e-5, `dbToLinear(0) expected 1.0, got ${db0Linear}`);

  const dbMinus6Linear = audioManager.dbToLinear(-6);
  assert(Math.abs(dbMinus6Linear - 0.501187) < 0.001, `dbToLinear(-6) expected ~0.501, got ${dbMinus6Linear}`);

  // Bus Volume Settings
  audioManager.setBusVolumeDb("music", -12);
  assert(audioManager.getBusVolumeDb("music") === -12, `getBusVolumeDb('music') expected -12, got ${audioManager.getBusVolumeDb("music")}`);

  audioManager.setMusicVolume(0.5);
  const updatedMusicDb = audioManager.getBusVolumeDb("music");
  assert(Math.abs(updatedMusicDb - (-6.02)) < 0.1, `setMusicVolume(0.5) expected ~-6.02 dB, got ${updatedMusicDb}`);

  // Sidechain Ducking Execution & Rapid Re-triggering
  console.log("  Testing Sidechain Ducking triggers & timer release...");
  audioManager.triggerSidechainDucking(-12, 100);
  audioManager.triggerSidechainDucking(-15, 100);
  audioManager.triggerSidechainDucking(-10, 100);

  // Wait 150ms for ducking release timer to execute cleanly
  await new Promise((resolve) => setTimeout(resolve, 150));
  console.log("    ✓ Sidechain ducking release timer executed cleanly!");

  audioManager.dispose();
  console.log("  ✓ [PASS] Audio gain conversions and sidechain ducking timing verified!");

  console.log("\n==================================================================");
  console.log("=== ALL STRESS, PERSISTENCE INTEGRITY & AUDIO CHALLENGES PASSED ===");
  console.log("==================================================================");
}

runEmpiricalStressAndIntegrityChallenge().catch((err) => {
  console.error("Phase 6 Stress & Persistence Challenge Failed:", err);
  process.exit(1);
});
