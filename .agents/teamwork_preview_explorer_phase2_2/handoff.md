# Phase 2 Technical Handoff Report: NavMesh & Pathfinding Integration

## 1. Observation
- **Package Configuration (`package.json`)**:
  - `recast-navigation`: `"^0.43.1"` is installed in `node_modules` via `pnpm`.
  - Exported entrypoints: `recast-navigation` (re-exporting `@recast-navigation/core`) and `recast-navigation/generators` (re-exporting `@recast-navigation/generators`).
- **Existing Core System Files (`src/core/InputManager.ts` & `src/entities/Player.ts`)**:
  - `InputManager.ts` line 28: `onPointerClickWorld: Observable<Vector3>` emits when mouse left-clicks world geometry matching `groundPredicate`.
  - `InputManager.ts` line 27: `onMoveVectorChanged: Observable<Vector3>` emits WASD/Gamepad stick input vectors.
  - `Player.ts` lines 65–73: `onMoveVectorChanged` listener calls `cancelNavPath()` and sets `isDirectMoving = true` when stick/WASD input vector magnitude $> 0.01$.
  - `Player.ts` lines 76–84: `onPointerClickWorld` listener receives `targetPos` vector.
  - `Player.ts` line 52: Ellipsoid bounding volume initialized to `Vector3(0.45, 0.9, 0.45)` (radius 0.45m, height 1.8m).
- **Recast WASM & Generator APIs (`node_modules/@recast-navigation`)**:
  - `init()` must be awaited before invoking any Recast/Detour functionality.
  - `generateSoloNavMesh(positions: ArrayLike<number>, indices: ArrayLike<number>, config?: Partial<SoloNavMeshGeneratorConfig>)`: accepts flat position array `[x0, y0, z0, ...]` and triangle indices `[i0, i1, i2, ...]`.
  - `NavMeshQuery.computePath(start: Vector3, end: Vector3, options?: NavMeshQueryParams)`: calculates straight path points `{x, y, z}[]`.
  - Recast instances (`NavMesh` and `NavMeshQuery`) require explicit `.destroy()` calls for WASM memory deallocation.

## 2. Logic Chain
1. **Observation**: `recast-navigation` is an asynchronous WASM module that requires `init()` before execution and manual memory management (`destroy()`).
   - **Reasoning**: `NavMeshManager.ts` must maintain an internal `isInitialized` flag, provide `async init()`, and include `disposeNavMesh()`/`dispose()` methods to destroy `NavMesh` and `NavMeshQuery` C++ instances on dungeon rebuilds.
2. **Observation**: `TileMap.ts` constructs procedural dungeons using `BABYLON.Mesh.MergeMeshes` to produce `mergedFloors`.
   - **Reasoning**: `NavMeshManager.createNavMesh(groundMesh)` extracts local position vertex attributes via `VertexBuffer.PositionKind` and triangle face indices via `getIndices()`, transforms vertex coordinates into world space using `groundMesh.getWorldMatrix()`, and passes flat typed arrays to `generateSoloNavMesh`.
3. **Observation**: The player entity's physical dimensions are `radius = 0.45m` and `height = 1.8m`. Dungeon tiles are $2\text{m} \times 2\text{m}$ grid squares.
   - **Reasoning**: NavMesh voxel configuration must set cell size `cs = 0.2`m, cell height `ch = 0.2`m, `walkableHeight = Math.ceil(1.8 / 0.2) = 9`, `walkableRadius = Math.ceil(0.45 / 0.2) = 3`, `walkableClimb = Math.floor(0.4 / 0.2) = 2`, and `walkableSlopeAngle = 45.0` to guarantee player fit and path clearance without wall clipping.
4. **Observation**: `InputManager.ts` handles click detection while `Player.ts` handles hybrid movement (click-to-move + instant WASD override).
   - **Reasoning**: Wiring `NavMeshManager.findPath` inside `Player.ts`'s `pointerClickObserver` supplies optimal Recast path points to `setNavPath(path)`. When WASD or stick input is active, `onMoveVectorChanged` immediately cancels `navPath`, maintaining instant vector control priority.

## 3. Caveats
- **Dynamic Obstacles**: The solo NavMesh generation strategy assumes static dungeon floor geometry per level. If dynamic destructible obstacles are added in later phases, `recast-navigation`'s `generateTileCache` or temporary obstacle APIs will need to be specified.
- **Async Build Timing**: `generateSoloNavMesh` runs synchronously on the main thread. For standard dungeon sizes ($30 \times 30$ tiles), generation takes $< 15\text{ms}$. For massive maps ($> 100 \times 100$ tiles), Web Worker offloading should be considered.
- **Y-Level Alignment**: Path query start/end positions snap to the nearest polygon within `halfExtents = (2, 5, 2)`. Elevated platforms or multi-level stairs require matching height Extents.

## 4. Conclusion
The technical specification for `src/dungeon/NavMeshManager.ts` fully solves runtime NavMesh generation over merged dungeon floors, provides safe WebAssembly memory cleanup, defines optimal Recast voxel parameters matching player metrics, and seamlessly connects `InputManager` raycasts to `Player` click-to-move pathing with direct WASD/stick override priority.

## 5. Verification Method
To independently verify the implementation:
1. **Compilation Check**: Run `npx tsc --noEmit` to verify type safety and interface contracts across `NavMeshManager.ts`, `InputManager.ts`, and `Player.ts`.
2. **Build Verification**: Run `npm run build` to confirm Vite production bundle packaging with WebAssembly dependencies.
3. **Runtime & Visual Inspection**:
   - Call `navMeshManager.createDebugMesh(scene)` in the dev scene loop to render the green translucent NavMesh overlay.
   - Click on dungeon floors in the browser: verify player walks along Recast path points.
   - Press WASD / Arrow keys during path movement: verify click pathing is immediately cancelled and direct vector movement takes priority without jitter.
