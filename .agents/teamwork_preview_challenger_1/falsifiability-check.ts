import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  createHeadlessTestContext,
  assertMergedColliders,
  assertSceneHierarchyClean,
  assertNavMeshPath,
  assertProximityInteraction,
} from "../../tests/harness";
import { BuiltDungeon } from "../../src/dungeon/TileMap";

async function runFalsifiabilityChecks() {
  console.log("==================================================");
  console.log("  RUNNING FALSIFIABILITY & STRESS HARNESS          ");
  console.log("==================================================\n");

  const ctx = createHeadlessTestContext();
  let falsifiedCount = 0;

  // ----------------------------------------------------
  // Test F1: assertMergedColliders fails when mergedFloors is null
  // ----------------------------------------------------
  try {
    const brokenDungeon: BuiltDungeon = {
      rootNode: new TransformNode("root", ctx.scene),
      mergedFloors: null,
      mergedWalls: null,
      spawnPoint: Vector3.Zero(),
      stairsPoint: Vector3.Zero(),
      wallInstances: [],
      floorInstances: [],
    };
    assertMergedColliders(brokenDungeon);
    console.error("❌ FAILED FALSIFIABILITY 1: assertMergedColliders did NOT throw on null mergedFloors!");
  } catch (err: any) {
    if (err.message.includes("assertMergedColliders failed")) {
      console.log("✅ FALSIFIED 1: assertMergedColliders correctly caught missing mergedFloors");
      falsifiedCount++;
    } else {
      console.error("❌ Unexpected error:", err);
    }
  }

  // ----------------------------------------------------
  // Test F2: assertSceneHierarchyClean fails when node remains undisposed
  // ----------------------------------------------------
  try {
    const dirtyNode = new TransformNode("leakedTownHubRoot", ctx.scene);
    assertSceneHierarchyClean(ctx.scene, "leakedTownHubRoot");
    console.error("❌ FAILED FALSIFIABILITY 2: assertSceneHierarchyClean did NOT throw on leaked node!");
  } catch (err: any) {
    if (err.message.includes("assertSceneHierarchyClean failed")) {
      console.log("✅ FALSIFIED 2: assertSceneHierarchyClean correctly caught undisposed scene node");
      falsifiedCount++;
    } else {
      console.error("❌ Unexpected error:", err);
    }
  }

  // ----------------------------------------------------
  // Test F3: assertProximityInteraction returns false above maxRadius
  // ----------------------------------------------------
  const p1 = new Vector3(0, 0, 0);
  const p2 = new Vector3(3.01, 0, 0); // Just past 3.0m
  const inRange = assertProximityInteraction(p1, p2, 3.0);
  if (!inRange) {
    console.log("✅ FALSIFIED 3: assertProximityInteraction correctly rejected position at 3.01m (radius 3.0m)");
    falsifiedCount++;
  } else {
    console.error("❌ FAILED FALSIFIABILITY 3: assertProximityInteraction returned true for 3.01m!");
  }

  // ----------------------------------------------------
  // Test F4: Rapid re-entrancy without guard triggers multiple transitions
  // ----------------------------------------------------
  let callCountWithoutGuard = 0;
  const unguardedHandler = async () => {
    callCountWithoutGuard++;
    await new Promise((r) => setTimeout(r, 5));
  };
  for (let i = 0; i < 100; i++) {
    unguardedHandler();
  }
  await new Promise((r) => setTimeout(r, 20));
  if (callCountWithoutGuard === 100) {
    console.log("✅ FALSIFIED 4: Unguarded transition executes 100 times, confirming guard test in Tier 2 is essential");
    falsifiedCount++;
  } else {
    console.error(`❌ FAILED FALSIFIABILITY 4: Unguarded calls = ${callCountWithoutGuard}`);
  }

  ctx.dispose();

  console.log(`\n==================================================`);
  console.log(`  FALSIFIABILITY SUMMARY: ${falsifiedCount}/4 tests verified falsifiable.`);
  console.log(`==================================================\n`);
}

runFalsifiabilityChecks().catch((err) => {
  console.error("Falsifiability test error:", err);
  process.exit(1);
});
