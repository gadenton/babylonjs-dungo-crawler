import "@babylonjs/core/Collisions/collisionCoordinator";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/loaders/glTF";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SceneLoader, ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";

import { Generator, DungeonGrid, TileType, CellMetadata } from "../../src/dungeon/Generator";
import { TileMap, BuiltDungeon } from "../../src/dungeon/TileMap";
import { getNeighborBitmask, selectWallTile, selectFloorTile, selectDoorRotation, isWalkable } from "../../src/dungeon/Autotiler";

console.log("==========================================================================");
console.log("  CHALLENGER 2: EMPIRICAL TEST SUITE FOR MILESTONE 1                      ");
console.log("==========================================================================");

function createTestContext() {
  const engine = new NullEngine({
    renderWidth: 512,
    renderHeight: 512,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });

  const scene = new Scene(engine);
  scene.collisionsEnabled = true;

  const camera = new TargetCamera("testCam", new Vector3(0, 10, -10), scene);

  // Setup mock asset loader so SceneLoader works in NullEngine environment
  SceneLoader.ImportMeshAsync = async function (
    meshNames: any,
    rootUrl: string,
    sceneFilename: string,
    targetScene?: Scene
  ): Promise<ISceneLoaderAsyncResult> {
    const sc = targetScene || scene;
    // Create a mock mesh with vertices
    const mockMesh = CreateBox(`mock_${sceneFilename}`, { size: 2.0 }, sc);
    mockMesh.isVisible = false;
    mockMesh.setEnabled(true);

    return {
      meshes: [mockMesh],
      particleSystems: [],
      skeletons: [],
      animationGroups: [],
      transformNodes: [],
      geometries: [],
      lights: [],
      spriteManagers: [],
    };
  };

  return {
    engine,
    scene,
    camera,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, description: string, extraInfo?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${description}`);
  } else {
    failed++;
    const errMsg = `❌ FAIL: ${description}${extraInfo ? ` (${extraInfo})` : ""}`;
    console.error(`  ${errMsg}`);
    failures.push(errMsg);
  }
}

async function runAllTests() {
  const ctx = createTestContext();

  try {
    // -------------------------------------------------------------------
    // 1. Grid Dimensions & Dungeon Generation (20x20, 40x40, 80x80, 100x100)
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 1: Dungeon Generation & Grid Dimensions ---");
    const testDimensions = [
      { w: 20, h: 20 },
      { w: 40, h: 40 },
      { w: 80, h: 80 },
      { w: 100, h: 100 },
    ];

    for (const dim of testDimensions) {
      const gen = new Generator({ width: dim.w, height: dim.h, seed: 12345 + dim.w });
      const grid = gen.generate();

      assert(grid.width === dim.w, `Generator produces correct width ${dim.w}`);
      assert(grid.height === dim.h, `Generator produces correct height ${dim.h}`);
      assert(grid.rooms.length >= 2, `${dim.w}x${dim.h} grid has at least 2 rooms (found ${grid.rooms.length})`);
      assert(
        grid.spawnPosition.x >= 0 && grid.spawnPosition.x < dim.w &&
        grid.spawnPosition.y >= 0 && grid.spawnPosition.y < dim.h,
        `${dim.w}x${dim.h} spawn position is within bounds (${grid.spawnPosition.x}, ${grid.spawnPosition.y})`
      );
      assert(
        grid.stairsPosition.x >= 0 && grid.stairsPosition.x < dim.w &&
        grid.stairsPosition.y >= 0 && grid.stairsPosition.y < dim.h,
        `${dim.w}x${dim.h} stairs position is within bounds (${grid.stairsPosition.x}, ${grid.stairsPosition.y})`
      );

      // Count tile types
      let floors = 0, walls = 0, doors = 0, stairs = 0, empty = 0;
      for (let y = 0; y < dim.h; y++) {
        for (let x = 0; x < dim.w; x++) {
          const type = grid.cells[y][x].type;
          if (type === TileType.Floor) floors++;
          else if (type === TileType.Wall) walls++;
          else if (type === TileType.Door) doors++;
          else if (type === TileType.Stairs) stairs++;
          else if (type === TileType.Empty) empty++;
        }
      }

      assert(floors > 0, `${dim.w}x${dim.h} grid has floors (${floors})`);
      assert(walls > 0, `${dim.w}x${dim.h} grid has walls (${walls})`);
      assert(stairs === 1, `${dim.w}x${dim.h} grid has exactly 1 stairs tile`);
      console.log(`     -> Stats for ${dim.w}x${dim.h}: Floors=${floors}, Walls=${walls}, Doors=${doors}, Stairs=${stairs}, Empty=${empty}`);
    }

    // -------------------------------------------------------------------
    // 2. GPU Instancing Verification & High Tile Count Stress Test
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: GPU Instancing & High Tile Count Stress Test ---");

    const tileMap = new TileMap(ctx.scene);
    await tileMap.preloadAssets();

    for (const dim of testDimensions) {
      const startTime = Date.now();
      const gen = new Generator({ width: dim.w, height: dim.h, seed: 999 + dim.w });
      const grid = gen.generate();

      const built: BuiltDungeon = await tileMap.buildFromGrid(grid);
      const elapsedMs = Date.now() - startTime;

      assert(built.rootNode instanceof TransformNode, `${dim.w}x${dim.h} rootNode is TransformNode`);

      // Inspect child nodes in rootNode
      const children = built.rootNode.getChildren();
      let instancedMeshCount = 0;
      let otherChildCount = 0;

      for (const child of children) {
        if (child instanceof InstancedMesh) {
          instancedMeshCount++;
        } else if (child.name === "mergedFloors" || child.name === "mergedWalls") {
          // Expected merged colliders
        } else {
          otherChildCount++;
        }
      }

      assert(instancedMeshCount > 0, `${dim.w}x${dim.h} created ${instancedMeshCount} InstancedMesh objects`);
      assert(otherChildCount === 0, `${dim.w}x${dim.h} has 0 unexpected non-instanced mesh children (found ${otherChildCount})`);
      console.log(`     -> ${dim.w}x${dim.h} TileMap build took ${elapsedMs}ms, created ${instancedMeshCount} GPU instances`);
    }

    // -------------------------------------------------------------------
    // 3. Merged Colliders, Picking Flags, Collision Flags & World Matrix Freezing
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: Physics Colliders, Flags & World Matrix Freezing ---");

    const testGen = new Generator({ width: 40, height: 40, seed: 42 });
    const testGrid = testGen.generate();
    const testBuilt = await tileMap.buildFromGrid(testGrid);

    // Verify mergedFloors properties
    const mf = testBuilt.mergedFloors;
    assert(mf !== null, "mergedFloors is created");
    if (mf) {
      assert(mf.name === "mergedFloors", "mergedFloors name is 'mergedFloors'");
      assert(mf.isVisible === false, "mergedFloors.isVisible is false (invisible)");
      assert(mf.checkCollisions === true, "mergedFloors.checkCollisions is true");
      assert(mf.isPickable === true, "mergedFloors.isPickable is true (for click-to-move)");
      assert(mf.parent === testBuilt.rootNode, "mergedFloors parent is rootNode");
      assert(mf.isWorldMatrixFrozen === true, "mergedFloors.freezeWorldMatrix() was executed (isWorldMatrixFrozen === true)");
    }

    // Verify mergedWalls properties
    const mw = testBuilt.mergedWalls;
    assert(mw !== null, "mergedWalls is created");
    if (mw) {
      assert(mw.name === "mergedWalls", "mergedWalls name is 'mergedWalls'");
      assert(mw.isVisible === false, "mergedWalls.isVisible is false (invisible)");
      assert(mw.checkCollisions === true, "mergedWalls.checkCollisions is true");
      assert(mw.isPickable === false, "mergedWalls.isPickable is false (non-pickable wall boundary)");
      assert(mw.parent === testBuilt.rootNode, "mergedWalls parent is rootNode");
      assert(mw.isWorldMatrixFrozen === true, "mergedWalls.freezeWorldMatrix() was executed (isWorldMatrixFrozen === true)");
    }

    // -------------------------------------------------------------------
    // 4. Main-Thread Microtask Yielding (setTimeout 0) Verification
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Main-Thread Microtask Yielding (setTimeout 0) ---");

    let setTimeoutCalls = 0;
    const originalSetTimeout = global.setTimeout;
    (global as any).setTimeout = function (fn: any, ms: any, ...args: any[]) {
      if (ms === 0) {
        setTimeoutCalls++;
      }
      return originalSetTimeout(fn, ms, ...args);
    };

    try {
      const yieldGen = new Generator({ width: 40, height: 40, seed: 777 });
      const yieldGrid = yieldGen.generate();
      await tileMap.buildFromGrid(yieldGrid);

      // 40 rows means gy=0, 10, 20, 30 -> 4 row yields + 2 collider merge yields = at least 6 yields
      assert(setTimeoutCalls >= 6, `TileMap yielded to main thread via setTimeout(0) at least 6 times for 40x40 grid (actual: ${setTimeoutCalls})`);
    } finally {
      (global as any).setTimeout = originalSetTimeout;
    }

    // -------------------------------------------------------------------
    // 5. Autotiling Logic & 8-Neighbor Bitmask Verification
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: Autotiling Logic & Bitmask Rules ---");

    // Helper to construct custom 5x5 grid
    function make5x5Grid(): DungeonGrid {
      const cells: CellMetadata[][] = [];
      for (let y = 0; y < 5; y++) {
        const row: CellMetadata[] = [];
        for (let x = 0; x < 5; x++) {
          row.push({ type: TileType.Wall, roomId: null, isCorridor: false });
        }
        cells.push(row);
      }
      return { width: 5, height: 5, cells, rooms: [], spawnPosition: { x: 2, y: 2 }, stairsPosition: { x: 2, y: 2 }, seed: 100 };
    }

    // Test Straight Wall directions
    let g = make5x5Grid();
    g.cells[3][2].type = TileType.Floor; // N walkable -> rotation 0
    let wall = selectWallTile(g, 2, 2);
    assert(wall.modelName.startsWith("template-wall") && wall.yRotation === 0, "Straight Wall facing North has yRotation 0");

    g = make5x5Grid();
    g.cells[2][3].type = TileType.Floor; // E walkable -> rotation PI/2
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName.startsWith("template-wall") && Math.abs(wall.yRotation - Math.PI / 2) < 0.0001, "Straight Wall facing East has yRotation PI/2");

    g = make5x5Grid();
    g.cells[1][2].type = TileType.Floor; // S walkable -> rotation PI
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName.startsWith("template-wall") && Math.abs(wall.yRotation - Math.PI) < 0.0001, "Straight Wall facing South has yRotation PI");

    g = make5x5Grid();
    g.cells[2][1].type = TileType.Floor; // W walkable -> rotation 3*PI/2
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName.startsWith("template-wall") && Math.abs(wall.yRotation - (3 * Math.PI) / 2) < 0.0001, "Straight Wall facing West has yRotation 3*PI/2");

    // Test Inner Corners
    g = make5x5Grid();
    g.cells[3][2].type = TileType.Floor; // N
    g.cells[2][3].type = TileType.Floor; // E
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName === "template-wall-corner.glb" && wall.yRotation === 0, "Inner Corner N+E uses template-wall-corner.glb with yRotation 0");

    // Test End Cap / Half Wall
    g = make5x5Grid();
    g.cells[3][2].type = TileType.Floor; // N
    g.cells[1][2].type = TileType.Floor; // S
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName === "template-wall-half.glb", "End Cap / Stub N+S uses template-wall-half.glb");

    // Test Outer Corner (NE diagonal walkable)
    g = make5x5Grid();
    g.cells[3][3].type = TileType.Floor; // NE diagonal
    wall = selectWallTile(g, 2, 2);
    assert(wall.modelName === "template-wall-corner.glb" && wall.yRotation === 0, "Outer Corner NE diagonal uses template-wall-corner.glb with yRotation 0");

    // Test Floor Variety Selection
    let floorVariantCount = new Set<string>();
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const floorSel = selectFloorTile(testGrid, x, y);
        floorVariantCount.add(floorSel.modelName);
      }
    }
    assert(floorVariantCount.size >= 2, `selectFloorTile selects multiple floor tile variants (found ${floorVariantCount.size} variants)`);

    // Test Door Rotations
    g = make5x5Grid();
    g.cells[3][2].type = TileType.Floor; // N
    g.cells[1][2].type = TileType.Floor; // S
    let doorRot = selectDoorRotation(g, 2, 2);
    assert(doorRot === 0, "Door rotation in N-S corridor is 0");

    g = make5x5Grid();
    g.cells[2][3].type = TileType.Floor; // E
    g.cells[2][1].type = TileType.Floor; // W
    doorRot = selectDoorRotation(g, 2, 2);
    assert(Math.abs(doorRot - Math.PI / 2) < 0.0001, "Door rotation in E-W corridor is PI/2");

    // -------------------------------------------------------------------
    // 6. Extreme Stress Test (120x120 Grid - 14,400 Tiles)
    // -------------------------------------------------------------------
    console.log("\n--- TEST GROUP 6: Extreme Stress Test (120x120 Grid) ---");

    const hugeGen = new Generator({ width: 120, height: 120, seed: 99999 });
    const hugeGrid = hugeGen.generate();
    assert(hugeGrid.width === 120 && hugeGrid.height === 120, "120x120 grid generated successfully");

    const hugeStart = Date.now();
    const hugeBuilt = await tileMap.buildFromGrid(hugeGrid);
    const hugeTime = Date.now() - hugeStart;

    const hugeInstances = hugeBuilt.rootNode.getChildren().filter(c => c instanceof InstancedMesh).length;
    assert(hugeInstances > 2000, `120x120 grid created ${hugeInstances} GPU instances without throwing exceptions (completed in ${hugeTime}ms)`);
    assert(hugeBuilt.mergedFloors !== null && hugeBuilt.mergedWalls !== null, "120x120 grid mergedFloors and mergedWalls created successfully");

    // Summary
    console.log("\n==========================================================================");
    console.log(`  EMPIRE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================================================");

    if (failed > 0) {
      console.error("Failures:");
      failures.forEach(f => console.error(`  ${f}`));
      process.exit(1);
    }

  } finally {
    ctx.dispose();
  }
}

runAllTests().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
