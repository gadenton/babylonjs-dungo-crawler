import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
  createHeadlessTestContext,
  assertGridDimensions,
} from "./harness";

import { Generator, DungeonGrid, TileType, CellMetadata } from "../src/dungeon/Generator";
import {
  getNeighborBitmask,
  selectWallTile,
  isWalkable,
} from "../src/dungeon/Autotiler";
import { TownHub } from "../src/town/TownHub";
import { TownHubAltar } from "../src/entities/TownHubAltar";
import { Player } from "../src/entities/Player";

async function runTier2Tests() {
  console.log("==================================================");
  console.log("  RUNNING TIER 2: BOUNDARY & CORNER CONDITION TESTS");
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
    // Test 1: Grid Edge Bitmasking at (0,0), (39,39), (0,39), (39,0)
    // ----------------------------------------------------
    console.log("\n--- Subtest 1: Grid Edge Bitmasking ---");
    const generator = new Generator({ width: 40, height: 40, seed: 777 });
    const grid = generator.generate();
    assertGridDimensions(grid, 40, 40);

    // Verify out-of-bounds neighbor checks return false safely
    assert(isWalkable(grid, -1, 0) === false, "isWalkable(-1, 0) returns false without throwing");
    assert(isWalkable(grid, 40, 0) === false, "isWalkable(40, 0) returns false without throwing");
    assert(isWalkable(grid, 0, -1) === false, "isWalkable(0, -1) returns false without throwing");
    assert(isWalkable(grid, 0, 40) === false, "isWalkable(0, 40) returns false without throwing");
    assert(isWalkable(grid, 40, 40) === false, "isWalkable(40, 40) returns false without throwing");
    assert(isWalkable(grid, -1, -1) === false, "isWalkable(-1, -1) returns false without throwing");

    // Grid corner cells bitmask checks
    const corners = [
      { gx: 0, gy: 0 },
      { gx: 39, gy: 0 },
      { gx: 0, gy: 39 },
      { gx: 39, gy: 39 },
    ];

    for (const corner of corners) {
      let maskResult: { cardinalMask: number; fullMask: number } | null = null;
      let wallSelection: ReturnType<typeof selectWallTile> | null = null;

      try {
        maskResult = getNeighborBitmask(grid, corner.gx, corner.gy);
        wallSelection = selectWallTile(grid, corner.gx, corner.gy);
      } catch (err) {
        assert(false, `Corner (${corner.gx}, ${corner.gy}) bitmask calculation threw error: ${err}`);
      }

      assert(maskResult !== null, `Bitmask calculated for corner (${corner.gx}, ${corner.gy})`);
      assert(wallSelection !== null, `Wall tile selected for corner (${corner.gx}, ${corner.gy})`);
      assert(typeof wallSelection!.modelName === "string", `Model selected is string for corner (${corner.gx}, ${corner.gy})`);
      assert(typeof wallSelection!.yRotation === "number", `Rotation selected is number for corner (${corner.gx}, ${corner.gy})`);
    }

    // Edge boundary scan across all edge cells (x=0, x=39, y=0, y=39)
    for (let i = 0; i < 40; i++) {
      const edgePoints = [
        { gx: 0, gy: i },
        { gx: 39, gy: i },
        { gx: i, gy: 0 },
        { gx: i, gy: 39 },
      ];
      for (const p of edgePoints) {
        const mask = getNeighborBitmask(grid, p.gx, p.gy);
        const sel = selectWallTile(grid, p.gx, p.gy);
        assert(mask.fullMask >= 0, `Edge cell (${p.gx}, ${p.gy}) mask >= 0`);
        assert(sel.modelName.length > 0, `Edge cell (${p.gx}, ${p.gy}) model selected`);
      }
    }

    // ----------------------------------------------------
    // Test 2: Invalid Transition Inputs (dist > 3.0m)
    // ----------------------------------------------------
    console.log("\n--- Subtest 2: Invalid Transition Inputs ---");
    const altar = new TownHubAltar(ctx.scene, new Vector3(10, 0, 16));
    const player = new Player("p_invalid", ctx.scene);

    // Outside proximity (dist 5.0m)
    player.transformNode.position = new Vector3(10, 0, 11);
    assert(altar.isPlayerInProximity(player.position) === false, "Player at dist 5.0m is outside proximity");

    let transitionTriggered = false;
    altar.onInteract.add(() => {
      transitionTriggered = true;
    });

    // Attempt interaction trigger when outside proximity
    const attemptInteraction = (playerPos: Vector3): boolean => {
      if (altar.isPlayerInProximity(playerPos)) {
        altar.interact();
        return true;
      }
      return false;
    };

    let result = attemptInteraction(player.position);
    assert(result === false, "Interaction attempt refused when outside proximity (dist 5.0m)");
    assert(transitionTriggered === false, "onInteract observable did not fire for refused interaction");

    // Extreme out-of-bounds coordinates
    const extremePositions = [
      new Vector3(999, 999, 999),
      new Vector3(-500, 0, -500),
      new Vector3(NaN, 0, 0),
    ];

    for (const extremePos of extremePositions) {
      result = attemptInteraction(extremePos);
      assert(result === false, `Interaction attempt refused for extreme position ${extremePos.toString()}`);
    }

    // ----------------------------------------------------
    // Test 3: Rapid Interaction Triggers (Stress Test / Re-entrancy)
    // ----------------------------------------------------
    console.log("\n--- Subtest 3: Rapid Interaction Triggers & Re-entrancy ---");

    // Move player inside proximity (dist 0.0m)
    player.transformNode.position = altar.position.clone();
    assert(altar.isPlayerInProximity(player.position) === true, "Player inside proximity for rapid trigger test");

    let transitionExecutionCount = 0;
    let isTransitioning = false;

    const guardedTransitionToDungeon = async () => {
      if (isTransitioning) return;
      isTransitioning = true;
      transitionExecutionCount++;
      // Simulate async transition workload
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    // Attach guarded transition listener to altar.onInteract
    altar.onInteract.add(() => {
      guardedTransitionToDungeon();
    });

    // Spam 100 rapid interaction triggers in 10ms
    const spamCount = 100;
    for (let i = 0; i < spamCount; i++) {
      if (altar.isPlayerInProximity(player.position)) {
        altar.interact();
      }
    }

    // Wait for transition promise to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert(
      transitionExecutionCount === 1,
      `State transition executed exactly ONCE despite ${spamCount} rapid keypress triggers (got ${transitionExecutionCount})`
    );
    assert(isTransitioning === true, "isTransitioning flag remained set after transition");

    altar.dispose();
    player.dispose();

    console.log(`\n==================================================`);
    console.log(`  TIER 2 COMPLETE: ${passedCount}/${totalCount} assertions passed.`);
    console.log(`==================================================\n`);
  } finally {
    ctx.dispose();
  }
}

runTier2Tests().catch((err) => {
  console.error("Tier 2 test runner error:", err);
  process.exit(1);
});
