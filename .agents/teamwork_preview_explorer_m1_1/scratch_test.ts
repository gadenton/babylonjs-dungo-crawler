import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SceneLoader, ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";
import { Generator } from "../../src/dungeon/Generator";
import { TileMap } from "../../src/dungeon/TileMap";

console.log("[Scratch Test] Testing mocked SceneLoader.ImportMeshAsync under NullEngine...");
const engine = new NullEngine();
const scene = new Scene(engine);
const camera = new TargetCamera("camera", new Vector3(0, 10, -10), scene);

// Mock SceneLoader.ImportMeshAsync
const originalImportMeshAsync = SceneLoader.ImportMeshAsync;
SceneLoader.ImportMeshAsync = async function (
  meshNames: any,
  rootUrl: string,
  sceneFilename: string,
  targetScene?: Scene
): Promise<ISceneLoaderAsyncResult> {
  const sc = targetScene || scene;
  const mockMesh = CreateBox(`mock_${sceneFilename}`, { size: 2.0 }, sc);
  mockMesh.isVisible = false;
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

async function testMockedTileMap() {
  const generator = new Generator({ width: 10, height: 10, seed: 12345 });
  const grid = generator.generate();

  const tileMap = new TileMap(scene);
  const builtDungeon = await tileMap.buildFromGrid(grid);

  console.log(`[Scratch Test] TileMap buildFromGrid with mocked meshes completed.`);
  console.log(`  - mergedFloors vertices: ${builtDungeon.mergedFloors?.getTotalVertices()}`);
  console.log(`  - mergedWalls vertices: ${builtDungeon.mergedWalls?.getTotalVertices()}`);
  console.log(`  - doors count: ${builtDungeon.doors.length}`);

  // Count total instanced meshes attached to rootNode
  const instances = builtDungeon.rootNode.getChildren();
  console.log(`  - total root children (instances + merged colliders): ${instances.length}`);

  tileMap.dispose();
}

testMockedTileMap().then(() => {
  SceneLoader.ImportMeshAsync = originalImportMeshAsync;
  engine.dispose();
  console.log("[Scratch Test] Done!");
});
