import "@babylonjs/core/Collisions/collisionCoordinator";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/loaders/glTF";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader, ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import { DungeonGrid, Generator } from "../src/dungeon/Generator";
import { BuiltDungeon, TileMap } from "../src/dungeon/TileMap";
import { NavMeshManager } from "../src/dungeon/NavMeshManager";
import { TownHub, BuiltTownHub } from "../src/town/TownHub";

export interface HeadlessTestContext {
  engine: NullEngine;
  scene: Scene;
  camera: TargetCamera;
  dispose: () => void;
}

/**
 * Creates a NullEngine-based headless test environment for Babylon.js execution in Node.
 */
export function createHeadlessTestContext(options?: { mockAssets?: boolean }): HeadlessTestContext {
  const engine = new NullEngine({
    renderWidth: 512,
    renderHeight: 512,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });

  const scene = new Scene(engine);
  scene.collisionsEnabled = true;

  const camera = new TargetCamera("testCamera", new Vector3(0, 10, -10), scene);
  camera.setTarget(Vector3.Zero());

  if (options?.mockAssets !== false) {
    setupMockAssetLoader(scene);
  }

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

/**
 * Mocks SceneLoader.ImportMeshAsync to create lightweight primitive meshes for NullEngine environment.
 */
export function setupMockAssetLoader(scene: Scene): () => void {
  const originalImport = SceneLoader.ImportMeshAsync;

  SceneLoader.ImportMeshAsync = async function (
    meshNames: any,
    rootUrl: string,
    sceneFilename: string,
    targetScene?: Scene
  ): Promise<ISceneLoaderAsyncResult> {
    const sc = targetScene || scene;
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

  return () => {
    SceneLoader.ImportMeshAsync = originalImport;
  };
}

/**
 * Helper to construct TownHub in headless context.
 */
export async function buildTestTownHub(ctx: HeadlessTestContext): Promise<BuiltTownHub> {
  const townHub = new TownHub(ctx.scene);
  return await townHub.build();
}

/**
 * Helper to generate BSP dungeon, TileMap, and NavMesh in headless context.
 */
export async function buildTestDungeon(
  ctx: HeadlessTestContext,
  seed: number = 42
): Promise<{ grid: DungeonGrid; builtDungeon: BuiltDungeon; navMeshManager: NavMeshManager }> {
  const generator = new Generator({ width: 40, height: 40, seed });
  const grid = generator.generate();

  const tileMap = new TileMap(ctx.scene);
  const builtDungeon = await tileMap.buildFromGrid(grid);

  const navMeshManager = new NavMeshManager();
  await navMeshManager.init(3000);
  if (builtDungeon.mergedFloors) {
    await navMeshManager.createNavMesh(builtDungeon.mergedFloors);
  }

  return { grid, builtDungeon, navMeshManager };
}

// ── Opaque Assertion Helpers ──

export function assertGridDimensions(grid: DungeonGrid, expectedW: number = 40, expectedH: number = 40): void {
  if (grid.width !== expectedW || grid.height !== expectedH) {
    throw new Error(`Grid dimensions assertion failed: expected ${expectedW}x${expectedH}, got ${grid.width}x${grid.height}`);
  }
  if (!grid.cells || grid.cells.length !== expectedH || grid.cells[0].length !== expectedW) {
    throw new Error(`Grid cells array invalid dimensions: expected ${expectedH}x${expectedW}`);
  }
}

export function assertMergedColliders(builtDungeon: BuiltDungeon): void {
  if (!builtDungeon.mergedFloors) {
    throw new Error("assertMergedColliders failed: mergedFloors is null");
  }
  if (!builtDungeon.mergedWalls) {
    throw new Error("assertMergedColliders failed: mergedWalls is null");
  }
  if (builtDungeon.mergedFloors.name !== "mergedFloors" || !builtDungeon.mergedFloors.checkCollisions) {
    throw new Error("assertMergedColliders failed: mergedFloors name or collision check property invalid");
  }
  if (builtDungeon.mergedWalls.name !== "mergedWalls" || !builtDungeon.mergedWalls.checkCollisions) {
    throw new Error("assertMergedColliders failed: mergedWalls name or collision check property invalid");
  }
}

export function assertNavMeshPath(navMeshManager: NavMeshManager, start: Vector3, end: Vector3): Vector3[] {
  const path = navMeshManager.findPath(start, end);
  if (!path || path.length === 0) {
    throw new Error(`assertNavMeshPath failed: no path found between ${start.toString()} and ${end.toString()}`);
  }
  return path;
}

export function assertProximityInteraction(playerPosition: Vector3, altarPosition: Vector3, maxRadius: number = 3.0): boolean {
  const dist = Vector3.Distance(playerPosition, altarPosition);
  return dist <= maxRadius;
}

export function assertSceneHierarchyClean(scene: Scene, deletedRootName: string): void {
  const node = scene.getNodeByName(deletedRootName);
  if (node !== null && !node.isDisposed()) {
    throw new Error(`assertSceneHierarchyClean failed: root node '${deletedRootName}' is still present in scene graph`);
  }
}
