# Handoff Report: Level Transition & Dungeon Trigger Integration

**Author:** Explorer 3 (Milestone 3 Task 3)  
**Working Directory:** `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_m3_3`  
**Date:** 2026-08-06  

---

## 1. Observation

Direct observations from codebase inspection across `src/`:

1. **`src/dungeon/Generator.ts` (lines 95-187):**
   - `Generator.generate()` builds a 40x40 BSP grid (`DungeonGrid`).
   - Returns `spawnPosition` (`{ x: rooms[0].centerX, y: rooms[0].centerY }`) in `rooms[0]`, `stairsPosition` in farthest room, and `rooms: Room[]` where `rooms[1..N-1]` are additional room bounds.
2. **`src/dungeon/TileMap.ts` (lines 34-290):**
   - `TileMap.preloadAssets()` preloads 10 GLB templates (`template-floor.glb`, `template-wall.glb`, `template-wall-corner.glb`, `gate-door.glb`, `stairs.glb`, etc.).
   - `TileMap.buildFromGrid(grid: DungeonGrid)` converts grid coordinates via `worldX = gx * 2.0 + 1.0`, `worldZ = gy * 2.0 + 1.0`, instantiates meshes via `sourceMesh.createInstance()`, yields every 10 rows (`await new Promise(r => setTimeout(r, 0))`), and builds merged colliders `mergedFloors` and `mergedWalls`.
   - Returns `BuiltDungeon`: `{ rootNode, mergedFloors, mergedWalls, doors, spawnPoint, stairsPoint }`.
3. **`src/dungeon/NavMeshManager.ts` (lines 20-112):**
   - `NavMeshManager.init(3000)` initializes `recast-navigation` WASM module with a 3s race timeout.
   - `NavMeshManager.createNavMesh(groundMesh: Mesh)` builds a solo NavMesh from `mergedFloors` world geometry.
   - `NavMeshManager.findPath(start: Vector3, end: Vector3)` returns path vector array for entity navigation.
4. **`src/camera/CameraRig.ts` (lines 63-67, 70-105):**
   - `CameraRig.attachToTarget(target: TransformNode)` snaps camera focus directly to `target.position` and updates transforms with zero shake.
   - Smooth frame updates use exponential lerping (`followRate: 10.0`).
5. **`src/town/TownHub.ts` (lines 90-260) & `src/entities/TownHubAltar.ts` (lines 11-100):**
   - `TownHub.build()` constructs a static 10x10 plaza (`builtTown: BuiltTownHub`) and places `TownHubAltar`.
   - `TownHubAltar.onInteract` dispatches an event when interacted with via `[E]`/`[F]` or click.
6. **`src/index.ts` (lines 167-226):**
   - Currently uses a prototype inline closure `transitionToDungeon` inside `bootstrap()`.
   - Leaves Town Hub root node (`builtTown.rootNode`) and colliders active in the scene during transition (scene pollution).
   - Lacks a central `GameStateManager` and formal loading curtain UI sequence.

---

## 2. Logic Chain

1. **Premise 1:** In Milestone 2, the game boots into `TownHub` with zero enemies. Interacting with `TownHubAltar` must trigger the transition to the procedural dungeon level (Milestone 3 requirement).
2. **Premise 2:** `TileMap.buildFromGrid()` and `NavMeshManager.createNavMesh()` build 3D instanced meshes, merged floor/wall colliders, and Recast WASM navmeshes asynchronously.
3. **Deduction 1:** To prevent invisible collision conflicts and memory leaks, transitioning to the dungeon requires explicit teardown/disposal of the Town Hub root node (`builtTown.rootNode.dispose()`) and altar (`townHubAltar.dispose()`).
4. **Deduction 2:** Moving the player from Town Hub `(10, 0, 6)` to `builtDungeon.spawnPoint` requires clearing old path state (`player.cancelNavPath()`) and instantly snapping camera focus via `cameraRig.attachToTarget(player.transformNode)` to avoid camera panning across void space.
5. **Deduction 3:** To ensure main thread responsiveness during asset preloading, tile instancing, and navmesh building, a dedicated state manager (`GameStateManager.ts`) must drive a 10-step transition sequence while managing a DOM-based loading curtain (`#loadingOverlay`).

---

## 3. Caveats

- **No Existing `GameStateManager.ts`:** `src/core/GameStateManager.ts` is specified in `PROJECT.md` contract but has not been created yet in the codebase. Implementers must create this file.
- **Recast WASM Timeout:** `NavMeshManager.init()` includes a 3000ms timeout fallback. If WASM fails to load, `findPath()` falls back to direct linear vector movement.
- **Shadow Generator Cleanup:** When disposing town or dungeon meshes, ensure removed meshes are unregistered from `shadowGenerator.removeShadowCaster()`.
- **GLB Model Paths:** Enemy model loading (`assets/characters/enemies/character-orc.glb`) strips leading `"public/"` prefixes to work cleanly with Vite public directory paths.

---

## 4. Conclusion

The transition sequence for Milestone 3 should be driven by a newly created `GameStateManager.ts` class.

**Recommended 10-Step Transition Workflow:**
1. Show loading curtain DOM overlay (`#loadingOverlay`).
2. Disable player input and clear active navigation path (`player.cancelNavPath()`).
3. Dispose Town Hub root node (`builtTown.rootNode.dispose()`) and `townHubAltar.dispose()`.
4. Yield to browser main thread (`await new Promise(r => setTimeout(r, 0))`).
5. Generate 40x40 BSP grid via `Generator.generate()`.
6. Construct 3D instanced tilemap via `TileMap.buildFromGrid(grid)`.
7. Rebuild Recast WASM NavMesh via `NavMeshManager.createNavMesh(builtDungeon.mergedFloors)`.
8. Position player at `builtDungeon.spawnPoint` and snap camera via `cameraRig.attachToTarget(player.transformNode)`.
9. Spawn Orc enemies in rooms `1..N-1` with AI state machine, navmesh reference, loot drops, and shadow caster registration.
10. Hide loading curtain DOM overlay and enable player input.

---

## 5. Verification Method

### Automated Checks
- `pnpm exec tsc --noEmit` — Confirm 0 TypeScript compilation errors.
- `pnpm run build` — Confirm Vite production build succeeds.

### Manual Verification
1. Execute `pnpm run dev` and open `http://localhost:5173/`.
2. Boot into Town Hub, walk to `TownHubAltar` at `(10, 0, 16)`.
3. Press `[E]` to interact.
4. Observe loading curtain overlay displayed during load sequence.
5. Verify Town Hub is disposed, 40x40 dungeon is built, player is at spawn point, camera is snapped, and enemies are active in rooms 1..N.
