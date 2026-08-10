import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import {
  createHeadlessTestContext,
  assertGridDimensions,
  assertMergedColliders,
  assertNavMeshPath,
  assertSceneHierarchyClean,
} from "./harness";

import { Generator } from "../src/dungeon/Generator";
import { TileMap } from "../src/dungeon/TileMap";
import { NavMeshManager } from "../src/dungeon/NavMeshManager";
import { TownHub } from "../src/town/TownHub";
import { Player } from "../src/entities/Player";
import { Enemy } from "../src/entities/Enemy";

async function runTier4Tests() {
  console.log("==================================================");
  console.log("  RUNNING TIER 4: FULL GAMEPLAY LOOP & AUDIT TESTS");
  console.log("==================================================\n");

  const ctx = createHeadlessTestContext();
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (!condition) {
      console.error(`❌ FAIL: ${testName} ${detail ? `- ${detail}` : ""}`);
      throw new Error(`Test failed: ${testName}`);
    }
    passedCount++;
    console.log(`✅ PASS: ${testName}`);
  }

  try {
    // ----------------------------------------------------
    // Phase 1: Town Hub Bootstrap State
    // ----------------------------------------------------
    console.log("--- Phase 1: Town Hub Start ---");
    const townHub = new TownHub(ctx.scene);
    await townHub.preloadAssets();
    const builtTown = await townHub.build();

    const player = new Player("player_t4", ctx.scene);
    player.transformNode.position.copyFrom(builtTown.spawnPoint);

    assert(builtTown.rootNode !== null && !builtTown.rootNode.isDisposed(), "townHubRoot is active in scene");
    assert(player.position.equals(builtTown.spawnPoint), "Player spawned at town spawn position");

    const townPhaseMeshNames = ctx.scene.meshes.map((m) => m.name);
    console.log(`[Town Phase] Active meshes in scene: ${townPhaseMeshNames.length}`);

    // ----------------------------------------------------
    // Phase 2: Town Proximity & Altar Interaction Trigger
    // ----------------------------------------------------
    console.log("\n--- Phase 2: Proximity Check & Altar Interaction ---");
    player.transformNode.position.copyFrom(builtTown.altarPosition);
    player.update(0.016);

    assert(builtTown.altar.isPlayerInProximity(player.position) === true, "Player inside altar proximity");

    let transitionFired = false;
    builtTown.altar.onInteract.add(() => {
      transitionFired = true;
    });

    builtTown.altar.interact();
    assert(transitionFired === true, "Altar interaction event triggered");

    // ----------------------------------------------------
    // Phase 3: Transition & Scene Hierarchy Cleanup Audit
    // ----------------------------------------------------
    console.log("\n--- Phase 3: Level Transition & Scene Hierarchy Audit ---");

    // Cleanly dispose Town Hub
    builtTown.altar.dispose();
    builtTown.rootNode.dispose();
    townHub.dispose();

    assertSceneHierarchyClean(ctx.scene, "townHubRoot");

    // Audit for lingering town nodes in rootNodes / transformNodes / meshes
    const leakedTownNodes = ctx.scene.transformNodes.filter(
      (node) => !node.isDisposed() && (node.name === "townHubRoot" || node.name.startsWith("town_"))
    );
    assert(
      leakedTownNodes.length === 0,
      `Strict scene hierarchy audit: 0 leaked town nodes remain (found ${leakedTownNodes.length})`
    );

    const leakedTownMeshes = ctx.scene.meshes.filter(
      (mesh) => !mesh.isDisposed() && mesh.name.startsWith("town_")
    );
    assert(
      leakedTownMeshes.length === 0,
      `Strict scene hierarchy audit: 0 leaked town meshes remain (found ${leakedTownMeshes.length})`
    );

    // ----------------------------------------------------
    // Phase 4: Dungeon Generation, NavMesh & Enemy Spawning
    // ----------------------------------------------------
    console.log("\n--- Phase 4: Dungeon Load & Enemy Spawning ---");
    const generator = new Generator({ width: 40, height: 40, seed: 12345 });
    const dungeonGrid = generator.generate();
    assertGridDimensions(dungeonGrid, 40, 40);

    const tileMap = new TileMap(ctx.scene);
    await tileMap.preloadAssets();
    const builtDungeon = await tileMap.buildFromGrid(dungeonGrid);

    assert(ctx.scene.getNodeByName("dungeonRoot") !== null, "dungeonRoot active in scene graph");
    assertMergedColliders(builtDungeon);

    const navMeshManager = new NavMeshManager();
    await navMeshManager.init(3000);
    const navBuilt = await navMeshManager.createNavMesh(builtDungeon.mergedFloors!);
    assert(navBuilt === true, "NavMesh constructed over dungeon mergedFloors");

    player.transformNode.position.copyFrom(builtDungeon.spawnPoint);
    player.setNavMeshManager(navMeshManager);

    // Spawn enemies in rooms 1..N
    const enemies: Enemy[] = [];
    for (let i = 1; i < dungeonGrid.rooms.length; i++) {
      const room = dungeonGrid.rooms[i];
      const spawnPos = new Vector3(room.centerX * 2.0 + 1.0, 0, room.centerY * 2.0 + 1.0);
      const enemy = new Enemy(`enemy_t4_${i}`, `Orc_${i}`, ctx.scene, spawnPos, {
        maxHp: 60,
        attackDamage: 12,
        moveSpeed: 4.5,
        aggroRadius: 9.0,
      });
      enemy.setNavMeshManager(navMeshManager);
      enemy.setTarget(player);
      enemies.push(enemy);
    }

    assert(enemies.length > 0, `Enemies spawned across ${enemies.length} dungeon rooms`);
    assert(enemies[0].isAlive === true, "First spawned enemy isAlive === true");

    // ----------------------------------------------------
    // Phase 5: Gameplay Simulation & Pathing Verification
    // ----------------------------------------------------
    console.log("\n--- Phase 5: Gameplay Loop Simulation & Navigation ---");

    // Simulate 30 frames of gameplay updates
    for (let frame = 0; frame < 30; frame++) {
      const dt = 0.016;
      player.update(dt, enemies);
      for (const enemy of enemies) {
        if (enemy.isAlive) {
          enemy.update(dt, player);
        }
      }
    }

    assert(player.isAlive === true, "Player remains alive after 30 gameplay simulation frames");

    // Verify player pathing query to first enemy position
    const path = assertNavMeshPath(navMeshManager, player.position, enemies[0].position);
    assert(path.length >= 1, `Path computed from player to room 1 enemy position (path length = ${path.length})`);

    // Clean up dungeon resources
    for (const enemy of enemies) {
      enemy.dispose();
    }
    navMeshManager.dispose();
    tileMap.dispose();
    player.dispose();

    console.log(`\n==================================================`);
    console.log(`  TIER 4 COMPLETE: ${passedCount}/${totalCount} assertions passed.`);
    console.log(`==================================================\n`);
  } finally {
    ctx.dispose();
  }
}

runTier4Tests().catch((err) => {
  console.error("Tier 4 test runner error:", err);
  process.exit(1);
});
