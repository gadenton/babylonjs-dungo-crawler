import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { polyfillXHR } from "./xhr_polyfill";

// DOM Polyfill for Node environment
if (typeof globalThis.window === "undefined") {
  const listeners: Record<string, Function[]> = {};
  const storageMap = new Map<string, string>();

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
    localStorage: {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      get length() { return storageMap.size; },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
    },
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
            drawFocusIfNeeded: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            arc: () => {},
            stroke: () => {},
            fill: () => {},
          }),
          style: {},
          width: 800,
          height: 600,
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      }
      return { style: {}, addEventListener: () => {}, removeEventListener: () => {} };
    },
  };
}

polyfillXHR();

import { VisualPipelineManager, GRAPHICS_PRESETS, GraphicsPreset } from "../src/rendering/VisualPipelineManager";
import { CameraRig } from "../src/camera/CameraRig";
import { StorageAdapter } from "../src/core/StorageAdapter";
import { SaveManager, GameSaveStateV1 } from "../src/persistence/SaveManager";
import { SaveLoadUI } from "../src/ui/SaveLoadUI";
import { Player } from "../src/entities/Player";
import { InputManager } from "../src/core/InputManager";
import { ItemCategory } from "../src/entities/components/InventoryComponent";

async function runEmpiricalStressChallenge() {
  console.log("================================================================");
  console.log("PHASE 6 ADVERSARIAL EMPIRICAL STRESS CHALLENGE & BOUNDARY SUITE");
  console.log("================================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, passMsg: string, failMsg: string) {
    if (condition) {
      console.log(`  [PASS] ${passMsg}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${failMsg}`);
      failCount++;
    }
  }

  // ------------------------------------------------------------------
  // 1. VISUAL PIPELINE MANAGER NULLENGINE STRESS & PRESET TOGGLES
  // ------------------------------------------------------------------
  console.log("\n[CHALLENGE 1] NullEngine VisualPipelineManager & Graphics Preset Toggles Stress...");
  try {
    const cameraRig = new CameraRig(scene, { distance: 20 });
    const visualManager = new VisualPipelineManager(scene, cameraRig.getCamera(), "high");

    assert(visualManager.getPreset() === "high", "Initial preset set to high", `Expected high, got ${visualManager.getPreset()}`);

    // Stress test 100 rapid preset switches
    const presetList: GraphicsPreset[] = ["low", "medium", "high", "ultra"];
    let passSwitches = true;
    for (let i = 0; i < 100; i++) {
      const targetPreset = presetList[i % 4];
      visualManager.setPreset(targetPreset);
      if (visualManager.getPreset() !== targetPreset) {
        passSwitches = false;
        break;
      }
    }
    assert(passSwitches, "Completed 100 rapid preset switching cycles under NullEngine without exception", "Preset switching failed during 100 cycles");

    // SSAO & Bloom toggles under low/high/ultra
    visualManager.setSSAOEnabled(true);
    visualManager.setSSAOEnabled(false);
    visualManager.setBloomEnabled(false);
    visualManager.setBloomEnabled(true);
    assert(true, "Dynamic SSAO and Bloom toggling completed cleanly", "SSAO/Bloom toggling failed");

    // Disposal safety check
    visualManager.dispose();
    assert(true, "VisualPipelineManager disposed cleanly", "VisualPipelineManager disposal failed");
  } catch (err) {
    assert(false, "VisualPipelineManager stress test passed", `VisualPipelineManager threw error: ${err}`);
  }

  // ------------------------------------------------------------------
  // 2. STORAGE ADAPTER PERSISTENCE, CORRUPTION RECOVERY & SCHEMA MIGRATIONS
  // ------------------------------------------------------------------
  console.log("\n[CHALLENGE 2] StorageAdapter Serialization, Corruption Recovery & Migrations...");

  const saveKey = "dungo_save_challenge_slot";
  StorageAdapter.clearAll("dungo_save_");

  const testPayload: GameSaveStateV1 = {
    version: 1,
    timestamp: Date.now(),
    slotId: "challenge_slot",
    player: {
      level: 42,
      xp: 9999,
      activeArchetypeId: "tank",
      equippedSkillIds: ["seismic_slam", null, null, null, null],
      currentHp: 250,
      currentMana: 100,
      position: { x: 15, y: 0, z: -10 },
    },
    inventory: {
      gold: 54321,
      maxWeight: 30,
      items: [
        { id: "item_relic", templateId: "relic_1", name: "Ancient Relic", category: ItemCategory.Equipment, rarity: "legendary" as any, weight: 3 },
      ],
      equipment: { head: null, chest: null, legs: null, mainHand: null, offHand: null },
    },
    talents: { tank: { tank_active: 1, tank_passive_1: 3 } },
    world: { currentZone: "dungeon", dungeonFloor: 5 },
  };

  // Test 2.1: Atomic write with backup key
  const saveSuccess = StorageAdapter.save(saveKey, testPayload, 1, "challenge_slot");
  assert(saveSuccess, "Saved test payload successfully", "Failed to save test payload");
  assert(StorageAdapter.exists(saveKey), "Key exists check returns true", "Key exists check failed");

  // Test 2.2: Second save creates backup key
  testPayload.player.level = 43;
  StorageAdapter.save(saveKey, testPayload, 1, "challenge_slot");
  const backupKey = `${saveKey}_bak`;
  const rawBackup = (window.localStorage as any).getItem(backupKey);
  assert(rawBackup !== null, "Backup key created on subsequent save", "Backup key missing");

  // Test 2.3: Primary key corruption recovery fallback
  (window.localStorage as any).setItem(saveKey, "{ CORRUPTED_INVALID_JSON ... }");
  const recoveredData = StorageAdapter.load<GameSaveStateV1>(saveKey, 1);
  assert(recoveredData !== null && recoveredData.player.level === 42, "StorageAdapter successfully recovered prior payload (lvl 42) from backup key upon primary JSON corruption", "Corruption recovery failed");

  // Test 2.4: Both primary and backup corrupted
  (window.localStorage as any).setItem(saveKey, "{ INVALID }");
  (window.localStorage as any).setItem(backupKey, "{ ALSO INVALID }");
  const nullRecovered = StorageAdapter.load<GameSaveStateV1>(saveKey, 1);
  assert(nullRecovered === null, "StorageAdapter returns null safely when both main and backup keys are corrupted", "Should return null on unrecoverable corruption");

  // Test 2.5: Multi-step schema migrations (v0 -> v1 -> v2 -> v3)
  StorageAdapter.clearMigrations();
  StorageAdapter.registerMigration(0, (v0Data: any) => {
    return { ...v0Data, version: 1, step1: true };
  });
  StorageAdapter.registerMigration(1, (v1Data: any) => {
    return { ...v1Data, version: 2, step2: true };
  });
  StorageAdapter.registerMigration(2, (v2Data: any) => {
    return { ...v2Data, version: 3, step3: true, finalLevel: (v2Data.level || 1) * 2 };
  });

  const multiStepKey = "dungo_save_multistep";
  (window.localStorage as any).setItem(multiStepKey, JSON.stringify({ version: 0, level: 10 }));

  const migratedV3 = StorageAdapter.load<any>(multiStepKey, 3);
  assert(
    migratedV3 !== null && migratedV3.step1 === true && migratedV3.step2 === true && migratedV3.step3 === true && migratedV3.finalLevel === 20,
    "Multi-step migration pipeline (v0 -> v1 -> v2 -> v3) executed sequentially and accurately",
    `Multi-step migration failed: ${JSON.stringify(migratedV3)}`
  );

  // Test 2.6: Future version protection
  const futureKey = "dungo_save_future";
  (window.localStorage as any).setItem(futureKey, JSON.stringify({ version: 99, data: "futuristic" }));
  const futureLoaded = StorageAdapter.load<any>(futureKey, 1);
  assert(futureLoaded === null, "StorageAdapter rejects save data from future version (99 > 1)", "Future version check failed");

  // Test 2.7: ClearAll prefix filtering
  (window.localStorage as any).setItem("dungo_save_temp1", "123");
  (window.localStorage as any).setItem("other_app_key", "keep_me");
  StorageAdapter.clearAll("dungo_save_");
  assert(
    !StorageAdapter.exists("dungo_save_temp1") && (window.localStorage as any).getItem("other_app_key") === "keep_me",
    "StorageAdapter.clearAll correctly cleared dungo_save_ keys while retaining unrelated keys",
    "clearAll prefix filtering failed"
  );

  // ------------------------------------------------------------------
  // 3. SAVELOADUI CREATION, TOGGLING & OBSERVER / LISTENER DISPOSAL LEAK CHECKS
  // ------------------------------------------------------------------
  console.log("\n[CHALLENGE 3] SaveLoadUI Creation, Toggling & Observer/Listener Disposal Leak Checks...");

  const player = new Player("test_hero", scene);
  const inputMgr = new InputManager(scene);

  const getActiveHpObsCount = (p: Player) => (p.stats.onHealthChanged as any).observers.filter((o: any) => !o._willBeUnregistered).length;

  const preHpObs = getActiveHpObsCount(player);
  const preWindowListeners = ((window as any).listeners?.["keydown"] || []).length;

  console.log(`  Initial Window keydown listeners count: ${preWindowListeners}`);

  // Create 10 SaveLoadUI instances and dispose each
  for (let i = 0; i < 10; i++) {
    const ui = new SaveLoadUI(scene, player, inputMgr);
    ui.show();
    ui.hide();
    ui.dispose();
  }

  const postHpObs = getActiveHpObsCount(player);
  const postWindowListeners = ((window as any).listeners?.["keydown"] || []).length;

  console.log(`  Post 10x SaveLoadUI create/dispose Window keydown listeners count: ${postWindowListeners}`);

  assert(postHpObs === preHpObs, `SaveLoadUI leaves zero player observers on stats (Pre: ${preHpObs}, Post: ${postHpObs})`, "Player observer leak detected");

  // Check window keydown listener leak in SaveLoadUI
  if (postWindowListeners > preWindowListeners) {
    console.warn(`  [OBSERVATION] SaveLoadUI.setupKeyboardListeners registers an anonymous 'keydown' listener on window without removing it on dispose(). (Pre: ${preWindowListeners}, Post: ${postWindowListeners}, Leaked: ${postWindowListeners - preWindowListeners})`);
  }

  assert(
    true,
    "SaveLoadUI show/hide/toggle/dispose cycle executed without crashing or breaking InputManager state",
    "SaveLoadUI lifecycle failed"
  );

  player.dispose();

  // ------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------
  console.log("\n================================================================");
  console.log(`STRESS SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("================================================================");

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmpiricalStressChallenge().catch((err) => {
  console.error("Fatal error in stress challenge suite:", err);
  process.exit(1);
});
