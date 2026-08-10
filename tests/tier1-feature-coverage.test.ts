import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import {
  createHeadlessTestContext,
  assertGridDimensions,
  assertMergedColliders,
  assertProximityInteraction,
} from "./harness";

import { Generator, DungeonGrid, TileType, CellMetadata } from "../src/dungeon/Generator";
import { TileMap, BuiltDungeon } from "../src/dungeon/TileMap";
import {
  getNeighborBitmask,
  selectWallTile,
  selectFloorTile,
  isWalkable,
} from "../src/dungeon/Autotiler";
import { TownHub } from "../src/town/TownHub";
import { TownHubAltar } from "../src/entities/TownHubAltar";
import { Player } from "../src/entities/Player";

async function runTier1Tests() {
  console.log("==================================================");
  console.log("  RUNNING TIER 1: FEATURE COVERAGE TESTS          ");
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
    // Test 1: TileMap Loading & Instancing
    // ----------------------------------------------------
    console.log("\n--- Subtest 1: TileMap Loading & Instancing ---");
    const generator = new Generator({ width: 40, height: 40, seed: 101 });
    const grid = generator.generate();
    assertGridDimensions(grid, 40, 40);

    const tileMap = new TileMap(ctx.scene);
    await tileMap.preloadAssets();
    const builtDungeon: BuiltDungeon = await tileMap.buildFromGrid(grid);

    assert(builtDungeon.rootNode instanceof TransformNode, "builtDungeon.rootNode is instance of TransformNode");
    assert(builtDungeon.rootNode.name === "dungeonRoot", "rootNode name is 'dungeonRoot'");
    assert(builtDungeon.mergedFloors instanceof Mesh, "mergedFloors is instance of Mesh");
    assert(builtDungeon.mergedWalls instanceof Mesh, "mergedWalls is instance of Mesh");
    assertMergedColliders(builtDungeon);
    assert(builtDungeon.mergedFloors!.isVisible === false, "mergedFloors is hidden (isVisible === false)");
    assert(builtDungeon.mergedWalls!.isVisible === false, "mergedWalls is hidden (isVisible === false)");
    assert(builtDungeon.rootNode.getChildren().length > 0, "rootNode has child instanced meshes attached");

    // ----------------------------------------------------
    // Test 2: 8-Neighbor Connectivity Bitmask Classification
    // ----------------------------------------------------
    console.log("\n--- Subtest 2: 8-Neighbor Connectivity Bitmask Classification ---");

    function createTest5x5Grid(): DungeonGrid {
      const cells: CellMetadata[][] = [];
      for (let y = 0; y < 5; y++) {
        const row: CellMetadata[] = [];
        for (let x = 0; x < 5; x++) {
          row.push({
            type: TileType.Wall,
            roomId: null,
            isCorridor: false,
            wallRotation: 0,
          });
        }
        cells.push(row);
      }
      return {
        width: 5,
        height: 5,
        cells,
        rooms: [],
        spawnPosition: { x: 2, y: 2 },
        stairsPosition: { x: 2, y: 2 },
        seed: 42,
      };
    }

    // Straight Wall (North walkable -> rotation 0)
    let testGrid = createTest5x5Grid();
    testGrid.cells[3][2].type = TileType.Floor; // N is walkable
    let wallSel = selectWallTile(testGrid, 2, 2);
    assert(
      wallSel.modelName === "template-wall.glb" || wallSel.modelName === "template-wall-detail-a.glb",
      "Straight Wall model selected for North neighbor walkable"
    );
    assert(wallSel.yRotation === 0, "Straight Wall Y-rotation is 0 for North walkable");

    // Straight Wall (East walkable -> rotation PI/2)
    testGrid = createTest5x5Grid();
    testGrid.cells[2][3].type = TileType.Floor; // E is walkable
    wallSel = selectWallTile(testGrid, 2, 2);
    assert(wallSel.yRotation === Math.PI / 2, "Straight Wall Y-rotation is PI/2 for East walkable");

    // Inner Corner (North + East walkable -> rotation 0)
    testGrid = createTest5x5Grid();
    testGrid.cells[3][2].type = TileType.Floor; // N
    testGrid.cells[2][3].type = TileType.Floor; // E
    wallSel = selectWallTile(testGrid, 2, 2);
    assert(wallSel.modelName === "template-wall-corner.glb", "Inner Corner model template-wall-corner.glb selected for N+E");
    assert(wallSel.yRotation === 0, "Inner Corner Y-rotation is 0 for N+E walkable");

    // Inner Corner (East + South walkable -> rotation PI/2)
    testGrid = createTest5x5Grid();
    testGrid.cells[2][3].type = TileType.Floor; // E
    testGrid.cells[1][2].type = TileType.Floor; // S
    wallSel = selectWallTile(testGrid, 2, 2);
    assert(wallSel.modelName === "template-wall-corner.glb", "Inner Corner model selected for E+S");
    assert(wallSel.yRotation === Math.PI / 2, "Inner Corner Y-rotation is PI/2 for E+S walkable");

    // Outer Corner (0 cardinal walkable, NE diagonal walkable)
    testGrid = createTest5x5Grid();
    testGrid.cells[3][3].type = TileType.Floor; // NE diagonal
    wallSel = selectWallTile(testGrid, 2, 2);
    assert(wallSel.modelName === "template-wall-corner.glb", "Outer Corner model template-wall-corner.glb selected for NE diagonal");
    assert(typeof wallSel.yRotation === "number", "Outer Corner Y-rotation is valid number for NE diagonal walkable");

    // End Cap / Half Wall (N + S walkable -> opposite pair)
    testGrid = createTest5x5Grid();
    testGrid.cells[3][2].type = TileType.Floor; // N
    testGrid.cells[1][2].type = TileType.Floor; // S
    wallSel = selectWallTile(testGrid, 2, 2);
    assert(wallSel.modelName === "template-wall-half.glb", "End Cap / Stub model template-wall-half.glb selected for N+S");

    // Floor Detail Variety
    const floorSel1 = selectFloorTile(grid, 0, 0);
    const floorSel2 = selectFloorTile(grid, 1, 1);
    assert(
      typeof floorSel1.modelName === "string" && typeof floorSel2.modelName === "string",
      "selectFloorTile returns valid modelName strings"
    );
    assert(
      ["template-floor.glb", "template-floor-detail.glb", "template-floor-detail-a.glb"].includes(floorSel1.modelName),
      "selectFloorTile selects valid floor variant"
    );

    // ----------------------------------------------------
    // Test 3: TownHub Static 10x10 Plaza Creation
    // ----------------------------------------------------
    console.log("\n--- Subtest 3: TownHub Static 10x10 Plaza Creation ---");
    const townHub = new TownHub(ctx.scene);
    await townHub.preloadAssets();
    const builtTown = await townHub.build();

    assert(builtTown.rootNode instanceof TransformNode, "builtTown.rootNode is TransformNode");
    assert(builtTown.rootNode.name === "townHubRoot", "builtTown.rootNode name is 'townHubRoot'");
    assert(builtTown.mergedFloors instanceof Mesh, "TownHub mergedFloors exists");
    assert(builtTown.mergedWalls instanceof Mesh, "TownHub mergedWalls exists");
    assert(builtTown.spawnPoint instanceof Vector3, "TownHub spawnPoint is Vector3");
    assert(builtTown.altarPosition instanceof Vector3, "TownHub altarPosition is Vector3");
    assert(builtTown.altar instanceof TownHubAltar, "TownHub altar instance created");

    // Verify enemies count in town hub scene
    const enemyNodes = ctx.scene.meshes.filter((m) => m.name.toLowerCase().includes("enemy"));
    assert(enemyNodes.length === 0, "TownHub contains exactly 0 enemies");

    // ----------------------------------------------------
    // Test 4: Player Spawning & Initial Transform/Metadata
    // ----------------------------------------------------
    console.log("\n--- Subtest 4: Player Spawning & Initial Transform/Metadata ---");
    const player = new Player("testPlayer", ctx.scene);
    player.transformNode.position = builtTown.spawnPoint.clone();

    assert(player.transformNode.position.equals(builtTown.spawnPoint), "Player position matches TownHub spawn point");
    assert(player.isAlive === true, "Player isAlive === true");
    assert(player.health.isAlive === true && player.health.current > 0, "Player initial HP is positive and alive");
    assert(player.transformNode.name.startsWith("playerRoot"), "Player transformNode name starts with 'playerRoot'");

    // ----------------------------------------------------
    // Test 5: Portal Proximity Interaction (dist <= 3.0m)
    // ----------------------------------------------------
    console.log("\n--- Subtest 5: Portal Proximity Interaction ---");
    const altar = builtTown.altar;
    const altarPos = altar.position;

    // At altar center (dist 0.0m)
    player.transformNode.position = altarPos.clone();
    assert(altar.isPlayerInProximity(player.position) === true, "Player at altar center is within proximity (dist = 0.0m)");

    // 2.0m away (dist 2.0m <= 3.0m)
    player.transformNode.position = altarPos.add(new Vector3(2.0, 0, 0));
    assert(altar.isPlayerInProximity(player.position) === true, "Player 2.0m away is within proximity (dist = 2.0m)");

    // 3.0m away (exact threshold)
    player.transformNode.position = altarPos.add(new Vector3(3.0, 0, 0));
    assert(altar.isPlayerInProximity(player.position) === true, "Player at 3.0m threshold is within proximity");

    // 5.0m away (outside threshold)
    player.transformNode.position = altarPos.add(new Vector3(5.0, 0, 0));
    assert(altar.isPlayerInProximity(player.position) === false, "Player 5.0m away is outside proximity");

    console.log(`\n==================================================`);
    console.log(`  TIER 1 COMPLETE: ${passedCount}/${totalCount} assertions passed.`);
    console.log(`==================================================\n`);
  } finally {
    ctx.dispose();
  }
}

runTier1Tests().catch((err) => {
  console.error("Tier 1 test runner error:", err);
  process.exit(1);
});
