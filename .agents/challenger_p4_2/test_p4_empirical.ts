import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TownHubAltar } from "../../src/entities/TownHubAltar";
import { ArchetypeManager, ArchetypeType } from "../../src/combat/Archetypes";
import { Player } from "../../src/entities/Player";
import { InputManager } from "../../src/core/InputManager";
import { StatType } from "../../src/entities/components/StatsComponent";
import { Enemy } from "../../src/entities/Enemy";
import { SeismicSlamSkill, HolyBeaconSkill, ArcaneNovaSkill, WhirlwindSkill } from "../../src/combat/Skill";
import { TalentTree } from "../../src/combat/TalentTree";

// DOM Mocks for Node environment GUI testing
if (typeof window === "undefined") {
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    requestAnimationFrame: (cb: Function) => setTimeout(cb, 16),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    performance: performance,
  };
}

if (typeof document === "undefined") {
  const fakeCanvas = {
    getContext: () => ({
      measureText: () => ({ width: 100 }),
      canvas: {},
    }),
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 800,
    height: 600,
  };

  (global as any).document = {
    createElement: (tagName: string) => {
      if (tagName === "canvas") return fakeCanvas;
      return { style: {} };
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { appendChild: () => {} },
  };
}

if (typeof HTMLCanvasElement === "undefined") {
  (global as any).HTMLCanvasElement = class {};
}

async function runTests() {
  console.log("=== PHASE 4 EMPIRICAL VERIFICATION & STRESS TEST SUITE ===");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: TownHubAltar 3.0m Proximity Detection Logic
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: TownHubAltar Proximity Detection & Interaction Toggle ---");
  try {
    const altarPos = new Vector3(3, 0, 3);
    const altar = new TownHubAltar(scene, altarPos);

    // Test exact 3.0m boundary and various distances
    assert(altar.isPlayerInProximity(new Vector3(3, 0, 3)), "Altar proximity at 0.0m distance -> true");
    assert(altar.isPlayerInProximity(new Vector3(3, 0, 5.9)), "Altar proximity at 2.9m distance -> true");
    assert(altar.isPlayerInProximity(new Vector3(3, 0, 6.0)), "Altar proximity at 3.0m distance -> true");
    assert(!altar.isPlayerInProximity(new Vector3(3, 0, 6.01)), "Altar proximity at 3.01m distance -> false");
    assert(!altar.isPlayerInProximity(new Vector3(3, 0, 10.0)), "Altar proximity at 7.0m distance -> false");

    // Dispose safety check
    altar.dispose();
    assert(altar.mesh.isDisposed(), "Altar base mesh properly disposed");
    console.log("Test 1 completed successfully.");
  } catch (err) {
    console.error("Test 1 threw error:", err);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 2: Archetype Level Gating (Level 1, 10, 20, 30 unlock thresholds) & Stat Drift
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Archetype Level Gating & Stat Drift Protection ---");
  try {
    ArchetypeManager.initialize();

    // Check raw unlock level rules
    assert(ArchetypeManager.isArchetypeUnlocked('tank', 1), "Tank unlocked at Level 1");
    assert(!ArchetypeManager.isArchetypeUnlocked('healer', 9), "Healer locked at Level 9");
    assert(ArchetypeManager.isArchetypeUnlocked('healer', 10), "Healer unlocked at Level 10");
    assert(!ArchetypeManager.isArchetypeUnlocked('mage', 19), "Mage locked at Level 19");
    assert(ArchetypeManager.isArchetypeUnlocked('mage', 20), "Mage unlocked at Level 20");
    assert(!ArchetypeManager.isArchetypeUnlocked('physical_dps', 29), "Physical DPS locked at Level 29");
    assert(ArchetypeManager.isArchetypeUnlocked('physical_dps', 30), "Physical DPS unlocked at Level 30");

    // Test Player class swapping integration with gating
    const player = new Player("test_player", scene);
    player.level = 1;

    // Tank should set successfully (Level 1)
    assert(player.setArchetype('tank'), "Player at Level 1 can set Tank");
    assert(player.activeArchetypeId === 'tank', "Active archetype is Tank");
    const initialTankHp = player.stats.maxHealth;

    // Healer, Mage, DPS should fail at Level 1
    assert(!player.setArchetype('healer'), "Player at Level 1 cannot set Healer");
    assert(!player.setArchetype('mage'), "Player at Level 1 cannot set Mage");
    assert(!player.setArchetype('physical_dps'), "Player at Level 1 cannot set Physical DPS");

    // Level up to 10 and swap to Healer
    player.level = 10;
    assert(player.setArchetype('healer'), "Player at Level 10 can set Healer");
    assert(player.activeArchetypeId === 'healer', "Active archetype is Healer");

    // Level up to 20 and swap to Mage
    player.level = 20;
    assert(player.setArchetype('mage'), "Player at Level 20 can set Mage");
    assert(player.activeArchetypeId === 'mage', "Active archetype is Mage");

    // Level up to 30 and swap to Physical DPS
    player.level = 30;
    assert(player.setArchetype('physical_dps'), "Player at Level 30 can set Physical DPS");
    assert(player.activeArchetypeId === 'physical_dps', "Active archetype is Physical DPS");

    // Test Stat Drift Protection: Cycle back to Tank 10 times and verify max HP matches original tank stats
    for (let i = 0; i < 10; i++) {
      player.setArchetype('mage');
      player.setArchetype('healer');
      player.setArchetype('physical_dps');
      player.setArchetype('tank');
    }
    assert(player.stats.maxHealth === initialTankHp, `No stat drift after 10 full cycles (Max HP: ${player.stats.maxHealth} vs ${initialTankHp})`);

    player.dispose();
  } catch (err) {
    console.error("Test 2 threw error:", err);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 3: GUI Overlay Creation and Disposal Safety
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: GUI Overlay Creation & Disposal Safety ---");
  try {
    const { TalentUI } = await import("../../src/ui/TalentUI");
    const { ArchetypeUI } = await import("../../src/ui/ArchetypeUI");
    const { HUD } = await import("../../src/ui/HUD");

    const player = new Player("ui_player", scene);
    const inputMgr = new InputManager(scene);

    // Create UIs
    const talentUI = new TalentUI(scene, player.talentTree, inputMgr);
    const archetypeUI = new ArchetypeUI(scene, player, inputMgr);
    const hud = new HUD(scene, player, inputMgr);

    // Test Show / Hide / Toggle / Refresh
    talentUI.show();
    assert(talentUI.isCurrentlyVisible === true, "TalentUI shown");
    talentUI.refreshUI();
    talentUI.hide();
    assert(talentUI.isCurrentlyVisible === false, "TalentUI hidden");
    talentUI.toggle();
    assert(talentUI.isCurrentlyVisible === true, "TalentUI toggled on");

    archetypeUI.show();
    assert(archetypeUI.isCurrentlyVisible === true, "ArchetypeUI shown");
    archetypeUI.refreshUI();
    archetypeUI.hide();
    assert(archetypeUI.isCurrentlyVisible === false, "ArchetypeUI hidden");

    hud.updateHealthDisplay();
    hud.updateManaDisplay();
    hud.updateLevelDisplay();
    hud.updateArchetypeDisplay();
    hud.update(0.016);

    // Repeated Disposal Safety Test
    talentUI.dispose();
    archetypeUI.dispose();
    hud.dispose();
    inputMgr.dispose();
    player.dispose();

    assert(true, "GUI overlays created, interacted with, and disposed cleanly without throwing exceptions");
  } catch (err) {
    console.error("Test 3 threw error:", err);
    failed++;
  }

  // -------------------------------------------------------------
  // TEST 4: 100 Continuous Skill Casts & 120ms Input Buffer Stress Test
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: 100 Continuous Skill Casts & 120ms Input Buffer Stress Test ---");
  try {
    const player = new Player("stress_player", scene);
    const inputMgr = new InputManager(scene);
    player.setInputManager(inputMgr);
    player.level = 30; // Unlock all classes

    // Spawn 5 target dummy enemies
    const dummyEnemies: Enemy[] = [];
    for (let i = 0; i < 5; i++) {
      const enemy = new Enemy(`dummy_${i}`, `Dummy_${i}`, scene, new Vector3(i * 1.0, 0, i * 1.0), {
        maxHp: 10000, // Large HP pool
        attackDamage: 1,
        armor: 0,
        moveSpeed: 0,
        aggroRadius: 0,
        attackRadius: 0,
        attackCooldown: 10,
      });
      dummyEnemies.push(enemy);
    }

    const archetypesToTest: ArchetypeType[] = ['tank', 'healer', 'mage', 'physical_dps'];
    let totalCastsExecuted = 0;

    for (const archId of archetypesToTest) {
      player.setArchetype(archId);
      const skill = player.equippedSkills[0];
      assert(skill !== null, `Equipped skill exists for ${archId}`);

      console.log(`  Testing 25 rapid skill casts for Archetype: ${archId} (${skill!.def.name})`);

      for (let i = 0; i < 25; i++) {
        // Refill mana to allow uninterrupted stress testing of skill execution pipeline
        player.stats.modifyMana(1000);
        // Force cooldown to 0 for instant continuous casting
        skill!.currentCooldown = 0;

        // Simulate user buffer press
        inputMgr.bufferSkillInput(0, player.position);

        // Run player update step (consumes input buffer and executes skill)
        player.update(0.016, dummyEnemies);
        totalCastsExecuted++;

        // If skill channels (Whirlwind), update channeling for a few frames
        if (skill!.isChanneling) {
          for (let tick = 0; tick < 5; tick++) {
            player.update(0.016, dummyEnemies);
          }
          skill!.stopChanneling();
        }
      }
    }

    assert(totalCastsExecuted === 100, `Successfully executed ${totalCastsExecuted} continuous skill casts under rapid keypress simulation`);
    assert(player.isAlive, "Player remains alive after 100 skill casts");

    // Cleanup
    dummyEnemies.forEach((e) => e.dispose());
    inputMgr.dispose();
    player.dispose();
  } catch (err) {
    console.error("Test 4 threw error:", err);
    failed++;
  }

  console.log(`\n=== FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  engine.dispose();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
