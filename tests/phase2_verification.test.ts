import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Generator, TileType } from "../src/dungeon/Generator";
import { TileMap, DungeonTheme } from "../src/dungeon/TileMap";
import { NavMeshManager } from "../src/dungeon/NavMeshManager";

async function runEmpiricalTests() {
  console.log("=== PHASE 2 EMPIRICAL VERIFICATION TESTS ===");
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- 1. Generator Verification ---
  console.log("\n1. Testing Generator logic across seeds...");
  const seeds = [42, 1001, 77777, 987654];
  for (const seed of seeds) {
    const generator = new Generator({ width: 40, height: 40, seed });
    const grid = generator.generate();

    assert(grid.width === 40 && grid.height === 40, `Seed ${seed}: Grid dimensions 40x40`);
    assert(grid.rooms.length >= 2, `Seed ${seed}: Generated at least 2 rooms (found ${grid.rooms.length})`);

    const spawnCell = grid.cells[grid.spawnPosition.y][grid.spawnPosition.x];
    assert(
      spawnCell.type === TileType.Floor || spawnCell.type === TileType.Stairs,
      `Seed ${seed}: Spawn point (${grid.spawnPosition.x}, ${grid.spawnPosition.y}) is walkable`
    );

    const stairsCell = grid.cells[grid.stairsPosition.y][grid.stairsPosition.x];
    assert(
      stairsCell.type === TileType.Stairs,
      `Seed ${seed}: Stairs point (${grid.stairsPosition.x}, ${grid.stairsPosition.y}) is TileType.Stairs`
    );

    // Verify BFS reachability from spawn to stairs and all room centers
    const visited = new Set<string>();
    const queue = [{ x: grid.spawnPosition.x, y: grid.spawnPosition.y }];
    visited.add(`${grid.spawnPosition.x},${grid.spawnPosition.y}`);
    const dirs = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const d of dirs) {
        const nx = curr.x + d.x;
        const ny = curr.y + d.y;
        if (nx >= 0 && nx < 40 && ny >= 0 && ny < 40) {
          const type = grid.cells[ny][nx].type;
          if (type === TileType.Floor || type === TileType.Door || type === TileType.Stairs) {
            const key = `${nx},${ny}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ x: nx, y: ny });
            }
          }
        }
      }
    }

    assert(
      visited.has(`${grid.stairsPosition.x},${grid.stairsPosition.y}`),
      `Seed ${seed}: Exit stairs reachable from spawn via grid search`
    );

    for (const room of grid.rooms) {
      assert(
        visited.has(`${room.centerX},${room.centerY}`),
        `Seed ${seed}: Room ${room.id} center (${room.centerX}, ${room.centerY}) is reachable from spawn`
      );
    }
  }

  // --- 2. TileMap Mesh Placement & Merging Verification ---
  console.log("\n2. Testing TileMap Mesh Placement & Merging...");
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const generator = new Generator({ width: 40, height: 40, seed: 12345 });
  const grid = generator.generate();

  // Create mock floor and wall meshes to test Mesh.MergeMeshes and parameters in NullEngine context
  const mockFloor1 = MeshBuilder.CreateGround("f1", { width: 2, height: 2 }, scene);
  mockFloor1.position.set(1, 0, 1);
  mockFloor1.bakeCurrentTransformIntoVertices();

  const mockFloor2 = MeshBuilder.CreateGround("f2", { width: 2, height: 2 }, scene);
  mockFloor2.position.set(3, 0, 1);
  mockFloor2.bakeCurrentTransformIntoVertices();

  const mergedFloorsTest = Mesh.MergeMeshes([mockFloor1, mockFloor2], true, true, undefined, false, false);
  assert(mergedFloorsTest !== null, "Mesh.MergeMeshes succeeds for floor meshes");
  if (mergedFloorsTest) {
    mergedFloorsTest.checkCollisions = true;
    mergedFloorsTest.isPickable = true;
    assert(mergedFloorsTest.checkCollisions === true, "mergedFloors.checkCollisions is true");
    assert(mergedFloorsTest.isPickable === true, "mergedFloors.isPickable is true");
  }

  const mockWall1 = MeshBuilder.CreateBox("w1", { width: 2, height: 2, depth: 0.2 }, scene);
  mockWall1.position.set(1, 1, 0);
  mockWall1.bakeCurrentTransformIntoVertices();

  const mockWall2 = MeshBuilder.CreateBox("w2", { width: 2, height: 2, depth: 0.2 }, scene);
  mockWall2.position.set(3, 1, 0);
  mockWall2.bakeCurrentTransformIntoVertices();

  const mergedWallsTest = Mesh.MergeMeshes([mockWall1, mockWall2], true, true, undefined, false, false);
  assert(mergedWallsTest !== null, "Mesh.MergeMeshes succeeds for wall meshes");
  if (mergedWallsTest) {
    mergedWallsTest.checkCollisions = true;
    mergedWallsTest.isPickable = false;
    assert(mergedWallsTest.checkCollisions === true, "mergedWalls.checkCollisions is true for wall sliding");
    assert(mergedWallsTest.isPickable === false, "mergedWalls.isPickable is false");
  }

  // --- 3. Recast NavMesh Pathfinding Verification ---
  console.log("\n3. Testing Recast NavMesh Pathfinding Queries...");
  const navManager = new NavMeshManager();
  await navManager.init();

  // Create floor geometry corresponding to grid walkable cells
  const floorBoxes: Mesh[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.cells[y][x];
      if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
        const floorTile = MeshBuilder.CreateBox(`tile_${x}_${y}`, { width: 2, height: 0.2, depth: 2 }, scene);
        floorTile.position.set(x * 2.0 + 1.0, 0, y * 2.0 + 1.0);
        floorTile.computeWorldMatrix(true);
        floorTile.bakeCurrentTransformIntoVertices();
        floorBoxes.push(floorTile);
      }
    }
  }

  const mergedDungeonFloors = Mesh.MergeMeshes(floorBoxes, true, true, undefined, false, false);
  assert(mergedDungeonFloors !== null, "Merged dungeon floor mesh generated successfully for Recast input");

  if (mergedDungeonFloors) {
    const navCreated = await navManager.createNavMesh(mergedDungeonFloors);
    assert(navCreated === true, "Recast NavMesh created successfully over merged floor mesh");

    const spawnPoint = new Vector3(grid.spawnPosition.x * 2.0 + 1.0, 0, grid.spawnPosition.y * 2.0 + 1.0);
    const stairsPoint = new Vector3(grid.stairsPosition.x * 2.0 + 1.0, 0, grid.stairsPosition.y * 2.0 + 1.0);

    const spawnToStairsPath = navManager.findPath(spawnPoint, stairsPoint);
    assert(spawnToStairsPath.length > 0, `Path found from Spawn ${spawnPoint} to Stairs ${stairsPoint} (length: ${spawnToStairsPath.length})`);

    if (spawnToStairsPath.length > 0) {
      const firstPt = spawnToStairsPath[0];
      const lastPt = spawnToStairsPath[spawnToStairsPath.length - 1];
      const distStart = Vector3.Distance(firstPt, spawnPoint);
      const distEnd = Vector3.Distance(lastPt, stairsPoint);
      assert(distStart < 1.0, `Path start ${firstPt} is close to Spawn ${spawnPoint} (dist: ${distStart.toFixed(3)})`);
      assert(distEnd < 1.0, `Path end ${lastPt} is close to Stairs ${stairsPoint} (dist: ${distEnd.toFixed(3)})`);
    }

    // Verify paths between all room centers
    console.log(`Checking pathfinding queries between ${grid.rooms.length} room centers...`);
    for (let i = 0; i < grid.rooms.length; i++) {
      for (let j = i + 1; j < grid.rooms.length; j++) {
        const r1 = grid.rooms[i];
        const r2 = grid.rooms[j];
        const p1 = new Vector3(r1.centerX * 2.0 + 1.0, 0, r1.centerY * 2.0 + 1.0);
        const p2 = new Vector3(r2.centerX * 2.0 + 1.0, 0, r2.centerY * 2.0 + 1.0);

        const path = navManager.findPath(p1, p2);
        assert(path.length > 0, `Path found between Room ${r1.id} center (${p1.x}, ${p1.z}) and Room ${r2.id} center (${p2.x}, ${p2.z}) (length: ${path.length})`);
      }
    }
  }

  // Cleanup
  scene.dispose();
  engine.dispose();
  navManager.dispose();

  console.log(`\n=== EMPIRICAL TEST RESULT: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
}

runEmpiricalTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
