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

import { StatsComponent, StatType } from "../src/entities/components/StatsComponent";
import { InventoryComponent, EquipmentSlot, Rarity, ItemCategory, Item } from "../src/entities/components/InventoryComponent";
import { LootDrop } from "../src/entities/LootDrop";
import { Player } from "../src/entities/Player";
import { instantiateItem, createGoldItem, createGlobeItem } from "../src/combat/LootTable";
import { InventoryUI } from "../src/ui/InventoryUI";
import { InputManager } from "../src/core/InputManager";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

/**
 * Interface representing serializable Player Save State schema.
 */
interface PlayerSaveState {
  version: number;
  level: number;
  xp: number;
  activeArchetypeId: string;
  gold: number;
  currentHealth: number;
  currentMana: number;
  baseStats: Record<string, number>;
  inventoryItems: Item[];
  equipment: Record<string, Item | null>;
}

/**
 * Helper function to serialize Player state into a JSON object/string.
 */
function serializePlayer(player: Player): PlayerSaveState {
  const equipmentObj: Record<string, Item | null> = {};
  for (const [slot, item] of player.inventory.equipment.entries()) {
    equipmentObj[slot] = item ? { ...item } : null;
  }

  const baseStatsObj: Record<string, number> = {};
  const statTypes = [
    StatType.AttackDamage,
    StatType.CritChance,
    StatType.Armor,
    StatType.MaxHp,
    StatType.MaxMana,
    StatType.CooldownReduction,
    StatType.MoveSpeed,
    StatType.CritDamage,
  ];
  for (const stat of statTypes) {
    baseStatsObj[stat] = player.stats.getBaseStat(stat);
  }

  return {
    version: 1,
    level: player.level,
    xp: player.xp,
    activeArchetypeId: player.activeArchetypeId,
    gold: player.inventory.gold,
    currentHealth: player.stats.currentHealth,
    currentMana: player.stats.currentMana,
    baseStats: baseStatsObj,
    inventoryItems: player.inventory.items.map((item) => ({ ...item })),
    equipment: equipmentObj,
  };
}

/**
 * Helper function to deserialize Player save state and reconstruct a fresh Player entity.
 */
function deserializePlayer(saveState: PlayerSaveState, scene: Scene): Player {
  const player = new Player("restored_hero", scene);

  // Restore progression
  player.level = saveState.level;
  player.xp = saveState.xp;

  // Restore base stats
  for (const [statKey, value] of Object.entries(saveState.baseStats)) {
    player.stats.setBaseStat(statKey as StatType, value);
  }

  // Restore Archetype
  player.setArchetype(saveState.activeArchetypeId as any);

  // Restore inventory items & gold
  player.inventory.gold = saveState.gold;
  player.inventory.items = saveState.inventoryItems.map((item) => ({ ...item }));

  // Restore equipment slots and re-apply stat modifiers
  for (const [slotKey, item] of Object.entries(saveState.equipment)) {
    const slot = slotKey as EquipmentSlot;
    if (item) {
      const restoredItem = { ...item };
      player.inventory.equipment.set(slot, restoredItem);
      // Re-apply equipment modifiers to stats
      if (restoredItem.stats) {
        const sourceTag = `equipment_${slot}`;
        player.stats.removeModifiersBySource(sourceTag);
        restoredItem.stats.forEach((mod, idx) => {
          player.stats.addModifier({
            id: `equip_${slot}_${idx}`,
            stat: mod.stat,
            type: mod.type,
            value: mod.value,
            source: sourceTag,
          });
        });
      }
    } else {
      player.inventory.equipment.set(slot, null);
    }
  }

  // Restore HP and MP pools (clamped to max)
  player.stats.modifyHealth(saveState.currentHealth - player.stats.currentHealth);
  player.stats.modifyMana(saveState.currentMana - player.stats.currentMana);

  return player;
}

async function runPersistenceAndStressChallenge() {
  console.log("================================================================");
  console.log("=== PHASE 5 ITERATION 2 PERSISTENCE & STRESS CHALLENGE SUITE ===");
  console.log("================================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // -------------------------------------------------------------------
  // TEST 1: Persistence Save/Load Serialization & Restoration
  // -------------------------------------------------------------------
  console.log("\n[CHALLENGE 1] Verifying Save/Load Serialization & Restoration...");

  const originalPlayer = new Player("orig_hero", scene);
  originalPlayer.level = 5;
  originalPlayer.xp = 450;
  originalPlayer.inventory.addGold(1250);

  // Add items to inventory bag
  const healthPot = instantiateItem("health_potion");
  const manaPot = instantiateItem("mana_potion");
  originalPlayer.inventory.addItem(healthPot);
  originalPlayer.inventory.addItem(manaPot);

  // Equip full gear set
  const weapon = instantiateItem("sunfire_blade");    // MainHand: +35 Atk, +12% Crit, +25% CritDmg
  const shield = instantiateItem("aegis_of_valor");   // OffHand: +25 Armor, +40 HP, +8% CDR
  const helm = instantiateItem("steel_helm");         // Head: +8 Armor, +10 HP
  const chest = instantiateItem("dragonplate_armor"); // Chest: +40 Armor, +100 HP

  originalPlayer.inventory.items.push(weapon, shield, helm, chest);
  originalPlayer.inventory.equipItem(weapon, originalPlayer.stats);
  originalPlayer.inventory.equipItem(shield, originalPlayer.stats);
  originalPlayer.inventory.equipItem(helm, originalPlayer.stats);
  originalPlayer.inventory.equipItem(chest, originalPlayer.stats);

  // Partially damage HP and spend MP
  originalPlayer.stats.modifyHealth(-50);
  originalPlayer.stats.modifyMana(-30);

  const origAtk = originalPlayer.stats.getStat(StatType.AttackDamage);
  const origArmor = originalPlayer.stats.getStat(StatType.Armor);
  const origHp = originalPlayer.stats.getStat(StatType.MaxHp);
  const origCurHp = originalPlayer.stats.currentHealth;
  const origCurMp = originalPlayer.stats.currentMana;

  // Serialize to JSON string
  const saveStateObj = serializePlayer(originalPlayer);
  const jsonString = JSON.stringify(saveStateObj);
  assert(typeof jsonString === "string" && jsonString.length > 0, "Serialization produced valid JSON string");

  // Parse back JSON string & deserialize into restored player entity
  const parsedSaveState: PlayerSaveState = JSON.parse(jsonString);
  const restoredPlayer = deserializePlayer(parsedSaveState, scene);

  // Assert state matches original exactly
  assert(restoredPlayer.level === 5, `Restored level: expected 5, got ${restoredPlayer.level}`);
  assert(restoredPlayer.xp === 450, `Restored XP: expected 450, got ${restoredPlayer.xp}`);
  assert(restoredPlayer.inventory.gold === 1250, `Restored Gold: expected 1250, got ${restoredPlayer.inventory.gold}`);
  assert(restoredPlayer.inventory.items.length === 2, `Restored bag item count: expected 2, got ${restoredPlayer.inventory.items.length}`);
  assert(restoredPlayer.inventory.items[0].templateId === "health_potion", "Restored item 1 is health potion");
  assert(restoredPlayer.inventory.items[1].templateId === "mana_potion", "Restored item 2 is mana potion");

  // Assert equipment slots
  assert(restoredPlayer.inventory.equipment.get(EquipmentSlot.MainHand)?.templateId === "sunfire_blade", "MainHand restored");
  assert(restoredPlayer.inventory.equipment.get(EquipmentSlot.OffHand)?.templateId === "aegis_of_valor", "OffHand restored");
  assert(restoredPlayer.inventory.equipment.get(EquipmentSlot.Head)?.templateId === "steel_helm", "Head restored");
  assert(restoredPlayer.inventory.equipment.get(EquipmentSlot.Chest)?.templateId === "dragonplate_armor", "Chest restored");

  // Assert stats on restored player match original equipped stats
  const restAtk = restoredPlayer.stats.getStat(StatType.AttackDamage);
  const restArmor = restoredPlayer.stats.getStat(StatType.Armor);
  const restHp = restoredPlayer.stats.getStat(StatType.MaxHp);
  const restCurHp = restoredPlayer.stats.currentHealth;
  const restCurMp = restoredPlayer.stats.currentMana;

  assert(restAtk === origAtk, `Restored Atk mismatch: expected ${origAtk}, got ${restAtk}`);
  assert(restArmor === origArmor, `Restored Armor mismatch: expected ${origArmor}, got ${restArmor}`);
  assert(restHp === origHp, `Restored HP mismatch: expected ${origHp}, got ${restHp}`);
  assert(restCurHp === origCurHp, `Restored Current HP mismatch: expected ${origCurHp}, got ${restCurHp}`);
  assert(restCurMp === origCurMp, `Restored Current MP mismatch: expected ${origCurMp}, got ${restCurMp}`);

  // Test unequipping items on restored player down to base stats (zero stat drift check)
  restoredPlayer.inventory.unequipItem(EquipmentSlot.MainHand, restoredPlayer.stats);
  restoredPlayer.inventory.unequipItem(EquipmentSlot.OffHand, restoredPlayer.stats);
  restoredPlayer.inventory.unequipItem(EquipmentSlot.Head, restoredPlayer.stats);
  restoredPlayer.inventory.unequipItem(EquipmentSlot.Chest, restoredPlayer.stats);

  const unequipAtk = restoredPlayer.stats.getStat(StatType.AttackDamage);
  const unequipArmor = restoredPlayer.stats.getStat(StatType.Armor);
  const baseAtk = restoredPlayer.stats.getBaseStat(StatType.AttackDamage);
  const baseArmor = restoredPlayer.stats.getBaseStat(StatType.Armor);

  assert(unequipAtk === baseAtk, `Unequipped restored player Atk drift: expected ${baseAtk}, got ${unequipAtk}`);
  assert(unequipArmor === baseArmor, `Unequipped restored player Armor drift: expected ${baseArmor}, got ${unequipArmor}`);

  console.log("  ✓ Challenge 1 Passed: Persistence Save/Load serialization & full restoration verified with 0 stat drift!");

  // -------------------------------------------------------------------
  // TEST 2: Exact Max Weight Capacity Limit Boundary Edge Cases (30 Weight)
  // -------------------------------------------------------------------
  console.log("\n[CHALLENGE 2] Testing Exact Max Weight Capacity Limit Edge Cases (30 Weight)...");

  const invCapTest = new InventoryComponent(30);

  // Fill up to 29 weight: 9x 3x items (27 weight) + 1x 2x item (2 weight) = 29 weight
  for (let i = 0; i < 9; i++) {
    invCapTest.addItem(instantiateItem("dragonplate_armor")); // 3 weight each
  }
  invCapTest.addItem(instantiateItem("iron_sword")); // 2 weight
  assert(invCapTest.getCurrentWeight() === 29, `Initial fill reaches 29 weight (actual: ${invCapTest.getCurrentWeight()})`);

  // At 29 weight:
  // 1x item -> 29 + 1 = 30 <= 30 (ALLOWED)
  // 2x item -> 29 + 2 = 31 > 30 (REJECTED)
  // 3x item -> 29 + 3 = 32 > 30 (REJECTED)
  assert(invCapTest.canAddItem(instantiateItem("health_potion")) === true, "1x item can be added at 29 weight");
  assert(invCapTest.canAddItem(instantiateItem("iron_sword")) === false, "2x item CANNOT be added at 29 weight");
  assert(invCapTest.canAddItem(instantiateItem("dragonplate_armor")) === false, "3x item CANNOT be added at 29 weight");

  // Attempt adding 2x item: addItem must return false and weight stay at 29
  const added2xAt29 = invCapTest.addItem(instantiateItem("iron_sword"));
  assert(added2xAt29 === false, "addItem(2x) returned false at 29 weight");
  assert(invCapTest.getCurrentWeight() === 29, "Current weight remains 29");

  // Add 1x item to reach exact 30 weight
  const potion1x = instantiateItem("health_potion"); // 1 weight
  const added1xAt29 = invCapTest.addItem(potion1x);
  assert(added1xAt29 === true, "addItem(1x) succeeded at 29 weight");
  assert(invCapTest.getCurrentWeight() === 30, `Current weight is exact 30/30 (actual: ${invCapTest.getCurrentWeight()})`);

  // At exact 30 weight: ALL normal items must be rejected
  assert(invCapTest.canAddItem(instantiateItem("health_potion")) === false, "1x item rejected at 30 weight");
  assert(invCapTest.canAddItem(instantiateItem("iron_sword")) === false, "2x item rejected at 30 weight");
  assert(invCapTest.canAddItem(instantiateItem("dragonplate_armor")) === false, "3x item rejected at 30 weight");

  const added1xAt30 = invCapTest.addItem(instantiateItem("health_potion"));
  assert(added1xAt30 === false, "addItem(1x) returned false at 30 weight");
  assert(invCapTest.getCurrentWeight() === 30, "Current weight remains 30");

  // Currency exceptions: Gold and Globe (0 weight) MUST still be accepted at 30 weight
  const gold100 = createGoldItem(100);
  assert(invCapTest.canAddItem(gold100) === true, "canAddItem(Gold) returns true at 30 weight");
  invCapTest.addGold(100);
  assert(invCapTest.gold === 100, "Gold increased by 100");
  assert(invCapTest.getCurrentWeight() === 30, "Bag weight remains 30 after adding gold currency");

  const hpGlobe = createGlobeItem("health");
  assert(invCapTest.canAddItem(hpGlobe) === true, "canAddItem(Globe) returns true at 30 weight");

  // Unequip attempt while bag is at exact 30/30 limit
  const fullStats = new StatsComponent();
  const equippedHelm = instantiateItem("steel_helm");
  invCapTest.equipment.set(EquipmentSlot.Head, equippedHelm);
  fullStats.addModifier({ id: "equip_head_0", stat: StatType.Armor, type: "flat", value: 8, source: "equipment_head" });

  const unequipAt30 = invCapTest.unequipItem(EquipmentSlot.Head, fullStats);
  assert(unequipAt30 === false, "unequipItem returned false when bag weight is 30/30");
  assert(invCapTest.equipment.get(EquipmentSlot.Head) === equippedHelm, "Item remains equipped when bag is full");
  assert(fullStats.getStat(StatType.Armor) === fullStats.getBaseStat(StatType.Armor) + 8, "Stat modifier remains active when unequip fails");

  console.log("  ✓ Challenge 2 Passed: Exact 30 max weight capacity limit, boundary rejections, currency exceptions, and unequip locks verified!");

  // -------------------------------------------------------------------
  // TEST 3: Equipping Items with Stat Modifiers & Item Swapping Stress Test
  // -------------------------------------------------------------------
  console.log("\n[CHALLENGE 3] Equipping Items with Stat Modifiers & Item Swapping Stress Test...");

  const stressStats = new StatsComponent({
    [StatType.AttackDamage]: 20,
    [StatType.Armor]: 10,
    [StatType.MaxHp]: 100,
  });
  const stressInv = new InventoryComponent(30);

  const swordA = instantiateItem("iron_sword");    // MainHand: +15 Atk, +5% Crit
  const swordB = instantiateItem("sunfire_blade"); // MainHand: +35 Atk, +12% Crit, +25% CritDmg

  stressInv.items.push(swordA, swordB);

  // Equip Sword A
  const equipASuccess = stressInv.equipItem(swordA, stressStats);
  assert(equipASuccess === true, "Equipped Sword A successfully");
  assert(stressInv.equipment.get(EquipmentSlot.MainHand) === swordA, "MainHand has Sword A");
  assert(stressStats.getStat(StatType.AttackDamage) === 26, `Stats show 20 base + 6 = 26 Atk (actual: ${stressStats.getStat(StatType.AttackDamage)})`);

  // Equip Sword B (swapping with Sword A)
  const swapSuccess = stressInv.equipItem(swordB, stressStats);
  assert(swapSuccess === true, "Equipped Sword B successfully (swap)");
  assert(stressInv.equipment.get(EquipmentSlot.MainHand) === swordB, "MainHand has Sword B");
  assert(stressStats.getStat(StatType.AttackDamage) === 55, `Stats show 20 base + 35 = 55 Atk (actual: ${stressStats.getStat(StatType.AttackDamage)})`);
  assert(stressInv.items.some((i) => i.id === swordA.id), "Sword A returned to inventory bag upon swap");

  // Perform 1,000 rapid equip/unequip/swap cycles
  console.log("  Executing 1,000 rapid equip/unequip/swap cycles...");
  for (let i = 0; i < 500; i++) {
    stressInv.equipItem(swordA, stressStats);
    stressInv.equipItem(swordB, stressStats);
    stressInv.unequipItem(EquipmentSlot.MainHand, stressStats);
  }

  const finalAtk = stressStats.getStat(StatType.AttackDamage);
  const baseAtkCheck = stressStats.getBaseStat(StatType.AttackDamage);
  assert(finalAtk === baseAtkCheck, `1,000 swap cycles zero stat drift check: expected base ${baseAtkCheck}, got ${finalAtk}`);

  console.log("  ✓ Challenge 3 Passed: Item swapping, stat modifier replacements, and 1,000 swap cycles zero drift verified!");

  // -------------------------------------------------------------------
  // TEST 4: UI Observer Disposal & Modal Isolation Test
  // -------------------------------------------------------------------
  console.log("\n[CHALLENGE 4] Verifying InventoryUI Disposal & Observer Cleanup...");

  const uiPlayer = new Player("ui_hero", scene);
  const inputManager = new InputManager(scene);
  uiPlayer.setInputManager(inputManager);

  const getActiveObservers = (obs: any): number => {
    return (obs.observers || obs["_observers"] || []).filter((o: any) => !o._willBeUnregistered).length;
  };

  // Check pre-creation observer counts on player inventory observables
  const preInvObs = getActiveObservers(uiPlayer.inventory.onInventoryChanged);
  const preGoldObs = getActiveObservers(uiPlayer.inventory.onGoldChanged);
  const preEquipObs = getActiveObservers(uiPlayer.inventory.onItemEquipped);

  const invUI = new InventoryUI(scene, uiPlayer, inputManager);

  const duringInvObs = getActiveObservers(uiPlayer.inventory.onInventoryChanged);
  const duringGoldObs = getActiveObservers(uiPlayer.inventory.onGoldChanged);
  const duringEquipObs = getActiveObservers(uiPlayer.inventory.onItemEquipped);

  assert(duringInvObs === preInvObs + 1, "InventoryChanged observer attached");
  assert(duringGoldObs === preGoldObs + 1, "GoldChanged observer attached");
  assert(duringEquipObs === preEquipObs + 1, "ItemEquipped observer attached");

  // Dispose InventoryUI
  invUI.dispose();

  const postInvObs = getActiveObservers(uiPlayer.inventory.onInventoryChanged);
  const postGoldObs = getActiveObservers(uiPlayer.inventory.onGoldChanged);
  const postEquipObs = getActiveObservers(uiPlayer.inventory.onItemEquipped);

  console.log(`  Pre-creation active observers: Inv=${preInvObs}, Gold=${preGoldObs}, Equip=${preEquipObs}`);
  console.log(`  During UI active observers: Inv=${duringInvObs}, Gold=${duringGoldObs}, Equip=${duringEquipObs}`);
  console.log(`  Post-dispose active observers: Inv=${postInvObs}, Gold=${postGoldObs}, Equip=${postEquipObs}`);

  assert(postInvObs === preInvObs, `Post-dispose InventoryChanged observers: expected ${preInvObs}, got ${postInvObs}`);
  assert(postGoldObs === preGoldObs, `Post-dispose GoldChanged observers: expected ${preGoldObs}, got ${postGoldObs}`);
  assert(postEquipObs === preEquipObs, `Post-dispose ItemEquipped observers: expected ${preEquipObs}, got ${postEquipObs}`);

  // Firing events post-dispose must not throw
  uiPlayer.inventory.addGold(50);
  uiPlayer.inventory.addItem(instantiateItem("health_potion"));

  console.log("  ✓ Challenge 4 Passed: InventoryUI.dispose() cleanly detached all observers!");

  console.log("\n================================================================");
  console.log("=== ALL PERSISTENCE & STRESS CHALLENGES PASSED WITH VERDICT: APPROVE ===");
  console.log("================================================================");
}

runPersistenceAndStressChallenge().catch((err) => {
  console.error("Persistence & Stress Challenge failed:", err);
  process.exit(1);
});
