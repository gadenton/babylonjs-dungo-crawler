# Specification Mining Report: M1 E2E Test Infra & Harness

## Overview & Methodology
This report provides a comprehensive specification analysis for **Milestone M1: E2E Test Infra & Harness**, supporting the test suites for Tiers 1 through 4 of the Babylon.js Dungo Crawler ARPG.

The authoritative specifications were mined from:
- `PROJECT.md` (Project Architecture & Feature Inventory)
- `.agents/ORIGINAL_REQUEST.md` (Original Technical Requirements & Constraints)
- `.agents/teamwork_preview_sub_orch_e2e/SCOPE.md` (E2E Test Scope & Feature Definitions)
- Source files: `src/dungeon/TileMap.ts`, `src/dungeon/Generator.ts`, `src/entities/TownHubAltar.ts`, `src/entities/Player.ts`, `src/dungeon/NavMeshManager.ts`, `src/index.ts`, `tests/phase6_e2e_verification_harness.ts`.

---

## 1. Full Enumeration of Test Requirements Across Tiers 1–4

### Tier 1: Basic Feature Coverage Tests (`tests/tier1-feature-coverage.test.ts`)
- **T1-F1: TileMap Asset Loading & Instancing**: Verify preloading GLBs and creating GPU instanced meshes (`createInstance()`) within a Babylon.js NullEngine / headless environment.
- **T1-F2: 8-Neighbor Connectivity Classification**: Verify the 8-neighbor bitmask lookup algorithm correctly classifies cell topologies (straight wall, inner corner, outer corner, end cap, detail variants) and determines Y-rotations (0, $\pi/2$, $\pi$, $3\pi/2$).
- **T1-F3: Static Town Hub Creation**: Verify `TownHub` creates a static 10x10 safe courtyard plaza (20x20 world units) with zero enemies, merged floor colliders, and wall colliders.
- **T1-F4: Player Spawning & Metadata**: Verify player creation, initial transform placement at town hub spawn point, correct tag/metadata initialization, and health/stats state.
- **T1-F5: Portal Proximity Interaction**: Verify `TownHubAltar` proximity checking logic (`dist <= 3.0` units) and prompt activation states.

### Tier 2: Boundary & Corner Condition Tests (`tests/tier2-boundary-corner.test.ts`)
- **T2-F1: Grid Edge Bitmasking**: Verify 8-neighbor bitmask calculations at grid boundaries (0,0), (39,39), (0,39), (39,0) and edge cells (x=0, x=39, y=0, y=39) treat out-of-bounds cells safely as wall/empty without throwing index out-of-bounds errors.
- **T2-F2: Invalid Transition Inputs**: Verify state transition requests fail gracefully or no-op when player is outside interaction radius (`dist > 3.0`) or when transition is triggered with uninitialized state.
- **T2-F3: Rapid Interaction Triggers & Re-entrancy**: Stress test rapid `[E]`/`[F]` interaction spam (e.g., 100 triggers in 10ms) to ensure state transition is strictly idempotent, transition happens exactly once, and no race conditions occur.

### Tier 3: Cross-Feature Interaction Chain Tests (`tests/tier3-cross-feature.test.ts`)
- **T3-F1: Town Hub to Dungeon Transition & NavMesh Rebuild**: Verify the multi-step interaction pipeline: Town Hub player movement $\rightarrow$ Altar proximity trigger $\rightarrow$ `GameStateManager.transitionToDungeon()` $\rightarrow$ Town Hub disposal/hiding $\rightarrow$ 40x40 BSP grid generation $\rightarrow$ `TileMap` GLB instantiation $\rightarrow$ Recast NavMesh rebuild over `mergedFloors`.

### Tier 4: Gameplay Loop & Full Integration Tests (`tests/tier4-gameplay-loop.test.ts`)
- **T4-F1: Full Gameplay Loop**: Verify town start $\rightarrow$ altar interaction $\rightarrow$ procedural dungeon loading $\rightarrow$ enemy spawning in rooms 1..N $\rightarrow$ clean scene hierarchy $\rightarrow$ zero lingering Town Hub nodes.
- **T4-F2: Zero TypeScript Compilation Errors**: Verify `pnpm exec tsc --noEmit` returns exit code 0 with zero errors.

---

## 2. Tier 1 Detailed State & Assertion Specifications

### T1-F1: TileMap Asset Loading & Instancing
- **Target Functions**: `TileMap.preloadAssets()`, `TileMap.buildFromGrid(grid)`
- **Assertions**:
  1. `preloadAssets()` resolves without throwing error in NullEngine (with mock/polyfilled XHR loader).
  2. Returned `BuiltDungeon` structure must possess non-null fields:
     - `builtDungeon.rootNode` is instance of `TransformNode`, named `"dungeonRoot"`, parented to scene.
     - `builtDungeon.mergedFloors` is instance of `Mesh`, `name === "mergedFloors"`, `checkCollisions === true`, `isPickable === true`, `isVisible === false`.
     - `builtDungeon.mergedWalls` is instance of `Mesh`, `name === "mergedWalls"`, `checkCollisions === true`, `isPickable === false`, `isVisible === false`.
  3. Source template meshes in `templateMeshes` map have `isVisible === false` and `isEnabled() === true`.
  4. Total `InstancedMesh` instances parented to `dungeonRoot` equal total active grid cell count (floors + walls + doors + stairs).

### T1-F2: 8-Neighbor Connectivity Classification
- **Target Function**: `TileMap.classifyCellTopology(grid, gx, gy)` or bitmask logic
- **Bitmask Definition**: 8-neighbor bitmask evaluating N, NE, E, SE, S, SW, W, NW.
- **Assertions**:
  1. **Straight Wall**: Cell with Floor to South (or North) and Wall to East/West $\rightarrow$ resolves to `template-wall.glb` with Y-rotation $0$ or $\pi$.
  2. **Inner Corner**: Concave corner where two wall edges meet at $90^\circ$ $\rightarrow$ resolves to `template-wall-corner.glb` with correct quadrant Y-rotation.
  3. **Outer Corner**: Convex corner facing into room interior $\rightarrow$ resolves to `template-wall-corner.glb` or `template-corner.glb`.
  4. **End Cap**: Wall cell touching floors on 3 sides $\rightarrow$ resolves to end-cap/half-wall model.
  5. **Floor Variety**: Seeded hash `(gx * 31 + gy * 17 + seed) % 100 < 15` selects `template-floor-detail.glb`; remaining 85% select `template-floor.glb`.

### T1-F3: Static Town Hub Creation
- **Target Class/Method**: `TownHub.build(scene)`
- **Assertions**:
  1. Creates root node `"townHubRoot"` (TransformNode).
  2. Creates exactly 100 floor tiles arranged in 10x10 grid (world coords X: [0, 20], Z: [0, 20]).
  3. `mergedFloors` generated for 10x10 plaza with `checkCollisions === true` and `isPickable === true`.
  4. Perimeter wall colliders generated surrounding plaza.
  5. `spawnPoint` is `Vector3(10.0, 0.0, 10.0)` (center of plaza).
  6. Enemy count in Town Hub scene equals 0 (`enemies.length === 0`).

### T1-F4: Player Spawning & Metadata
- **Target Class**: `Player` (`src/entities/Player.ts`)
- **Assertions**:
  1. `player.transformNode` exists and `player.position` equals `spawnPoint`.
  2. `player.isAlive === true`.
  3. `player.health.currentHp === player.health.maxHp`.
  4. `player.transformNode.name === "player"` or has metadata tag `entityType: "player"`.

### T1-F5: Portal Proximity Interaction
- **Target Class**: `TownHubAltar` (`src/entities/TownHubAltar.ts`)
- **Assertions**:
  1. `altar.position` is instantiated at expected world position (e.g. `Vector3(13, 0, 13)`).
  2. When player position is `Vector3(13, 0, 13)` (dist 0.0): `altar.isPlayerInProximity(player.position) === true`.
  3. When player position is `Vector3(15, 0, 13)` (dist 2.0 <= 3.0): `altar.isPlayerInProximity(player.position) === true`.
  4. When player position is `Vector3(17, 0, 13)` (dist 4.0 > 3.0): `altar.isPlayerInProximity(player.position) === false`.

---

## 3. Tier 2 Edge Cases & Boundary Specifications

### T2-F1: Grid Edge Bitmasking
- **Boundary Conditions**:
  - Grid corners: `(0, 0)`, `(39, 0)`, `(0, 39)`, `(39, 39)` for 40x40 grid.
  - Grid edges: `gx = 0`, `gx = 39`, `gy = 0`, `gy = 39`.
- **Expected Behavior**:
  - Grid neighbor lookup must safely treat indices $< 0$ or $\ge W / H$ as `TileType.Wall` (or `TileType.Empty`), returning a valid bitmask without throwing `TypeError: Cannot read properties of undefined`.
  - Bitmask must correctly select perimeter wall pieces facing inwards towards the 40x40 grid interior.

### T2-F2: Invalid Transition Inputs
- **Boundary Conditions**:
  - Player triggers transition while `isPlayerInProximity()` returns `false` (dist > 3.0).
  - Attempting transition when `GameStateManager` is uninitialized or null.
- **Expected Behavior**:
  - `transitionToDungeon()` is ignored or throws explicit error; state remains `TOWN_HUB`.
  - Scene hierarchy remains intact, zero side effects on current level.

### T2-F3: Rapid Interaction Triggers & Re-entrancy
- **Boundary Conditions**:
  - Simulating 100 rapid `[E]` or `[F]` keypress events within 10ms while in proximity.
- **Expected Behavior**:
  - State machine sets state flag `isTransitioning = true` immediately on first invocation.
  - Subsequent 99 invocations abort immediately without spawning duplicate async transition promises.
  - Town Hub is disposed exactly once, dungeon is generated exactly once, and player spawns once.

---

## 4. Tier 3 Interaction Chain Assertion Specifications

### Sequential Pipeline Verification (Town Hub $\rightarrow$ Portal $\rightarrow$ Dungeon $\rightarrow$ NavMesh)
1. **Initial State (Town Hub)**:
   - `GameStateManager.currentState === GameState.TOWN_HUB`.
   - `scene.getNodeByName("townHubRoot")` is present and active.
   - Player position equals `TownHub` spawn position (`Vector3(10, 0, 10)`).
   - Enemy count in scene $= 0$.
2. **Player Movement to Portal**:
   - Set player target position to `altar.position` (`Vector3(13, 0, 13)`).
   - Advance frame updates (`player.update(deltaTime)`).
   - Verify `player.position` reaches `Vector3(13, 0, 13)`.
   - `altar.isPlayerInProximity(player.position)` transitions from `false` to `true`.
3. **Portal Activation & Scene Transition**:
   - Fire interaction key `[E]`.
   - `GameStateManager.transitionToDungeon()` starts.
   - `townHubRoot` node is disposed (`townHubRoot.isDisposed() === true`).
   - BSP generator builds `DungeonGrid` (40x40).
   - `TileMap.buildFromGrid(grid)` completes and returns `BuiltDungeon`.
   - `NavMeshManager.createNavMesh(mergedFloors)` rebuilds Recast NavMesh for `mergedFloors`.
4. **Dungeon State Assertions**:
   - `GameStateManager.currentState === GameState.DUNGEON`.
   - `scene.getNodeByName("dungeonRoot")` is present and active.
   - Player position updated to `dungeonGrid.spawnPosition` in world units (`gx*2+1`, `0`, `gy*2+1`).
   - Enemies spawned in rooms 1..N (`enemies.length > 0`).
   - NavMesh query from player spawn position to `stairsPosition` returns valid path array with length $> 0$.

---

## 5. Tier 4 End-to-End Integration Assertion Specifications

### T4-F1: End-to-End Gameplay Loop & Hierarchy Audit
- **Assertions**:
  - Complete lifecycle execution from bootstrap to town start, altar interaction, dungeon generation, enemy spawning, and pathfinding query without throwing any exceptions.
  - **Scene Hierarchy Audit**:
    - Disposed nodes count equals exact count of Town Hub nodes.
    - Zero orphaned transform nodes or meshes remain attached to `scene.rootNodes` from Town Hub.
    - `dungeonRoot` contains `mergedFloors`, `mergedWalls`, and instanced meshes.
  - **Observer Audit**:
    - All temporary observers registered during Town Hub phase are unregistered upon transition to Dungeon.

### T4-F2: Typecheck & Build Integrity
- **Assertions**:
  - `pnpm exec tsc --noEmit` completes with exit code 0 and 0 errors.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | TileMap | Asset Preloading & Instancing | Preloads Kenney GLB tiles and creates InstancedMeshes | Array of GLB paths | `BuiltDungeon` with `rootNode`, `mergedFloors`, `mergedWalls` | Throws on GLB load timeout (>5000ms) | `TileMap.ts` |
| 2 | TileMap | 8-Neighbor Bitmask Classification | Evaluates cell neighbor topology to select exact GLB model & rotation | 3x3 `CellMetadata` grid around cell | Selected GLB model path & Y-rotation | Fallbacks to straight wall if topology unknown | `TileMap.ts` & `PROJECT.md` |
| 3 | TileMap | Main Thread Yielding | Yields execution every 10 rows (`await setTimeout(0)`) | `gy % 10 === 0` | Resumes after microtask | Prevents long-task UI freeze | `TileMap.ts:220` |
| 4 | TownHub | Static Plaza Construction | Builds static 10x10 courtyard plaza with colliders | Babylon `Scene` | `townHubRoot`, `mergedFloors`, `mergedWalls`, `spawnPoint` | Handles missing asset templates gracefully | `PROJECT.md` & `TownHub.ts` contract |
| 5 | TownHubAltar | Interactive Portal Entity | Proximity check (`dist <= 3.0`) and rune ring rotation | `playerPosition` (Vector3) | Boolean `isPlayerInProximity` | Returns `false` on invalid position | `TownHubAltar.ts` |
| 6 | StateManager | Town-to-Dungeon State Transition | Disposes Town Hub, triggers BSP dungeon gen & NavMesh rebuild | Interaction event `[E]`/`[F]` | State changed to `DUNGEON`, new level ready | Prevents re-entrant double triggering | `PROJECT.md` & `GameStateManager.ts` contract |
| 7 | NavMesh | Recast WASM NavMesh Rebuild | Computes pathfinding NavMesh over `mergedFloors` | `mergedFloors` Mesh | Recast NavMesh instance | Throws if mesh lacks valid geometry | `NavMeshManager.ts` & `index.ts` |
| 8 | Player | Player Spawning & Control | Spawns player at spawn point with NavMesh & Input hooks | `Scene`, `spawnPoint` Vector3 | Controllable `Player` entity | Safely handles missing NavMesh | `Player.ts` & `index.ts` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Bitmask Lookup | Out-of-bounds grid coordinates (e.g. gx=-1, gy=0 or gx=40, gy=40) | Grid lookup safely returns `TileType.Wall` without throwing `TypeError: Cannot read properties of undefined`. |
| 2 | Bitmask Lookup | Corner cells (0,0), (0,39), (39,0), (39,39) | Evaluates 3 out-of-bound neighbors as walls; selects correct inner corner piece and Y-rotation facing plaza. |
| 3 | Portal Interaction | Player triggering `[E]` key at `dist = 3.1` (outside 3.0m threshold) | `isPlayerInProximity()` returns `false`; transition request ignored. |
| 4 | State Transition | 100 rapid `[E]` keypresses fired within 10ms while inside radius | First trigger sets `isTransitioning = true`; remaining 99 triggers abort immediately, preventing duplicate dungeon creation. |
| 5 | TileMap Build | Call `buildFromGrid()` before calling `preloadAssets()` | `buildFromGrid()` checks `!this.isLoaded` and automatically awaits `preloadAssets()` before building. |
| 6 | Scene Cleanup | Transitioning from Town Hub to Dungeon | All nodes parented to `townHubRoot` disposed cleanly; zero orphan meshes remain in `scene.meshes`. |
| 7 | NavMesh Build | NavMesh creation called with empty or null `mergedFloors` mesh | `createNavMesh()` checks mesh validity and returns null or throws clear error instead of crashing WASM module. |
