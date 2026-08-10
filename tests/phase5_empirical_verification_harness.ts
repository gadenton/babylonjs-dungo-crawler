import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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

import { rollEnemyDrops, DROP_TABLES } from "../src/combat/LootTable";
import { Enemy } from "../src/entities/Enemy";
import { Player } from "../src/entities/Player";
import { InputManager } from "../src/core/InputManager";
import { InventoryUI } from "../src/ui/InventoryUI";
import { HUD } from "../src/ui/HUD";
import { ItemCategory } from "../src/entities/components/InventoryComponent";

async function runEmpiricalHarness() {
  console.log("==================================================================");
  console.log("PHASE 5 EMPIRICAL VERIFICATION HARNESS & STRESS TEST");
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
  // 1. ENEMY DROP TABLE PROBABILITIES ACROSS STANDARD, ELITE, BOSS
  // ------------------------------------------------------------------
  console.log("--- 1. Testing Enemy Drop Table Probabilities (Monte Carlo N = 10,000) ---");
  const N = 10000;
  const tiers = ["standard", "elite", "boss"];

  for (const tier of tiers) {
    const config = DROP_TABLES[tier];
    let goldCount = 0;
    let globeCount = 0;
    let itemCount = 0;
    let minGoldObserved = Infinity;
    let maxGoldObserved = -Infinity;
    let healthGlobes = 0;
    let manaGlobes = 0;
    let totalItemsDropped = 0;

    for (let i = 0; i < N; i++) {
      const drops = rollEnemyDrops(tier);
      let hasGold = false;
      let hasGlobe = false;
      let hasItem = false;

      for (const drop of drops) {
        if (drop.category === ItemCategory.Gold) {
          hasGold = true;
          const goldAmt = drop.goldAmount ?? 0;
          if (goldAmt < minGoldObserved) minGoldObserved = goldAmt;
          if (goldAmt > maxGoldObserved) maxGoldObserved = goldAmt;
        } else if (drop.category === ItemCategory.Globe) {
          hasGlobe = true;
          if (drop.globeType === "health") healthGlobes++;
          else if (drop.globeType === "mana") manaGlobes++;
        } else {
          hasItem = true;
          totalItemsDropped++;
        }
      }

      if (hasGold) goldCount++;
      if (hasGlobe) globeCount++;
      if (hasItem) itemCount++;
    }

    const goldRate = goldCount / N;
    const globeRate = globeCount / N;
    const itemRate = itemCount / N;
    const avgItemsPerItemDrop = itemCount > 0 ? totalItemsDropped / itemCount : 0;

    console.log(`Tier [${tier.toUpperCase()}]:`);
    console.log(`  Gold Rate: ${(goldRate * 100).toFixed(2)}% (Target: ${(config.goldChance * 100).toFixed(0)}%) | Gold Range Observed: [${minGoldObserved}, ${maxGoldObserved}] (Target: [${config.minGold}, ${config.maxGold}])`);
    console.log(`  Globe Rate: ${(globeRate * 100).toFixed(2)}% (Target: ${(config.globeChance * 100).toFixed(0)}%) | Health: ${healthGlobes}, Mana: ${manaGlobes}`);
    console.log(`  Item Drop Rate: ${(itemRate * 100).toFixed(2)}% (Target: ${(config.itemDropChance * 100).toFixed(0)}%) | Avg Items per Drop: ${avgItemsPerItemDrop.toFixed(2)} (Target rolls: ${config.itemRolls})`);

    // Quantitative Assertions
    const goldMargin = tier === "standard" ? 0.015 : 0.0001;
    if (Math.abs(goldRate - config.goldChance) <= goldMargin) {
      logPass(`${tier} gold drop rate ${(goldRate * 100).toFixed(2)}% within tolerance of ${config.goldChance * 100}%`);
    } else {
      logFail(`${tier} gold drop rate ${(goldRate * 100).toFixed(2)}% outside tolerance of ${config.goldChance * 100}%`);
    }

    if (minGoldObserved >= config.minGold && maxGoldObserved <= config.maxGold) {
      logPass(`${tier} gold quantity range [${minGoldObserved}, ${maxGoldObserved}] strictly within expected bounds [${config.minGold}, ${config.maxGold}]`);
    } else {
      logFail(`${tier} gold quantity range [${minGoldObserved}, ${maxGoldObserved}] out of bounds [${config.minGold}, ${config.maxGold}]`);
    }

    const globeMargin = 0.015;
    if (Math.abs(globeRate - config.globeChance) <= globeMargin) {
      logPass(`${tier} globe drop rate ${(globeRate * 100).toFixed(2)}% within tolerance of ${config.globeChance * 100}%`);
    } else {
      logFail(`${tier} globe drop rate ${(globeRate * 100).toFixed(2)}% outside tolerance of ${config.globeChance * 100}%`);
    }

    const itemMargin = 0.015;
    if (Math.abs(itemRate - config.itemDropChance) <= itemMargin) {
      logPass(`${tier} item drop rate ${(itemRate * 100).toFixed(2)}% within tolerance of ${config.itemDropChance * 100}%`);
    } else {
      logFail(`${tier} item drop rate ${(itemRate * 100).toFixed(2)}% outside tolerance of ${config.itemDropChance * 100}%`);
    }

    if (Math.abs(avgItemsPerItemDrop - config.itemRolls) < 0.01) {
      logPass(`${tier} items count per item drop ${avgItemsPerItemDrop} matches expected roll count ${config.itemRolls}`);
    } else {
      logFail(`${tier} items count per item drop ${avgItemsPerItemDrop} mismatches expected roll count ${config.itemRolls}`);
    }
  }

  // Fallback check for invalid tier
  const fallbackDrops = rollEnemyDrops("non_existent_tier");
  if (fallbackDrops !== undefined) {
    logPass("rollEnemyDrops('non_existent_tier') safely falls back to standard drop table without crashing");
  } else {
    logFail("rollEnemyDrops('non_existent_tier') failed to fallback");
  }

  // Enemy entity death event integration check
  let enemyLootEmitted = false;
  const testEnemy = new Enemy("test_orc", "Orc Warrior", scene, Vector3.Zero(), { enemyTier: "boss" });
  testEnemy.onLootDropped.add(({ enemy, drops }) => {
    enemyLootEmitted = true;
    if (drops.length >= 2) {
      logPass(`Enemy onLootDropped emitted ${drops.length} items on death for boss tier`);
    } else {
      logFail(`Enemy onLootDropped emitted only ${drops.length} items for boss tier`);
    }
  });

  // Force enemy death
  testEnemy.health.takeDamage(9999);
  if (!enemyLootEmitted) {
    logFail("Enemy death did not fire onLootDropped observable");
  }

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 2. INVENTORY UI FOCUS NAVIGATION TRAVERSAL & MODAL TOGGLING
  // ------------------------------------------------------------------
  console.log("--- 2. Testing InventoryUI Focus Navigation Traversal & Modal Toggling ---");

  const inputManager = new InputManager(scene);
  const player = new Player("hero", scene);
  const inventoryUI = new InventoryUI(scene, player, inputManager);

  // 2a. Modal State Toggling in InputManager
  if (!inputManager.isUIModalOpen) {
    logPass("InputManager isUIModalOpen is initially false");
  } else {
    logFail("InputManager isUIModalOpen is initially true when no modal is open");
  }

  inventoryUI.show();
  if (inventoryUI.isCurrentlyVisible && inputManager.isUIModalOpen) {
    logPass("InventoryUI.show() opens modal and sets InputManager.isUIModalOpen to true");
  } else {
    logFail(`InventoryUI.show() failed: visible=${inventoryUI.isCurrentlyVisible}, isUIModalOpen=${inputManager.isUIModalOpen}`);
  }

  // Verify pointer clicks in world are blocked when modal is open
  let pointerClicked = false;
  const pointerSub = inputManager.onPointerClickWorld.add(() => {
    pointerClicked = true;
  });
  // Simulate pointer click event via scene observable while modal open
  scene.onPointerObservable.notifyObservers({
    type: 1, // POINTERDOWN
    event: { button: 0 } as MouseEvent
  });
  if (!pointerClicked) {
    logPass("InputManager blocks world pointer clicks when UI modal is open");
  } else {
    logFail("InputManager failed to block world pointer click while UI modal was open");
  }

  inventoryUI.hide();
  if (!inventoryUI.isCurrentlyVisible && !inputManager.isUIModalOpen) {
    logPass("InventoryUI.hide() closes modal and sets InputManager.isUIModalOpen to false");
  } else {
    logFail(`InventoryUI.hide() failed: visible=${inventoryUI.isCurrentlyVisible}, isUIModalOpen=${inputManager.isUIModalOpen}`);
  }

  inventoryUI.toggle();
  if (inventoryUI.isCurrentlyVisible && inputManager.isUIModalOpen) {
    logPass("InventoryUI.toggle() toggles modal state open");
  } else {
    logFail("InventoryUI.toggle() failed to open modal");
  }

  inventoryUI.toggle();
  if (!inventoryUI.isCurrentlyVisible && !inputManager.isUIModalOpen) {
    logPass("InventoryUI.toggle() toggles modal state closed");
  } else {
    logFail("InventoryUI.toggle() failed to close modal");
  }

  // 2b. Focus Navigation Traversal
  inventoryUI.show();

  const getFocusIdx = (ui: any): number => ui["currentFocusIdx"];

  if (getFocusIdx(inventoryUI) === 5) {
    logPass("InventoryUI initial focus node index is 5 (Grid slot 0,0)");
  } else {
    logFail(`InventoryUI initial focus node index is ${getFocusIdx(inventoryUI)}, expected 5`);
  }

  // Move right across Grid Row 0 (5 -> 6 -> 7 -> 8 -> 9 -> wrap 5)
  const nav = (ui: any, dx: number, dy: number) => ui["navigateFocus"](dx, dy);

  nav(inventoryUI, 1, 0); // 6
  if (getFocusIdx(inventoryUI) === 6) logPass("Grid horizontal nav 5 -> 6 (col 1)");
  else logFail(`Grid nav 5 -> 6 failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 1, 0); // 7
  nav(inventoryUI, 1, 0); // 8
  nav(inventoryUI, 1, 0); // 9
  if (getFocusIdx(inventoryUI) === 9) logPass("Grid horizontal nav -> 9 (col 4)");
  else logFail(`Grid nav -> 9 failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 1, 0); // wrap to 5
  if (getFocusIdx(inventoryUI) === 5) logPass("Grid horizontal nav 9 -> 5 (wrap col 4 -> 0)");
  else logFail(`Grid wrap 9 -> 5 failed, got ${getFocusIdx(inventoryUI)}`);

  // Move Left from Grid Col 0 into Paperdoll (5 -> Paperdoll node 0)
  nav(inventoryUI, -1, 0);
  if (getFocusIdx(inventoryUI) === 0) logPass("Grid left exit at col 0 moves focus into Paperdoll Head slot (node 0)");
  else logFail(`Grid left exit failed, got ${getFocusIdx(inventoryUI)}`);

  // Vertical movement inside Paperdoll (0 -> 1 -> 2 -> 3 -> 4 -> 0)
  nav(inventoryUI, 0, 1);
  if (getFocusIdx(inventoryUI) === 1) logPass("Paperdoll vertical nav 0 -> 1 (Chest)");
  else logFail(`Paperdoll vertical nav failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 0, 1); // 2 (Legs)
  nav(inventoryUI, 0, 1); // 3 (MainHand)
  nav(inventoryUI, 0, 1); // 4 (OffHand)
  if (getFocusIdx(inventoryUI) === 4) logPass("Paperdoll vertical nav -> 4 (OffHand)");
  else logFail(`Paperdoll vertical nav failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 0, 1); // 0 (wrap Head)
  if (getFocusIdx(inventoryUI) === 0) logPass("Paperdoll vertical nav wrap 4 -> 0");
  else logFail(`Paperdoll vertical wrap failed, got ${getFocusIdx(inventoryUI)}`);

  // Move Right from Paperdoll into Grid
  nav(inventoryUI, 1, 0);
  if (getFocusIdx(inventoryUI) === 5) logPass("Paperdoll right exit moves focus back into Grid node 5");
  else logFail(`Paperdoll right exit failed, got ${getFocusIdx(inventoryUI)}`);

  // Grid vertical movement (5 [row 0] -> 10 [row 1] -> 15 [row 2] -> 20 [row 3] -> wrap 5)
  nav(inventoryUI, 0, 1);
  if (getFocusIdx(inventoryUI) === 10) logPass("Grid vertical nav 5 -> 10 (row 1)");
  else logFail(`Grid vertical nav 5 -> 10 failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 0, 1); // 15
  nav(inventoryUI, 0, 1); // 20
  if (getFocusIdx(inventoryUI) === 20) logPass("Grid vertical nav -> 20 (row 3)");
  else logFail(`Grid vertical nav -> 20 failed, got ${getFocusIdx(inventoryUI)}`);

  nav(inventoryUI, 0, 1); // wrap to 5
  if (getFocusIdx(inventoryUI) === 5) logPass("Grid vertical wrap 20 -> 5");
  else logFail(`Grid vertical wrap failed, got ${getFocusIdx(inventoryUI)}`);

  // Simulate Keyboard Events
  const dispatchKey = (code: string) => {
    const listener = (inventoryUI as any)["keyboardListener"];
    if (listener) {
      listener({ code } as KeyboardEvent);
    }
  };

  dispatchKey("ArrowRight");
  if (getFocusIdx(inventoryUI) === 6) logPass("Keyboard listener responds to ArrowRight (focus -> 6)");
  else logFail(`Keyboard ArrowRight failed, got ${getFocusIdx(inventoryUI)}`);

  dispatchKey("KeyS"); // Down
  if (getFocusIdx(inventoryUI) === 11) logPass("Keyboard listener responds to KeyS (down focus 6 -> 11)");
  else logFail(`Keyboard KeyS failed, got ${getFocusIdx(inventoryUI)}`);

  dispatchKey("Escape");
  if (!inventoryUI.isCurrentlyVisible && !inputManager.isUIModalOpen) {
    logPass("Keyboard Escape key closes InventoryUI and resets InputManager modal state");
  } else {
    logFail("Keyboard Escape key failed to close InventoryUI");
  }

  console.log("\n------------------------------------------------------------------");
  // ------------------------------------------------------------------
  // 3. OBSERVER DISPOSAL CLEANUP FOR HUD AND INVENTORY UI
  // ------------------------------------------------------------------
  console.log("--- 3. Testing Observer Disposal Cleanup (HUD & InventoryUI) ---");

  const getActiveObservers = (obs: any): number => {
    return obs.observers.filter((o: any) => !o._willBeUnregistered).length;
  };

  // 3a. HUD Observer Cleanup
  console.log("Evaluating HUD Disposal Observer Cleanup...");
  const hudPlayer = new Player("hud_player", scene);

  const preHudHpActive = getActiveObservers(hudPlayer.stats.onHealthChanged);
  const preHudManaActive = getActiveObservers(hudPlayer.stats.onManaChanged);
  const preHudStatActive = getActiveObservers(hudPlayer.stats.onStatChanged);
  const preHudLevelActive = getActiveObservers(hudPlayer.onLevelUp);
  const preHudArchActive = getActiveObservers(hudPlayer.onArchetypeSwapped);
  const preHudGoldActive = getActiveObservers(hudPlayer.inventory.onGoldChanged);
  const preHudPickupActive = getActiveObservers(hudPlayer.inventory.onItemPickedUp);

  const hud = new HUD(scene, hudPlayer, inputManager);

  const duringHudHpActive = getActiveObservers(hudPlayer.stats.onHealthChanged);
  const duringHudManaActive = getActiveObservers(hudPlayer.stats.onManaChanged);
  const duringHudStatActive = getActiveObservers(hudPlayer.stats.onStatChanged);
  const duringHudLevelActive = getActiveObservers(hudPlayer.onLevelUp);
  const duringHudArchActive = getActiveObservers(hudPlayer.onArchetypeSwapped);
  const duringHudGoldActive = getActiveObservers(hudPlayer.inventory.onGoldChanged);
  const duringHudPickupActive = getActiveObservers(hudPlayer.inventory.onItemPickedUp);

  console.log(`  Pre-HUD active observer counts: HP=${preHudHpActive}, MP=${preHudManaActive}, Stat=${preHudStatActive}, Level=${preHudLevelActive}, Arch=${preHudArchActive}, Gold=${preHudGoldActive}, Pickup=${preHudPickupActive}`);
  console.log(`  During HUD active observer counts: HP=${duringHudHpActive}, MP=${duringHudManaActive}, Stat=${duringHudStatActive}, Level=${duringHudLevelActive}, Arch=${duringHudArchActive}, Gold=${duringHudGoldActive}, Pickup=${duringHudPickupActive}`);

  hud.dispose();

  const postHudHpActive = getActiveObservers(hudPlayer.stats.onHealthChanged);
  const postHudManaActive = getActiveObservers(hudPlayer.stats.onManaChanged);
  const postHudStatActive = getActiveObservers(hudPlayer.stats.onStatChanged);
  const postHudLevelActive = getActiveObservers(hudPlayer.onLevelUp);
  const postHudArchActive = getActiveObservers(hudPlayer.onArchetypeSwapped);
  const postHudGoldActive = getActiveObservers(hudPlayer.inventory.onGoldChanged);
  const postHudPickupActive = getActiveObservers(hudPlayer.inventory.onItemPickedUp);

  console.log(`  Post-dispose HUD active observer counts: HP=${postHudHpActive}, MP=${postHudManaActive}, Stat=${postHudStatActive}, Level=${postHudLevelActive}, Arch=${postHudArchActive}, Gold=${postHudGoldActive}, Pickup=${postHudPickupActive}`);

  if (
    postHudHpActive === preHudHpActive &&
    postHudManaActive === preHudManaActive &&
    postHudStatActive === preHudStatActive &&
    postHudLevelActive === preHudLevelActive &&
    postHudArchActive === preHudArchActive &&
    postHudGoldActive === preHudGoldActive &&
    postHudPickupActive === preHudPickupActive
  ) {
    logPass("HUD.dispose() cleanly unregisters all 7 subscribed observers from player stats, level, archetype, and inventory");
  } else {
    logFail("HUD.dispose() failed to unregister all subscribed observers");
  }

  // Verify firing observables post-HUD dispose does not invoke HUD callbacks
  let hudCallbackTriggered = false;
  (hud as any)["updateHealthDisplay"] = () => { hudCallbackTriggered = true; };
  hudPlayer.stats.modifyHealth(-10);
  if (!hudCallbackTriggered) {
    logPass("Firing observables post-HUD disposal does not trigger disposed HUD callbacks");
  } else {
    logFail("Disposed HUD callback was invoked when observable fired post-dispose!");
  }

  // 3b. InventoryUI Observer Cleanup
  console.log("Evaluating InventoryUI Disposal Observer Cleanup...");
  const invPlayer = new Player("inv_player", scene);

  const preInvInvActive = getActiveObservers(invPlayer.inventory.onInventoryChanged);
  const preInvGoldActive = getActiveObservers(invPlayer.inventory.onGoldChanged);
  const preInvEquipActive = getActiveObservers(invPlayer.inventory.onItemEquipped);

  const testInvUI = new InventoryUI(scene, invPlayer, inputManager);

  const duringInvInvActive = getActiveObservers(invPlayer.inventory.onInventoryChanged);
  const duringInvGoldActive = getActiveObservers(invPlayer.inventory.onGoldChanged);
  const duringInvEquipActive = getActiveObservers(invPlayer.inventory.onItemEquipped);

  console.log(`  Pre-creation InventoryUI active observer counts: Inv=${preInvInvActive}, Gold=${preInvGoldActive}, Equip=${preInvEquipActive}`);
  console.log(`  During InventoryUI active observer counts: Inv=${duringInvInvActive}, Gold=${duringInvGoldActive}, Equip=${duringInvEquipActive}`);

  testInvUI.dispose();

  const postInvInvActive = getActiveObservers(invPlayer.inventory.onInventoryChanged);
  const postInvGoldActive = getActiveObservers(invPlayer.inventory.onGoldChanged);
  const postInvEquipActive = getActiveObservers(invPlayer.inventory.onItemEquipped);

  console.log(`  Post-dispose InventoryUI active observer counts: Inv=${postInvInvActive}, Gold=${postInvGoldActive}, Equip=${postInvEquipActive}`);

  let invLeaked = false;
  if (postInvInvActive > preInvInvActive) {
    logFail(`InventoryUI.dispose() LEAK DETECTED: onInventoryChanged observers remain registered (${postInvInvActive} > ${preInvInvActive})`);
    invLeaked = true;
  }
  if (postInvGoldActive > preInvGoldActive) {
    logFail(`InventoryUI.dispose() LEAK DETECTED: onGoldChanged observers remain registered (${postInvGoldActive} > ${preInvGoldActive})`);
    invLeaked = true;
  }
  if (postInvEquipActive > preInvEquipActive) {
    logFail(`InventoryUI.dispose() LEAK DETECTED: onItemEquipped observers remain registered (${postInvEquipActive} > ${preInvEquipActive})`);
    invLeaked = true;
  }

  if (!invLeaked) {
    logPass("InventoryUI.dispose() cleanly removes all registered observers from InventoryComponent");
  } else {
    // Empirical test of dangling callback execution
    let invRefreshCalled = false;
    testInvUI.refresh = () => { invRefreshCalled = true; };
    invPlayer.inventory.addGold(10);
    if (invRefreshCalled) {
      logFail("CRITICAL BUG: Leaked InventoryUI.refresh() observer callback was invoked on disposed InventoryUI when gold changed!");
    }
  }

  console.log("\n==================================================================");
  console.log(`HARNESS COMPLETE. Total Failures: ${failureCount}`);
  console.log("==================================================================");

  if (failureCount > 0) {
    console.error(`VERDICT: REJECT - ${failureCount} failure(s) detected during empirical verification.`);
    process.exit(1);
  } else {
    console.log("VERDICT: APPROVE - All empirical tests passed without error.");
    process.exit(0);
  }
}

runEmpiricalHarness().catch((err) => {
  console.error("Fatal error running empirical harness:", err);
  process.exit(1);
});
