import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { NavMeshManager } from "./src/dungeon/NavMeshManager.js";
import { Generator, TileType } from "./src/dungeon/Generator.js";

async function runTest() {
  console.log("Testing NullEngine and NavMeshManager in Node...");
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const navManager = new NavMeshManager({ walkableRadius: 1 });
  await navManager.init();
  console.log("Recast initialized successfully!");

  // Create a test ground mesh (mimicking mergedFloors)
  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10, subdivisions: 2 }, scene);
  const success = await navManager.createNavMesh(ground);
  console.log("Create NavMesh result:", success);

  if (success) {
    const path = navManager.findPath(new Vector3(-4, 0, -4), new Vector3(4, 0, 4));
    console.log("Found path points:", path.length, path);
  }

  engine.dispose();
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
