# Survey Explorer 3 Analysis Report: Build Config, NavMesh, Performance Yields & E2E Testing

**Date**: 2026-08-06  
**Project**: Babylon.js ARPG Dungeon Crawler (`babylonjs-dungo-crawler`)  
**Author**: Survey Explorer 3  

---

## 1. Executive Summary

This report provides a comprehensive analysis of the project configuration, TypeScript setup, build pipelines, WebAssembly integration (`recast-navigation`), main thread yield/performance strategies, and recommended E2E testing infrastructure for the Dungo Crawler ARPG codebase.

Key findings include:
1. **TypeScript & Build Config**: Modern ESM setup using Vite 6 + TypeScript 5.4. `pnpm exec tsc --noEmit` and `pnpm run build` verify 0 type errors. `recast-navigation` is correctly excluded from Vite's `optimizeDeps` to prevent WASM bundling breakage.
2. **NavMesh & Tile Grid**: `NavMeshManager.ts` generates solo Recast navigation meshes directly from world-space geometry of merged floor colliders (`mergedFloors`). Introducing a static Town Hub (R2) or modular tile layout changes (R1) requires ensuring Town Hub has its own walkable floor geometry and triggering NavMesh re-creation upon level transition into the procedural dungeon.
3. **Performance Yields**: `TileMap.ts` yields control to the main thread via `await new Promise(resolve => setTimeout(resolve, 0))` every 10 rows. This keeps the UI responsive during 40x40 grid instancing. Yielding points should also precede synchronous collider merging (`Mesh.MergeMeshes`) and Recast WASM generation.
4. **E2E Testing Strategy**: The project contains a custom Node.js `NullEngine` test harness (`tests/phase6_e2e_verification_harness.ts`) capable of headless logic testing. We recommend a 3-tier testing strategy combining headless unit/integration scripts, automated `tsc`/`vite` build checks, and Playwright browser automation for visual UI and WebGL rendering validation.

---

## 2. TypeScript Configuration & Build Infrastructure Analysis

### 2.1 Package Configuration (`package.json`)
- **Module Format**: `"type": "module"` (native ES Modules).
- **Core Dependencies**:
  - `@babylonjs/core`: `^9.0.0`
  - `@babylonjs/gui`: `^9.19.0`
  - `@babylonjs/loaders`: `^9.0.0`
  - `recast-navigation`: `^0.43.1`
- **Dev Dependencies**:
  - `typescript`: `^5.4.0`
  - `vite`: `^6.0.0`
  - `tsx`: `^4.23.5` (used for running Node.js TypeScript test scripts)
- **Scripts**:
  - `dev`: `vite`
  - `build`: `tsc && vite build`
  - `preview`: `vite preview`

### 2.2 TypeScript Compiler Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```
- **Key Analysis Points**:
  - `"moduleResolution": "bundler"`: Supports package exports and Vite module resolution mechanics.
  - `"noEmit": true`: `tsc` acts strictly as a type checker without producing `.js` output files. Vite handles final JS transpilation and bundling.
  - `"include": ["src"]`: Standard `tsc` invocation checks `src/`. Note that standalone test scripts in `tests/` are run via `tsx` and are not in `include`, preventing test-specific DOM mocks from polluting runtime types.

### 2.3 Vite Configuration (`vite.config.ts`)
```typescript
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["recast-navigation"],
  },
  assetsInclude: ["**/*.glb", "**/*.wasm"],
  server: {
    port: 5173,
    host: true,
  },
});
```
- **Crucial Setting**: `optimizeDeps: { exclude: ["recast-navigation"] }`. Recast Navigation relies on WebAssembly binaries and Emscripten glue code. Excluding it from Vite's `esbuild` pre-bundling prevents binary corruption and ensures `init()` can load `.wasm` files directly.
- `assetsInclude`: Ensures `.glb` models and `.wasm` files are bundled as static asset URLs.

### 2.4 Build Command Verification
- `pnpm exec tsc --noEmit` verifies clean compilation across all source files in `src/`.
- `pnpm run build` executes `tsc && vite build`, creating a production bundle in `dist/`.

---

## 3. NavMeshManager & Recast WASM Interaction Analysis

### 3.1 Architecture of `NavMeshManager.ts`
1. **WASM Initialization (`init`)**:
   - Executes `await init()` from `recast-navigation` wrapped in `Promise.race()` with a 3000ms timeout guard.
   - Gracefully handles timeout/failure by logging warnings and marking `isInitialized = false`.
2. **NavMesh Generation (`createNavMesh(groundMesh: Mesh)`)**:
   - Calls `extractWorldGeometry(groundMesh)` to extract transformed world-space positions (`Float32Array`) and triangle indices (`Uint32Array`).
   - Invokes `generateSoloNavMesh(positions, indices, config)` with:
     - `cs: 0.2`, `ch: 0.2` (cell size and cell height in world units)
     - `walkableHeight: 9` (1.8m voxel height)
     - `walkableRadius: 1` (0.2m voxel radius for agent radius)
     - `walkableClimb: 2` (0.4m step climb height)
     - `walkableSlopeAngle: 45` degrees.
   - Instantiates `NavMeshQuery` for A* path computation (`findPath(start, end)`).
3. **Debug Mesh Visualization (`createDebugMesh(scene)`)**:
   - Extracts navmesh polygon geometry using `getNavMeshPositionsAndIndices(this.navMesh)`.
   - Creates a wireframe `StandardMaterial` debug mesh elevated by `+0.05m Y` to prevent Z-fighting with floor tiles.

### 3.2 Impact of Town Hub (R2) & Tile Layout Changes (R1) on NavMesh
- **Source Geometry Dependency**: NavMesh generation does not parse raw grid data directly; it reads geometry from `builtDungeon.mergedFloors`.
- **Town Hub Integration**:
  - The Town Hub is a static starting zone. If player or NPC navigation (or click-to-move pathing) is required within the Town Hub, a NavMesh must be created for the Town Hub's floor mesh.
  - When transitioning from Town Hub to Dungeon Level (R2), `navMeshManager.dispose()` must be called to clean up old Recast WASM data before calling `createNavMesh()` on the new dungeon's `mergedFloors`.
- **Tile Selection / Layout (R1)**:
  - Changes to wall/corner selection logic in `TileMap.ts` do not affect floor geometry as long as `mergedFloors` box colliders continue to accurately represent all walkable floor cells (`TileType.Floor`, `TileType.Door`, `TileType.Stairs`).

---

## 4. Main Thread Performance & Yield Strategy Analysis

### 4.1 Existing Yield Strategy in `TileMap.ts`
In `TileMap.buildFromGrid()`:
```typescript
for (let gy = 0; gy < H; gy++) {
  for (let gx = 0; gx < W; gx++) {
    // Tile placement and collider box creation...
  }
  // Yield to browser every 10 rows
  if (gy % 10 === 0) {
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log(`[TileMap] Placed row ${gy}/${H}...`);
  }
}
```

### 4.2 Evaluation & Bottleneck Analysis
1. **Loop Yielding (`setTimeout(resolve, 0)`)**:
   - Yielding every 10 rows breaks execution into 4 distinct macrotasks for a 40x40 grid.
   - Keeps the browser main thread event loop responsive, allowing DOM updates (such as updating loading overlay text) and preventing "Long Task" warnings (>50ms frame freezes).
2. **Synchronous CPU Bottlenecks**:
   - `Mesh.MergeMeshes(floorColliders, true, true)`: Merging 1,000+ box meshes into a single floor collider mesh executes synchronously and takes ~20–40ms.
   - `generateSoloNavMesh()`: Recast WASM solo navmesh generation runs synchronously in WebAssembly and takes ~15–35ms.
3. **Recommended Optimizations**:
   - Retain yielding during grid iteration.
   - Insert explicit yield points (`await new Promise(r => setTimeout(r, 0))`) right before heavy synchronous tasks (e.g. before `Mesh.MergeMeshes` and before `navMeshManager.createNavMesh`). This ensures UI loading text changes render to screen immediately before CPU spikes.

---

## 5. Recommended E2E Test Harness & Verification Strategy

### 5.1 Analysis of Existing Test Infrastructure
The repository contains 20+ test scripts in `tests/`, utilizing Babylon's `NullEngine` and Node polyfills (`xhr_polyfill.ts` for asset loading, DOM mocks for `window`/`document`).
- Key Harness: `tests/phase6_e2e_verification_harness.ts`
- Environment check: `npx tsx tests/check_environment.ts` (verified working with Babylon.js v9 `NullEngine`).

### 5.2 Recommended 3-Tier Testing Architecture

```
+-------------------------------------------------------------------+
|                     3-TIER VERIFICATION HARNESS                    |
+-------------------------------------------------------------------+
| Tier 1: Headless Node.js Integration Tests (tsx + NullEngine)      |
|   - Tile selection & neighbor lookup matrix unit tests            |
|   - Town Hub -> Dungeon level transition state machine tests       |
+-------------------------------------------------------------------+
| Tier 2: Static Type & Build Checks (tsc + Vite)                   |
|   - pnpm exec tsc --noEmit                                        |
|   - pnpm run build                                                |
+-------------------------------------------------------------------+
| Tier 3: Browser E2E Automation (Playwright / Puppeteer)            |
|   - Real WebGL canvas rendering verification                      |
|   - Console error monitoring during Town Hub -> Dungeon transition |
|   - Visual tile connectivity & corner alignment spot-checks        |
+-------------------------------------------------------------------+
```

### 5.3 Concrete Test Cases for R1 & R2
1. **Tile Connectivity (R1)**:
   - **Test Script**: `tests/test_tile_connectivity.ts`
   - **Verification**: Construct a synthetic 5x5 grid with straight walls, inner corners, outer corners, doors, and detail floors. Verify that `TileMap` assigns correct model filenames and rotation angles (`0`, `PI/2`, `PI`, `3*PI/2`).
2. **Town Hub State Machine & Transition (R2)**:
   - **Test Script**: `tests/test_town_hub_transition.ts`
   - **Verification**:
     - Verify initial game state spawns player in static Town Hub.
     - Verify no enemies are spawned in Town Hub (`enemies.length === 0`).
     - Interact with Town Hub portal/altar -> trigger dungeon loading.
     - Verify player position moves to dungeon spawn point and enemies spawn in dungeon rooms.
3. **Build & Type Safety Check**:
   - `pnpm exec tsc --noEmit` and `pnpm run build`.

---

## 6. Conclusion & Summary Table

| Focus Area | Current State | Recommendations |
|---|---|---|
| **TypeScript / Build** | Vite 6 + TS 5.4, strict mode, `recast-navigation` excluded from optimizeDeps | Maintain `tsconfig.json` & `vite.config.ts`. Run `pnpm exec tsc --noEmit` and `pnpm run build` during CI/verification. |
| **NavMesh / Recast WASM** | `NavMeshManager` generates solo navmesh from `mergedFloors` | Re-create NavMesh when transitioning from Town Hub to Dungeon Level. Ensure Town Hub ground geometry is passed to NavMeshManager if Town Hub movement uses NavMesh. |
| **Main Thread Yields** | Yields every 10 rows (`await setTimeout(0)`) in `TileMap.ts` | Retain 10-row yield. Add explicit yield calls prior to `Mesh.MergeMeshes()` and `createNavMesh()`. |
| **E2E Test Strategy** | Existing `NullEngine` harnesses in `tests/` | Implement Tier 1 headless tsx unit tests for tile selection & Town Hub transition, coupled with Tier 2 build verification and Tier 3 browser checks. |
