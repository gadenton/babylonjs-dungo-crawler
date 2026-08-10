# Handoff Report: Level Transition & Town Hub Lifecycle (Milestone 3)

**Agent:** Explorer 2 (Milestone 3)  
**Working Directory:** `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_m3_2`  
**Date:** 2026-08-06  

---

## 1. Observation

### Key Code Locations & Findings:

- **`src/index.ts` (Lines 87-98 & 167-234)**:
  - Line 87: `const townHub = new TownHub(scene);`
  - Line 89: `const builtTown = await townHub.build();`
  - Line 95: `player.transformNode.position = builtTown.spawnPoint.clone();`
  - Line 98: `const enemies: Enemy[] = [];` (Zero enemies spawned in Town Hub state).
  - Line 167-226: `const transitionToDungeon = async () => { ... }` generates BSP dungeon grid, builds `TileMap`, builds Recast WASM `NavMeshManager`, moves player, and populates `enemies` array.
  - **Deficiency**: `transitionToDungeon()` does NOT disable or hide `builtTown.rootNode`, `builtTown.mergedFloors`, `builtTown.mergedWalls`, or `builtTown.altar`. They remain visible and active in the scene, causing mesh overlap, collider conflicts, and extra render calls.

- **`src/town/TownHub.ts` (Lines 96, 119, 212, 229, 242-249)**:
  - Line 96: `const rootNode = new TransformNode("townHubRoot", this.scene);`
  - Lines 119, 219, 230: All instantiated tile meshes, `mergedFloors`, and `mergedWalls` are parented to `rootNode`.
  - Line 242-249: Returns `rootNode`, `mergedFloors`, `mergedWalls`, `spawnPoint`, `altarPosition`, `altar`.
  - **Observation**: Calling `rootNode.setEnabled(false)` recursively disables all 100 floor instances, wall instances, gate, stairs, `mergedFloors`, and `mergedWalls`, removing them from scene rendering, physics collision (`checkCollisions`), and picking (`isPickable`).

- **`src/entities/TownHubAltar.ts` (Lines 30, 43, 54, 67-75, 77-98)**:
  - Lines 30, 43, 54: Creates `mesh` (stone cylinder), `ringMesh` (glow torus), and `light` (`PointLight`).
  - Lines 67-70: `isPlayerInProximity(playerPosition)` checks `Vector3.Distance(this.position, playerPosition) <= 3.0`.
  - Line 73-75: `interact()` notifies `onInteract` observable.
  - Lines 77-98: `dispose()` cleans up materials, lights, observers, and meshes.
  - **Observation**: `mesh`, `ringMesh`, and `light` are created under `scene` directly (not parented to `townHubRoot`). They require explicit disabling via `setEnabled(enabled: boolean)` when transitioning out of Town Hub.

- **DOM Loading Overlay (`index.html`, Lines 24-66)**:
  - `index.html` contains `#loadingOverlay` and `#loadingStatus` DOM elements styled with CSS transitions, suitable for reuse during level loading curtain transitions.

---

## 2. Logic Chain

1. **Observation**: `src/index.ts` bootstraps the game into `TownHub` with `const enemies: Enemy[] = []`, placing player at `builtTown.spawnPoint` (`(10, 0, 6)`).
   - **Deduction**: Initial bootstrap into `TownHub` with zero enemies and controllable player is already established in code, but lacks state lifecycle management and clean encapsulation.

2. **Observation**: `src/town/TownHub.ts` parents all 3D environment instances and merged colliders to `rootNode` (`TransformNode("townHubRoot")`).
   - **Deduction**: Setting `rootNode.setEnabled(false)` automatically disables all visual meshes, `mergedFloors`, and `mergedWalls` in Babylon.js, stopping rendering, collision checks, and picking raycasts in a single operation.

3. **Observation**: `TownHubAltar` creates `mesh`, `ringMesh`, and `light` directly on `Scene` without parenting to `townHubRoot`.
   - **Deduction**: Disabling `townHubRoot` alone will leave the altar cylinder, glow ring, and point light active. Adding a `public setEnabled(enabled: boolean)` method to `TownHubAltar` allows `GameStateManager` to toggle altar visibility and light along with `TownHub`.

4. **Observation**: `transitionToDungeon()` in `src/index.ts` is currently an unencapsulated inline callback without a loading curtain or state tracking.
   - **Deduction**: Refactoring transition handling into a central `GameStateManager` (`src/core/GameStateManager.ts`) with `enum GameState { TOWN_HUB, DUNGEON, TRANSITIONING }` and a loading curtain phase ensures clean scene transitions, smooth UI feedback, and fault-tolerant environment lifecycle management.

---

## 3. Caveats

- **Town Hub Re-entry**: Current requirements focus on `TOWN_HUB` -> `DUNGEON` transition. If future requirements add returning from dungeon to town hub, `setEnabled(true)` on `rootNode` and `altar` provides instant zero-allocation restoration of the Town Hub environment.
- **Audio Listener & Camera**: `CameraRig` and `AudioManager` remain attached to `Player` transform node across state transitions, which is correct and requires no re-attachment.

---

## 4. Conclusion

The prototype can be cleanly refactored so `src/index.ts` bootstraps in `TownHub` with zero enemies and a controllable player, with `GameStateManager` orchestrating level transitions. `TownHub` environment lifecycle is managed by calling `rootNode.setEnabled(false)` on `townHubRoot` and `altar.setEnabled(false)` on `TownHubAltar`, safely disabling all Town Hub meshes, colliders, and lights during transition to `DUNGEON`.

---

## 5. Verification Method

To independently verify the analysis and proposed refactoring strategy:

### 1. Automated Verification
- Run `pnpm exec tsc --noEmit` to verify zero TypeScript errors.
- Run `pnpm run build` to verify Vite bundle compilation.

### 2. Manual Inspection & Testing
- Open `src/index.ts`, `src/town/TownHub.ts`, and `src/entities/TownHubAltar.ts`.
- Launch `pnpm run dev`, open browser (`http://localhost:5173/`):
  1. Confirm game starts in `TownHub` plaza with zero enemies.
  2. Approach altar and observe prompt: `"Press [E] or (A) to Access Altar"`.
  3. Press `[E]` / `[F]` or click altar to trigger transition.
  4. Inspect scene graph to confirm `townHubRoot` and `townHubAltar` nodes are disabled (`isEnabled() === false`).
  5. Confirm player spawns in procedural dungeon with enemies present and Recast WASM navmesh pathfinding active.
