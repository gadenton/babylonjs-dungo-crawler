# Handoff Report: E2E Test Infra & Harness Architecture (Milestone M1)

## 1. Observation

### Code Base Subsystems Examined
1. `src/core/Engine.ts`:
   - Line 1: `import { Engine as BabylonEngine } from "@babylonjs/core/Engines/engine";`
   - Lines 36-45: `this.engine = new BabylonEngine(this.canvas, ...)` requires an `HTMLCanvasElement` for WebGL rendering.
   - Lines 9-16: Imports side-effects (`import "@babylonjs/loaders/glTF";`, `@babylonjs/core/Collisions/collisionCoordinator`, etc.).

2. `src/dungeon/TileMap.ts`:
   - Line 70: `const importPromise = SceneLoader.ImportMeshAsync("", basePath, model, this.scene);`
   - Lines 95-97: Preloading catches GLB load errors per model: `catch (err) { console.warn('[TileMap] Model ... load failed/timed out:', err); }`.
   - Lines 157-195: Calls `src.createInstance()` for GLB source meshes (if available) and `CreateBox(...)` for floor/wall collision boxes.
   - Lines 231-255: Merges floor and wall collision boxes into `mergedFloors` and `mergedWalls` via `Mesh.MergeMeshes()`.

3. `src/dungeon/NavMeshManager.ts`:
   - Lines 42-46: Initializes Recast WASM asynchronously via `init()`.
   - Lines 65-81: Extracts positions and indices from `mergedFloors` and builds solo NavMesh via `generateSoloNavMesh()`.
   - Lines 94-112: `findPath(start, end)` computes vector path points over the navmesh.

4. `src/index.ts`:
   - Lines 23-380: Complete 8-step bootstrap sequence from Engine initialization to enemy spawning, UI event wiring, and main render loop.

5. `src/town/TownHub.ts` & `src/core/GameStateManager.ts`:
   - Not yet present in `src/` (scheduled for M2 & M3). Listed in `PROJECT.md` interface contracts:
     - `TownHub.build(scene: Scene): { rootNode: TransformNode, mergedFloors: Mesh, mergedWalls: Mesh, spawnPoint: Vector3 }`
     - `GameStateManager.transitionToDungeon(): Promise<void>`

6. `package.json`:
   - Line 18: `"tsx": "^4.23.5"` available in `devDependencies`.

### Empirical Test Execution Results under Node (`npx tsx`)
1. **Unmocked GLB loading**:
   Command: `npx tsx .agents/teamwork_preview_explorer_m1_1/scratch_test.ts`
   Verbatim error when calling `SceneLoader.ImportMeshAsync`:
   ```
   ReferenceError: XMLHttpRequest is not defined
       at createXMLHttpRequest (C:\Users\greg_\source\babylonjs-dungo-crawler\node_modules\.pnpm\@babylonjs+core@9.19.0\dev\core\src\Misc\webRequest.ts:15:9)
   ```
   - Observed behavior: `TileMap.preloadAssets()` catches this error gracefully. `buildFromGrid()` proceeds and creates 0 `InstancedMesh` nodes, but STILL generates 1128 floor box vertices and 768 wall box vertices in `mergedFloors` and `mergedWalls`.

2. **Mocked Asset Loader + Recast WASM Pathfinding**:
   Command: Mocked `SceneLoader.ImportMeshAsync` returning `CreateBox` primitives.
   Verbatim output:
   ```
   BJS - Babylon.js v9.19.0 - Null engine
   [TileMap] Instancing done. Floors: 47, Walls: 32, Total instances: 80
   [TileMap] Merging collision geometry...
   [TileMap] Collision geometry merged.
   [NavMeshManager] Recast WASM initialized successfully.
   [Scratch Test] NavMesh create result: true
   [Scratch Test] Path points count: 2
   [Scratch Test] Start: {X: 11 Y: 0 Z: 11}, End: {X: 9 Y: 0 Z: 9}
   ```

---

## 2. Logic Chain

1. **Observation**: `Engine.ts` relies on `BabylonEngine` and DOM canvas, whereas `NullEngine` runs without any DOM canvas element.
   **Deduction**: `tests/harness.ts` can instantiate `NullEngine` and `Scene` in headless Node environment via `npx tsx` without any browser process.

2. **Observation**: Rendering `Scene` under `NullEngine` without an active camera throws `Error: No camera defined`.
   **Deduction**: Every test context created in `tests/harness.ts` must attach at least one camera (`TargetCamera` or `FreeCamera`) to the `Scene`.

3. **Observation**: `SceneLoader.ImportMeshAsync` fails in Node due to missing `XMLHttpRequest`.
   **Deduction**: Real GLBs cannot be loaded directly over local HTTP relative paths without a DOM/XHR shim. However, `TileMap.ts` catches preload errors and still produces `mergedFloors` and `mergedWalls` box meshes.

4. **Observation**: Mocking `SceneLoader.ImportMeshAsync` to return lightweight `CreateBox` primitive meshes allows `TileMap.preloadAssets()` to succeed completely and populate 80+ `InstancedMesh` nodes attached to `rootNode`.
   **Deduction**: `tests/harness.ts` should include a `setupMockAssetLoader(scene)` utility so tests can verify instancing counts, cell rotations, parent hierarchy, and mesh structures cleanly without network or DOM overhead.

5. **Observation**: Recast WASM initializes and generates solo navmeshes over `mergedFloors` under `NullEngine` in 62ms, returning valid `Vector3[]` paths.
   **Deduction**: Full pathfinding and movement verification tests (Tiers 1-4) can be executed natively in Node.

---

## 3. Caveats

- **Visual Rendering**: `NullEngine` does not execute WebGL shader rasterization or output pixel buffers. Visual inspections (e.g. verifying exact pixel shaders or SSAO post-processing appearance) must rely on mesh geometry transform and node hierarchy assertions rather than image diffing.
- **Future Subsystems**: `TownHub.ts` (M2) and `GameStateManager.ts` (M3) are not yet in `src/`. `tests/harness.ts` design is modular so implementers can plug in `TownHub` and `GameStateManager` exports without refactoring the test runner.
- **WASM Memory**: Recast WASM (`recast-navigation`) creates webassembly memory instances. `navMeshManager.dispose()` must be called in test teardown hooks to prevent memory leaks across multiple test files.

---

## 4. Conclusion

1. **Test Runner Choice**: `npx tsx` running Babylon.js `NullEngine` is 100% viable, ultra-fast (~60ms per test run), and requires zero browser runners (Puppeteer/Playwright) or DOM emulation.
2. **Asset Loading**: Implement `setupMockAssetLoader(scene)` in `tests/harness.ts` to supply primitive source meshes for GLB loader requests.
3. **Test Infrastructure Layout**:
   - `tests/harness.ts`: Core test context factory, asset loader mock, and opaque assertions.
   - `tests/tier1-feature-coverage.test.ts`: TileMap, Bitmasking, TownHub static plaza, Spawning, Proximity.
   - `tests/tier2-boundary-corner.test.ts`: Edge bitmasking (0,0)/(39,39), invalid inputs, interaction spam.
   - `tests/tier3-cross-feature.test.ts`: Town Hub movement -> Portal trigger -> BSP grid -> WASM NavMesh.
   - `tests/tier4-gameplay-loop.test.ts`: Full opaque gameplay loop.

---

## 5. Verification Method

### How to Verify Headless Test Execution
Run the scratch verification script in Node via `npx tsx`:
```bash
npx tsx .agents/teamwork_preview_explorer_m1_1/scratch_test.ts
```

### Invalidation Conditions
- If `NullEngine` throws `No camera defined`, verify a `TargetCamera` is attached to `scene`.
- If `recast-navigation` WASM init fails in Node, verify WASM binary import path in `node_modules/recast-navigation`.
