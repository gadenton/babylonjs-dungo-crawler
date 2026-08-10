# Analysis Report: Level Transition, TownHub Lifecycle & Altar Interaction (Milestone 3)

**Author:** Explorer 2 (Milestone 3)  
**Target Directory:** `c:\Users\greg_\source\babylonjs-dungo-crawler`  
**Date:** 2026-08-06  

---

## 1. Executive Summary

Milestone 3 requires establishing a clean level transition mechanism between the safe **Town Hub** starting area and the procedural **Dungeon** level. Specifically, the game must bootstrap in `TownHub` with zero enemies and a controllable player, handle proximity and keyboard/click interactions with the `TownHubAltar`, safely disable/hide the `TownHub` environment (root nodes, instanced meshes, merged floor/wall colliders, and altar light/meshes) during transition, and initialize the procedural dungeon with Recast WASM NavMesh and enemy AI.

This report analyzes `src/index.ts`, `src/town/TownHub.ts`, and `src/entities/TownHubAltar.ts`, identifies lifecycle and architectural gaps in the current bootstrap flow, and provides a concrete design for `GameStateManager` and step-by-step refactoring strategy.

---

## 2. Current Bootstrap Investigation (`src/index.ts`)

### 2.1 Current 8-Step Bootstrap Sequence
The entry point `src/index.ts` currently bootstraps the prototype through an 8-step sequence inside `async function bootstrap()`:

1. **Engine & Scene Setup**: Instantiates `GameEngine` (which sets up WebGL canvas, `Scene`, ambient light, directional sun light, exponential shadow generator).
2. **Subsystems**: Instantiates `AudioManager`, `JuiceOverlay`, `InputManager`, `CameraRig` (45° pitch/yaw isometric rig), and `Player`.
3. **Visual Pipeline**: Initializes `VisualPipelineManager` (SSAO2, Bloom, ACES tone mapping).
4. **Town Hub Plaza Construction**: Instantiates `TownHub(scene)` and calls `await townHub.build()`.
5. **Player & Camera Spawning**: Positions player at `builtTown.spawnPoint` (`Vector3(10, 0, 6)`), initializes empty `enemies: Enemy[] = []` (zero enemies in Town Hub), attaches player input and camera follow.
6. **UI Overlays Wiring**: Instantiates `TalentUI`, `ArchetypeUI`, `InventoryUI`, `SaveLoadUI`, `HUD`, `LootDrop` list, and connects event listeners.
7. **Input & Shortcut Handling**: Registers keyboard shortcuts (`KeyT`, `KeyI`, `KeyP`, `F9`, `KeyE`/`KeyF`, `Escape`) and altar interaction handler.
8. **Inline Transition Handler**: Defines an inline `transitionToDungeon()` callback wired to `townHubAltar.onInteract`.

### 2.2 Critical Gaps & Issues Identified
- **No Environment Hiding/Disabling**: When `transitionToDungeon()` is triggered, `townHub` environment root node (`townHubRoot`), child instanced meshes, `mergedFloors`, `mergedWalls`, and `townHubAltar` remain **100% active** in the Babylon.js scene. They render behind or inside the dungeon and retain collision boxes (`checkCollisions = true`) and picking targets (`isPickable = true`), causing collision conflicts with `tileMap.mergedFloors` and `tileMap.mergedWalls`.
- **Inline Transition Logic**: `transitionToDungeon()` is implemented as an un-encapsulated inline arrow function within `bootstrap()`, making state management, resource cleanup, and lifecycle control difficult to test or extend.
- **Missing Loading Curtain Overlay**: During `transitionToDungeon()`, BSP dungeon generation, Kenney tilemap GPU instancing, mesh merging, and Recast WASM navmesh building execute sequentially. Without displaying a loading screen or curtain (using DOM `#loadingOverlay` or GUI), the game UI freezes without visual feedback for ~200-500ms.
- **Lack of Centralized State Machine**: State transitions (`TOWN_HUB` vs `DUNGEON`) are tracked via a simple boolean `let inDungeon = false`. There is no dedicated state manager handling scene graph cleanup, enemy lifecycle, or UI prompt updates.

---

## 3. TownHub Environment Lifecycle & Colliders (`src/town/TownHub.ts`)

### 3.1 Scene Graph Architecture
`TownHub.ts` constructs a static 10x10 plaza using Kenney GLB assets:
- **Root Node**: `TransformNode("townHubRoot", scene)` acts as the parent container.
- **Visual Instanced Meshes**: 100 floor tiles (`template-floor.glb`, `template-floor-detail.glb`), 36 perimeter wall tiles (`template-wall.glb`, `template-wall-corner.glb`), 1 gate (`gate.glb`), and 1 set of stairs (`stairs-wide.glb`). Every instance has `inst.parent = rootNode`.
- **Merged Floor Collider**: `mergedFloors` (`Mesh`) merged from 100 box colliders (`town_fc_x_y`). Properties: `parent = rootNode`, `checkCollisions = true`, `isPickable = true`.
- **Merged Wall Collider**: `mergedWalls` (`Mesh`) merged from perimeter wall colliders (`town_wc_x_y`). Properties: `parent = rootNode`, `checkCollisions = true`, `isPickable = false`.

### 3.2 Safe Environment Disabling Mechanism
In Babylon.js, disabling a parent `TransformNode` via `rootNode.setEnabled(false)` **recursively disables all child nodes**, including instanced meshes, `mergedFloors`, and `mergedWalls`. When a node is disabled:
1. **Rendering**: Scene render loop skips all child instances and merged meshes (0 draw calls).
2. **Collisions**: Physics/movement collision checks (`scene.pickWithRay`, `moveWithCollisions`) ignore disabled colliders.
3. **Picking**: Pointer picking (`scene.pick`) ignores disabled meshes (`isPickable` state is bypassed when disabled).

### 3.3 Proposed Lifecycle Extension for `TownHub.ts`
We recommend adding a `setEnabled(enabled: boolean)` method to `TownHub`:
```ts
public setEnabled(enabled: boolean): void {
  if (this.rootNode && !this.rootNode.isDisposed()) {
    this.rootNode.setEnabled(enabled);
  }
}
```

---

## 4. TownHubAltar Entity & Interaction Wiring (`src/entities/TownHubAltar.ts`)

### 4.1 Component Structure
`TownHubAltar` creates three distinct scene objects positioned at `Vector3(10.0, 0.0, 16.0)`:
1. `mesh` (`Mesh`): Stylized stone cylinder base (`height: 1.6`, `diameterTop: 2.2`, `checkCollisions: true`, `isPickable: true`).
2. `ringMesh` (`Mesh`): Outer runed glow ring (`Torus`, `isPickable: true`), animated via `scene.onBeforeRenderObservable`.
3. `light` (`PointLight`): Cyan glowing light (`intensity: 2.0`, `position: (10, 2.2, 16)`).

Note: These 3 objects are created directly in `scene` (not under `townHubRoot`).

### 4.2 Altar Lifecycle Disabling
Because `mesh`, `ringMesh`, and `light` are not children of `townHubRoot`, disabling `townHubRoot` does not disable the altar. Therefore, `TownHubAltar` requires its own `setEnabled(enabled: boolean)` method:
```ts
public setEnabled(enabled: boolean): void {
  if (this.mesh && !this.mesh.isDisposed()) this.mesh.setEnabled(enabled);
  if (this.ringMesh && !this.ringMesh.isDisposed()) this.ringMesh.setEnabled(enabled);
  if (this.light && !this.light.isDisposed()) this.light.setEnabled(enabled);
}
```

### 4.3 Interaction Wiring & Proximity
- **Proximity Calculation**: `isPlayerInProximity(playerPosition: Vector3): boolean` computes `Vector3.Distance(this.position, playerPosition) <= 3.0`.
- **Render Loop Observer**: Each frame, when in `TOWN_HUB` state:
  ```ts
  if (townHubAltar.isPlayerInProximity(player.position)) {
    hud.showInteractionPrompt("Press [E] or (A) to Access Altar");
  } else {
    hud.hideInteractionPrompt();
  }
  ```
- **Interaction Triggers**:
  1. Keyboard Press: `KeyE` or `KeyF` triggers `townHubAltar.interact()` when proximity is true.
  2. Pointer Click: Clicking on `townHubAltar.mesh` or `townHubAltar.ringMesh` triggers interaction.
- **Event Observable**: `onInteract` observable fires `onInteract.notifyObservers()`.

---

## 5. Recommended Architecture & Step-by-Step Refactoring Strategy

### 5.1 Architecture: `GameStateManager` (`src/core/GameStateManager.ts`)
Create a dedicated `GameStateManager` class to encapsulate scene state, level transitions, and lifecycle control.

```
+-------------------------------------------------------------------+
|                        GameStateManager                           |
+-------------------------------------------------------------------+
| - currentState: GameState (TOWN_HUB | DUNGEON | TRANSITIONING)    |
| - scene: Scene                                                    |
| - player: Player                                                  |
| - townHub: TownHub                                                |
| - builtTown: BuiltTownHub                                         |
| - tileMap: TileMap | null                                         |
| - navMeshManager: NavMeshManager | null                           |
| - enemies: Enemy[]                                                |
| - hud: HUD                                                        |
+-------------------------------------------------------------------+
| + transitionToDungeon(): Promise<void>                            |
| + transitionToTownHub(): Promise<void>                            |
| + update(deltaTime: number): void                                 |
+-------------------------------------------------------------------+
```

### 5.2 Transition Lifecycle Protocol (`TOWN_HUB` -> `DUNGEON`)

1. **Trigger Phase**:
   - Player interacts with `townHubAltar` (keypress `[E]`/`[F]` or click).
   - `GameStateManager.transitionToDungeon()` is invoked.
   - If `currentState !== GameState.TOWN_HUB`, exit early.
   - Set `currentState = GameState.TRANSITIONING`.

2. **Loading Curtain Phase**:
   - Show DOM loading overlay (`#loadingOverlay` / `#loadingStatus`) or GUI curtain: `LoadingCurtain.show("Generating Procedural Dungeon...")`.
   - Hide HUD interaction prompt (`hud.hideInteractionPrompt()`).
   - Yield execution to main thread (`await new Promise(r => setTimeout(r, 50))`) to allow browser to render loading curtain frame.

3. **Town Hub Hiding Phase**:
   - Disable Town Hub environment root node: `builtTown.rootNode.setEnabled(false)`.
   - Disable Town Hub Altar entity: `builtTown.altar.setEnabled(false)`.

4. **Dungeon Generation Phase**:
   - Instantiate `Generator({ width: 40, height: 40 })` and run `generate()`.
   - Instantiate `TileMap(scene)` and call `await tileMap.buildFromGrid(dungeonGrid)`. Yield every 10 rows.
   - Instantiate `NavMeshManager()`, call `await navMeshManager.init(3000)`, create navmesh from `builtDungeon.mergedFloors`.

5. **Entity & Camera Placement Phase**:
   - Move player position: `player.transformNode.position = builtDungeon.spawnPoint.clone()`.
   - Update player navmesh: `player.setNavMeshManager(navMeshManager)`.
   - Clear existing enemies array.
   - For each dungeon room (`i = 1..N`), instantiate `Enemy`, assign navmesh, set target `player`, attach shadow caster, wire attack/death/loot events.

6. **Finalize Transition Phase**:
   - Hide Loading Curtain: `LoadingCurtain.hide()`.
   - Set `currentState = GameState.DUNGEON`.
   - Show toast notification: `hud.showPickupNotification("Entered Procedural Dungeon", "#3B82F6")`.

---

## 6. Implementation Verification Method

To verify the refactored bootstrap and transition logic:
1. **TypeScript Type Check**: `pnpm exec tsc --noEmit` (must yield 0 errors).
2. **Production Build**: `pnpm run build` (must complete successfully).
3. **Runtime Verification**:
   - Game launches into `TownHub` with zero enemies and controllable player.
   - Approaching `TownHubAltar` displays HUD interaction prompt `"Press [E] or (A) to Access Altar"`.
   - Pressing `[E]` or `[F]` triggers loading curtain transition.
   - Town Hub meshes (`townHubRoot`, `mergedFloors`, `mergedWalls`, `townHubAltar`) become invisible and uncollidable.
   - Player spawns in procedural dungeon with enemies present and Recast WASM pathfinding operational.
