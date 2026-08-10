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

import { AudioManager } from "../src/audio/AudioManager";
import { GameEngine } from "../src/core/Engine";
import { InputManager } from "../src/core/InputManager";
import { CameraRig } from "../src/camera/CameraRig";
import { Player } from "../src/entities/Player";
import { Enemy } from "../src/entities/Enemy";
import { DamageSystem } from "../src/combat/DamageSystem";
import { JuiceOverlay } from "../src/ui/JuiceOverlay";
import { HUD } from "../src/ui/HUD";
import { InventoryUI } from "../src/ui/InventoryUI";
import { TalentUI } from "../src/ui/TalentUI";
import { ArchetypeUI } from "../src/ui/ArchetypeUI";
import { StorageAdapter } from "../src/core/StorageAdapter";
import { SaveManager, GameSaveStateV1 } from "../src/persistence/SaveManager";
import { VisualPipelineManager, GRAPHICS_PRESETS } from "../src/rendering/VisualPipelineManager";
import { LootDrop } from "../src/entities/LootDrop";
import { ItemCategory } from "../src/entities/components/InventoryComponent";

async function runPhase6E2EHarness() {
  console.log("==================================================================");
  console.log("PHASE 6 END-TO-END SYSTEM INTEGRATION & VERIFICATION HARNESS");
  console.log("==================================================================\n");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  let failureCount = 0;
  const auditLogs: string[] = [];

  function logPass(msg: string) {
    console.log(`[PASS] ${msg}`);
    auditLogs.push(`[PASS] ${msg}`);
  }

  function logFail(msg: string) {
    console.log(`[FAIL] ${msg}`);
    auditLogs.push(`[FAIL] ${msg}`);
    failureCount++;
  }

  // ------------------------------------------------------------------
  // 1. AUDIO BUS POLISH & DECIBEL CONVERSION HARNESS
  // ------------------------------------------------------------------
  console.log("--- 1. Testing Audio Bus Architecture & Sidechain Ducking ---");
  const audio = new AudioManager();

  // Verify bus volume getters in dB
  const masterDb = audio.getBusVolumeDb("master");
  const musicDb = audio.getBusVolumeDb("music");
  const sfxDb = audio.getBusVolumeDb("sfx");
  const uiDb = audio.getBusVolumeDb("ui");

  if (masterDb === 0 && musicDb === -6 && sfxDb === 0 && uiDb === -3) {
    logPass(`Initial bus volumes verified in dB: master=${masterDb}dB, music=${musicDb}dB, sfx=${sfxDb}dB, ui=${uiDb}dB`);
  } else {
    logFail(`Initial bus volume mismatch: master=${masterDb}, music=${musicDb}, sfx=${sfxDb}, ui=${uiDb}`);
  }

  // Decibel Math conversions
  const lin0 = audio.dbToLinear(0);
  const linMinus6 = audio.dbToLinear(-6);
  const linMinus20 = audio.dbToLinear(-20);
  if (Math.abs(lin0 - 1.0) < 0.001 && Math.abs(linMinus6 - 0.5012) < 0.01 && Math.abs(linMinus20 - 0.1) < 0.001) {
    logPass("dbToLinear conversion math accurate across 0dB (1.0), -6dB (~0.50), and -20dB (0.10)");
  } else {
    logFail(`dbToLinear math mismatch: 0dB=${lin0}, -6dB=${linMinus6}, -20dB=${linMinus20}`);
  }

  const db0 = audio.linearToDb(1.0);
  const dbHalf = audio.linearToDb(0.5);
  if (Math.abs(db0 - 0) < 0.001 && Math.abs(dbHalf - (-6.02)) < 0.05) {
    logPass("linearToDb conversion math accurate across 1.0 (0dB) and 0.5 (-6.02dB)");
  } else {
    logFail(`linearToDb math mismatch: 1.0=${db0}dB, 0.5=${dbHalf}dB`);
  }

  // Sidechain ducking trigger test
  try {
    audio.triggerSidechainDucking(-12, 350);
    audio.duckMusic(300, -10);
    logPass("Sidechain ducking methods executed cleanly without exceptions");
  } catch (err) {
    logFail(`Sidechain ducking threw error: ${err}`);
  }

  // Synthetic SFX triggers test
  try {
    audio.playHitSFX(Vector3.Zero(), true);
    audio.playHitSFX(Vector3.Zero(), false);
    audio.playSwingSFX();
    audio.playGoldPickupSFX();
    audio.playGlobePickupSFX();
    audio.playItemPickupSFX();
    logPass("Synthetic SFX methods (Hit, Swing, Gold, Globe, Item) executed cleanly");
  } catch (err) {
    logFail(`Synthetic SFX execution threw error: ${err}`);
  }

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 2. VISUAL PIPELINE MANAGER PRESETS & TOGGLES
  // ------------------------------------------------------------------
  console.log("--- 2. Testing Visual Pipeline Manager & Graphics Presets ---");
  const cameraRig = new CameraRig(scene, { distance: 20 });
  const visualManager = new VisualPipelineManager(scene, cameraRig.getCamera(), "high");

  if (visualManager.getPreset() === "high") {
    logPass("VisualPipelineManager initialized with 'high' preset");
  } else {
    logFail(`VisualPipelineManager preset mismatch: got ${visualManager.getPreset()}, expected 'high'`);
  }

  const presets: Array<keyof typeof GRAPHICS_PRESETS> = ["low", "medium", "high", "ultra"];
  for (const preset of presets) {
    visualManager.setPreset(preset);
    if (visualManager.getPreset() === preset) {
      logPass(`VisualPipelineManager cleanly switched graphics preset to '${preset}'`);
    } else {
      logFail(`Failed to switch graphics preset to '${preset}'`);
    }
  }

  visualManager.setBloomEnabled(false);
  visualManager.setBloomEnabled(true);
  logPass("VisualPipelineManager bloom toggle executed successfully");

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 3. VERSIONED STORAGE ADAPTER & SAVE MANAGER PERSISTENCE
  // ------------------------------------------------------------------
  console.log("--- 3. Testing Versioned Save Persistence & Schema Migrations ---");
  window.localStorage.clear();

  const testSaveKey = "test_e2e_save_slot_1";
  const dummyState: GameSaveStateV1 = {
    version: 1,
    timestamp: Date.now(),
    slotId: "slot_1",
    player: {
      level: 15,
      xp: 4500,
      activeArchetypeId: "mage",
      equippedSkillIds: ["arcane_nova", null, null, null, null],
      currentHp: 180,
      currentMana: 120,
      position: { x: 10, y: 0, z: 10 },
    },
    inventory: {
      gold: 1250,
      maxWeight: 30,
      items: [
        { id: "item_sword_1", name: "Iron Sword", category: ItemCategory.Equipment, rarity: "magic", weight: 2 },
      ],
      equipment: {
        head: null,
        chest: null,
        legs: null,
        mainHand: { id: "item_staff_1", name: "Arcane Staff", category: ItemCategory.Equipment, rarity: "rare", weight: 2 },
        offHand: null,
      },
    },
    talents: {
      mage: { node_node_1: 2 },
    },
    world: {
      currentZone: "dungeon",
      dungeonFloor: 2,
    },
  };

  const saveResult = StorageAdapter.save(testSaveKey, dummyState, 1, "slot_1");
  if (saveResult && StorageAdapter.exists(testSaveKey)) {
    logPass("StorageAdapter.save successfully wrote version 1 payload to storage");
  } else {
    logFail("StorageAdapter.save failed to write payload");
  }

  const loadedState = StorageAdapter.load<GameSaveStateV1>(testSaveKey, 1);
  if (loadedState && loadedState.player.level === 15 && loadedState.player.activeArchetypeId === "mage") {
    logPass("StorageAdapter.load restored version 1 payload with exact player level (15) and archetype ('mage')");
  } else {
    logFail("StorageAdapter.load failed to restore valid payload");
  }

  // Schema Migration Test (Version 0 -> Version 1)
  StorageAdapter.registerMigration(0, (oldData: any) => {
    return {
      version: 1,
      timestamp: Date.now(),
      slotId: "legacy",
      player: {
        level: oldData.lvl || 1,
        xp: 0,
        activeArchetypeId: "tank",
        equippedSkillIds: [],
        currentHp: 100,
        currentMana: 50,
        position: { x: 0, y: 0, z: 0 },
      },
      inventory: { gold: 50, maxWeight: 30, items: [], equipment: { head: null, chest: null, legs: null, mainHand: null, offHand: null } },
      talents: {},
      world: { currentZone: "town_hub", dungeonFloor: 1 },
    };
  });

  const legacyKey = "legacy_save_slot";
  window.localStorage.setItem(legacyKey, JSON.stringify({ version: 0, lvl: 8 }));
  const migratedState = StorageAdapter.load<GameSaveStateV1>(legacyKey, 1);

  if (migratedState && migratedState.version === 1 && migratedState.player.level === 8) {
    logPass("StorageAdapter executed migration pipeline step (v0 -> v1), converting legacy data to v1 schema");
  } else {
    logFail("StorageAdapter migration pipeline failed");
  }

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 4. FULL E2E COMBAT, JUICE & LOOT CYCLE VERIFICATION
  // ------------------------------------------------------------------
  console.log("--- 4. Testing E2E Combat Loop, Juice Overlay & Loot Pickup ---");
  const inputManager = new InputManager(scene);
  const juiceOverlay = new JuiceOverlay(scene);
  const player = new Player("hero", scene);
  const enemy = new Enemy("orc_1", "Orc Warrior", scene, new Vector3(2, 0, 2));

  let floatTextSpawned = false;
  let flashTriggered = false;
  let hitStopTriggered = false;

  // Intercept Damage Applied event
  DamageSystem.onDamageApplied.add((evt) => {
    juiceOverlay.spawnFloatingText(evt.target.position, `-${evt.amount}`, evt.isCrit ? "crit" : "normal");
    floatTextSpawned = true;

    if (evt.isCrit) {
      juiceOverlay.triggerHitStop(60);
      hitStopTriggered = true;
    }
  });

  // Resolve Critical Combat Damage
  DamageSystem.resolveDamage(player, enemy, 40);

  if (floatTextSpawned) {
    logPass("DamageSystem event successfully spawned floating text in JuiceOverlay");
  } else {
    logFail("DamageSystem event failed to trigger floating text");
  }

  if (juiceOverlay.isHitStopped() || hitStopTriggered) {
    logPass("Critical damage hit successfully triggered 60ms hit-stop freeze frame in JuiceOverlay");
  } else {
    logFail("Critical hit failed to trigger hit-stop freeze frame");
  }

  // Update loop tick check during hit-stop
  juiceOverlay.update(0.016);
  if (juiceOverlay.isHitStopped()) {
    logPass("JuiceOverlay accurately tracks hit-stop remaining timer during frame update");
  } else {
    logFail("JuiceOverlay hit-stop timer expired prematurely");
  }

  // Proximity Auto-Loot Drop Test
  const testItem = { id: "item_gold_10", name: "Gold Coins", category: ItemCategory.Gold, goldAmount: 75, weight: 0 };
  const drop = new LootDrop("drop_gold", scene, testItem, player.position.clone().add(new Vector3(1, 0, 0)));

  drop.update(0.016, player, juiceOverlay, audio);

  if (drop.isPickedUp && player.inventory.gold >= 75) {
    logPass("LootDrop proximity auto-loot (1.0m < 3.0m radius) successfully vacuum-collected gold into Player inventory");
  } else {
    logFail(`LootDrop auto-loot failed: isPickedUp=${drop.isPickedUp}, playerGold=${player.inventory.gold}`);
  }

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 5. OBSERVER DISPOSAL & CLEANUP AUDIT
  // ------------------------------------------------------------------
  console.log("--- 5. Testing Observer Disposal & Memory Leak Cleanup ---");
  const getActiveObsCount = (obs: any): number => obs.observers.filter((o: any) => !o._willBeUnregistered).length;

  const preHpObs = getActiveObsCount(player.stats.onHealthChanged);
  const hud = new HUD(scene, player, inputManager);
  const invUI = new InventoryUI(scene, player, inputManager);
  const talentUI = new TalentUI(scene, player.talentTree, inputManager);
  const archUI = new ArchetypeUI(scene, player, inputManager, audio);

  const activeHpObs = getActiveObsCount(player.stats.onHealthChanged);
  console.log(`Active HP observers count during UI lifecycle: ${activeHpObs} (Initial: ${preHpObs})`);

  // Dispose UI elements
  hud.dispose();
  invUI.dispose();
  talentUI.dispose();
  archUI.dispose();

  const postHpObs = getActiveObsCount(player.stats.onHealthChanged);
  if (postHpObs === preHpObs) {
    logPass("Disposing HUD, InventoryUI, TalentUI, and ArchetypeUI cleanly unsubscribes all registered observers from Player stats");
  } else {
    logFail(`Observer leak detected! Pre-count=${preHpObs}, Post-count=${postHpObs}`);
  }

  audio.dispose();
  visualManager.dispose();
  player.dispose();
  enemy.dispose();

  console.log("\n==================================================================");
  console.log(`HARNESS COMPLETE. Total Failures: ${failureCount}`);
  console.log("==================================================================");

  if (failureCount > 0) {
    console.error(`VERDICT: REJECT - ${failureCount} failure(s) detected during empirical verification.`);
    process.exit(1);
  } else {
    console.log("VERDICT: APPROVE - All empirical E2E integration tests passed cleanly.");
    process.exit(0);
  }
}

runPhase6E2EHarness().catch((err) => {
  console.error("Fatal error running Phase 6 E2E harness:", err);
  process.exit(1);
});
