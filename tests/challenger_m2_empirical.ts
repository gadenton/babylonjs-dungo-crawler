import "@babylonjs/core/Collisions/collisionCoordinator";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/loaders/glTF";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createHeadlessTestContext } from "./harness";
import { TownHub } from "../src/town/TownHub";
import { Player } from "../src/entities/Player";
import { CameraRig } from "../src/camera/CameraRig";
import { TownHubAltar } from "../src/entities/TownHubAltar";

async function runChallengerM2Tests() {
  console.log("==========================================================");
  console.log("  CHALLENGER 2: EMPIRICAL TEST SUITE (MILESTONE 2)");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
    }
  }

  const ctx = createHeadlessTestContext();

  try {
    // ----------------------------------------------------------------------
    // TEST 1: Inspect Player Spawning & Altar Positions
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 1: Entity Positions & Spawning ---");
    const townHub = new TownHub(ctx.scene);
    const builtTown = await townHub.build();

    assert(
      builtTown.spawnPoint.equals(new Vector3(10.0, 0.0, 6.0)),
      `Spawn point is exactly Vector3(10.0, 0.0, 6.0) (actual: ${builtTown.spawnPoint.toString()})`
    );

    assert(
      builtTown.altarPosition.equals(new Vector3(10.0, 0.0, 16.0)),
      `Altar position is exactly Vector3(10.0, 0.0, 16.0) (actual: ${builtTown.altarPosition.toString()})`
    );

    assert(
      builtTown.altar.position.equals(new Vector3(10.0, 0.0, 16.0)),
      `TownHubAltar instance position matches altarPosition Vector3(10.0, 0.0, 16.0)`
    );

    const player = new Player("test_player", ctx.scene);
    player.transformNode.position = builtTown.spawnPoint.clone();

    assert(
      player.position.equals(new Vector3(10.0, 0.0, 6.0)),
      `Player entity position successfully initialized to spawnPoint (10, 0, 6)`
    );

    // ----------------------------------------------------------------------
    // TEST 2: Altar Proximity & Distance Calculation
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: Altar Proximity Detection ---");
    const initialProximity = builtTown.altar.isPlayerInProximity(player.position);
    assert(
      initialProximity === false,
      `Player at (10, 0, 6) is NOT in proximity of altar at (10, 0, 16) (dist: ${Vector3.Distance(
        player.position,
        builtTown.altar.position
      ).toFixed(2)}m > 3.0m threshold)`
    );

    // Move player closer to altar (10, 0, 14.0) -> distance = 2.0m <= 3.0m
    player.transformNode.position = new Vector3(10.0, 0.0, 14.0);
    const closeProximity = builtTown.altar.isPlayerInProximity(player.position);
    assert(
      closeProximity === true,
      `Player at (10, 0, 14) IS in proximity of altar at (10, 0, 16) (dist: ${Vector3.Distance(
        player.position,
        builtTown.altar.position
      ).toFixed(2)}m <= 3.0m threshold)`
    );

    // Move player right on top of altar (10, 0, 16.0)
    player.transformNode.position = new Vector3(10.0, 0.0, 16.0);
    const zeroDistanceProximity = builtTown.altar.isPlayerInProximity(player.position);
    assert(
      zeroDistanceProximity === true,
      `Player at exact altar position (10, 0, 16) is in proximity`
    );

    // ----------------------------------------------------------------------
    // TEST 3: Altar Interaction Observable & Transition Trigger
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: Altar Transition Trigger & Observables ---");
    let transitionTriggered = false;
    let transitionCount = 0;

    const subscription = builtTown.altar.onInteract.add(() => {
      transitionTriggered = true;
      transitionCount++;
    });

    assert(subscription !== null, `Successfully attached observer to altar.onInteract`);

    builtTown.altar.interact();

    assert(
      transitionTriggered === true && transitionCount === 1,
      `Triggering altar.interact() correctly notified onInteract observer (count: ${transitionCount})`
    );

    // Multiple interact calls
    builtTown.altar.interact();
    assert(transitionCount === 2, `Multiple altar interactions trigger callback consistently (count: ${transitionCount})`);

    // ----------------------------------------------------------------------
    // TEST 4: Camera Rig Tracking & Exponential Smoothing
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Camera Rig Tracking ---");
    player.transformNode.position = builtTown.spawnPoint.clone(); // reset to (10, 0, 6)

    const cameraRig = new CameraRig(ctx.scene, {
      pitchDegrees: 45,
      yawDegrees: 45,
      distance: 22.0,
      followRate: 10.0,
      lookAheadDist: 3.5,
    });

    cameraRig.attachToTarget(player.transformNode);

    const initialCamPos = cameraRig.getCamera().position.clone();
    assert(
      initialCamPos.lengthSquared() > 0,
      `Camera position successfully computed on attach: ${initialCamPos.toString()}`
    );

    // Move player and step camera update
    player.transformNode.position = new Vector3(14.0, 0.0, 10.0);
    const dt = 0.016; // ~60fps
    for (let i = 0; i < 60; i++) {
      cameraRig.update(dt, player.getVelocity(), player.getFacingDirection());
    }

    const updatedCamPos = cameraRig.getCamera().position.clone();
    assert(
      !updatedCamPos.equals(initialCamPos),
      `Camera position tracked player movement to new target location (Cam pos: ${updatedCamPos.toString()})`
    );

    // Test trauma & shake hook
    cameraRig.addTrauma(0.8);
    cameraRig.update(dt);
    assert(true, "Camera rig handled trauma decay and screen shake without runtime exceptions");

    // ----------------------------------------------------------------------
    // TEST 5: Plaza Merged Colliders & Map Bounds Setup
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: Plaza Colliders & Asset Loading Resilience ---");
    assert(
      builtTown.mergedFloors !== null,
      `mergedFloors mesh created and merged successfully`
    );

    assert(
      builtTown.mergedWalls !== null,
      `mergedWalls mesh created and merged successfully`
    );

    if (builtTown.mergedFloors) {
      assert(builtTown.mergedFloors.checkCollisions === true, `mergedFloors has checkCollisions = true`);
      assert(builtTown.mergedFloors.isPickable === true, `mergedFloors has isPickable = true for click-to-move`);
    }

    if (builtTown.mergedWalls) {
      assert(builtTown.mergedWalls.checkCollisions === true, `mergedWalls has checkCollisions = true for boundary blocking`);
      assert(builtTown.mergedWalls.isPickable === false, `mergedWalls has isPickable = false`);
    }

    // ----------------------------------------------------------------------
    // TEST 6: Resilience against Asset Preload Faults
    // ----------------------------------------------------------------------
    console.log("\n--- TEST GROUP 6: Asset Preload Resilience ---");
    const resilientTownHub = new TownHub(ctx.scene);
    // Preload should complete safely without throwing even if fallback mock assets are used
    let preloadError = false;
    try {
      await resilientTownHub.preloadAssets();
    } catch (err) {
      preloadError = true;
    }
    assert(preloadError === false, `preloadAssets() completes without throwing uncaught exceptions`);

    const secondBuild = await resilientTownHub.build();
    assert(secondBuild.rootNode !== null, `Resilient build produced valid rootNode`);

    // Cleanup
    cameraRig.dispose();
    player.dispose();
    builtTown.altar.dispose();
    townHub.dispose();
    resilientTownHub.dispose();
    ctx.dispose();

  } catch (err: any) {
    console.error("UNHANDLED ERROR IN TEST SUITE:", err);
    failed++;
  }

  console.log("==========================================================");
  console.log(`  FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runChallengerM2Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
