import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { StatsComponent, StatType } from "../src/entities/components/StatsComponent";
import { InventoryComponent, EquipmentSlot, Rarity, ItemCategory, Item } from "../src/entities/components/InventoryComponent";
import { LootDrop } from "../src/entities/LootDrop";
import { Player } from "../src/entities/Player";
import { instantiateItem, createGoldItem, createGlobeItem, rollEnemyDrops } from "../src/combat/LootTable";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

async function runDeepEmpiricalTests() {
  console.log("==================================================");
  console.log("=== Phase 5 Deep Empirical Verification Harness ===");
  console.log("==================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // -------------------------------------------------------------------
  // TEST 1: Inventory Capacity Enforcement (30 max weight limit, 1x/2x/3x costs)
  // -------------------------------------------------------------------
  console.log("\n[TEST 1] Inventory Capacity Enforcement & 1x/2x/3x Weight Rejections...");
  const inv = new InventoryComponent(30);

  // 1a. Fill with 10x 3x weight items (total weight 30/30)
  const items3x: Item[] = [];
  for (let i = 0; i < 10; i++) {
    const item = instantiateItem("dragonplate_armor"); // weight 3
    assert(item.weight === 3, "Item has 3x weight");
    const added = inv.addItem(item);
    assert(added, `Added 3x item ${i + 1}`);
    items3x.push(item);
  }
  assert(inv.getCurrentWeight() === 30, `Current weight is 30 (actual: ${inv.getCurrentWeight()})`);
  assert(inv.canAddItem(instantiateItem("health_potion")) === false, "1x weight item rejected at 30/30");
  assert(inv.canAddItem(instantiateItem("iron_sword")) === false, "2x weight item rejected at 30/30");
  assert(inv.canAddItem(instantiateItem("dragonplate_armor")) === false, "3x weight item rejected at 30/30");

  // 1b. Test removal and exact boundary rejections at 27, 28, 29 weight
  inv.removeItem(items3x[9].id); // Remove 1x 3x item -> weight 27
  assert(inv.getCurrentWeight() === 27, `Weight reduced to 27 (actual: ${inv.getCurrentWeight()})`);

  // At 27 weight:
  // - 3x item: 27 + 3 = 30 -> allowed
  // - 2x item: 27 + 2 = 29 -> allowed
  // - 1x item: 27 + 1 = 28 -> allowed
  assert(inv.canAddItem(instantiateItem("dragonplate_armor")) === true, "3x item allowed at 27 weight");

  // Fill 1x 2x item -> weight 29
  const sword2x = instantiateItem("iron_sword"); // weight 2
  inv.addItem(sword2x);
  assert(inv.getCurrentWeight() === 29, `Weight is now 29 (actual: ${inv.getCurrentWeight()})`);

  // At 29 weight:
  // - 3x item: 29 + 3 = 32 > 30 -> REJECTED
  // - 2x item: 29 + 2 = 31 > 30 -> REJECTED
  // - 1x item: 29 + 1 = 30 <= 30 -> ALLOWED
  assert(inv.canAddItem(instantiateItem("dragonplate_armor")) === false, "3x item REJECTED at 29 weight");
  assert(inv.canAddItem(instantiateItem("iron_sword")) === false, "2x item REJECTED at 29 weight");
  assert(inv.canAddItem(instantiateItem("health_potion")) === true, "1x item ALLOWED at 29 weight");

  // Add 1x item -> weight 30
  const potion1x = instantiateItem("health_potion"); // weight 1
  inv.addItem(potion1x);
  assert(inv.getCurrentWeight() === 30, "Weight reaches exact max 30/30");

  // At 30 weight: Gold and Globe items (0 weight) should still be accepted
  const goldItem = createGoldItem(100);
  assert(inv.canAddItem(goldItem) === true, "Gold (0 weight) allowed when bag full");

  const hpGlobeItem = createGlobeItem("health");
  assert(inv.canAddItem(hpGlobeItem) === true, "Health globe (0 weight) allowed when bag full");

  // 1c. Test unequip rejection when inventory bag is full (30/30)
  const testStats = new StatsComponent();
  const testInv = new InventoryComponent(30);
  const headItem = instantiateItem("steel_helm"); // Head gear
  testInv.items.push(headItem);
  testInv.equipItem(headItem, testStats);
  assert(testInv.equipment.get(EquipmentSlot.Head) === headItem, "Head item equipped");

  // Now fill testInv bag to 30/30 weight
  for (let i = 0; i < 10; i++) {
    testInv.addItem(instantiateItem("dragonplate_armor"));
  }
  assert(testInv.getCurrentWeight() === 30, "Bag is full 30/30");

  // Unequip attempt should fail because bag cannot hold headItem
  const unequipSuccess = testInv.unequipItem(EquipmentSlot.Head, testStats);
  assert(unequipSuccess === false, "Unequip fails when bag capacity is 30/30 full");
  assert(testInv.equipment.get(EquipmentSlot.Head) === headItem, "Item remains equipped");

  console.log("  ✓ Test 1 Passed: 30 max weight limit, 1x/2x/3x weight cost rejections, currency exceptions, and unequip checks verified!");

  // -------------------------------------------------------------------
  // TEST 2: Stat Modifier Application & Removal (50 & 500 Equip Cycles Zero Drift)
  // -------------------------------------------------------------------
  console.log("\n[TEST 2] Stat Modifier Application & Removal (50 & 500 Equip Cycles Zero Drift Check)...");

  const statsComp = new StatsComponent({
    [StatType.AttackDamage]: 25,
    [StatType.CritChance]: 0.15,
    [StatType.Armor]: 15,
    [StatType.MaxHp]: 150,
    [StatType.MaxMana]: 100,
    [StatType.CooldownReduction]: 0.05,
    [StatType.MoveSpeed]: 7.0,
    [StatType.CritDamage]: 1.5,
  });

  const initialStats = {
    atk: statsComp.getStat(StatType.AttackDamage),
    crit: statsComp.getStat(StatType.CritChance),
    armor: statsComp.getStat(StatType.Armor),
    hp: statsComp.getStat(StatType.MaxHp),
    mana: statsComp.getStat(StatType.MaxMana),
    cdr: statsComp.getStat(StatType.CooldownReduction),
    speed: statsComp.getStat(StatType.MoveSpeed),
    critDmg: statsComp.getStat(StatType.CritDamage),
  };

  const gearInv = new InventoryComponent(30);

  const weapon = instantiateItem("sunfire_blade");    // MainHand: +35 Atk, +12% Crit, +25% CritDmg
  const shield = instantiateItem("aegis_of_valor");   // OffHand: +25 Armor, +40 HP, +8% CDR
  const cowl = instantiateItem("steel_helm");         // Head: +8 Armor, +10 HP
  const chest = instantiateItem("dragonplate_armor"); // Chest: +40 Armor, +100 HP

  // Run 50 cycles first
  for (let cycle = 1; cycle <= 50; cycle++) {
    // Equip all 4 slots
    gearInv.items = [weapon, shield, cowl, chest];
    gearInv.equipItem(weapon, statsComp);
    gearInv.equipItem(shield, statsComp);
    gearInv.equipItem(cowl, statsComp);
    gearInv.equipItem(chest, statsComp);

    // Unequip all 4 slots
    gearInv.unequipItem(EquipmentSlot.MainHand, statsComp);
    gearInv.unequipItem(EquipmentSlot.OffHand, statsComp);
    gearInv.unequipItem(EquipmentSlot.Head, statsComp);
    gearInv.unequipItem(EquipmentSlot.Chest, statsComp);
    gearInv.items = [];
  }

  const post50Atk = statsComp.getStat(StatType.AttackDamage);
  const post50Crit = statsComp.getStat(StatType.CritChance);
  const post50Armor = statsComp.getStat(StatType.Armor);
  const post50Hp = statsComp.getStat(StatType.MaxHp);

  assert(post50Atk === initialStats.atk, `50 cycles Atk drift: expected ${initialStats.atk}, got ${post50Atk}`);
  assert(post50Crit === initialStats.crit, `50 cycles Crit drift: expected ${initialStats.crit}, got ${post50Crit}`);
  assert(post50Armor === initialStats.armor, `50 cycles Armor drift: expected ${initialStats.armor}, got ${post50Armor}`);
  assert(post50Hp === initialStats.hp, `50 cycles HP drift: expected ${initialStats.hp}, got ${post50Hp}`);
  console.log(`  ✓ 50 equip/unequip cycles: ZERO stat drift across all slots (Atk: ${post50Atk}, Crit: ${post50Crit}, Armor: ${post50Armor}, HP: ${post50Hp})`);

  // Run up to 500 cycles for ultimate stress testing
  for (let cycle = 51; cycle <= 500; cycle++) {
    gearInv.items = [weapon, shield, cowl, chest];
    gearInv.equipItem(weapon, statsComp);
    gearInv.equipItem(shield, statsComp);
    gearInv.equipItem(cowl, statsComp);
    gearInv.equipItem(chest, statsComp);

    gearInv.unequipItem(EquipmentSlot.MainHand, statsComp);
    gearInv.unequipItem(EquipmentSlot.OffHand, statsComp);
    gearInv.unequipItem(EquipmentSlot.Head, statsComp);
    gearInv.unequipItem(EquipmentSlot.Chest, statsComp);
    gearInv.items = [];
  }

  const post500Atk = statsComp.getStat(StatType.AttackDamage);
  const post500Armor = statsComp.getStat(StatType.Armor);
  assert(post500Atk === initialStats.atk, `500 cycles Atk drift: expected ${initialStats.atk}, got ${post500Atk}`);
  assert(post500Armor === initialStats.armor, `500 cycles Armor drift: expected ${initialStats.armor}, got ${post500Armor}`);
  console.log(`  ✓ 500 equip/unequip cycles: ZERO stat drift verified!`);

  // -------------------------------------------------------------------
  // TEST 3: Proximity Auto-Pickup Math (3.0 unit radius, pull physics, instant restoration)
  // -------------------------------------------------------------------
  console.log("\n[TEST 3] Proximity Auto-Pickup Math (3.0 Unit Radius & Instant Restoration)...");

  const player = new Player("hero", scene);
  player.position = new Vector3(0, 0, 0);

  // 3a. Verify item outside 3.0 unit radius is NOT pulled
  const farGoldItem = createGoldItem(50);
  const farLoot = new LootDrop("far_gold", scene, farGoldItem, new Vector3(4.0, 0, 0));
  const initialFarPos = farLoot.transformNode.position.clone();

  farLoot.update(0.016, player);
  assert(Vector3.Distance(farLoot.transformNode.position, initialFarPos) < 0.0001, "Loot outside 3.0 radius did NOT move");
  assert(farLoot.isPickedUp === false, "Loot outside 3.0 radius was NOT picked up");

  // 3b. Verify item inside 3.0 unit radius IS pulled towards player
  const nearGoldItem = createGoldItem(75);
  const nearLoot = new LootDrop("near_gold", scene, nearGoldItem, new Vector3(2.5, 0, 0));
  const distBefore = Vector3.Distance(nearLoot.transformNode.position, player.position);

  nearLoot.update(0.016, player); // 1 frame update
  const distAfter = Vector3.Distance(nearLoot.transformNode.position, player.position);
  assert(distAfter < distBefore, `Loot pulled closer to player (before: ${distBefore.toFixed(3)}, after: ${distAfter.toFixed(3)})`);

  // Advance updates until gold is picked up (< 0.5m threshold)
  let steps = 0;
  while (!nearLoot.isPickedUp && steps < 100) {
    nearLoot.update(0.016, player);
    steps++;
  }
  assert(nearLoot.isPickedUp === true, `Gold picked up after ${steps} update frames`);
  assert(player.inventory.gold === 75, `Player gold increased by 75 (actual: ${player.inventory.gold})`);
  console.log(`  ✓ 3.0 unit proximity magnet pull & Gold auto-pickup verified (in ${steps} frames).`);

  // 3c. HP Globe Instant Restoration Math (+25% Max HP)
  player.stats.modifyHealth(-80); // Damage player
  const hpBefore = player.stats.currentHealth;
  const maxHp = player.stats.maxHealth;
  const expectedHpHeal = Math.round(maxHp * 0.25);

  const hpGlobeItemPickup = createGlobeItem("health");
  const hpGlobeLoot = new LootDrop("hp_globe", scene, hpGlobeItemPickup, new Vector3(1.5, 0, 0));

  while (!hpGlobeLoot.isPickedUp) {
    hpGlobeLoot.update(0.016, player);
  }
  const hpAfter = player.stats.currentHealth;
  assert(hpAfter === hpBefore + expectedHpHeal, `HP Globe restored exactly +25% Max HP (+${expectedHpHeal} HP: before ${hpBefore}, after ${hpAfter})`);
  console.log(`  ✓ Health Globe instant restoration (+25% Max HP = +${expectedHpHeal} HP) verified!`);

  // 3d. MP Globe Instant Restoration Math (+25% Max MP)
  player.stats.modifyMana(-60); // Spend mana
  const mpBefore = player.stats.currentMana;
  const maxMp = player.stats.maxMana;
  const expectedMpRestore = Math.round(maxMp * 0.25);

  const mpGlobeItem = createGlobeItem("mana");
  const mpGlobeLoot = new LootDrop("mp_globe", scene, mpGlobeItem, new Vector3(1.5, 0, 0));

  while (!mpGlobeLoot.isPickedUp) {
    mpGlobeLoot.update(0.016, player);
  }
  const mpAfter = player.stats.currentMana;
  assert(mpAfter === mpBefore + expectedMpRestore, `MP Globe restored exactly +25% Max MP (+${expectedMpRestore} MP: before ${mpBefore}, after ${mpAfter})`);
  console.log(`  ✓ Mana Globe instant restoration (+25% Max MP = +${expectedMpRestore} MP) verified!`);

  // 3e. Full Inventory Equipment Pickup Protection
  // Fill player bag to 30/30
  player.inventory.items = [];
  for (let i = 0; i < 10; i++) {
    player.inventory.addItem(instantiateItem("dragonplate_armor"));
  }
  assert(player.inventory.getCurrentWeight() === 30, "Player inventory bag is 30/30 full");

  const equipLootItem = instantiateItem("sunfire_blade");
  const equipLoot = new LootDrop("full_bag_equip", scene, equipLootItem, new Vector3(1.0, 0, 0));

  // Run magnet updates: loot should pull to player, but should NOT be picked up because bag is full
  for (let i = 0; i < 20; i++) {
    equipLoot.update(0.016, player);
  }
  assert(equipLoot.isPickedUp === false, "Equipment drop NOT picked up when inventory capacity is 30/30");
  console.log("  ✓ Full inventory auto-pickup protection verified (item remains in world when bag full).");

  console.log("\n==================================================");
  console.log("=== ALL DEEP EMPIRICAL TESTS PASSED SUCCESSFULLY! ===");
  console.log("==================================================");
}

runDeepEmpiricalTests().catch((err) => {
  console.error("Deep empirical verification failed:", err);
  process.exit(1);
});
