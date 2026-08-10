# Handoff Report: Milestone 3 GameStateManager & Scene Lifecycle Architecture

## 1. Observation

Direct observations from examining the codebase:

1. **`src/index.ts` (lines 167–234)**:
   - Contains inline transition logic `transitionToDungeon` defined within `bootstrap()`:
     ```typescript
     const transitionToDungeon = async () => {
       if (inDungeon) return;
       inDungeon = true;
       hud.showPickupNotification("Entering Procedural Dungeon...", "#3B82F6");

       const generator = new Generator({ width: 40, height: 40 });
       const dungeonGrid = generator.generate();

       tileMap = new TileMap(scene);
       const builtDungeon = await tileMap.buildFromGrid(dungeonGrid);

       navMeshManager = new NavMeshManager();
       await navMeshManager.init(3000);
       if (builtDungeon.mergedFloors) {
         await navMeshManager.createNavMesh(builtDungeon.mergedFloors);
       }

       player.transformNode.position = builtDungeon.spawnPoint.clone();
       player.setNavMeshManager(navMeshManager);
       // ... enemy spawning ...
     };
     ```
   - Hides `#loadingOverlay` once during initial startup (lines 349–354), but does not re-invoke or display a loading overlay during mid-game level transitions.
   - `townHub.rootNode` remains enabled when `transitionToDungeon` runs; Town Hub colliders and meshes are not disabled or hidden when the player is in the Dungeon.

2. **`src/town/TownHub.ts` (lines 96, 216, 229, 252–259)**:
   - Creates a parent `TransformNode("townHubRoot", scene)`.
   - Parents floor instanced meshes, wall instanced meshes, `mergedFloors`, and `mergedWalls` to `rootNode`.
   - `dispose()` cleans up template roots and meshes, but no `setEnabled(enabled: boolean)` method exists to toggle visibility without disposing loaded GLBs.

3. **`src/entities/TownHubAltar.ts` (lines 30, 43, 54, 77–98)**:
   - Instantiates `mesh`, `ringMesh`, and `light` (PointLight).
   - Has `onInteract: Observable<void>` and `isPlayerInProximity(playerPosition: Vector3): boolean`.
   - Lacks a `setEnabled(enabled: boolean)` method to control mesh and light visibility during dungeon exploration.

4. **`index.html` (lines 24–74)**:
   - Pre-styled DOM loading curtain `<div id="loadingOverlay">` with `#loadingTitle`, `#loadingStatus`, and `#loadingError`, with CSS transition `opacity 0.4s ease`.

---

## 2. Logic Chain

1. **State Machine Necessity**:
   - Observation 1 shows `src/index.ts` relies on a local boolean `let inDungeon = false`.
   - This leads to potential race conditions, lacks transition locks (`TRANSITIONING`), and cannot handle two-way state switches (`DUNGEON` -> `TOWN_HUB` or level re-generation).
   - Therefore, a central `GameStateManager` with state enum `GameState { TOWN_HUB, DUNGEON, TRANSITIONING }` and `Observable<GameStateChangeEvent>` is required to govern transitions.

2. **Scene Lifecycle & Level Node Management**:
   - Observation 1 & 2 show that `townHubRoot` remains enabled during dungeon play.
   - Hiding Town Hub via `townHubRoot.setEnabled(false)` and `altar.setEnabled(false)` isolates the two environments in memory without re-fetching GLBs.
   - When transitioning to Dungeon, `GameStateManager` must clean up old enemies, old loot drops, old `dungeonRoot`, and old `navMeshManager` instances before instantiating the new level.

3. **Loading Curtain UI Overlay**:
   - Observation 1 & 4 show that `#loadingOverlay` is already styled in `index.html` but only used at initial page load.
   - Implementing `src/ui/LoadingCurtain.ts` wrapping `#loadingOverlay` provides an async overlay manager (`show()`, `updateStatus()`, `hide()`).
   - Yielding main thread execution (`await setTimeout(0)` / 50ms pause) before CPU-bound generation (`Generator`, `TileMap`, `NavMeshManager`) ensures the DOM curtain renders smoothly on screen without frame freezes.

---

## 3. Caveats

- **Audio Listener & Camera Rig**: The camera rig and spatial audio listener follow the `Player` transform node, which persists across scene transitions. No camera re-creation is required, only position updates.
- **Save State Persistence**: SaveManager auto-saves player inventory, stats, and talents. Transitioning levels does not reset player progression.
- **NavMesh Recycling**: Recast WASM navmesh instances should be disposed (`navMeshManager.dispose()`) when leaving or regenerating dungeons to avoid WASM memory leaks.

---

## 4. Conclusion

Milestone 3 requires introducing:
1. `src/ui/LoadingCurtain.ts` — Wrapper for `#loadingOverlay` DOM elements.
2. `src/core/GameStateManager.ts` — Orchestrator for `TOWN_HUB` <-> `DUNGEON` state machine, scene visibility, entity lifecycle, and async transition sequences.
3. Minor contract additions (`setEnabled(enabled: boolean)`) to `TownHub.ts` and `TownHubAltar.ts`.
4. Refactoring `src/index.ts` to delegate scene lifecycle management to `GameStateManager`.

Detailed analysis and exact code designs are available in `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_m3_1\analysis.md`.

---

## 5. Verification Method

1. **TypeScript Typecheck**:
   - Command: `pnpm exec tsc --noEmit`
   - Invalidation Condition: Any type errors, missing properties, or invalid method calls.
2. **Vite Production Build**:
   - Command: `pnpm run build`
   - Invalidation Condition: Build failure or bundle errors.
3. **Automated & Empirical Suite**:
   - Command: `pnpm test` (or running existing harness scripts in `tests/`).
   - Verify state transitions from `TOWN_HUB` -> `DUNGEON` -> `TOWN_HUB` cleanly update `GameStateManager.currentState`.
