import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";

if (typeof window === "undefined") {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    devicePixelRatio: 1,
  };
}

if (typeof document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === "canvas") {
        return {
          getContext: () => ({
            measureText: () => ({ width: 100 }),
            fillRect: () => {},
            clearRect: () => {},
            getImageData: () => ({ data: new Uint8Array(4) }),
            putImageData: () => {},
            createImageData: () => ({ data: new Uint8Array(4) }),
            setTransform: () => {},
            drawFocusIfNeeded: () => {},
            save: () => {},
            restore: () => {},
            scale: () => {},
            rotate: () => {},
            translate: () => {},
            transform: () => {},
            beginPath: () => {},
            closePath: () => {},
            lineTo: () => {},
            moveTo: () => {},
            clip: () => {},
            rect: () => {},
            arc: () => {},
            arcTo: () => {},
            stroke: () => {},
            fill: () => {},
            fillText: () => {},
            strokeText: () => {},
            drawImage: () => {},
          }),
          style: {},
          width: 1024,
          height: 768,
          addEventListener: () => {},
          removeEventListener: () => {},
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 768 }),
        };
      }
      return {
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { StatType, StatsComponent } from "../src/entities/components/StatsComponent";
import { ArchetypeManager } from "../src/combat/Archetypes";
import { TalentTree } from "../src/combat/TalentTree";
import { SeismicSlamSkill, HolyBeaconSkill, ArcaneNovaSkill, WhirlwindSkill } from "../src/combat/Skill";
import { TownHubAltar } from "../src/entities/TownHubAltar";
import { TalentUI } from "../src/ui/TalentUI";
import { ArchetypeUI } from "../src/ui/ArchetypeUI";
import { HUD } from "../src/ui/HUD";
import { Entity } from "../src/entities/Entity";

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

class DummyTarget extends Entity {
  public isAlive: boolean = true;
  constructor(id: string, scene: Scene, pos: Vector3) {
    super(id, "Dummy", scene);
    this.transformNode.position.copyFrom(pos);
  }
}

async function runEmpiricalRemediationSuite() {
  console.log("=================================================================");
  console.log("   RUNNING PHASE 4 VISUAL & LIFECYCLE REMEDIATION EMPIRICAL TEST ");
  console.log("=================================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // -------------------------------------------------------------------
  // 1. RING EXPANSION MATERIAL & MESH DISPOSAL IN SKILL.TS
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 1: Skill Ring Expansion Material & Mesh Disposal ---");
  {
    const initialObservers = scene.onBeforeRenderObservable.observers.length;

    const slam = new SeismicSlamSkill();
    const caster = {
      scene,
      position: new Vector3(0, 0, 0),
      stats: new StatsComponent({ [StatType.AttackDamage]: 20, [StatType.Armor]: 25, [StatType.MaxMana]: 100 }),
    } as any;

    slam.execute(caster, new Vector3(0, 0, 0), []);

    // Verify ring mesh and material created
    const createdMesh = scene.meshes.find(m => m.name === "vfx_seismic_slam");
    const createdMat = scene.materials.find(m => m.name === "vfx_mat_seismic_slam");
    assert(createdMesh !== undefined, "VFX ring mesh 'vfx_seismic_slam' created on skill execution");
    assert(createdMat !== undefined, "VFX ring material 'vfx_mat_seismic_slam' created on skill execution");
    assert(scene.onBeforeRenderObservable.observers.length === initialObservers + 1, "Render observer added for ring animation");

    // Advance render frame before completion (progress < 1.0)
    scene.onBeforeRenderObservable.notifyObservers(scene);

    assert(createdMesh!.isDisposed() === false, "Ring mesh is not disposed while animation is active");
    const isMatDisposedBefore = (createdMat as any).isDisposed === true || scene.getMaterialByName("vfx_mat_seismic_slam") === null;
    assert(!isMatDisposedBefore, "Ring material is not disposed while animation is active");

    // Fast-forward performance.now by waiting or overriding performance.now / simulating completion
    const realNow = performance.now.bind(performance);
    let fakeTime = realNow() + 1000; // 1000ms elapsed (> 450ms duration)
    performance.now = () => fakeTime;

    const countBeforeNotify = scene.onBeforeRenderObservable.observers.length;
    console.log("Before notify, observer in array:", scene.onBeforeRenderObservable.observers[0]);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    const countAfterNotify1 = scene.onBeforeRenderObservable.observers.length;
    console.log("After notify 1, observer in array:", scene.onBeforeRenderObservable.observers[0]);

    // In Babylon.js Observable, remove() during notification sets _willBeUnregistered = true.
    // The observer is pruned from the array on the next notification pass or via hasObservers check / prune.
    scene.onBeforeRenderObservable.notifyObservers(scene);
    const countAfterNotify2 = scene.onBeforeRenderObservable.observers.length;
    console.log("After notify 2, observers count:", countAfterNotify2, "hasObservers:", scene.onBeforeRenderObservable.hasObservers());
    console.log("After notify 2, observers[0]:", scene.onBeforeRenderObservable.observers[0]);

    performance.now = realNow; // restore

    assert(createdMesh!.isDisposed() === true, "VFX ring mesh IS DISPOSED when animation finishes (progress >= 1.0)");
    const matDisposedAfter = (createdMat as any).isDisposed === true || scene.getMaterialByName("vfx_mat_seismic_slam") === null;
    assert(matDisposedAfter, "VFX ring material IS DISPOSED when animation finishes (progress >= 1.0)");
    assert(scene.onBeforeRenderObservable.hasObservers() === false, "Render observer IS UNREGISTERED (_willBeUnregistered=true, hasObservers() returns false)");
  }

  // -------------------------------------------------------------------
  // 2. OBSERVER CLEANUP ON UI & ALTAR DISPOSAL
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 2: Observer Cleanup on Disposal ---");

  // 2.a TownHubAltar Disposal Cleanup
  {
    const hasObsBefore = scene.onBeforeRenderObservable.hasObservers();
    const altar = new TownHubAltar(scene, new Vector3(10, 0, 10));

    assert(scene.onBeforeRenderObservable.hasObservers() === true, "TownHubAltar adds 1 active render observer for ring rotation");

    altar.dispose();

    assert(scene.onBeforeRenderObservable.hasObservers() === hasObsBefore, "TownHubAltar.dispose() successfully unregisters its render observer (hasObservers() restored)");
    assert(altar.mesh.isDisposed() === true, "TownHubAltar base mesh is disposed");
  }

  // 2.b TalentUI Disposal Cleanup
  {
    const mockStatsComponent = new StatsComponent();
    const tree = new TalentTree(mockStatsComponent, "tank");
    const mockInputManager = {
      onActiveDeviceChanged: new Observable<any>(),
      setModalOpen: () => {},
    } as any;

    const talentUI = new TalentUI(scene, tree, mockInputManager);

    assert(tree.onTalentAllocated.hasObservers() === true, "TalentUI subscribed to onTalentAllocated");
    assert(tree.onTalentReset.hasObservers() === true, "TalentUI subscribed to onTalentReset");
    assert(tree.onArchetypeSwapped.hasObservers() === true, "TalentUI subscribed to onArchetypeSwapped");
    assert(mockInputManager.onActiveDeviceChanged.hasObservers() === true, "TalentUI subscribed to onActiveDeviceChanged");

    talentUI.dispose();

    assert(tree.onTalentAllocated.hasObservers() === false, "TalentUI.dispose() unregisters onTalentAllocated observer (hasObservers() === false)");
    assert(tree.onTalentReset.hasObservers() === false, "TalentUI.dispose() unregisters onTalentReset observer (hasObservers() === false)");
    assert(tree.onArchetypeSwapped.hasObservers() === false, "TalentUI.dispose() unregisters onArchetypeSwapped observer (hasObservers() === false)");
    assert(mockInputManager.onActiveDeviceChanged.hasObservers() === false, "TalentUI.dispose() unregisters onActiveDeviceChanged observer (hasObservers() === false)");
  }

  // 2.c ArchetypeUI Disposal Cleanup
  {
    const mockPlayer = {
      level: 1,
      activeArchetypeId: "tank",
      setArchetype: () => true,
    } as any;

    const mockInputManager = {
      onActiveDeviceChanged: new Observable<any>(),
      setModalOpen: () => {},
    } as any;

    const archetypeUI = new ArchetypeUI(scene, mockPlayer, mockInputManager);

    assert(mockInputManager.onActiveDeviceChanged.hasObservers() === true, "ArchetypeUI subscribed to onActiveDeviceChanged");

    archetypeUI.dispose();

    assert(mockInputManager.onActiveDeviceChanged.hasObservers() === false, "ArchetypeUI.dispose() unregisters onActiveDeviceChanged observer (hasObservers() === false)");
  }

  // 2.d HUD Disposal Cleanup
  {
    const mockPlayer = {
      stats: new StatsComponent(),
      level: 1,
      xp: 0,
      activeArchetypeId: "tank",
      equippedSkills: [],
      getRequiredXpForNextLevel: () => 100,
      onLevelUp: new Observable<number>(),
      onArchetypeSwapped: new Observable<any>(),
    } as any;

    const hud = new HUD(scene, mockPlayer);

    assert(mockPlayer.stats.onHealthChanged.hasObservers() === true, "HUD subscribed to onHealthChanged");
    assert(mockPlayer.stats.onManaChanged.hasObservers() === true, "HUD subscribed to onManaChanged");
    assert(mockPlayer.stats.onStatChanged.hasObservers() === true, "HUD subscribed to onStatChanged");
    assert(mockPlayer.onLevelUp.hasObservers() === true, "HUD subscribed to onLevelUp");
    assert(mockPlayer.onArchetypeSwapped.hasObservers() === true, "HUD subscribed to onArchetypeSwapped");

    hud.dispose();

    assert(mockPlayer.stats.onHealthChanged.hasObservers() === false, "HUD.dispose() unregisters onHealthChanged observer");
    assert(mockPlayer.stats.onManaChanged.hasObservers() === false, "HUD.dispose() unregisters onManaChanged observer");
    assert(mockPlayer.stats.onStatChanged.hasObservers() === false, "HUD.dispose() unregisters onStatChanged observer");
    assert(mockPlayer.onLevelUp.hasObservers() === false, "HUD.dispose() unregisters onLevelUp observer");
    assert(mockPlayer.onArchetypeSwapped.hasObservers() === false, "HUD.dispose() unregisters onArchetypeSwapped observer");
  }

  // -------------------------------------------------------------------
  // 3. ARCHETYPE SKILL MECHANICS & TALENT TREE NODE UNLOCKING
  // -------------------------------------------------------------------
  console.log("\n--- SECTION 3: Archetype Skill Mechanics & Talent Tree Node Unlocking ---");

  // 3.a Archetype Level Gating Logic
  {
    assert(ArchetypeManager.isArchetypeUnlocked("tank", 1) === true, "Tank unlocked at level 1");
    assert(ArchetypeManager.isArchetypeUnlocked("healer", 9) === false, "Healer locked at level 9");
    assert(ArchetypeManager.isArchetypeUnlocked("healer", 10) === true, "Healer unlocked at level 10");
    assert(ArchetypeManager.isArchetypeUnlocked("mage", 19) === false, "Mage locked at level 19");
    assert(ArchetypeManager.isArchetypeUnlocked("mage", 20) === true, "Mage unlocked at level 20");
    assert(ArchetypeManager.isArchetypeUnlocked("physical_dps", 29) === false, "Physical DPS locked at level 29");
    assert(ArchetypeManager.isArchetypeUnlocked("physical_dps", 30) === true, "Physical DPS unlocked at level 30");
  }

  // 3.b Tank Archetype: Seismic Slam Formula & Impact Juicing
  {
    const slam = new SeismicSlamSkill();
    const stats = new StatsComponent({ [StatType.AttackDamage]: 20, [StatType.Armor]: 25, [StatType.CritChance]: 0 });
    const caster = { scene, position: new Vector3(0, 0, 0), stats } as any;

    const dummy = new DummyTarget("dummy1", scene, new Vector3(1, 0, 0));
    dummy.stats = new StatsComponent({ [StatType.Armor]: 0, [StatType.MaxHp]: 200 });

    // Formula: (Atk * 1.5) + (Armor * 0.8) + 15 = (20 * 1.5) + (25 * 0.8) + 15 = 30 + 20 + 15 = 65
    let hitStopDuration = 0;
    const mockJuice = {
      spawnFloatingText: () => {},
      triggerHitFlash: () => {},
      triggerHitStop: (durationMs: number) => { hitStopDuration = durationMs; }
    } as any;

    const res = slam.execute(caster, new Vector3(0, 0, 0), [dummy], mockJuice);

    assert(res.success === true, "Seismic Slam cast successfully");
    assert(res.targetsHit === 1, "Seismic Slam hit 1 target in range");
    assert(res.totalDamage === 65, `Seismic Slam raw damage (65) matches formula: expected 65, got ${res.totalDamage}`);
    assert(hitStopDuration === 80, "Seismic Slam triggered 80ms hit-stop freeze frame juice");
  }

  // 3.c Healer Archetype: Holy Beacon Healing & Holy Damage Formula
  {
    const beacon = new HolyBeaconSkill();
    const stats = new StatsComponent({ [StatType.MaxHp]: 200, [StatType.AttackDamage]: 40, [StatType.CritChance]: 0 });
    const caster = { scene, position: new Vector3(0, 0, 0), stats } as any;

    // Heal Formula: (MaxHp * 0.03) + (Atk * 0.45) + 8 = (200 * 0.03) + (40 * 0.45) + 8 = 6 + 18 + 8 = 32
    // Holy Damage Formula: (Atk * 0.4) + 5 = (40 * 0.4) + 5 = 16 + 5 = 21

    const enemyTarget = new DummyTarget("enemy1", scene, new Vector3(2, 0, 0));
    enemyTarget.stats = new StatsComponent({ [StatType.Armor]: 0, [StatType.MaxHp]: 100 });

    const res = beacon.execute(caster, new Vector3(0, 0, 0), [enemyTarget]);

    assert(res.success === true, "Holy Beacon cast successfully");
    assert(res.totalHeal === 32, `Holy Beacon heal (32) matches formula: expected 32, got ${res.totalHeal}`);
    assert(res.totalDamage === 21, `Holy Beacon enemy holy damage (21) matches formula: expected 21, got ${res.totalDamage}`);
  }

  // 3.d Mage Archetype: Arcane Nova Burst & Crit Freeze Frame
  {
    const nova = new ArcaneNovaSkill();
    const stats = new StatsComponent({ [StatType.AttackDamage]: 50, [StatType.CritChance]: 1.0, [StatType.CritDamage]: 2.0 });
    const caster = { scene, position: new Vector3(0, 0, 0), stats } as any;

    // Raw Damage Formula: (Atk * 2.2) + 20 = (50 * 2.2) + 20 = 110 + 20 = 130
    // With 100% Crit (CritMultiplier = 2.0): 130 * 2.0 = 260

    const enemy = new DummyTarget("enemy_mage", scene, new Vector3(3, 0, 0));
    enemy.stats = new StatsComponent({ [StatType.Armor]: 0, [StatType.MaxHp]: 500 });

    let hitStopDuration = 0;
    const mockJuice = {
      spawnFloatingText: () => {},
      triggerHitFlash: () => {},
      triggerHitStop: (durationMs: number) => { hitStopDuration = durationMs; }
    } as any;

    const res = nova.execute(caster, new Vector3(0, 0, 0), [enemy], mockJuice);

    assert(res.success === true, "Arcane Nova cast successfully");
    assert(res.isCrit === true, "Arcane Nova critical hit triggered with 100% crit chance");
    assert(res.totalDamage === 260, `Arcane Nova crit damage (260) matches formula (130 * 2.0): got ${res.totalDamage}`);
    assert(hitStopDuration === 60, "Arcane Nova critical hit triggered 60ms freeze frame juice");
  }

  // 3.e Physical DPS Archetype: Whirlwind Channeling & Rapid Ticks
  {
    const whirlwind = new WhirlwindSkill();
    const stats = new StatsComponent({ [StatType.AttackDamage]: 40, [StatType.CritChance]: 0 });
    const caster = { scene, position: new Vector3(0, 0, 0), stats } as any;

    // Tick Damage Formula: (Atk * 0.65) + 6 = (40 * 0.65) + 6 = 26 + 6 = 32

    const enemy = new DummyTarget("enemy_ww", scene, new Vector3(1.5, 0, 0));
    enemy.stats = new StatsComponent({ [StatType.Armor]: 0, [StatType.MaxHp]: 500 });

    const initialRes = whirlwind.execute(caster, new Vector3(0, 0, 0), [enemy]);
    assert(whirlwind.isChanneling === true, "Whirlwind starts channeling state on execute");
    assert(initialRes.totalDamage === 32, "Whirlwind first tick applies immediate 32 damage");

    // Advance 0.25s (tickRate is 0.25s)
    whirlwind.update(0.25);
    const tickRes = whirlwind.updateChannelTick(caster, [enemy]);
    assert(tickRes !== null, "Whirlwind channel tick triggered after 0.25s update");
    assert(tickRes?.totalDamage === 32, "Whirlwind channel tick deals 32 damage");

    // Fast-forward channel duration (2.5s)
    whirlwind.update(2.5);
    assert(whirlwind.isChanneling === false, "Whirlwind stops channeling when duration expires");
  }

  // 3.f Talent Tree Node Unlocking, Prerequisite Rules & Stat Modifier Stacking
  {
    const playerStats = new StatsComponent({ [StatType.Armor]: 10 });
    const tree = new TalentTree(playerStats, "tank");

    // Level 10 player = 9 talent points
    tree.setPlayerLevel(10);
    assert(tree.getUnallocatedTalentPoints("tank") === 9, "Level 10 has 9 unallocated talent points");

    // Allocate Tank Signature Active Skill Node
    assert(tree.isSignatureSkillUnlocked("tank") === false, "Tank signature skill locked before allocating node");
    assert(tree.allocateNode("tank_active", "tank") === true, "Allocated tank_active node");
    assert(tree.isSignatureSkillUnlocked("tank") === true, "Tank signature skill unlocked after allocating tank_active");

    // Prerequisite Verification: tank_passive_3 requires tank_passive_1 rank 3 (maxed)
    assert(tree.canAllocateNode("tank_passive_3", "tank").canAllocate === false, "tank_passive_3 cannot be allocated when prereq tank_passive_1 is rank 0");

    // Allocate rank 1 of tank_passive_1 (+10 Armor per rank)
    assert(tree.allocateNode("tank_passive_1", "tank") === true, "Allocated tank_passive_1 rank 1");
    assert(playerStats.getStat(StatType.Armor) === 20, "Player Armor increased by 10 (10 -> 20) after rank 1 passive allocation");

    assert(tree.canAllocateNode("tank_passive_3", "tank").canAllocate === false, "tank_passive_3 still locked when tank_passive_1 is rank 1 (max rank 3)");

    // Allocate rank 2 and rank 3 to max tank_passive_1
    tree.allocateNode("tank_passive_1", "tank");
    tree.allocateNode("tank_passive_1", "tank");

    assert(tree.getNodeRank("tank_passive_1", "tank") === 3, "tank_passive_1 maxed out at rank 3");
    assert(playerStats.getStat(StatType.Armor) === 40, "Player Armor is 40 (base 10 + 30 from rank 3 passive)");
    assert(tree.canAllocateNode("tank_passive_3", "tank").canAllocate === true, "tank_passive_3 can now be allocated after maxing prereq tank_passive_1!");

    // Test Talent Reset / Respec
    const refunded = tree.resetTalents("tank");
    assert(refunded === 4, "Reset refunded 4 talent points (1 active + 3 passive)");
    assert(tree.getUnallocatedTalentPoints("tank") === 9, "Unallocated points returned to 9");
    assert(playerStats.getStat(StatType.Armor) === 10, "Player Armor returned to base 10 after talent reset (stat modifier removed cleanly)");
    assert(tree.isSignatureSkillUnlocked("tank") === false, "Tank signature skill locked again after reset");
  }

  engine.dispose();

  console.log("=================================================================");
  console.log(` REMEDIATION SUMMARY: Passed ${passedCount} tests, Failed ${failedCount} tests.`);
  console.log("=================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runEmpiricalRemediationSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
