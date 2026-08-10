# Phase 2 Code Changes

## Summary of Changes

### 1. `src/dungeon/Generator.ts` (New File)
- Implemented `SeedableRNG` using the Mulberry32 PRNG algorithm to ensure deterministic generation based on seed.
- Implemented `Generator` class for Grid BSP room/corridor generation on a $40 \times 40$ cell grid ($2\text{m} \times 2\text{m}$ per tile).
- Recursively subdivides space into non-overlapping rooms, connects room centers with 2-tile wide L-corridors.
- Placed door cells (`TileType.Door`) at room/corridor boundary transitions.
- Placed spawn position at start stairs (`rooms[0]`) and exit stairs (`TileType.Stairs`) at farthest room center.
- Added BFS flood-fill reachability validation ensuring player start can reach exit stairs and all rooms.
- Placed wall boundary tiles (`TileType.Wall`) around floor cells with neighbor-based rotational orientation.

### 2. `src/dungeon/TileMap.ts` (New File)
- Implemented asset preloading of Kenney 3D Dungeon & Cave GLB models from `public/assets/dungeon/` and `public/assets/cave/`.
- Positioned tiles accurately at `(gx * 2.0 + 1.0, 0.0, gz * 2.0 + 1.0)`.
- Instantiated sub-meshes and baked world transformations into vertex positions via `bakeCurrentTransformIntoVertices()`.
- Merged floor meshes into a single draw-call `mergedFloors` mesh using `BABYLON.Mesh.MergeMeshes(floorMeshes, true, true, undefined, false, false)`.
- Merged wall meshes into `mergedWalls` mesh using `BABYLON.Mesh.MergeMeshes(wallMeshes, true, true, undefined, false, false)` and set `mergedWalls.checkCollisions = true`.

### 3. `src/dungeon/NavMeshManager.ts` (New File)
- Implemented async WASM initialization (`init()`).
- Extracted world vertices and indices from `mergedFloors` mesh.
- Built Recast solo NavMesh using `generateSoloNavMesh` with tuned voxel parameters for 2m grid tiles and player ellipsoid.
- Implemented `findPath(start: Vector3, end: Vector3): Vector3[]` query interface.
- Implemented `createDebugMesh(scene)` method rendering green translucent wireframe overlay mesh of generated NavMesh.

### 4. `src/entities/Player.ts` (Updated File)
- Added `setNavMeshManager(navMeshManager: NavMeshManager)` method.
- Updated click-to-move pointer click observer to perform path queries against `NavMeshManager` when available.

### 5. `src/index.ts` (Updated File)
- Updated bootstrapper to instantiate `GameEngine`, `Generator`, `TileMap`, `NavMeshManager`, `CameraRig`, `InputManager`, and `Player`.
- Generated 40x40 procedural dungeon, merged tile meshes, initialized Recast WASM, and generated solo NavMesh.
- Placed player position at start stairs (`builtDungeon.spawnPoint`).
- Wired `InputManager.onPointerClickWorld` -> `NavMeshManager.findPath` -> `Player.setNavPath`.
- Registered full resource cleanup on `beforeunload`.

## Verification Results
- `pnpm exec tsc --noEmit`: Exit Code 0 (0 errors)
- `pnpm run build`: Exit Code 0 (Production build succeeded, dist bundle generated)
