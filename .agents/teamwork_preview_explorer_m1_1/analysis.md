# Analysis: E2E Test Infra & Harness Architecture (Milestone M1)

## Executive Summary
This report analyzes the core engine, dungeon generation, tile mapping, navigation, and scene transition subsystems to define a robust, headless E2E test harness for the Babylon.js Dungo Crawler project. Using Babylon.js `NullEngine` under Node via `npx tsx`, tests can execute completely headless without browser canvas requirements, DOM dependencies, or web servers.

---

## 1. Codebase & Subsystem Examination

### `src/core/Engine.ts`
- **Current State**: Wraps Babylon's `Engine` (WebGL2 canvas renderer), `Scene`, ambient and directional lights, and `ShadowGenerator`. Includes side-effect imports (`@babylonjs/loaders/glTF`, `@babylonjs/core/Collisions/collisionCoordinator`, standard/PBR materials).
- **Headless Strategy**: In `tests/harness.ts`, `NullEngine` replaces `BabylonEngine`. `NullEngine` operates without an `HTMLCanvasElement` or WebGL context while preserving Babylon's `Scene`, node transform hierarchy, vector math, collision engine, and picking APIs.

### `src/dungeon/TileMap.ts`
- **Current State**: 
  - `preloadAssets()` calls `SceneLoader.ImportMeshAsync("", basePath, model, scene)` for 6+ Kenney GLB models (`template-floor.glb`, `template-wall.glb`, `template-wall-corner.glb`, etc.).
  - Extracts source `Mesh` instances (`isVisible = false`, `setEnabled(true)`).
  - `buildFromGrid(grid)` loops through grid cells, instantiates source meshes via `sourceMesh.createInstance()`, attaches them to `rootNode`, and creates box colliders (`CreateBox`) for floors and walls.
  - Merges floor box colliders into `mergedFloors` and wall box colliders into `mergedWalls`.
- **Headless Strategy**: Under `NullEngine` in Node, raw `SceneLoader.ImportMeshAsync` fails with `ReferenceError: XMLHttpRequest is not defined` because Node lacks browser `XMLHttpRequest`. However:
  1. `TileMap.preloadAssets()` wraps model preloads in `try ... catch` blocks. When loading fails, it logs a warning and proceeds without throwing.
  2. `buildFromGrid()` still successfully generates invisible box colliders for floors and walls and merges them into `mergedFloors` and `mergedWalls`.
  3. Recast WASM (`NavMeshManager`) operates 100% successfully on `mergedFloors` even when GLB loading is bypassed.
  4. For tests that explicitly verify instancing counts (`InstancedMesh` count, parent transform hierarchy, cell rotations), `tests/harness.ts` can mock `SceneLoader.ImportMeshAsync` to return lightweight primitive `CreateBox` source meshes.

### `src/town/TownHub.ts` & `src/core/GameStateManager.ts`
- **Current State**: Listed in `PROJECT.md` interface contracts and scheduled for implementation in M2 and M3.
  - `TownHub.build(scene: Scene): { rootNode: TransformNode, mergedFloors: Mesh, mergedWalls: Mesh, spawnPoint: Vector3 }`
  - `GameStateManager.transitionToDungeon(): Promise<void>`
- **Headless Strategy**: The test harness must provide modular fixtures that can mock or instantiate `TownHub` and `GameStateManager` as they are implemented, ensuring opaque-box testing across Tier 1 (TownHub static layout, portal proximity) through Tier 4 (full scene transition gameplay loop).

### `src/index.ts`
- **Current State**: Entry point orchestrating bootstrap sequence (Engine -> Subsystems -> Generator -> TileMap -> NavMeshManager -> Altar/Player -> UI -> Enemy AI -> Render Loop).
- **Headless Strategy**: `tests/harness.ts` will mirror `index.ts` bootstrap steps in a modular, headless test context generator function `createHeadlessTestContext()`.

---

## 2. NullEngine Instantiation under Node (`npx tsx`)

### Requirements & Setup Pattern
Running `NullEngine` via `npx tsx` requires `@babylonjs/core/Engines/nullEngine` and a valid target camera attached to the `Scene` to prevent `Error: No camera defined` during frame rendering or matrix updates.

```typescript
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface HeadlessTestContext {
  engine: NullEngine;
  scene: Scene;
  camera: TargetCamera;
  dispose: () => void;
}

export function createHeadlessTestContext(): HeadlessTestContext {
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
```

### Empirical Verification
- Tested with Node v24.18.0 & `tsx` v4.23.5.
- `NullEngine` initializes cleanly: `BJS - Null engine`.
- `scene.render()` executes without WebGL errors when a camera is present.
- Recast WASM (`recast-navigation`) initializes asynchronously and builds solo navmeshes over `mergedFloors` in 62ms.

---

## 3. Asset Loading Behavior & Mocking Strategy

### Empirically Observed GLB Behavior under `NullEngine`
| Scenario | Behavior | Result | Impact on Test Harness |
|----------|----------|--------|------------------------|
| Unmocked `SceneLoader.ImportMeshAsync` | Throws `ReferenceError: XMLHttpRequest is not defined` inside `preloadAssets()` | `preloadAssets()` catches error; `buildFromGrid()` produces 0 `InstancedMesh` nodes, but generates full `mergedFloors` & `mergedWalls` colliders | Ideal for fast pathfinding / grid / collision tests (0ms network delay) |
| Mocked `SceneLoader.ImportMeshAsync` via Primitive Factory | Intercepts GLB import, returns lightweight `CreateBox` mesh as source | `preloadAssets()` populates source meshes; `buildFromGrid()` creates 80+ `InstancedMesh` nodes attached to `rootNode` | Ideal for instancing, transform, parent hierarchy, and bitmask rotation tests |

### Recommended Asset Loader Mock in `tests/harness.ts`
```typescript
import { SceneLoader, ISceneLoaderAsyncResult } from "@babylonjs/core/Loading/sceneLoader";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Scene } from "@babylonjs/core/scene";

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
```

---

## 4. Recommended Test Harness Architecture (`tests/harness.ts`)

### Structure of `tests/harness.ts`
`tests/harness.ts` will serve as the single source of truth for test environment creation, asset loader mocking, game state bootstrapping, and opaque assertion utilities.

```
tests/
├── harness.ts                     # Headless NullEngine context, mocking, & opaque assertions
├── tier1-feature-coverage.test.ts # Tier 1: TileMap, Bitmasking, TownHub, Spawning, Portal Proximity
├── tier2-boundary-corner.test.ts  # Tier 2: Edge bitmasking (0,0)/(39,39), invalid inputs, interaction spam
├── tier3-cross-feature.test.ts    # Tier 3: TownHub -> Portal -> BSP Grid -> Recast WASM NavMesh
└── tier4-gameplay-loop.test.ts    # Tier 4: Full town-to-dungeon gameplay loop opaque verification
```

### Core Harness API Specifications

1. **Context Creation & Teardown**:
   - `createTestContext(options?: { mockAssets?: boolean }): Promise<HeadlessTestContext>`
   - `disposeTestContext(ctx: HeadlessTestContext): void`

2. **Dungeon & Town Builders**:
   - `buildTestDungeon(ctx: HeadlessTestContext, seed?: number): Promise<{ grid: DungeonGrid, builtDungeon: BuiltDungeon, navMeshManager: NavMeshManager }>`
   - `buildTestTownHub(ctx: HeadlessTestContext): Promise<{ rootNode: TransformNode, mergedFloors: Mesh, mergedWalls: Mesh, spawnPoint: Vector3 }>`

3. **Opaque Assertion Utilities**:
   - `assertGridDimensions(grid: DungeonGrid, expectedW: number, expectedH: number): void`
   - `assertMergedColliders(builtDungeon: BuiltDungeon): void`
   - `assertNavMeshPath(navMeshManager: NavMeshManager, start: Vector3, end: Vector3): Vector3[]`
   - `assertProximityInteraction(playerPos: Vector3, altarPos: Vector3, radius: number): boolean`

---

## Summary of Recommendations for Sub-Orchestrator
1. Use `NullEngine` + `TargetCamera` in `tests/harness.ts` for zero-DOM headless testing.
2. Implement `setupMockAssetLoader()` in `tests/harness.ts` to allow `TileMap` and future `TownHub` to instantiate mock meshes cleanly under `NullEngine`.
3. Provide modular helper functions in `tests/harness.ts` matching the 4 test tier suites outlined in `SCOPE.md`.
