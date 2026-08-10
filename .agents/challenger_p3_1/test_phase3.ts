import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StatsComponent, StatType, StatModifier } from "../../src/entities/components/StatsComponent";
import { HealthComponent } from "../../src/entities/components/HealthComponent";
import { DamageSystem, DamageResult } from "../../src/combat/DamageSystem";
import { Enemy, EnemyState } from "../../src/entities/Enemy";
import { Entity } from "../../src/entities/Entity";

// Mock Entity for AI targeting test
class MockTargetEntity extends Entity {
  public health: HealthComponent;
  public stats: StatsComponent;

  constructor(id: string, scene: Scene, pos: Vector3) {
    super(id, "MockTarget", scene);
    this.position.copyFrom(pos);
    this.stats = new StatsComponent({
      [StatType.MaxHp]: 100,
      [StatType.Armor]: 0,
    });
    this.health = new HealthComponent(100);
  }
}

async function runEmpiricalTests() {
  console.log("=================================================");
  console.log("   PHASE 3 EMPIRICAL VERIFICATION SUITE         ");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}`);
    } else {
      failedTests++;
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
    }
  }

  // -------------------------------------------------------------
  // SUITE 1: StatsComponent Modifier Stack, Clamping & Drift
  // -------------------------------------------------------------
  console.log("--- SUITE 1: StatsComponent Tests ---");

  const stats = new StatsComponent({
    [StatType.AttackDamage]: 20,
    [StatType.CritChance]: 0.10,
    [StatType.Armor]: 50,
    [StatType.MaxHp]: 100,
    [StatType.MoveSpeed]: 7.0,
    [StatType.CritDamage]: 1.5,
  });

  // 1.1 Base stat query
  assert(
    stats.getStat(StatType.AttackDamage) === 20,
    "1.1 Base AttackDamage initial value equals 20",
    `Got ${stats.getStat(StatType.AttackDamage)}`
  );

  // 1.2 Flat modifier addition
  const flatMod: StatModifier = {
    id: "mod_flat_atk",
    stat: StatType.AttackDamage,
    type: "flat",
    value: 10,
  };
  stats.addModifier(flatMod);
  assert(
    stats.getStat(StatType.AttackDamage) === 30,
    "1.2 Flat +10 modifier calculates correctly (20 + 10 = 30)",
    `Got ${stats.getStat(StatType.AttackDamage)}`
  );

  // 1.3 Percent modifier addition
  const pctMod: StatModifier = {
    id: "mod_pct_atk",
    stat: StatType.AttackDamage,
    type: "percent",
    value: 0.50, // +50%
  };
  stats.addModifier(pctMod);
  // (20 + 10) * (1 + 0.50) = 30 * 1.5 = 45
  assert(
    stats.getStat(StatType.AttackDamage) === 45,
    "1.3 Combined flat (+10) and percent (+50%) calculates correctly: (20+10)*1.5 = 45",
    `Got ${stats.getStat(StatType.AttackDamage)}`
  );

  // 1.4 Modifier removal & stat restoration
  stats.removeModifier("mod_pct_atk");
  assert(
    stats.getStat(StatType.AttackDamage) === 30,
    "1.4 Removing percent modifier restores flat modified value (30)",
    `Got ${stats.getStat(StatType.AttackDamage)}`
  );

  stats.removeModifier("mod_flat_atk");
  assert(
    stats.getStat(StatType.AttackDamage) === 20,
    "1.5 Removing all modifiers restores base value (20)",
    `Got ${stats.getStat(StatType.AttackDamage)}`
  );

  // 1.6 Stat Drift Stress Test (10,000 random operations)
  console.log("   Running 10,000 iteration Stat Drift Stress Test...");
  const driftStats = new StatsComponent({ [StatType.AttackDamage]: 100 });
  const modIds: string[] = [];

  for (let i = 0; i < 10000; i++) {
    const id = `drift_mod_${i}`;
    modIds.push(id);
    const isFlat = Math.random() > 0.5;
    driftStats.addModifier({
      id,
      stat: StatType.AttackDamage,
      type: isFlat ? "flat" : "percent",
      value: Math.random() * 50 - 25,
    });
  }
  // Remove all 10,000 modifiers
  for (const id of modIds) {
    driftStats.removeModifier(id, false);
  }
  const finalDriftAtk = driftStats.getStat(StatType.AttackDamage);
  assert(
    finalDriftAtk === 100,
    "1.6 Zero stat drift after 10,000 random add/remove modifier cycles",
    `Expected 100, got ${finalDriftAtk}`
  );

  // 1.7 Clamping Tests
  // CritChance upper bound (1.0)
  stats.addModifier({ id: "crit_over", stat: StatType.CritChance, type: "flat", value: 1.5 });
  assert(
    stats.getStat(StatType.CritChance) === 1.0,
    "1.7 CritChance clamped to upper bound 1.0",
    `Got ${stats.getStat(StatType.CritChance)}`
  );
  stats.removeModifier("crit_over");

  // CritChance lower bound (0.0)
  stats.addModifier({ id: "crit_under", stat: StatType.CritChance, type: "flat", value: -0.5 });
  assert(
    stats.getStat(StatType.CritChance) === 0.0,
    "1.8 CritChance clamped to lower bound 0.0",
    `Got ${stats.getStat(StatType.CritChance)}`
  );
  stats.removeModifier("crit_under");

  // Armor lower bound (0.0)
  stats.addModifier({ id: "armor_neg", stat: StatType.Armor, type: "flat", value: -200 });
  assert(
    stats.getStat(StatType.Armor) === 0.0,
    "1.9 Armor clamped to lower bound 0.0",
    `Got ${stats.getStat(StatType.Armor)}`
  );
  stats.removeModifier("armor_neg");

  // MoveSpeed lower bound (0.1)
  stats.addModifier({ id: "speed_neg", stat: StatType.MoveSpeed, type: "flat", value: -50 });
  assert(
    stats.getStat(StatType.MoveSpeed) === 0.1,
    "1.10 MoveSpeed clamped to minimum bound 0.1",
    `Got ${stats.getStat(StatType.MoveSpeed)}`
  );
  stats.removeModifier("speed_neg");

  // MaxHp lower bound (1.0)
  stats.addModifier({ id: "hp_neg", stat: StatType.MaxHp, type: "flat", value: -500 });
  assert(
    stats.getStat(StatType.MaxHp) === 1.0,
    "1.11 MaxHp clamped to minimum bound 1.0",
    `Got ${stats.getStat(StatType.MaxHp)}`
  );
  stats.removeModifier("hp_neg");

  // Timed Modifier Expiry
  stats.addModifier({ id: "temp_mod", stat: StatType.AttackDamage, type: "flat", value: 50, duration: 1.0 });
  assert(stats.getStat(StatType.AttackDamage) === 70, "1.12 Temp modifier active before duration expires");
  stats.update(0.5);
  assert(stats.getStat(StatType.AttackDamage) === 70, "1.13 Temp modifier still active at t=0.5s");
  stats.update(0.6); // Total 1.1s > 1.0s
  assert(stats.getStat(StatType.AttackDamage) === 20, "1.14 Temp modifier automatically removed after duration (t=1.1s)");

  // -------------------------------------------------------------
  // SUITE 2: DamageSystem Tests
  // -------------------------------------------------------------
  console.log("\n--- SUITE 2: DamageSystem Tests ---");

  const attackerStats = new StatsComponent({
    [StatType.AttackDamage]: 100,
    [StatType.CritChance]: 0.0, // Guaranteed non-crit for math tests
    [StatType.CritDamage]: 2.0,
  });
  const attackerObj = { stats: attackerStats };

  const defender0ArmorStats = new StatsComponent({ [StatType.Armor]: 0 });
  const defender0Health = new HealthComponent(1000);
  const defender0Obj = { stats: defender0ArmorStats, health: defender0Health };

  const defender100ArmorStats = new StatsComponent({ [StatType.Armor]: 100 });
  const defender100Health = new HealthComponent(1000);
  const defender100Obj = { stats: defender100ArmorStats, health: defender100Health };

  const defender300ArmorStats = new StatsComponent({ [StatType.Armor]: 300 });
  const defender300Health = new HealthComponent(1000);
  const defender300Obj = { stats: defender300ArmorStats, health: defender300Health };

  // 2.1 Armor Mitigation Curve: Armor = 0 => 100 / (100 + 0) = 1.0 factor (0% reduction)
  const res0 = DamageSystem.resolveDamage(attackerObj, defender0Obj, 100, false);
  assert(
    res0.mitigatedDamage === 100 && res0.finalDamage === 100,
    "2.1 Armor = 0 results in 0% mitigation (100 raw -> 100 final)",
    `Mitigated=${res0.mitigatedDamage}, Final=${res0.finalDamage}`
  );

  // 2.2 Armor Mitigation Curve: Armor = 100 => 100 / (100 + 100) = 0.5 factor (50% reduction)
  const res100 = DamageSystem.resolveDamage(attackerObj, defender100Obj, 100, false);
  assert(
    Math.abs(res100.mitigatedDamage - 50) < 0.001 && res100.finalDamage === 50,
    "2.2 Armor = 100 results in 50% mitigation: 100 * (100 / (100 + 100)) = 50 final",
    `Mitigated=${res100.mitigatedDamage}, Final=${res100.finalDamage}`
  );

  // 2.3 Armor Mitigation Curve: Armor = 300 => 100 / (100 + 300) = 0.25 factor (75% reduction)
  const res300 = DamageSystem.resolveDamage(attackerObj, defender300Obj, 100, false);
  assert(
    Math.abs(res300.mitigatedDamage - 25) < 0.001 && res300.finalDamage === 25,
    "2.3 Armor = 300 results in 75% mitigation: 100 * (100 / (100 + 300)) = 25 final",
    `Mitigated=${res300.mitigatedDamage}, Final=${res300.finalDamage}`
  );

  // 2.4 Crit Multiplier (Guaranteed Crit)
  const critAttackerStats = new StatsComponent({
    [StatType.AttackDamage]: 100,
    [StatType.CritChance]: 1.0, // 100% Crit
    [StatType.CritDamage]: 2.5,
  });
  const critAttackerObj = { stats: critAttackerStats };
  const critRes = DamageSystem.resolveDamage(critAttackerObj, defender100Obj, 100, true);
  // Raw = 100, Mitigated = 50, Crit = 50 * 2.5 = 125
  assert(
    critRes.isCrit === true && critRes.finalDamage === 125,
    "2.4 Crit roll applies CritDamage multiplier correctly: 50 * 2.5 = 125",
    `isCrit=${critRes.isCrit}, Final=${critRes.finalDamage}`
  );

  // 2.5 Minimum Damage Clamping (1 damage min)
  const weakAttackerStats = new StatsComponent({ [StatType.AttackDamage]: 1, [StatType.CritChance]: 0 });
  const weakAttackerObj = { stats: weakAttackerStats };
  const tankDefenderStats = new StatsComponent({ [StatType.Armor]: 10000 }); // Massive armor
  const tankHealth = new HealthComponent(100);
  const tankDefenderObj = { stats: tankDefenderStats, health: tankHealth };
  const minRes = DamageSystem.resolveDamage(weakAttackerObj, tankDefenderObj, 1, false);
  assert(
    minRes.finalDamage === 1,
    "2.5 Minimum damage is clamped to at least 1 even under extreme armor mitigation",
    `Final damage=${minRes.finalDamage}`
  );

  // 2.6 DamageSystem.applyDamage integration & health reduction
  const initialHp = defender0Health.current;
  const applyRes = DamageSystem.applyDamage(attackerObj, defender0Obj, 1.0);
  const newHp = defender0Health.current;
  assert(
    applyRes.finalDamage === 100 && newHp === initialHp - 100,
    "2.6 DamageSystem.applyDamage correctly calculates damage and deducts target health",
    `Initial HP=${initialHp}, Final HP=${newHp}, Damage=${applyRes.finalDamage}`
  );

  // -------------------------------------------------------------
  // SUITE 3: Enemy AI & FSM Transitions
  // -------------------------------------------------------------
  console.log("\n--- SUITE 3: Enemy AI & FSM Tests ---");

  // Initialize NullEngine & Scene for Babylon mesh testing
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const enemyPos = new Vector3(0, 0, 0);
  const enemy = new Enemy("test_enemy_1", "TestOrc", scene, enemyPos);

  // 3.1 Initial state check
  assert(enemy.state === EnemyState.Idle, "3.1 Enemy initial state is Idle", `State=${enemy.state}`);

  // Create Target Entity at 5m distance (within 9m aggro range)
  const targetPos = new Vector3(5, 0, 0);
  const target = new MockTargetEntity("target_1", scene, targetPos);

  // Step 1: Target enters aggro range (5m <= 9m)
  enemy.update(0.1, target);
  assert(
    enemy.state === EnemyState.Aggro,
    "3.2 Target at 5m triggers transition Idle -> Aggro (alert phase)",
    `State=${enemy.state}`
  );

  // Step 2: During 400ms aggro delay phase (t = 0.2s, aggroTimer = 0.2s < 0.4s)
  enemy.update(0.2, target);
  assert(
    enemy.state === EnemyState.Aggro,
    "3.3 Enemy remains in Aggro alert state during 0.4s alert window (t=0.2s)",
    `State=${enemy.state}`
  );

  // Step 3: Complete 400ms aggro delay phase (dt = 0.25s -> aggroTimer = 0.45s >= 0.4s)
  enemy.update(0.25, target);
  assert(
    enemy.state === EnemyState.Chase,
    "3.4 Enemy transitions from Aggro to Chase state after 0.4s alert window expires",
    `State=${enemy.state}`
  );

  // Step 4: Move target into attack range (1.2m <= 1.8m attack range)
  target.position.set(1.2, 0, 0);
  enemy.update(0.1, target);
  assert(
    enemy.state === EnemyState.Attack,
    "3.5 Target at 1.2m triggers transition Chase -> Attack",
    `State=${enemy.state}`
  );

  // Step 5: Verify attack observer emission when enemy is in Attack state and attack cooldown (1.2s) passes
  let attackObserved = false;
  let observedDamage = 0;
  enemy.onAttackPerformed.add(({ damage }) => {
    attackObserved = true;
    observedDamage = damage;
  });

  // Advance time by 1.25s in Attack state (attackTimer >= attackCooldown 1.2s)
  enemy.update(1.25, target);
  assert(
    attackObserved === true && observedDamage === 12,
    "3.6 Enemy triggers onAttackPerformed observer when attack timer reaches cooldown (1.2s)",
    `attackObserved=${attackObserved}, damage=${observedDamage}`
  );

  // Step 6: Target retreats to 3.0m (> 1.8m + 0.5m attack range + hysteresis)
  target.position.set(3.0, 0, 0);
  enemy.update(0.1, target);
  assert(
    enemy.state === EnemyState.Chase,
    "3.7 Target retreat to 3.0m triggers transition Attack -> Chase",
    `State=${enemy.state}`
  );

  // Step 7: Target retreats far away beyond aggro range * 1.5 (15m > 13.5m)
  target.position.set(15.0, 0, 0);
  enemy.update(0.1, target);
  assert(
    enemy.state === EnemyState.Idle,
    "3.8 Target far out of range (15m) triggers transition Chase -> Idle",
    `State=${enemy.state}`
  );

  console.log(`\n=================================================`);
  console.log(` SUMMARY: ${passedTests}/${totalTests} tests PASSED (${failedTests} FAILED)`);
  console.log(`=================================================\n`);

  scene.dispose();
  engine.dispose();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runEmpiricalTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
