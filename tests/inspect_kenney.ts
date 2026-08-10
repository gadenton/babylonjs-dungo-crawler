import { polyfillXHR } from "./xhr_polyfill";
polyfillXHR();

import { init } from "recast-navigation";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { TileMap, DungeonTheme } from "../src/dungeon/TileMap";
import { Generator } from "../src/dungeon/Generator";
import { NavMeshManager } from "../src/dungeon/NavMeshManager";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";

async function inspectKenneyGLB() {
  console.log("=== INSPECTING KENNEY GLB ASSETS & TILEMAP NAVMESH ===");
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const tileMap = new TileMap(scene, DungeonTheme.Dungeon);
  await tileMap.preloadAssets();
  console.log("Preloaded GLB assets successfully!");

  const generator = new Generator({ width: 40, height: 40, seed: 12345 });
  const grid = generator.generate();

  const builtDungeon = await tileMap.buildFromGrid(grid);
  console.log("Built dungeon mergedFloors:", builtDungeon.mergedFloors ? builtDungeon.mergedFloors.name : "null");
  console.log("Built dungeon mergedWalls:", builtDungeon.mergedWalls ? builtDungeon.mergedWalls.name : "null");

  if (builtDungeon.mergedFloors) {
    const rawPositions = builtDungeon.mergedFloors.getVerticesData(VertexBuffer.PositionKind);
    if (rawPositions) {
      let minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < rawPositions.length; i += 3) {
        const y = rawPositions[i];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      console.log(`mergedFloors vertex count: ${rawPositions.length / 3}`);
      console.log(`mergedFloors Y-range: minY=${minY}, maxY=${maxY}, heightDelta=${maxY - minY}`);
    }

    const navManager = new NavMeshManager();
    await navManager.init();

    const success = await navManager.createNavMesh(builtDungeon.mergedFloors);
    console.log("NavMeshManager.createNavMesh result on actual mergedFloors:", success);

    if (success) {
      const path = navManager.findPath(builtDungeon.spawnPoint, builtDungeon.stairsPoint);
      console.log(`Path from Spawn (${builtDungeon.spawnPoint}) to Stairs (${builtDungeon.stairsPoint}): ${path.length} waypoints`);
      if (path.length > 0) {
        console.log("First 3 waypoints:", path.slice(0, 3));
        console.log("Last waypoint:", path[path.length - 1]);
      }
    }
  }

  scene.dispose();
  engine.dispose();
}

inspectKenneyGLB().catch(console.error);
