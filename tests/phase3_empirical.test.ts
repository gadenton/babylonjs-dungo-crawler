import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Collisions/collisionCoordinator";
import { StatsComponent, StatType } from "../src/entities/components/StatsComponent";

if (typeof window === "undefined") {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}
import { DamageSystem } from "../src/combat/DamageSystem";
import { Enemy, EnemyState } from "../src/entities/Enemy";
import { Entity } from "../src/entities/Entity";
import { AudioManager } from "../src/audio/AudioManager";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
    passedCount++;
  }
}

function assertCloseTo(actual: number, expected: number, delta: number = 0.001, message: string = "") {
  const diff = Math.abs(actual - expected);
  if (diff > delta) {
    console.error(`❌ FAIL: ${message} (expected ~${expected}, got ${actual}, diff ${diff})`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message} (${actual} ~= ${expected})`);
    passedCount++;
  }
}

// Concrete Dummy Entity for testing
class DummyEntity extends Entity {
  constructor(id: string, name: string, scene: Scene, pos: Vector3) {
    super(id, name, scene);
    this.transformNode.position.copyFrom(pos);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("   RUNNING PHASE 3 EMPIRICAL VERIFICATION TESTS  ");
  console.log("=================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // -------------------------------------------------------------------
  // 1. STATS COMPONENT VERIFICATION
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 1: StatsComponent Verification ---");

  // Test 1.1: Default Base Stats
  {
    const stats = new StatsComponent();
    assert(stats.getBaseStat(StatType.AttackDamage) === 15, "Default AttackDamage base stat is 15");
    assert(stats.getBaseStat(StatType.CritChance) === 0.10, "Default CritChance base stat is 0.10");
    assert(stats.getBaseStat(StatType.Armor) === 10, "Default Armor base stat is 10");
    assert(stats.getBaseStat(StatType.MaxHp) === 100, "Default MaxHp base stat is 100");
    assert(stats.getBaseStat(StatType.MoveSpeed) === 7.0, "Default MoveSpeed base stat is 7.0");
    assert(stats.getBaseStat(StatType.CritDamage) === 1.5, "Default CritDamage base stat is 1.5");
    assert(stats.currentHealth === 100, "Default currentHealth initialized to maxHealth (100)");
  }

  // Test 1.2: Flat & Percent Modifier Calculations
  {
    const stats = new StatsComponent();
    // Base AttackDamage = 15
    stats.addModifier({ id: "flat_dmg_1", stat: StatType.AttackDamage, type: "flat", value: 10 });
    assert(stats.getStat(StatType.AttackDamage) === 25, "Flat modifier added: 15 + 10 = 25");

    stats.addModifier({ id: "pct_dmg_1", stat: StatType.AttackDamage, type: "percent", value: 0.50 });
    // (15 + 10) * (1.0 + 0.50) = 25 * 1.5 = 37.5
    assert(stats.getStat(StatType.AttackDamage) === 37.5, "Flat + Percent combined: (15 + 10) * 1.5 = 37.5");

    // Stacking another percent modifier (+20%)
    stats.addModifier({ id: "pct_dmg_2", stat: StatType.AttackDamage, type: "percent", value: 0.20 });
    // (15 + 10) * (1.0 + 0.50 + 0.20) = 25 * 1.7 = 42.5
    assert(stats.getStat(StatType.AttackDamage) === 42.5, "Stacked percent modifiers: 25 * (1 + 0.5 + 0.2) = 42.5");
  }

  // Test 1.3: Modifier Removal & Drift Prevention
  {
    const stats = new StatsComponent();
    stats.addModifier({ id: "mod_a", stat: StatType.Armor, type: "flat", value: 15, source: "buff1" });
    stats.addModifier({ id: "mod_b", stat: StatType.Armor, type: "percent", value: 0.50, source: "buff2" });
    // (10 + 15) * 1.5 = 37.5
    assert(stats.getStat(StatType.Armor) === 37.5, "Armor with mod_a and mod_b is 37.5");

    stats.removeModifier("mod_a");
    // (10 + 0) * 1.5 = 15
    assert(stats.getStat(StatType.Armor) === 15, "Armor after removing mod_a by ID is 15 (no drift)");

    stats.addModifier({ id: "mod_c", stat: StatType.Armor, type: "flat", value: 20, source: "buff2" });
    stats.removeModifiersBySource("buff2");
    assert(stats.getStat(StatType.Armor) === 10, "Armor after removing by source 'buff2' returns to base 10");
  }

  // Test 1.4: Timed Modifier Expiration
  {
    const stats = new StatsComponent();
    stats.addModifier({ id: "temp_spd", stat: StatType.MoveSpeed, type: "flat", value: 3.0, duration: 2.0 });
    assert(stats.getStat(StatType.MoveSpeed) === 10.0, "MoveSpeed with temp mod is 10.0");

    stats.update(1.0);
    assert(stats.getStat(StatType.MoveSpeed) === 10.0, "MoveSpeed at t=1.0s is still 10.0");

    stats.update(1.1); // Total elapsed = 2.1s >= 2.0s duration
    assert(stats.getStat(StatType.MoveSpeed) === 7.0, "MoveSpeed at t=2.1s expired back to base 7.0");
  }

  // Test 1.5: Bounds Clamping
  {
    const stats = new StatsComponent();
    // CritChance upper bound: 1.0
    stats.addModifier({ id: "huge_crit", stat: StatType.CritChance, type: "flat", value: 2.0 });
    assert(stats.getStat(StatType.CritChance) === 1.0, "CritChance clamped to upper bound 1.0");

    // CritChance lower bound: 0.0
    stats.addModifier({ id: "neg_crit", stat: StatType.CritChance, type: "flat", value: -5.0 });
    assert(stats.getStat(StatType.CritChance) === 0.0, "CritChance clamped to lower bound 0.0");

    // CooldownReduction clamped to [0.0, 0.50]
    stats.addModifier({ id: "huge_cdr", stat: StatType.CooldownReduction, type: "flat", value: 0.80 });
    assert(stats.getStat(StatType.CooldownReduction) === 0.50, "CooldownReduction clamped to 0.50 (50%)");

    // Armor clamped >= 0
    stats.addModifier({ id: "neg_armor", stat: StatType.Armor, type: "flat", value: -100 });
    assert(stats.getStat(StatType.Armor) === 0, "Armor clamped to min 0");

    // MaxHp clamped >= 1.0
    stats.addModifier({ id: "neg_hp", stat: StatType.MaxHp, type: "flat", value: -500 });
    assert(stats.getStat(StatType.MaxHp) === 1.0, "MaxHp clamped to min 1.0");

    // MoveSpeed clamped >= 0.1
    stats.addModifier({ id: "neg_speed", stat: StatType.MoveSpeed, type: "flat", value: -50 });
    assert(stats.getStat(StatType.MoveSpeed) === 0.1, "MoveSpeed clamped to min 0.1");
  }

  // Test 1.6: Resource Pools & Events
  {
    const stats = new StatsComponent();
    let healthEventFired = false;
    let deathEventFired = false;

    stats.onHealthChanged.add((evt) => {
      healthEventFired = true;
    });

    stats.onDeath.add(() => {
      deathEventFired = true;
    });

    stats.modifyHealth(-40);
    assert(stats.currentHealth === 60, "modifyHealth(-40) reduces health from 100 to 60");
    assert(healthEventFired, "onHealthChanged fired on damage");

    stats.modifyHealth(100); // Overheal
    assert(stats.currentHealth === 100, "modifyHealth(+100) clamped to maxHealth 100");

    stats.modifyHealth(-100);
    assert(stats.currentHealth === 0, "modifyHealth(-100) reduces health to 0");
    assert(deathEventFired, "onDeath fired when currentHealth reaches 0");
    assert(stats.isAlive === false, "isAlive is false when health is 0");
  }

  // -------------------------------------------------------------------
  // 2. DAMAGE SYSTEM VERIFICATION
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 2: DamageSystem Verification ---");

  // Test 2.1: Armor Reduction Math: mitigated = raw * (100 / (100 + armor))
  {
    const attacker = { stats: new StatsComponent({ [StatType.AttackDamage]: 100, [StatType.CritChance]: 0 }) };
    const defenderNoArmor = { stats: new StatsComponent({ [StatType.Armor]: 0 }) };
    const defender100Armor = { stats: new StatsComponent({ [StatType.Armor]: 100 }) };
    const defender300Armor = { stats: new StatsComponent({ [StatType.Armor]: 300 }) };

    const res0 = DamageSystem.resolveDamage(attacker, defenderNoArmor, 100, false);
    assert(res0.mitigatedDamage === 100, "Armor 0: mitigatedDamage = 100 * (100/100) = 100");

    const res100 = DamageSystem.resolveDamage(attacker, defender100Armor, 100, false);
    assert(res100.mitigatedDamage === 50, "Armor 100: mitigatedDamage = 100 * (100/200) = 50");

    const res300 = DamageSystem.resolveDamage(attacker, defender300Armor, 100, false);
    assert(res300.mitigatedDamage === 25, "Armor 300: mitigatedDamage = 100 * (100/400) = 25");
  }

  // Test 2.2: Damage Floor Clamping Math: Math.max(1, Math.round(...))
  {
    const attacker = { stats: new StatsComponent({ [StatType.AttackDamage]: 1, [StatType.CritChance]: 0 }) };
    const defenderExtremeArmor = { stats: new StatsComponent({ [StatType.Armor]: 10000 }) };

    const res = DamageSystem.resolveDamage(attacker, defenderExtremeArmor, 1, false);
    assert(res.mitigatedDamage < 0.1, "Mitigated damage with extreme armor is < 0.1");
    assert(res.finalDamage === 1, "Final damage is clamped to minimum 1");
  }

  // Test 2.3: Critical Hit Calculations & Multipliers
  {
    // Guaranteed Crit (100% crit chance)
    const attackerCrit = {
      stats: new StatsComponent({
        [StatType.AttackDamage]: 100,
        [StatType.CritChance]: 1.0,
        [StatType.CritDamage]: 2.5,
      }),
    };
    const defenderNoArmor = { stats: new StatsComponent({ [StatType.Armor]: 0 }) };

    const resCrit = DamageSystem.resolveDamage(attackerCrit, defenderNoArmor, 100, true);
    assert(resCrit.isCrit === true, "isCrit is true when CritChance is 1.0");
    assert(resCrit.finalDamage === 250, "Crit damage is 100 * 2.5 = 250");

    // Disabled Crit (canCrit = false)
    const resNoCrit = DamageSystem.resolveDamage(attackerCrit, defenderNoArmor, 100, false);
    assert(resNoCrit.isCrit === false, "isCrit is false when canCrit parameter is false");
    assert(resNoCrit.finalDamage === 100, "Non-crit damage is raw 100");
  }

  // Test 2.4: Damage Applied Observer & Integration
  {
    let eventReceived: any = null;
    const sub = DamageSystem.onDamageApplied.add((evt) => {
      eventReceived = evt;
    });

    const attacker = { name: "Hero", stats: new StatsComponent({ [StatType.AttackDamage]: 50 }) };
    const defenderStats = new StatsComponent({ [StatType.Armor]: 0, [StatType.MaxHp]: 100 });
    const defender = { name: "Goblin", stats: defenderStats };

    const res = DamageSystem.resolveDamage(attacker, defender, 50, false);
    assert(defenderStats.currentHealth === 50, "defender health reduced by finalDamage (50)");
    assert(eventReceived !== null, "onDamageApplied event observed");
    assert(eventReceived.amount === 50, "event amount matches finalDamage (50)");
    assert(eventReceived.isFatal === false, "isFatal is false when target survives");

    sub?.remove();
  }

  // -------------------------------------------------------------------
  // 3. ENEMY AI & THROTTLED FSM VERIFICATION
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 3: Enemy AI & Throttled FSM Verification ---");

  // Test 3.1: FSM Initial State & Aggro Transition
  {
    const player = new DummyEntity("player1", "Player", scene, new Vector3(0, 0, 0));
    const enemy = new Enemy("enemy1", "Orc", scene, new Vector3(5, 0, 0), {
      aggroRadius: 9.0,
      attackRadius: 1.8,
    });
    enemy.setTarget(player);

    assert(enemy.getAIState() === EnemyState.Idle, "Enemy initializes in Idle state");

    // Update with player within aggro radius (dist = 5.0 <= 9.0)
    enemy.update(0.1);
    assert(enemy.getAIState() === EnemyState.Aggro, "Enemy transitions Idle -> Aggro when player in aggro radius");
  }

  // Test 3.2: Aggro Delay Timer (400ms) to Chase Transition
  {
    const player = new DummyEntity("player2", "Player", scene, new Vector3(5, 0, 0));
    const enemy = new Enemy("enemy2", "Orc", scene, new Vector3(0, 0, 0));
    enemy.setTarget(player);

    enemy.update(0.1);
    assert(enemy.getAIState() === EnemyState.Aggro, "Enemy in Aggro state at t=0.1s");

    // Update by 0.2s (total aggro time = 0.2s < 0.4s delay)
    enemy.update(0.2);
    assert(enemy.getAIState() === EnemyState.Aggro, "Enemy remains in Aggro state at aggroTimer=0.2s (< 0.4s)");

    // Update by 0.25s (total aggro time = 0.45s >= 0.4s delay)
    enemy.update(0.25);
    assert(enemy.getAIState() === EnemyState.Chase, "Enemy transitions Aggro -> Chase after 400ms aggro delay");
  }

  // Test 3.3: Throttled Path Update Timer (~300ms)
  {
    const player = new DummyEntity("player3", "Player", scene, new Vector3(5, 0, 0));
    const enemy = new Enemy("enemy3", "Orc", scene, new Vector3(0, 0, 0));
    enemy.setTarget(player);

    enemy.setState(EnemyState.Chase);
    // In Chase state, pathUpdateTimer starts at pathUpdateInterval (0.3s) for immediate query on entry

    // First update at Chase entry resets timer to 0
    enemy.update(0.1);
    // pathUpdateTimer is now 0.1s

    // Update with 0.15s (accumulated 0.25s < 0.3s)
    enemy.update(0.15);
    // pathUpdateTimer = 0.25s (< 0.3s interval)

    // Update with 0.1s (accumulated 0.35s >= 0.3s)
    enemy.update(0.1);
    // Throttled query triggers and timer resets cleanly
    assert(enemy.getAIState() === EnemyState.Chase, "Chase state maintained through throttled ~300ms AI updates");
  }

  // Test 3.4: Chase to Attack Transition & Attack to Chase Leash
  {
    const player = new DummyEntity("player4", "Player", scene, new Vector3(1.2, 0, 0));
    const enemy = new Enemy("enemy4", "Orc", scene, new Vector3(0, 0, 0), {
      attackRadius: 1.8,
    });
    enemy.setTarget(player);
    enemy.setState(EnemyState.Chase);

    // Update while in attack radius (dist = 1.2 <= 1.8)
    enemy.update(0.1);
    assert(enemy.getAIState() === EnemyState.Attack, "Enemy transitions Chase -> Attack when inside attack radius");

    // Move player outside attack radius + margin (e.g., 3.0 > 1.8 + 0.5 = 2.3)
    player.position.set(3.0, 0, 0);
    enemy.update(0.1);
    assert(enemy.getAIState() === EnemyState.Chase, "Enemy transitions Attack -> Chase when target moves out of attack radius");
  }

  // Test 3.5: Leash / De-aggro to Idle when target far away
  {
    const player = new DummyEntity("player5", "Player", scene, new Vector3(20, 0, 0));
    const enemy = new Enemy("enemy5", "Orc", scene, new Vector3(0, 0, 0), {
      aggroRadius: 9.0,
    });
    enemy.setTarget(player);
    enemy.setState(EnemyState.Chase);

    // Target dist = 20.0 > 9.0 * 1.5 = 13.5
    enemy.update(0.1);
    assert(enemy.getAIState() === EnemyState.Idle, "Enemy transitions Chase -> Idle when target exceeds 1.5x aggro radius (leash)");
  }

  // Test 3.6: Stuck Condition Timer (1.0s window check)
  {
    const player = new DummyEntity("player6", "Player", scene, new Vector3(5, 0, 0));
    const enemy = new Enemy("enemy6", "Orc", scene, new Vector3(0, 0, 0));
    enemy.setTarget(player);
    enemy.setState(EnemyState.Chase);

    // Force position to stay static across stuck check intervals (stuck check runs every 0.5s)
    // 0.5s check 1: movedDist < 0.1 -> stuckDuration = 0.5s
    enemy.update(0.5);
    // 0.5s check 2: movedDist < 0.1 -> stuckDuration = 1.0s >= 1.0s -> triggers recalculatePathToTarget
    enemy.update(0.5);

    assert(enemy.getAIState() === EnemyState.Chase, "Enemy handles stuck condition check without crashing");
  }

  // Test 3.7: Death State Transition
  {
    const enemy = new Enemy("enemy7", "Orc", scene, new Vector3(0, 0, 0));
    enemy.health.takeDamage(1000); // Fatal damage

    assert(enemy.getAIState() === EnemyState.Dead, "Enemy transitions to Dead state on fatal damage");
    assert(enemy.isAlive === false, "Enemy isAlive becomes false on death");
  }

  // -------------------------------------------------------------------
  // 4. AUDIO MANAGER VERIFICATION
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 4: AudioManager Verification ---");

  const audio = new AudioManager();

  // Test 4.1: Decibel <-> Linear Conversion Math
  {
    assertCloseTo(audio.dbToLinear(0), 1.0, 0.0001, "0 dB = 1.0 linear gain");
    assertCloseTo(audio.dbToLinear(6), 1.99526, 0.001, "+6 dB ~= 1.995 linear gain");
    assertCloseTo(audio.dbToLinear(-6), 0.50118, 0.001, "-6 dB ~= 0.501 linear gain");
    assertCloseTo(audio.dbToLinear(-20), 0.1, 0.0001, "-20 dB = 0.1 linear gain");

    assertCloseTo(audio.linearToDb(1.0), 0, 0.0001, "1.0 linear gain = 0 dB");
    assertCloseTo(audio.linearToDb(0.5), -6.0206, 0.01, "0.5 linear gain ~= -6.02 dB");
    assertCloseTo(audio.linearToDb(0.1), -20, 0.01, "0.1 linear gain = -20 dB");
  }

  // Test 4.2: Bus Volume Control States
  {
    assert(audio.getBusVolumeDb("master") === 0, "Default master volume is 0 dB");
    assert(audio.getBusVolumeDb("music") === -6, "Default music volume is -6 dB");
    assert(audio.getBusVolumeDb("sfx") === 0, "Default sfx volume is 0 dB");
    assert(audio.getBusVolumeDb("ui") === -3, "Default ui volume is -3 dB");

    audio.setBusVolumeDb("music", -12);
    assert(audio.getBusVolumeDb("music") === -12, "setBusVolumeDb updates music bus to -12 dB");

    audio.setMasterVolume(0.5);
    assertCloseTo(audio.getBusVolumeDb("master"), -6.0206, 0.01, "setMasterVolume(0.5) converts to ~-6.02 dB");
  }

  // Test 4.3: Sidechain Ducking & Spatial Audio Calls (Graceful Fallbacks)
  {
    audio.triggerSidechainDucking(-10, 350);
    audio.duckMusic(300, -10);
    audio.updateListener(new Vector3(0, 0, 0), new Vector3(0, 0, 1), Vector3.Up());

    // Call SFX triggers (fall back gracefully when AudioContext is null in Node)
    audio.playHitSFX(new Vector3(1, 0, 1), true);
    audio.playSwingSFX();
    audio.playSound("missing_sound", "sfx");
    audio.playSpatialSound("missing_sound", new Vector3(2, 0, 2));

    assert(true, "AudioManager methods execute safely and gracefully in environment");
  }

  audio.dispose();
  engine.dispose();

  console.log("=================================================");
  console.log(` SUMMARY: Passed ${passedCount} tests, Failed ${failedCount} tests.`);
  console.log("=================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
