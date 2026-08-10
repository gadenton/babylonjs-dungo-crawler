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

async function runTier3Tests() {
  console.log("==================================================");
  console.log("  RUNNING TIER 3: CROSS-FEATURE INTEGRATION TESTS ");
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
    // Step 1: Town Hub Environment & Player Initialization
    // ----------------------------------------------------
    console.log("--- Step 1: Initial Town Hub Setup ---");
    const townHub = new TownHub(ctx.scene);
    await townHub.preloadAssets();
    const builtTown = await townHub.build();

    assert(ctx.scene.getNodeByName("townHubRoot") !== null, "townHubRoot node exists in scene graph");

    const player = new Player("p_cross", ctx.scene);
    player.transformNode.position = builtTown.spawnPoint.clone();

    assert(player.position.equals(builtTown.spawnPoint), "Player spawned at Town Hub spawn position (10, 0, 6)");

    // ----------------------------------------------------
    // Step 2: Player Movement & Portal Proximity Trigger
    // ----------------------------------------------------
    console.log("\n--- Step 2: Player Movement to Altar Portal ---");
    assert(builtTown.altar.isPlayerInProximity(player.position) === false, "Player initially outside altar proximity");

    // Move player directly to Altar Position (10, 0, 16)
    const targetAltarPos = builtTown.altarPosition.clone();
    player.transformNode.position.copyFrom(targetAltarPos);
    player.update(0.016);

    assert(player.position.equals(targetAltarPos), "Player moved to Altar position");
    assert(builtTown.altar.isPlayerInProximity(player.position) === true, "Player is within altar interaction proximity");

    // ----------------------------------------------------
    // Step 3: Portal Trigger & Level Transition Execution
    // ----------------------------------------------------
    console.log("\n--- Step 3: Level Transition Execution & Town Hub Disposal ---");
    let transitionFired = false;
    builtTown.altar.onInteract.add(() => {
      transitionFired = true;
    });

    builtTown.altar.interact();
    assert(transitionFired === true, "Altar onInteract observable fired upon interaction");

    // Dispose Town Hub resources
    builtTown.altar.dispose();
    builtTown.rootNode.dispose();
    townHub.dispose();

    assertSceneHierarchyClean(ctx.scene, "townHubRoot");
    assert(ctx.scene.getNodeByName("townHubRoot") === null, "townHubRoot completely removed from scene");

    // ----------------------------------------------------
    // Step 4: Procedural Dungeon Instantiation & Recast NavMesh Rebuild
    // ----------------------------------------------------
    console.log("\n--- Step 4: Procedural Dungeon & NavMesh Generation ---");
    const generator = new Generator({ width: 40, height: 40, seed: 999 });
    const dungeonGrid = generator.generate();
    assertGridDimensions(dungeonGrid, 40, 40);

    const tileMap = new TileMap(ctx.scene);
    await tileMap.preloadAssets();
    const builtDungeon = await tileMap.buildFromGrid(dungeonGrid);

    assert(ctx.scene.getNodeByName("dungeonRoot") !== null, "dungeonRoot node exists in scene graph");
    assertMergedColliders(builtDungeon);

    console.log("Initializing Recast WASM NavMesh...");
    const navMeshManager = new NavMeshManager();
    const initSuccess = await navMeshManager.init(3000);
    assert(initSuccess === true, "Recast WASM initialized successfully");

    const navMeshBuilt = await navMeshManager.createNavMesh(builtDungeon.mergedFloors!);
    assert(navMeshBuilt === true, "NavMesh constructed over mergedFloors successfully");

    // Move player to dungeon spawn point and attach navMeshManager
    player.transformNode.position.copyFrom(builtDungeon.spawnPoint);
    player.setNavMeshManager(navMeshManager);

    assert(player.position.equals(builtDungeon.spawnPoint), "Player moved to procedural dungeon spawn position");

    // ----------------------------------------------------
    // Step 5: End-to-End Navigation Pathfinding Query
    // ----------------------------------------------------
    console.log("\n--- Step 5: Navigation Pathfinding Verification ---");
    const path = assertNavMeshPath(navMeshManager, builtDungeon.spawnPoint, builtDungeon.stairsPoint);

    assert(Array.isArray(path), "findPath returned Array of Vector3 waypoints");
    assert(path.length >= 1, `Path contains at least 1 waypoint (length = ${path.length})`);

    const firstPoint = path[0];
    const lastPoint = path[path.length - 1];
    const distToStart = Vector3.Distance(firstPoint, builtDungeon.spawnPoint);
    const distToEnd = Vector3.Distance(lastPoint, builtDungeon.stairsPoint);

    assert(distToStart < 3.0, `Path start waypoint is near player spawn point (dist = ${distToStart.toFixed(2)}m)`);
    assert(distToEnd < 4.0, `Path end waypoint is near dungeon stairs point (dist = ${distToEnd.toFixed(2)}m)`);

    // Clean up
    navMeshManager.dispose();
    tileMap.dispose();
    player.dispose();

    console.log(`\n==================================================`);
    console.log(`  TIER 3 COMPLETE: ${passedCount}/${totalCount} assertions passed.`);
    console.log(`==================================================\n`);
  } finally {
    ctx.dispose();
  }
}

runTier3Tests().catch((err) => {
  console.error("Tier 3 test runner error:", err);
  process.exit(1);
});
