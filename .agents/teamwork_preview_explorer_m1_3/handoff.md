# Milestone 1 Investigation Report: Tile Connectivity & GPU Instancing

**Author**: Explorer 3  
**Target Audience**: Implementer / Worker Agent & Orchestrator  
**Working Directory**: `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_m1_3`  
**Date**: 2026-08-06  

---

## 1. Observation

### 1.1 GPU Instancing in `TileMap.ts`
- **File**: `src/dungeon/TileMap.ts` (lines 52–102, 144–224)
- **Asset Preloading (`preloadAssets`)**:
  - GLB files are loaded asynchronously using `SceneLoader.ImportMeshAsync("", basePath, model, this.scene)` (line 70).
  - The root container mesh `result.meshes[0]` is collected into `templateRoots: TransformNode[]` for scene lifecycle disposal (line 78).
  - All real child meshes with vertices (`m instanceof Mesh && m.getTotalVertices() > 0`) are configured as templates:
    ```ts
    m.isVisible = false; // Source mesh hidden at origin
    m.setEnabled(true);  // Must stay enabled so instances inherit geometry/material and render
    sourceMeshes.push(m);
    ```
  - `templateMeshes` maps model filenames to `Mesh[]` arrays (line 92). This handles multi-mesh GLBs (GLB models containing multiple child meshes) properly.
- **Instance Placement (`buildFromGrid`)**:
  - For each grid cell `(gx, gy)`, `TileMap.ts` queries template source meshes:
    ```ts
    for (const src of sources) {
      const inst = src.createInstance(`wall_${gx}_${gy}_${src.name}`);
      inst.position.set(worldX, 0, worldZ);
      inst.rotationQuaternion = null; // Essential before setting Euler angles!
      inst.rotation.set(0, rotation, 0);
      inst.parent = rootNode;
      allInstances.push(inst);
    }
    ```
  - Instancing aggregates all instances sharing a source `Mesh` into **1 draw call** via hardware instanced rendering.

### 1.2 Physics Collider Generation & Merging
- **File**: `src/dungeon/TileMap.ts` (lines 166–195, 228–255)
- **Decoupled Architecture**: Rendering geometry (`InstancedMesh`) is kept completely separate from collision geometry (`Mesh`). Rendering instances have `checkCollisions = false` and `isPickable = false`.
- **Collider Creation**:
  - Floor colliders: `CreateBox("fc_...", { width: 2.0, height: 0.2, depth: 2.0 }, scene)` at `(worldX, -0.1, worldZ)` (lines 167–170).
  - Wall colliders: `CreateBox("wc_...", { width: 2.0, height: 3.0, depth: 2.0 }, scene)` at `(worldX, 1.5, worldZ)` (lines 191–194).
- **Mesh Merging**:
  - `Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false)` and `Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false)` combine hundreds/thousands of individual box colliders into unified single meshes (`mergedFloors` and `mergedWalls`).
  - Flag `disposeSource = true` disposes individual box nodes, freeing scene node overhead.
  - `mergedFloors`: `isVisible = false`, `checkCollisions = true`, `isPickable = true`, `freezeWorldMatrix()`. Used for click-to-move picking and Recast NavMesh geometry extraction (`NavMeshManager.ts:58`).
  - `mergedWalls`: `isVisible = false`, `checkCollisions = true`, `isPickable = false`, `freezeWorldMatrix()`. Used for player/camera collision detection.

### 1.3 Main Thread Yield Points
- **File**: `src/dungeon/TileMap.ts` (lines 220–223)
  - Tile placement loop currently yields every 10 rows:
    ```ts
    if (gy % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    ```
- **File**: `src/dungeon/Generator.ts` (lines 113–187)
  - `Generator.generate()` is **100% synchronous**. `splitNode`, `createRoomsInLeaves`, `connectBSPNodes`, `placeDoors`, `ensureReachability` (BFS flood fill), and `placeWalls` all run synchronously in a single blocking call.
- **File**: `src/dungeon/TileMap.ts` (lines 229–255)
  - `Mesh.MergeMeshes` for floors and walls is executed synchronously right after tile placement without yielding. On 40x40 (1,600 tiles) or larger grids, merging thousands of geometries blocks the UI event loop.
- **File**: `src/dungeon/NavMeshManager.ts` (lines 58–91)
  - `extractWorldGeometry` + `generateSoloNavMesh` in Recast WASM run synchronously without a yield point immediately before execution.

---

## 2. Logic Chain

1. **GPU Instancing Integrity**:
   - *Premise*: `mesh.createInstance()` in Babylon.js provides optimal WebGL performance by batching instances into single draw calls per source mesh.
   - *Observation*: `TileMap.ts` loads GLB files into `templateMeshes` (`Map<string, Mesh[]>`), hides source meshes (`isVisible = false`, `setEnabled(true)`), and instances them in `buildFromGrid()`.
   - *Deduction*: Adding modular Kenney GLB pieces (`template-wall-corner.glb`, `template-wall-half.glb`, `template-wall-detail-a.glb`, `template-floor-detail-a.glb`, etc.) requires extending `preloadAssets()` to preload these GLBs and mapping them in `templateMeshes`. In `buildFromGrid()`, selected models must be instantiated via `createInstance()`. Standard mesh cloning (`clone()`) or direct `ImportMeshAsync` during loop iteration must NEVER be used, as it would break GPU instancing and cause draw call explosions.

2. **Rotation Quaternion Reset**:
   - *Premise*: Babylon.js GLTF/GLB loader assigns `rotationQuaternion` to imported meshes by default.
   - *Observation*: Setting `inst.rotation.set(0, rotation, 0)` is ignored by Babylon's transformation pipeline if `inst.rotationQuaternion` is non-null.
   - *Deduction*: `inst.rotationQuaternion = null` MUST be called on every instantiated mesh prior to assigning `inst.rotation.set(0, rotation, 0)` (or `inst.rotation.y = rotation`).

3. **Physics Collider Decoupling**:
   - *Premise*: High-poly modular visual meshes slow down raycasting and collision detection if checked directly.
   - *Observation*: `TileMap.ts` generates low-poly primitive box colliders (2x2 grid spacing) and merges them into `mergedFloors` and `mergedWalls` via `Mesh.MergeMeshes(..., true)`.
   - *Deduction*: Swapping visual wall models for corners or detail pieces does NOT require modifying the collider generation algorithm. The 2.0x2.0 box colliders aligned to the grid provide smooth, continuous, seamless physical collision boundaries and perfect click-to-move picking.

4. **Eliminating UI Freezing**:
   - *Premise*: Continuous JavaScript execution exceeding ~50ms triggers "long task" browser warnings and causes UI freezes during dungeon generation.
   - *Observation*: Heavy operations exist across 4 stages: (1) BSP grid generation & BFS reachability checks in `Generator.ts`, (2) tile placement loop in `TileMap.ts`, (3) `Mesh.MergeMeshes` for floor and wall colliders in `TileMap.ts`, and (4) Recast WASM navmesh generation in `NavMeshManager.ts`.
   - *Deduction*: Main thread yield points (`await new Promise(r => setTimeout(r, 0))`) must be inserted before and between each heavy stage to allow the browser render loop and UI events to execute smoothly.

---

## 3. Caveats

- **GLB Model Asset Inventory**: Assumes all required Kenney GLB models (`template-floor.glb`, `template-floor-detail-a.glb`, `template-wall.glb`, `template-wall-corner.glb`, `template-wall-half.glb`, `gate-door.glb`, `stairs.glb`) are present in `public/assets/dungeon/`.
- **Multi-Mesh Model Support**: Some GLBs may contain multiple child `Mesh` objects. `TileMap`'s current logic iterates over `sources` (`Mesh[]`), which correctly handles multi-mesh GLBs. Implementers must maintain this loop for every tile placement.
- **Worker/Main Thread Boundaries**: Yielding with `setTimeout(0)` keeps generation on the main thread without blocking rendering. (If full off-main-thread Web Workers are used in future milestones, `setTimeout(0)` still serves as a safe micro-task yield point).

---

## 4. Conclusion & Recommendations for Worker Implementation

### 4.1 Asset Preloading Matrix (`TileMap.ts`)
Extend `preloadAssets()` to register all required Kenney modular pieces:
```ts
const models = [
  "template-floor.glb",
  "template-floor-detail.glb",
  "template-floor-detail-a.glb",
  "template-wall.glb",
  "template-wall-corner.glb",
  "template-wall-half.glb",
  "template-wall-detail-a.glb",
  "gate-door.glb",
  "stairs.glb",
];
```

### 4.2 Modular Tile & Rotation Instancing Rule
In `buildFromGrid()`, resolve models based on neighbor bitmask analysis:
```ts
// Example modular tile selection output: { modelName: string, yRotation: number }
const { modelName, yRotation } = selectTileForCell(grid, gx, gy);
const sources = this.templateMeshes.get(modelName) || fallbackSources;

for (const src of sources) {
  const inst = src.createInstance(`${modelName}_${gx}_${gy}_${src.name}`);
  inst.position.set(worldX, 0, worldZ);
  inst.rotationQuaternion = null; // REQUIRED!
  inst.rotation.set(0, yRotation, 0);
  inst.parent = rootNode;
  allInstances.push(inst);
}
```

### 4.3 Collider Generation Protocol
- Keep the existing `CreateBox` generation for floors (`width: 2.0, height: 0.2, depth: 2.0`) and walls (`width: 2.0, height: 3.0, depth: 2.0`).
- Retain `Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false)` and `Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false)`.
- Set `freezeWorldMatrix()` on `mergedFloors` and `mergedWalls`.

### 4.4 Async Yield Points Strategy (`yieldToMain`)
Define a reusable yield helper:
```ts
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
```

Insert yield points at these 5 critical locations:
1. **Generator Async Pass**: Convert `Generator.generate()` to `generateAsync()` or yield in `index.ts` / `GameStateManager.ts` immediately after grid generation:
   ```ts
   const dungeonGrid = generator.generate();
   await yieldToMain();
   ```
2. **Tile Placement Loop**: Yield every 10 rows in `buildFromGrid()`:
   ```ts
   if (gy % 10 === 0) {
     await yieldToMain();
   }
   ```
3. **Before Merging Floor Colliders**:
   ```ts
   await yieldToMain();
   mergedFloors = Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false);
   ```
4. **Before Merging Wall Colliders**:
   ```ts
   await yieldToMain();
   mergedWalls = Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false);
   ```
5. **Before NavMesh Construction**:
   ```ts
   await yieldToMain();
   await navMeshManager.createNavMesh(builtDungeon.mergedFloors);
   ```

---

## 5. Verification Method

To independently verify GPU instancing preservation, physics colliders, and async yield performance:

1. **Typecheck & Build**:
   - Command: `pnpm exec tsc --noEmit`
   - Command: `pnpm run build`
   - Condition: Zero TypeScript compiler errors or Vite build failures.

2. **GPU Instancing Verification**:
   - Inspect Babylon.js scene instrumentation via console:
     `scene.getEngine().getGlInfo()` or `scene.getActiveIndices()`.
   - In browser devtools, check `scene.getEngine()._drawCalls`: total draw calls for 1,600+ dungeon tiles should remain low (< 30 draw calls total for the environment).

3. **Physics Collider Verification**:
   - Confirm `mergedFloors.name === "mergedFloors"` and `mergedWalls.name === "mergedWalls"`.
   - Verify `mergedFloors.isPickable === true` and `mergedFloors.checkCollisions === true`.
   - Verify `mergedWalls.isPickable === false` and `mergedWalls.checkCollisions === true`.
   - In-game test: Click on floor cells; player pathfinding should move smoothly to target location without walking through wall boundaries.

4. **UI Responsiveness & Main Thread Verification**:
   - Open Performance tab in Chrome DevTools during dungeon transition.
   - Condition: No continuous long tasks exceeding 50ms; UI loading text updates progressively without UI thread freeze.
