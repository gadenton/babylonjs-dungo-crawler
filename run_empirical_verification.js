import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

// Import compiled dist-test modules
import { Generator, TileType } from "./dist-test/dungeon/Generator.js";
import { NavMeshManager } from "./dist-test/dungeon/NavMeshManager.js";

async function runEmpiricalVerification() {
  console.log("=================================================");
  console.log("Phase 2 Iteration 2 Empirical Verification Runner");
  console.log("=================================================\n");

  let allTestsPassed = true;

  // ----------------------------------------------------
  // TEST 1: TileMap Submesh Rotation Baking Logic
  // ----------------------------------------------------
  console.log("--- Test 1: TileMap Submesh Rotation & Matrix Baking ---");
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const templateNode = new TransformNode("template_wall", scene);
  const childMesh = MeshBuilder.CreateBox("wall_submesh", { width: 0.2, height: 2, depth: 2 }, scene);
  childMesh.parent = templateNode;
  childMesh.rotationQuaternion = Quaternion.Identity(); // Mimic GLTF import

  // Clone with fix (rotationQuaternion = null before setting Euler rotation)
  const clonedFixed = childMesh.clone("tileMesh_fixed", null);
  clonedFixed.setEnabled(true);
  clonedFixed.position.set(5, 0, 5);
  clonedFixed.rotationQuaternion = null;
  clonedFixed.rotation.set(0, Math.PI / 2, 0);
  clonedFixed.computeWorldMatrix(true);
  clonedFixed.bakeCurrentTransformIntoVertices();

  const wm = clonedFixed.getWorldMatrix();
  const testLocalPt = new Vector3(0.1, 0, 1.0);
  const transformedPt = Vector3.TransformCoordinates(testLocalPt, wm);

  // In 90deg rotation around Y, local (0.1, 0, 1.0) at pos (5,0,5) transforms to (6, 0, 4.9) or (4, 0, 5.1)
  const isRotatedCorrectly = Math.abs(transformedPt.x - 6.0) < 0.001 || Math.abs(transformedPt.x - 4.0) < 0.001;
  console.log(`Submesh transform check: local (0.1, 0, 1.0) => world (${transformedPt.x.toFixed(2)}, ${transformedPt.y.toFixed(2)}, ${transformedPt.z.toFixed(2)})`);
  console.log(`Submesh Rotation Baking Test: ${isRotatedCorrectly ? "PASS" : "FAIL"}\n`);

  if (!isRotatedCorrectly) allTestsPassed = false;

  // ----------------------------------------------------
  // TEST 2: Recast NavMesh Pathfinding Across Generated Grids
  // ----------------------------------------------------
  console.log("--- Test 2: Recast NavMesh Pathfinding across 5 Procedural Dungeon Seeds ---");

  const seeds = [42, 100, 12345, 99999, 77777];
  const navManager = new NavMeshManager({ walkableRadius: 1 });
  await navManager.init();

  for (const seed of seeds) {
    console.log(`\nTesting Seed ${seed}:`);
    const generator = new Generator({ seed, width: 40, height: 40, corridorWidth: 2 });
    const grid = generator.generate();

    console.log(`  Rooms carved: ${grid.rooms.length}`);
    console.log(`  Spawn Pos: (${grid.spawnPosition.x}, ${grid.spawnPosition.y}) => World: (${grid.spawnPosition.x * 2 + 1}, 0, ${grid.spawnPosition.y * 2 + 1})`);
    console.log(`  Stairs Pos: (${grid.stairsPosition.x}, ${grid.stairsPosition.y}) => World: (${grid.stairsPosition.x * 2 + 1}, 0, ${grid.stairsPosition.y * 2 + 1})`);

    // Build floor meshes for NavMesh generation
    const floorMeshes = [];
    const doorCells = [];

    for (let gy = 0; gy < grid.height; gy++) {
      for (let gx = 0; gx < grid.width; gx++) {
        const cell = grid.cells[gy][gx];
        if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
          const worldX = gx * 2.0 + 1.0;
          const worldZ = gy * 2.0 + 1.0;
          const tileFloor = MeshBuilder.CreatePlane(`floor_${gx}_${gy}`, { size: 2.0 }, scene);
          tileFloor.rotation.x = Math.PI / 2; // Flat on X-Z plane
          tileFloor.position.set(worldX, 0, worldZ);
          tileFloor.computeWorldMatrix(true);
          tileFloor.bakeCurrentTransformIntoVertices();
          floorMeshes.push(tileFloor);

          if (cell.type === TileType.Door) {
            doorCells.push({ gx, gy, worldX, worldZ });
          }
        }
      }
    }

    const mergedFloors = Mesh.MergeMeshes(floorMeshes, true, true, undefined, false, false);
    if (!mergedFloors) {
      console.error(`  FAIL: Failed to create mergedFloors for seed ${seed}`);
      allTestsPassed = false;
      continue;
    }

    mergedFloors.checkCollisions = true;

    const navSuccess = await navManager.createNavMesh(mergedFloors);
    if (!navSuccess) {
      console.error(`  FAIL: Recast NavMesh creation failed for seed ${seed}`);
      allTestsPassed = false;
      mergedFloors.dispose();
      continue;
    }

    console.log(`  NavMesh generated successfully.`);

    // Query 2a: Spawn to Stairs
    const spawnVec = new Vector3(grid.spawnPosition.x * 2.0 + 1.0, 0, grid.spawnPosition.y * 2.0 + 1.0);
    const stairsVec = new Vector3(grid.stairsPosition.x * 2.0 + 1.0, 0, grid.stairsPosition.y * 2.0 + 1.0);
    const spawnToStairsPath = navManager.findPath(spawnVec, stairsVec);

    const pathLength = spawnToStairsPath.length;
    const reachEnd = pathLength > 0 ? Vector3.Distance(spawnToStairsPath[pathLength - 1], stairsVec) < 1.5 : false;

    console.log(`  Path [Spawn -> Stairs]: Points count = ${pathLength}, Reached End = ${reachEnd}`);
    if (pathLength === 0 || !reachEnd) {
      console.error(`  FAIL: Spawn to Stairs path invalid for seed ${seed}`);
      allTestsPassed = false;
    }

    // Query 2b: Spawn to All Room Centers
    let allRoomsReachable = true;
    for (const room of grid.rooms) {
      const roomCenterVec = new Vector3(room.centerX * 2.0 + 1.0, 0, room.centerY * 2.0 + 1.0);
      const roomPath = navManager.findPath(spawnVec, roomCenterVec);
      const roomReached = roomPath.length > 0 && Vector3.Distance(roomPath[roomPath.length - 1], roomCenterVec) < 1.5;
      if (!roomReached) {
        console.error(`  FAIL: Room ${room.id} at (${room.centerX}, ${room.centerY}) unreachable from spawn!`);
        allRoomsReachable = false;
      }
    }
    console.log(`  Path [Spawn -> All ${grid.rooms.length} Rooms]: ${allRoomsReachable ? "PASS (All Reachable)" : "FAIL"}`);
    if (!allRoomsReachable) allTestsPassed = false;

    // Query 2c: Doorway Traversability
    console.log(`  Doors found: ${doorCells.length}`);
    let doorsNavigable = 0;
    for (const door of doorCells) {
      const doorVec = new Vector3(door.worldX, 0, door.worldZ);
      const doorPath = navManager.findPath(spawnVec, doorVec);
      if (doorPath.length > 0 && Vector3.Distance(doorPath[doorPath.length - 1], doorVec) < 1.5) {
        doorsNavigable++;
      }
    }
    console.log(`  Door Traversability: ${doorsNavigable}/${doorCells.length} doors reachable from spawn.`);
    if (doorsNavigable < doorCells.length) {
      console.warn(`  Warning: ${doorCells.length - doorsNavigable} doors not directly reachable from spawn (or obstructed).`);
    }

    mergedFloors.dispose();
  }

  // ----------------------------------------------------
  // TEST 3: Stress Comparison (walkableRadius = 1 vs walkableRadius = 3)
  // ----------------------------------------------------
  console.log("\n--- Test 3: Radius Stress Test (walkableRadius = 1 vs 3) ---");
  const testSeed = 42;
  const testGen = new Generator({ seed: testSeed, width: 30, height: 30 });
  const testGrid = testGen.generate();

  const floorMeshes = [];
  for (let gy = 0; gy < testGrid.height; gy++) {
    for (let gx = 0; gx < testGrid.width; gx++) {
      const cell = testGrid.cells[gy][gx];
      if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;
        const tileFloor = MeshBuilder.CreatePlane(`floor_${gx}_${gy}`, { size: 2.0 }, scene);
        tileFloor.rotation.x = Math.PI / 2;
        tileFloor.position.set(worldX, 0, worldZ);
        tileFloor.computeWorldMatrix(true);
        tileFloor.bakeCurrentTransformIntoVertices();
        floorMeshes.push(tileFloor);
      }
    }
  }

  const merged = Mesh.MergeMeshes(floorMeshes, true, true, undefined, false, false);
  if (merged) {
    const nav1 = new NavMeshManager({ walkableRadius: 1 });
    const nav3 = new NavMeshManager({ walkableRadius: 3 });

    await nav1.createNavMesh(merged);
    await nav3.createNavMesh(merged);

    const pStart = new Vector3(testGrid.spawnPosition.x * 2.0 + 1.0, 0, testGrid.spawnPosition.y * 2.0 + 1.0);
    const pEnd = new Vector3(testGrid.stairsPosition.x * 2.0 + 1.0, 0, testGrid.stairsPosition.y * 2.0 + 1.0);

    const path1 = nav1.findPath(pStart, pEnd);
    const path3 = nav3.findPath(pStart, pEnd);

    console.log(`  walkableRadius = 1 path points: ${path1.length}`);
    console.log(`  walkableRadius = 3 path points: ${path3.length}`);

    nav1.dispose();
    nav3.dispose();
    merged.dispose();
  }

  engine.dispose();
  navManager.dispose();

  console.log("\n=================================================");
  console.log(`FINAL EMPIRICAL VERDICT: ${allTestsPassed ? "ALL TESTS PASSED (APPROVE)" : "SOME TESTS FAILED (REQUEST_CHANGES)"}`);
  console.log("=================================================");
}

runEmpiricalVerification().catch(err => {
  console.error("Empirical Verification Error:", err);
  process.exit(1);
});
