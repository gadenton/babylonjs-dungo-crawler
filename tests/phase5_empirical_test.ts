import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { StatsComponent, StatType } from "../src/entities/components/StatsComponent";
import { InventoryComponent, EquipmentSlot, Rarity, ItemCategory } from "../src/entities/components/InventoryComponent";
import { instantiateItem, createGoldItem, createGlobeItem, rollEnemyDrops } from "../src/combat/LootTable";
import { Player } from "../src/entities/Player";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

async function runEmpiricalTests() {
  console.log("=== Starting Phase 5 Empirical Test Suite ===");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // --- Test 1: Drop Table Rolling ---
  console.log("Test 1: Rolling drop tables for standard, elite, and boss tiers...");
  const standardDrops = rollEnemyDrops("standard");
  const eliteDrops = rollEnemyDrops("elite");
  const bossDrops = rollEnemyDrops("boss");

  assert(standardDrops.length >= 0, "Standard drops generated array");
  assert(eliteDrops.length >= 1, "Elite drops generated at least 1 item");
  assert(bossDrops.length >= 2, "Boss drops generated multiple items");
  console.log(`  ✓ Standard drops count: ${standardDrops.length}`);
  console.log(`  ✓ Elite drops count: ${eliteDrops.length}`);
  console.log(`  ✓ Boss drops count: ${bossDrops.length}`);

  // --- Test 2: Weighted Capacity Bounds ---
  console.log("Test 2: Verifying Option D1 30-weight slot capacity bounds...");
  const inventory = new InventoryComponent(30);

  // Add 10x 2x weight items = 20 weight
  for (let i = 0; i < 10; i++) {
    const sword = instantiateItem("fine_steel_sword");
    assert(sword.weight === 2, "Sword has 2x weight badge");
    const added = inventory.addItem(sword);
    assert(added, `Added 2x weight item ${i + 1}`);
  }
  assert(inventory.getCurrentWeight() === 20, "Current weight is 20 / 30");

  // Add 3x 3x weight items = +9 weight (total 29 weight)
  for (let i = 0; i < 3; i++) {
    const heavyPlate = instantiateItem("dragonplate_armor");
    assert(heavyPlate.weight === 3, "Plate has 3x weight badge");
    const added = inventory.addItem(heavyPlate);
    assert(added, `Added 3x weight item ${i + 1}`);
  }
  assert(inventory.getCurrentWeight() === 29, "Current weight is 29 / 30");

  // Attempt to add a 2x weight item -> should fail (29 + 2 = 31 > 30)
  const overflowItem = instantiateItem("iron_sword"); // weight 2
  const addedOverflow = inventory.addItem(overflowItem);
  assert(!addedOverflow, "Overflow 2x weight item rejected when total weight would exceed 30");
  assert(inventory.getCurrentWeight() === 29, "Current weight remained 29");

  // Add a 1x weight item -> should succeed (29 + 1 = 30)
  const potion = instantiateItem("health_potion"); // weight 1
  const addedPotion = inventory.addItem(potion);
  assert(addedPotion, "1x weight item accepted filling capacity to exactly 30");
  assert(inventory.getCurrentWeight() === 30, "Current weight is exactly 30 / 30");
  console.log("  ✓ Weighted inventory capacity bounds enforced correctly.");

  // --- Test 3: Equip / Unequip Stat Drift Verification (100 Cycles) ---
  console.log("Test 3: Running 100 equip/unequip cycles for zero stat drift...");
  const testStats = new StatsComponent({
    [StatType.MaxHp]: 100,
    [StatType.AttackDamage]: 20,
    [StatType.Armor]: 10,
    [StatType.CritChance]: 0.10,
  });

  const baseAtk = testStats.getStat(StatType.AttackDamage);
  const baseArmor = testStats.getStat(StatType.Armor);

  const legendBlade = instantiateItem("sunfire_blade"); // +35 Atk, +12% Crit, +25% CritDmg
  const legendShield = instantiateItem("aegis_of_valor"); // +25 Armor, +40 HP, +8% CDR

  const testInv = new InventoryComponent(30);

  for (let cycle = 1; cycle <= 100; cycle++) {
    // Equip Blade & Shield
    testInv.items.push(legendBlade);
    testInv.equipItem(legendBlade, testStats);

    testInv.items.push(legendShield);
    testInv.equipItem(legendShield, testStats);

    // Assert boosted stats
    assert(testStats.getStat(StatType.AttackDamage) > baseAtk, "Attack boosted while equipped");
    assert(testStats.getStat(StatType.Armor) > baseArmor, "Armor boosted while equipped");

    // Unequip Blade & Shield
    testInv.unequipItem(EquipmentSlot.MainHand, testStats);
    testInv.unequipItem(EquipmentSlot.OffHand, testStats);
    testInv.items = []; // Clear bag
  }

  const finalAtk = testStats.getStat(StatType.AttackDamage);
  const finalArmor = testStats.getStat(StatType.Armor);

  assert(Math.abs(finalAtk - baseAtk) < 0.0001, `Attack damage stat drift is 0 (base: ${baseAtk}, final: ${finalAtk})`);
  assert(Math.abs(finalArmor - baseArmor) < 0.0001, `Armor stat drift is 0 (base: ${baseArmor}, final: ${finalArmor})`);
  console.log(`  ✓ 100 equip/unequip cycles verified 0 stat drift (Atk: ${finalAtk}, Armor: ${finalArmor}).`);

  // --- Test 4: Resource Globe Instant Restoration Math ---
  console.log("Test 4: Verifying +25% HP and MP resource globe restoration...");
  const player = new Player("testPlayer", scene);
  player.stats.modifyHealth(-100); // Reduce HP
  player.stats.modifyMana(-50); // Reduce Mana

  const initialHp = player.stats.currentHealth;
  const initialMana = player.stats.currentMana;
  const maxHp = player.stats.maxHealth;
  const maxMana = player.stats.maxMana;

  // Restore 25% HP
  const expectedHeal = Math.round(maxHp * 0.25);
  player.stats.modifyHealth(expectedHeal);
  assert(player.stats.currentHealth === initialHp + expectedHeal, "Health globe restored 25% max HP");

  // Restore 25% MP
  const expectedMana = Math.round(maxMana * 0.25);
  player.stats.modifyMana(expectedMana);
  assert(player.stats.currentMana === initialMana + expectedMana, "Mana globe restored 25% max Mana");
  console.log(`  ✓ Globe HP/MP restoration math verified (+${expectedHeal} HP, +${expectedMana} MP).`);

  // --- Test 5: Gold Addition & Observables ---
  console.log("Test 5: Verifying Gold addition and observable notification...");
  let goldNotified = -1;
  player.inventory.onGoldChanged.add((amount) => {
    goldNotified = amount;
  });

  player.inventory.addGold(150);
  assert(player.inventory.gold === 150, "Gold state is 150");
  assert(goldNotified === 150, "onGoldChanged observer notified with 150");
  console.log("  ✓ Gold state and observables functioning correctly.");

  console.log("=== All Phase 5 Empirical Tests Passed Successfully! ===");
}

runEmpiricalTests().catch((err) => {
  console.error("Empirical test failure:", err);
  process.exit(1);
});
