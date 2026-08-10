import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StatsComponent, StatType } from "../../src/entities/components/StatsComponent";
import { ArchetypeManager, ArchetypeType } from "../../src/combat/Archetypes";
import { TalentTree, TALENT_TREES } from "../../src/combat/TalentTree";
import { InputManager } from "../../src/core/InputManager";
import { Player } from "../../src/entities/Player";
import {
  SeismicSlamSkill,
  HolyBeaconSkill,
  ArcaneNovaSkill,
  WhirlwindSkill,
} from "../../src/combat/Skill";
import { DamageSystem } from "../../src/combat/DamageSystem";
import { Entity } from "../../src/entities/Entity";

// Polyfill minimal browser globals for Node.js execution
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.navigator === "undefined") {
  (globalThis as any).navigator = {
    getGamepads: () => [],
  };
}

class MockEntity extends Entity {
  public stats: StatsComponent;
  constructor(id: string, scene: Scene, stats: StatsComponent) {
    super(id, "MockEntity", scene);
    this.stats = stats;
  }
  public update(dt: number) {}
}

async function runTests() {
  console.log("==========================================================");
  console.log("       EMPIRICAL TEST SUITE — PHASE 4 VERIFICATION        ");
  console.log("==========================================================\n");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${testName}${detail ? ` (${detail})` : ""}`);
    } else {
      failedTests++;
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    }
  }

  // ------------------------------------------------------------------------
  // 1. STAT DRIFT TEST: 10,000 rapid archetype swaps
  // ------------------------------------------------------------------------
  console.log("--- 1. Testing Stat Drift (10,000 Rapid Archetype Swaps) ---");
  {
    const stats = new StatsComponent();
    const entity = new MockEntity("player", scene, stats);

    const archetypes: ArchetypeType[] = ["tank", "healer", "mage", "physical_dps"];

    const startTime = performance.now();
    for (let i = 0; i < 10000; i++) {
      const arch = archetypes[i % archetypes.length];
      ArchetypeManager.applyArchetypeToPlayer(entity, arch);
    }
    const durationMs = (performance.now() - startTime).toFixed(2);
    console.log(`Executed 10,000 archetype swaps in ${durationMs} ms`);

    // Verify Tank Stats after 10,000 swaps
    ArchetypeManager.applyArchetypeToPlayer(entity, "tank");
    const tankHp = stats.getStat(StatType.MaxHp);
    const tankArmor = stats.getStat(StatType.Armor);
    const tankAtk = stats.getStat(StatType.AttackDamage);
    const tankMana = stats.getStat(StatType.MaxMana);
    const tankSpeed = stats.getStat(StatType.MoveSpeed);
    const tankCrit = stats.getStat(StatType.CritChance);

    // Expected Tank: Base HP 180 + 15% passive = 207; Armor 25; ATK 18; Mana 80; Speed 6.5; Crit 0.05
    const tankHpOk = Math.abs(tankHp - 207) < 0.0001;
    const tankArmorOk = tankArmor === 25;
    const tankAtkOk = tankAtk === 18;
    const tankManaOk = tankMana === 80;
    const tankSpeedOk = tankSpeed === 6.5;
    const tankCritOk = Math.abs(tankCrit - 0.05) < 0.0001;

    assert(
      tankHpOk && tankArmorOk && tankAtkOk && tankManaOk && tankSpeedOk && tankCritOk,
      "Stat Drift - Tank Stats Exact Return",
      `HP=${tankHp} (exp 207), Armor=${tankArmor} (exp 25), ATK=${tankAtk} (exp 18), Mana=${tankMana} (exp 80), Speed=${tankSpeed} (exp 6.5), Crit=${tankCrit} (exp 0.05)`
    );

    // Verify Mage Stats
    ArchetypeManager.applyArchetypeToPlayer(entity, "mage");
    const mageHp = stats.getStat(StatType.MaxHp);
    const mageCrit = stats.getStat(StatType.CritChance);
    const mageAtk = stats.getStat(StatType.AttackDamage);
    // Expected Mage: Base HP 95; Base Crit 0.20 + 0.05 passive = 0.25; ATK 35
    const mageHpOk = mageHp === 95;
    const mageCritOk = Math.abs(mageCrit - 0.25) < 0.0001;
    const mageAtkOk = mageAtk === 35;

    assert(
      mageHpOk && mageCritOk && mageAtkOk,
      "Stat Drift - Mage Stats Exact Return",
      `HP=${mageHp} (exp 95), Crit=${mageCrit} (exp 0.25), ATK=${mageAtk} (exp 35)`
    );

    // Verify Healer Stats
    ArchetypeManager.applyArchetypeToPlayer(entity, "healer");
    const healerMana = stats.getStat(StatType.MaxMana);
    // Expected Healer: Base Mana 160 + 20% passive = 192
    const healerManaOk = Math.abs(healerMana - 192) < 0.0001;
    assert(healerManaOk, "Stat Drift - Healer Stats Exact Return", `Mana=${healerMana} (exp 192)`);

    // Verify Physical DPS Stats
    ArchetypeManager.applyArchetypeToPlayer(entity, "physical_dps");
    const dpsSpeed = stats.getStat(StatType.MoveSpeed);
    // Expected DPS: Base Speed 7.5 + 10% passive = 8.25
    const dpsSpeedOk = Math.abs(dpsSpeed - 8.25) < 0.0001;
    assert(dpsSpeedOk, "Stat Drift - Physical DPS Stats Exact Return", `Speed=${dpsSpeed} (exp 8.25)`);

    // Verify Modifier list does not leak memory
    const activeModifiersCount = (stats as any).modifiers.length;
    assert(
      activeModifiersCount === 1,
      "Stat Drift - No Modifier Array Memory Leak",
      `Active modifiers in StatsComponent = ${activeModifiersCount} (expected 1 passive modifier)`
    );
  }

  // ------------------------------------------------------------------------
  // 2. INPUT BUFFER TIMING & QUEUED SKILL EXECUTION TEST
  // ------------------------------------------------------------------------
  console.log("\n--- 2. Testing Input Buffer Timing (120ms Expiration & Cooldown Queue) ---");
  {
    const inputMgr = new InputManager(scene);

    // 2A. Sliding Window Expiration (120ms)
    inputMgr.bufferSkillInput(0);
    const consumedImmediate = inputMgr.consumeBufferedSkill();
    assert(
      consumedImmediate !== null && consumedImmediate.skillSlot === 0,
      "Input Buffer - Immediate Consumption",
      `Consumed skill slot ${consumedImmediate?.skillSlot}`
    );

    // Test buffer expiry window
    inputMgr.bufferSkillInput(1);
    const bufferedList = (inputMgr as any).bufferedInputs;
    assert(
      bufferedList.length === 1 && bufferedList[0].expiresAt > performance.now(),
      "Input Buffer - 120ms Expiration Timestamp Calculation",
      `expiresAt delta = ${(bufferedList[0]?.expiresAt - performance.now()).toFixed(1)}ms`
    );

    // 2B. Queued Skill Execution Upon Cooldown Expiry in Player Game Loop
    inputMgr.clearBuffer(); // Clear buffer so no leftover inputs remain
    const player = new Player("test_player", scene);
    player.setInputManager(inputMgr);

    const slamSkill = new SeismicSlamSkill();
    player.equippedSkills[0] = slamSkill;

    // Put skill on cooldown with 50ms remaining (well within 120ms window)
    slamSkill.currentCooldown = 0.05;

    // Player presses skill key at t = 0 (buffered in InputManager for 120ms)
    inputMgr.bufferSkillInput(0);

    // Frame 1 tick (16ms later). Cooldown is 34ms left.
    player.update(0.016);
    const cdAfterFrame1 = slamSkill.currentCooldown;
    assert(
      cdAfterFrame1 > 0,
      "Input Buffer - Skill Not Triggered Prematurely on Frame 1 (On Cooldown)",
      `CD after frame 1 = ${cdAfterFrame1.toFixed(3)}s`
    );

    // Frame 2 tick (40ms later). Total time elapsed = 56ms. Cooldown has now expired!
    player.update(0.040);
    const cdAfterFrame2 = slamSkill.currentCooldown;

    // If queued skill execution upon cooldown expiry works, the skill would execute on Frame 2
    // and reset its cooldown to 6.0s (or effective base cooldown).
    // If it fails (buffered input was prematurely discarded on Frame 1), CD will be 0!
    const executedOnCooldownExpiry = cdAfterFrame2 > 1.0;

    assert(
      executedOnCooldownExpiry,
      "Input Buffer - Queued Skill Executes Upon Cooldown Expiry Within 120ms",
      `Skill CD after cooldown expiry frame = ${cdAfterFrame2.toFixed(3)}s (expected ~6.0s if executed, got ${cdAfterFrame2.toFixed(3)}s)`
    );
  }

  // ------------------------------------------------------------------------
  // 3. TALENT TREE RESPEC & STAT MODIFIER CLEANUP TEST
  // ------------------------------------------------------------------------
  console.log("\n--- 3. Testing Talent Tree Respec & Stat Modifier Cleanup ---");
  {
    const stats = new StatsComponent();
    ArchetypeManager.applyArchetypeToPlayer({ stats } as any, "tank");
    const baselineTankArmor = stats.getStat(StatType.Armor); // 25
    const baselineTankHp = stats.getStat(StatType.MaxHp); // 207

    const talentTree = new TalentTree(stats, "tank");
    talentTree.setPlayerLevel(10); // 9 total talent points

    assert(
      talentTree.getTotalTalentPoints() === 9,
      "Talent Tree - Points Math (Level 10)",
      `Total points = ${talentTree.getTotalTalentPoints()} (expected 9)`
    );

    // Allocate Tank Active
    const allocActive = talentTree.allocateNode("tank_active");
    assert(allocActive, "Talent Tree - Allocate Root Active Node");

    // Allocate Tank Passive 1 (Hardened Armor: +10 flat armor per rank, max 3)
    talentTree.allocateNode("tank_passive_1");
    talentTree.allocateNode("tank_passive_1");
    talentTree.allocateNode("tank_passive_1");

    const spent = talentTree.getSpentTalentPoints("tank");
    const unallocated = talentTree.getUnallocatedTalentPoints("tank");

    assert(
      spent === 4 && unallocated === 5,
      "Talent Tree - Point Spent/Unallocated Math",
      `Spent = ${spent} (exp 4), Unallocated = ${unallocated} (exp 5)`
    );

    const armorWithTalents = stats.getStat(StatType.Armor);
    assert(
      armorWithTalents === baselineTankArmor + 30,
      "Talent Tree - Stat Modifiers Applied",
      `Armor with 3 ranks = ${armorWithTalents} (baseline ${baselineTankArmor} + 30 = ${baselineTankArmor + 30})`
    );

    // Perform Respec / Reset
    const refunded = talentTree.resetTalents("tank");
    assert(refunded === 4, "Talent Tree - Reset Refund Math", `Refunded = ${refunded} (exp 4)`);

    const armorAfterReset = stats.getStat(StatType.Armor);
    assert(
      armorAfterReset === baselineTankArmor,
      "Talent Tree - Stat Modifier Cleanup on Respec",
      `Armor after reset = ${armorAfterReset} (expected baseline ${baselineTankArmor})`
    );

    const unallocatedAfterReset = talentTree.getUnallocatedTalentPoints("tank");
    assert(
      unallocatedAfterReset === 9,
      "Talent Tree - All Points Refunded to Pool",
      `Unallocated = ${unallocatedAfterReset} (exp 9)`
    );

    // Test Prerequisite Enforcement
    const allocNoPre = talentTree.allocateNode("tank_passive_3");
    assert(
      !allocNoPre,
      "Talent Tree - Prerequisite Enforcement Prevents Premature Allocation"
    );
  }

  // ------------------------------------------------------------------------
  // 4. SKILL DAMAGE FORMULAS TEST
  // ------------------------------------------------------------------------
  console.log("\n--- 4. Testing Skill Damage Formulas ---");
  {
    // 4A. Seismic Slam (Tank)
    // Formula: (AttackDamage * 1.5) + (Armor * 0.8) + 15
    const tankStats = new StatsComponent({
      [StatType.AttackDamage]: 20,
      [StatType.Armor]: 30,
      [StatType.CritChance]: 0,
    });
    const casterTank = new MockEntity("tank", scene, tankStats);

    const targetStats = new StatsComponent({
      [StatType.Armor]: 0, // 0 armor for raw check
      [StatType.MaxHp]: 1000,
    });
    const targetEnemy = new MockEntity("enemy", scene, targetStats);

    const slam = new SeismicSlamSkill();
    // Raw damage = (20 * 1.5) + (30 * 0.8) + 15 = 30 + 24 + 15 = 69
    const slamResult = slam.execute(casterTank as any, Vector3.Zero(), [targetEnemy as any]);

    assert(
      slamResult.success && slamResult.totalDamage === 69,
      "Skill Damage Formula - Seismic Slam (Tank)",
      `Total Damage = ${slamResult.totalDamage} (expected 69)`
    );

    // 4B. Holy Beacon (Healer)
    // Formula: Heal per tick = (MaxHp * 0.03) + (AttackDamage * 0.45) + 8
    // Holy Damage to enemy per tick = (AttackDamage * 0.4) + 5
    const healerStats = new StatsComponent({
      [StatType.MaxHp]: 200,
      [StatType.AttackDamage]: 20,
      [StatType.CritChance]: 0,
    });
    healerStats.modifyHealth(-50); // Set current HP to 150/200
    const casterHealer = new MockEntity("healer", scene, healerStats);

    const enemyStats2 = new StatsComponent({
      [StatType.Armor]: 0,
      [StatType.MaxHp]: 1000,
    });
    const enemy2 = new MockEntity("enemy2", scene, enemyStats2);

    const beacon = new HolyBeaconSkill();
    // Heal = (200 * 0.03) + (20 * 0.45) + 8 = 6 + 9 + 8 = 23
    // Damage = (20 * 0.4) + 5 = 8 + 5 = 13
    const beaconResult = beacon.execute(casterHealer as any, Vector3.Zero(), [enemy2 as any]);

    assert(
      beaconResult.totalHeal === 23,
      "Skill Damage Formula - Holy Beacon Heal (Healer)",
      `Total Heal = ${beaconResult.totalHeal} (expected 23)`
    );
    assert(
      beaconResult.totalDamage === 13,
      "Skill Damage Formula - Holy Beacon Damage (Healer)",
      `Total Damage = ${beaconResult.totalDamage} (expected 13)`
    );

    // 4C. Arcane Nova (Mage)
    // Formula: (AttackDamage * 2.2) + 20
    const mageStats = new StatsComponent({
      [StatType.AttackDamage]: 40,
      [StatType.CritChance]: 0,
    });
    const casterMage = new MockEntity("mage", scene, mageStats);

    const enemyStats3 = new StatsComponent({
      [StatType.Armor]: 0,
      [StatType.MaxHp]: 1000,
    });
    const enemy3 = new MockEntity("enemy3", scene, enemyStats3);

    const nova = new ArcaneNovaSkill();
    // Raw damage = (40 * 2.2) + 20 = 88 + 20 = 108
    const novaResult = nova.execute(casterMage as any, Vector3.Zero(), [enemy3 as any]);

    assert(
      novaResult.totalDamage === 108,
      "Skill Damage Formula - Arcane Nova (Mage)",
      `Total Damage = ${novaResult.totalDamage} (expected 108)`
    );

    // 4D. Whirlwind (Physical Melee DPS)
    // Formula: (AttackDamage * 0.65) + 6
    const dpsStats = new StatsComponent({
      [StatType.AttackDamage]: 30,
      [StatType.CritChance]: 0,
    });
    const casterDps = new MockEntity("dps", scene, dpsStats);

    const enemyStats4 = new StatsComponent({
      [StatType.Armor]: 0,
      [StatType.MaxHp]: 1000,
    });
    const enemy4 = new MockEntity("enemy4", scene, enemyStats4);

    const ww = new WhirlwindSkill();
    // Tick damage = (30 * 0.65) + 6 = 19.5 + 6 = 25.5 -> Math.round = 26
    const wwResult = ww.execute(casterDps as any, Vector3.Zero(), [enemy4 as any]);

    assert(
      wwResult.totalDamage === 26,
      "Skill Damage Formula - Whirlwind Tick (Physical DPS)",
      `Total Damage = ${wwResult.totalDamage} (expected 26)`
    );
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  console.log("\n==========================================================");
  console.log(`SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log("==========================================================");

  engine.dispose();

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner failed with error:", err);
  process.exit(1);
});
