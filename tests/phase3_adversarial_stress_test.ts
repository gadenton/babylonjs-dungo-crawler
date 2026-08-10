import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Collisions/collisionCoordinator";
import { StatsComponent, StatType, StatModifier } from "../src/entities/components/StatsComponent";
import { HealthComponent } from "../src/entities/components/HealthComponent";
import { DamageSystem } from "../src/combat/DamageSystem";
import { Enemy, EnemyState } from "../src/entities/Enemy";
import { Entity } from "../src/entities/Entity";

// Helper mock entity for testing
class MockEntity extends Entity {
  public mesh: Mesh;
  public stats: StatsComponent;
  public health: HealthComponent;

  constructor(id: string, name: string, scene: Scene, pos?: Vector3) {
    super(id, name, scene);
    this.mesh = new Mesh(`mock_${id}`, scene);
    this.transformNode = this.mesh;
    if (pos) this.position.copyFrom(pos);
    this.stats = new StatsComponent();
    this.health = new HealthComponent(100);
  }
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    passCount++;
    console.log(`[PASS] Test ${passCount + failCount}: ${description}`);
  } else {
    failCount++;
    console.error(`[FAIL] Test ${passCount + failCount}: ${description}`);
  }
}

async function runAdversarialTestSuite() {
  console.log("==========================================================");
  console.log("CHALLENGER P3 ITERATION 2: ADVERSARIAL STRESS TEST SUITE");
  console.log("==========================================================\n");

  // Setup Headless Babylon Environment
  const engine = new NullEngine();
  const scene = new Scene(engine);

  // =========================================================================
  // SECTION 1: STAT MODIFIER STACK STRESS & ZERO STAT DRIFT
  // =========================================================================
  console.log("--- 1. Stat Modifier Stack Stress & Zero Stat Drift ---");

  const stats = new StatsComponent({
    [StatType.AttackDamage]: 20,
    [StatType.CritChance]: 0.15,
    [StatType.Armor]: 25,
    [StatType.MaxHp]: 150,
    [StatType.CooldownReduction]: 0.05,
    [StatType.MoveSpeed]: 6.0,
    [StatType.CritDamage]: 1.5,
  });

  // Test 1: Initial base stats
  assert(stats.getBaseStat(StatType.AttackDamage) === 20, "Base AttackDamage is 20");
  assert(stats.getStat(StatType.AttackDamage) === 20, "Computed AttackDamage with no mods is 20");

  // Test 2: setBaseStat triggers recalculation and event
  let eventFired = false;
  const sub = stats.onStatChanged.add((evt) => {
    if (evt.stat === StatType.AttackDamage && evt.newValue === 30) {
      eventFired = true;
    }
  });
  stats.setBaseStat(StatType.AttackDamage, 30);
  assert(eventFired && stats.getStat(StatType.AttackDamage) === 30, "setBaseStat updated value to 30 and fired observer");
  sub?.remove();
  stats.setBaseStat(StatType.AttackDamage, 20); // restore base

  // Test 3: Compound modifier formula: (base + flat) * (1 + percent)
  const modFlat1: StatModifier = { id: "mod_flat1", stat: StatType.AttackDamage, type: "flat", value: 10 };
  const modPct1: StatModifier = { id: "mod_pct1", stat: StatType.AttackDamage, type: "percent", value: 0.50 };
  stats.addModifier(modFlat1);
  stats.addModifier(modPct1);
  // (20 + 10) * (1.0 + 0.50) = 30 * 1.5 = 45
  assert(stats.getStat(StatType.AttackDamage) === 45, "Compound (20+10)*1.5 = 45");

  stats.removeModifier("mod_flat1");
  // (20 + 0) * 1.5 = 30
  assert(stats.getStat(StatType.AttackDamage) === 30, "Removing flat mod yields (20)*1.5 = 30");

  stats.removeModifier("mod_pct1");
  assert(stats.getStat(StatType.AttackDamage) === 20, "Removing percent mod restores exact base 20");

  // Test 4: 100,000 Random Additions & Removals Stress Test for Zero Stat Drift
  console.log("Running 100,000 random modifier addition/removal cycles...");
  const driftStats = new StatsComponent({
    [StatType.AttackDamage]: 100,
    [StatType.CritChance]: 0.20,
    [StatType.Armor]: 50,
    [StatType.MaxHp]: 500,
    [StatType.CooldownReduction]: 0.10,
    [StatType.MoveSpeed]: 8.0,
    [StatType.CritDamage]: 2.0,
  });

  const allStatTypes = [
    StatType.AttackDamage,
    StatType.CritChance,
    StatType.Armor,
    StatType.MaxHp,
    StatType.CooldownReduction,
    StatType.MoveSpeed,
    StatType.CritDamage,
  ];

  const activeModIds: string[] = [];
  for (let i = 0; i < 100000; i++) {
    const shouldAdd = activeModIds.length === 0 || Math.random() < 0.55;
    if (shouldAdd) {
      const id = `stress_mod_${i}`;
      const stat = allStatTypes[Math.floor(Math.random() * allStatTypes.length)];
      const type = Math.random() < 0.5 ? "flat" : "percent";
      const value = (Math.random() - 0.5) * 50;
      driftStats.addModifier({ id, stat, type, value, source: "stress" });
      activeModIds.push(id);
    } else {
      const popIdx = Math.floor(Math.random() * activeModIds.length);
      const idToRemove = activeModIds[popIdx];
      activeModIds.splice(popIdx, 1);
      driftStats.removeModifier(idToRemove);
    }
  }

  // Clear all remaining active modifiers
  for (const id of activeModIds) {
    driftStats.removeModifier(id);
  }

  // Verify Zero Stat Drift across all stat types
  let driftDetected = false;
  for (const statType of allStatTypes) {
    const currentVal = driftStats.getStat(statType);
    const baseVal = driftStats.getBaseStat(statType);
    if (currentVal !== baseVal) {
      driftDetected = true;
      console.error(`Drift detected on ${statType}: expected ${baseVal}, got ${currentVal}`);
    }
  }
  assert(!driftDetected, "Zero stat drift after 100,000 random modifier addition/removal cycles");

  // Test 5: Overwriting existing modifier ID updates modifier value
  stats.addModifier({ id: "overwrite_mod", stat: StatType.Armor, type: "flat", value: 15 });
  assert(stats.getStat(StatType.Armor) === 40, "Base 25 + 15 = 40 Armor");
  stats.addModifier({ id: "overwrite_mod", stat: StatType.Armor, type: "flat", value: 35 });
  assert(stats.getStat(StatType.Armor) === 60, "Overwritten mod: Base 25 + 35 = 60 Armor");
  stats.removeModifier("overwrite_mod");
  assert(stats.getStat(StatType.Armor) === 25, "Restored base 25 Armor");

  // Test 6: Removing non-existent modifier ID does not throw or corrupt state
  try {
    stats.removeModifier("non_existent_id");
    assert(true, "Removing non-existent modifier ID handled safely without throwing");
  } catch (err) {
    assert(false, `Removing non-existent modifier ID threw error: ${err}`);
  }

  // Test 7: removeModifiersBySource
  stats.addModifier({ id: "s1_m1", stat: StatType.MoveSpeed, type: "flat", value: 2.0, source: "buff_A" });
  stats.addModifier({ id: "s1_m2", stat: StatType.MoveSpeed, type: "flat", value: 3.0, source: "buff_A" });
  stats.addModifier({ id: "s2_m1", stat: StatType.MoveSpeed, type: "flat", value: 1.0, source: "buff_B" });
  assert(stats.getStat(StatType.MoveSpeed) === 12.0, "MoveSpeed 6.0 + 2 + 3 + 1 = 12.0");
  stats.removeModifiersBySource("buff_A");
  assert(stats.getStat(StatType.MoveSpeed) === 7.0, "After removing buff_A, MoveSpeed 6.0 + 1 = 7.0");
  stats.removeModifiersBySource("buff_B");
  assert(stats.getStat(StatType.MoveSpeed) === 6.0, "After removing buff_B, MoveSpeed restored to 6.0");

  // Test 8 & 9: Timed modifier auto-expiration under sub-millisecond deltas and multi-mod expiration
  stats.addModifier({ id: "timed_1", stat: StatType.AttackDamage, type: "flat", value: 10, duration: 1.0 });
  stats.addModifier({ id: "timed_2", stat: StatType.AttackDamage, type: "flat", value: 20, duration: 1.0 });
  assert(stats.getStat(StatType.AttackDamage) === 50, "AttackDamage with 2 timed mods = 50");

  // Tick tiny delta time (0.0001s) x 5000 steps = 0.5s total
  for (let i = 0; i < 5000; i++) {
    stats.update(0.0001);
  }
  assert(stats.getStat(StatType.AttackDamage) === 50, "At t=0.5s, timed mods are still active (50)");

  // Advance remaining 0.6s in single tick -> both mods expire simultaneously
  stats.update(0.6);
  assert(stats.getStat(StatType.AttackDamage) === 20, "At t=1.1s, both timed mods expired simultaneously, restoring 20");

  // Test 10: Clamping upper & lower bounds
  // CritChance clamping [0.0, 1.0]
  stats.addModifier({ id: "over_crit", stat: StatType.CritChance, type: "flat", value: 5.0 });
  assert(stats.getStat(StatType.CritChance) === 1.0, "CritChance clamped upper bound to 1.0");
  stats.removeModifier("over_crit");

  stats.addModifier({ id: "under_crit", stat: StatType.CritChance, type: "flat", value: -5.0 });
  assert(stats.getStat(StatType.CritChance) === 0.0, "CritChance clamped lower bound to 0.0");
  stats.removeModifier("under_crit");

  // CooldownReduction clamping [0.0, 0.50]
  stats.addModifier({ id: "over_cdr", stat: StatType.CooldownReduction, type: "flat", value: 0.90 });
  assert(stats.getStat(StatType.CooldownReduction) === 0.50, "CooldownReduction clamped upper bound to 0.50");
  stats.removeModifier("over_cdr");

  stats.addModifier({ id: "under_cdr", stat: StatType.CooldownReduction, type: "flat", value: -1.0 });
  assert(stats.getStat(StatType.CooldownReduction) === 0.0, "CooldownReduction clamped lower bound to 0.0");
  stats.removeModifier("under_cdr");

  // Armor clamping [0.0, infinity]
  stats.addModifier({ id: "under_armor", stat: StatType.Armor, type: "flat", value: -10000 });
  assert(stats.getStat(StatType.Armor) === 0.0, "Armor clamped lower bound to 0.0");
  stats.removeModifier("under_armor");

  // MaxHp clamping [1.0, infinity]
  stats.addModifier({ id: "under_hp", stat: StatType.MaxHp, type: "flat", value: -10000 });
  assert(stats.getStat(StatType.MaxHp) === 1.0, "MaxHp clamped lower bound to 1.0");
  stats.removeModifier("under_hp");

  // MoveSpeed clamping [0.1, infinity]
  stats.addModifier({ id: "under_speed", stat: StatType.MoveSpeed, type: "flat", value: -10000 });
  assert(stats.getStat(StatType.MoveSpeed) === 0.1, "MoveSpeed clamped lower bound to 0.1");
  stats.removeModifier("under_speed");

  // Test 11: MaxHp reduction auto-clamps currentHealth
  stats.modifyHealth(150); // full health 150
  assert(stats.currentHealth === 150, "Current health at full 150");
  stats.addModifier({ id: "debuff_max_hp", stat: StatType.MaxHp, type: "flat", value: -100 });
  // MaxHp drops to 50
  assert(stats.maxHealth === 50, "MaxHp dropped to 50");
  assert(stats.currentHealth === 50, "currentHealth auto-clamped down to 50");
  stats.removeModifier("debuff_max_hp");
  assert(stats.maxHealth === 150, "MaxHp restored to 150");
  assert(stats.currentHealth === 50, "currentHealth remains 50 after MaxHp increases");

  // Test 12: Resource pool modifyHealth edge cases
  stats.modifyHealth(200); // heal to max
  assert(stats.currentHealth === 150, "modifyHealth(+200) clamped to MaxHp 150");
  assert(stats.modifyHealth(0) === 150, "modifyHealth(0) returns currentHealth without change");

  let deathCount = 0;
  stats.onDeath.add(() => deathCount++);
  stats.modifyHealth(-300); // fatal damage
  assert(stats.currentHealth === 0, "currentHealth clamped to 0 on fatal damage");
  assert(deathCount === 1, "onDeath fired once on initial death");

  stats.modifyHealth(-100); // damage while already dead
  assert(stats.currentHealth === 0, "currentHealth remains 0");
  assert(deathCount === 1, "onDeath does NOT fire again on subsequent damage to dead entity");

  // Test 13: Resource pool modifyMana edge cases
  stats.modifyMana(200);
  assert(stats.currentMana === 100, "modifyMana(+200) clamped to maxMana 100");
  stats.modifyMana(-150);
  assert(stats.currentMana === 0, "modifyMana(-150) clamped to 0");
  stats.modifyMana(50);
  assert(stats.currentMana === 50, "modifyMana(+50) restored to 50");


  // =========================================================================
  // SECTION 2: DAMAGE MATH BOUNDARY VALUES
  // =========================================================================
  console.log("\n--- 2. Damage Math Boundary Values ---");

  const attacker = new MockEntity("attacker", "Attacker", scene);
  const defender = new MockEntity("defender", "Defender", scene);

  attacker.stats.setBaseStat(StatType.AttackDamage, 100);
  attacker.stats.setBaseStat(StatType.CritChance, 0.0); // 0% crit
  defender.stats.setBaseStat(StatType.Armor, 100); // 50% mitigation (100 / (100+100) = 0.5)
  defender.stats.setBaseStat(StatType.MaxHp, 1000);
  defender.stats.modifyHealth(1000);

  // Test 14: 0 Raw Damage boundary -> final damage clamped to min 1
  const resZero = DamageSystem.resolveDamage(attacker, defender, 0, false);
  assert(resZero.rawDamage === 0, "Raw damage is 0");
  assert(resZero.mitigatedDamage === 0, "Mitigated damage is 0");
  assert(resZero.finalDamage === 1, "0 raw damage clamped to minimum 1 final damage");

  // Test 15: Negative Raw Damage boundary -> final damage clamped to min 1
  const resNeg = DamageSystem.resolveDamage(attacker, defender, -100, false);
  assert(resNeg.rawDamage === -100, "Raw damage is -100");
  assert(resNeg.finalDamage === 1, "Negative raw damage clamped to minimum 1 final damage");

  // Test 16: Max / Massive Armor boundary (1 Billion Armor)
  defender.stats.setBaseStat(StatType.Armor, 1000000000);
  const resMaxArmor = DamageSystem.resolveDamage(attacker, defender, 1000, false);
  assert(resMaxArmor.mitigatedDamage < 0.001, "Mitigated damage under 1B armor is ~0");
  assert(resMaxArmor.finalDamage === 1, "1B armor mitigates damage but clamps final damage to min 1");

  // Test 17: 0 Armor boundary
  defender.stats.setBaseStat(StatType.Armor, 0);
  const resZeroArmor = DamageSystem.resolveDamage(attacker, defender, 100, false);
  assert(resZeroArmor.mitigatedDamage === 100, "0 armor yields 100% mitigated damage (100)");
  assert(resZeroArmor.finalDamage === 100, "Final damage is 100");

  // Test 18: Negative Armor boundary (treated as 0 armor)
  defender.stats.setBaseStat(StatType.Armor, -50);
  const resNegArmor = DamageSystem.resolveDamage(attacker, defender, 100, false);
  assert(resNegArmor.mitigatedDamage === 100, "Negative armor treated as 0 armor (mitigated = 100)");

  // Test 19: 100% Crit Rate boundary (1,000 iterations)
  attacker.stats.setBaseStat(StatType.CritChance, 1.0);
  attacker.stats.setBaseStat(StatType.CritDamage, 2.0);
  defender.stats.setBaseStat(StatType.Armor, 0);

  let critHitsCount = 0;
  for (let i = 0; i < 1000; i++) {
    const r = DamageSystem.resolveDamage(attacker, defender, 100, true);
    if (r.isCrit) critHitsCount++;
  }
  assert(critHitsCount === 1000, "100% CritChance produced exactly 1000/1000 critical hits");

  // Test 20: 0% Crit Rate boundary (1,000 iterations)
  attacker.stats.setBaseStat(StatType.CritChance, 0.0);
  critHitsCount = 0;
  for (let i = 0; i < 1000; i++) {
    const r = DamageSystem.resolveDamage(attacker, defender, 100, true);
    if (r.isCrit) critHitsCount++;
  }
  assert(critHitsCount === 0, "0% CritChance produced exactly 0/1000 critical hits");

  // Test 21: CritChance > 1.0 boundary (clamped to 1.0 by StatsComponent)
  attacker.stats.addModifier({ id: "huge_crit", stat: StatType.CritChance, type: "flat", value: 5.0 });
  critHitsCount = 0;
  for (let i = 0; i < 1000; i++) {
    const r = DamageSystem.resolveDamage(attacker, defender, 100, true);
    if (r.isCrit) critHitsCount++;
  }
  assert(critHitsCount === 1000, "CritChance > 1.0 (clamped 1.0) produced 1000/1000 critical hits");
  attacker.stats.removeModifier("huge_crit");

  // Test 22: canCrit = false with 100% CritChance
  attacker.stats.setBaseStat(StatType.CritChance, 1.0);
  critHitsCount = 0;
  for (let i = 0; i < 1000; i++) {
    const r = DamageSystem.resolveDamage(attacker, defender, 100, false);
    if (r.isCrit) critHitsCount++;
  }
  assert(critHitsCount === 0, "canCrit=false produced 0 crits even with 100% CritChance");

  // Test 23: Custom CritDamage stat multiplier
  attacker.stats.setBaseStat(StatType.CritDamage, 3.5);
  defender.stats.setBaseStat(StatType.Armor, 0);
  const resCritMult = DamageSystem.resolveDamage(attacker, defender, 100, true);
  assert(resCritMult.isCrit === true, "Hit was critical");
  assert(resCritMult.finalDamage === 350, "Raw 100 * 3.5x CritDamage = 350 final damage");

  // Test 24: DamageSystem observer notification
  let damageEventReceived = false;
  const dmgSub = DamageSystem.onDamageApplied.add((evt) => {
    if (evt.amount === 350 && evt.isCrit) {
      damageEventReceived = true;
    }
  });
  DamageSystem.resolveDamage(attacker, defender, 100, true);
  assert(damageEventReceived, "onDamageApplied observer notification fired with correct payload");
  dmgSub?.remove();

  // Test 25: Target Health & Stats deduction and isFatal calculation
  defender.stats.setBaseStat(StatType.MaxHp, 50);
  defender.stats.modifyHealth(50);
  defender.health.setMaxHp(50);
  defender.health.heal(50);

  const fatalRes = DamageSystem.resolveDamage(attacker, defender, 100, false);
  assert(fatalRes.isFatal === true, "Damage equal to or greater than current HP sets isFatal=true");
  assert(defender.stats.currentHealth === 0, "Defender StatsComponent health reduced to 0");
  assert(defender.health.currentHp === 0, "Defender HealthComponent hp reduced to 0");


  // =========================================================================
  // SECTION 3: ENEMY FSM UNDER RAPID DELTA-TIME UPDATES & STRESS
  // =========================================================================
  console.log("\n--- 3. Enemy FSM Under Rapid Delta-Time Updates & Stress ---");

  const enemyPos = new Vector3(0, 0, 0);
  const enemy = new Enemy("enemy_1", "Orc Sentry", scene, enemyPos, {
    aggroRadius: 9.0,
    attackRadius: 1.8,
    attackCooldown: 1.5,
    maxHp: 100,
    attackDamage: 15,
  });

  const playerTarget = new MockEntity("player", "Hero", scene, new Vector3(5.0, 0, 0));
  enemy.setTarget(playerTarget);

  assert(enemy.getAIState() === EnemyState.Idle, "Initial enemy state is Idle");

  // Test 28: Micro Delta-Time Stress (100,000 steps at dt = 0.0001s = 10s total)
  console.log("Simulating 100,000 micro update ticks (dt = 0.0001s)...");

  // Tick 1: Dist = 5.0m (within 9.0m aggro) -> Idle -> Aggro
  enemy.update(0.0001);
  assert(enemy.getAIState() === EnemyState.Aggro, `Enemy transitioned from Idle to Aggro when target at 5.0m (state=${enemy.getAIState()})`);

  // Advance 0.401s (4,010 micro-ticks) in Aggro alert window to account for IEEE 754 float accumulation
  for (let i = 0; i < 4010; i++) {
    enemy.update(0.0001);
  }
  assert(enemy.getAIState() === EnemyState.Chase, `Enemy transitioned from Aggro to Chase after 0.4s alert delay (state=${enemy.getAIState()})`);

  // Move player into attack range (1.2m <= 1.8m attackRadius)
  playerTarget.position.set(1.2, 0, 0);
  enemy.update(0.016);
  assert(enemy.getAIState() === EnemyState.Attack, `Enemy transitioned from Chase to Attack when target at 1.2m (state=${enemy.getAIState()})`);

  // Track attacks performed over 10 seconds of micro-step ticks (100,000 ticks)
  let attackCount = 0;
  enemy.onAttackPerformed.add(() => attackCount++);

  for (let i = 0; i < 100000; i++) {
    enemy.update(0.0001);
  }
  // Cooldown = 1.5s -> 10s / 1.5s = 6 attacks performed
  assert(attackCount === 6, `Micro-tick 10s simulation produced exactly 6 attacks (got ${attackCount})`);

  // Test 29: Spike Delta-Time Stress
  const enemySpike = new Enemy("enemy_spike", "Spike Orc", scene, new Vector3(0, 0, 0), {
    aggroRadius: 9.0,
    attackRadius: 1.8,
  });
  const spikePlayer = new MockEntity("player_spike", "Hero", scene, new Vector3(5.0, 0, 0));
  enemySpike.setTarget(spikePlayer);

  // Single huge frame spike (10.0s): Frame 1 transitions Idle -> Aggro.
  enemySpike.update(10.0);
  assert(enemySpike.getAIState() === EnemyState.Aggro, `10.0s spike frame transitioned Idle -> Aggro on frame 1 (state=${enemySpike.getAIState()})`);
  // Frame 2 with 0.5s delta advances aggroTimer past 0.4s aggroDelay -> transitions Aggro -> Chase.
  enemySpike.update(0.5);
  assert(enemySpike.getAIState() === EnemyState.Chase, `Subsequent frame with dt=0.5s transitioned Aggro -> Chase (state=${enemySpike.getAIState()})`);

  // Test 30: Rapid Target Position Oscillations (1,000 frame loop)
  console.log("Simulating 1,000 rapid target position oscillation frames...");
  const distances = [0.5, 4.0, 12.0, 25.0]; // Attack, Chase, Aggro/Leash, Leash Return
  let oscillationError = false;

  for (let frame = 0; frame < 1000; frame++) {
    const dist = distances[frame % distances.length];
    playerTarget.position.set(dist, 0, 0);
    try {
      enemy.update(0.016);
    } catch (err) {
      oscillationError = true;
      console.error(`Oscillation error at frame ${frame}:`, err);
    }
  }
  assert(!oscillationError, "FSM handled 1,000 rapid target position oscillation frames without throwing");

  // Test 31: Target Death Mid-Chase / Mid-Attack
  playerTarget.isAlive = false;
  enemy.update(0.016);
  assert(enemy.getAIState() === EnemyState.Idle, "Target death forces enemy state back to Idle");

  // Test 32: Null Target
  enemy.setTarget(null as any);
  enemy.update(0.016);
  assert(enemy.getAIState() === EnemyState.Idle, "Null target forces enemy state back to Idle");

  // Test 33: Dead Enemy Update Ignored
  const deadEnemy = new Enemy("dead_enemy", "Dead Orc", scene);
  deadEnemy.stats.modifyHealth(-500); // kill enemy
  assert(deadEnemy.getAIState() === EnemyState.Dead, "Enemy is Dead state");
  deadEnemy.update(0.016);
  assert(deadEnemy.getAIState() === EnemyState.Dead, "Dead enemy state unchanged after update call");

  // Test 34: Zero or Negative Delta-Time
  enemy.setState(EnemyState.Idle);
  enemy.update(0);
  assert(enemy.getAIState() === EnemyState.Idle, "update(0) handled safely");
  enemy.update(-0.1);
  assert(enemy.getAIState() === EnemyState.Idle, "update(-0.1) handled safely");

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n==========================================================");
  console.log(`EMPIRICAL TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${passCount + failCount} TESTS`);
  console.log("==========================================================");

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialTestSuite().catch((err) => {
  console.error("Adversarial test execution error:", err);
  process.exit(1);
});
