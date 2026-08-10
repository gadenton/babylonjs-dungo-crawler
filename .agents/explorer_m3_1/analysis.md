# Architectural Analysis: GameStateManager & Level Transition (Milestone 3)

## 1. Executive Summary

Milestone 3 focuses on implementing `src/core/GameStateManager.ts` and `src/ui/LoadingCurtain.ts` to govern scene lifecycles, level transitions between `TOWN_HUB` and `DUNGEON`, loading overlay management, active level node visibility, and entity orchestration.

Currently in `src/index.ts`, level generation and transitions are handled via inline logic within the bootstrap procedure, lacking a formal state machine, clean level node enabling/disabling, reusable loading curtain control, or clean cleanup between town hub and dungeon instances.

This document presents the complete architectural investigation, interface definitions, state machine design, scene lifecycle management, and implementation strategy for Milestone 3.

---

## 2. Existing Codebase Audit

### 2.1 Entry Point & Bootstrap (`src/index.ts`)
- **Current Behavior**:
  - Initializes `GameEngine`, `Audio`, `JuiceOverlay`, `InputManager`, `CameraRig`, `Player`, `VisualPipelineManager`.
  - Builds `TownHub` asynchronously (`await townHub.build()`).
  - Spawns player at town `spawnPoint` (10.0, 0.0, 6.0).
  - Configures UI overlays (`TalentUI`, `ArchetypeUI`, `InventoryUI`, `SaveLoadUI`, `HUD`).
  - Defines an inline `transitionToDungeon()` closure (lines 167–226) that generates a 40x40 grid, creates `TileMap`, initializes `NavMeshManager`, repositions player, and spawns enemies.
  - Subscribes `townHubAltar.onInteract` to open `archetypeUI` and call `transitionToDungeon()`.
  - Directly hides `#loadingOverlay` DOM element once bootstrap completes.
- **Architectural Gaps**:
  - No formal state tracking (only a primitive boolean `inDungeon = false`).
  - No transition locking (multiple trigger keypresses or clicks during build can cause race conditions).
  - No reusable Loading Curtain overlay controller for mid-game level transitions.
  - Town Hub nodes (`townHubRoot`) remain enabled in the scene alongside dungeon nodes (`dungeonRoot`), accumulating unnecessary render/collision load.
  - No clean teardown or rebuild logic when returning to Town or re-generating the Dungeon.

### 2.2 Town Hub & Altar (`src/town/TownHub.ts` & `src/entities/TownHubAltar.ts`)
- **`TownHub`**:
  - Builds a 10x10 plaza using Kenney GLB instanced meshes under a parent `TransformNode` named `"townHubRoot"`.
  - Merges floor colliders into `mergedFloors` and wall colliders into `mergedWalls`, both parented to `rootNode`.
  - Returns `BuiltTownHub`: `{ rootNode, mergedFloors, mergedWalls, spawnPoint, altarPosition, altar }`.
- **`TownHubAltar`**:
  - Creates 3D altar meshes (`mesh`, `ringMesh`) and a `PointLight`.
  - Exposes `onInteract: Observable<void>` and `isPlayerInProximity(playerPosition: Vector3): boolean`.
- **Gap**: `TownHub` and `TownHubAltar` currently lack a `setEnabled(enabled: boolean)` method to easily hide/show the entire town hub environment and lights during dungeon play without destroying GLB preloaded assets.

### 2.3 Dungeon Generation & NavMesh (`src/dungeon/Generator.ts`, `TileMap.ts`, `NavMeshManager.ts`)
- **`Generator`**: BSP dungeon generator producing `DungeonGrid` (40x40 grid).
- **`TileMap`**:
  - Preloads Kenney GLB tile templates and creates lightweight `InstancedMesh` instances parented to `TransformNode("dungeonRoot", scene)`.
  - Merges floor colliders (`mergedFloors`) and wall colliders (`mergedWalls`), parented to `dungeonRoot`.
  - Exposes `dispose()` to release preloaded templates, and returns `BuiltDungeon`.
- **`NavMeshManager`**:
  - Recast WASM pathfinder wrapper requiring `init(3000)` and `createNavMesh(mergedFloors)`.
  - Exposes `dispose()` to free Recast WASM navmesh memory.

### 2.4 HTML DOM Overlay (`index.html`)
- `index.html` contains a pre-styled `#loadingOverlay` element with:
  - `<div id="loadingOverlay">`: Fullscreen dark backdrop (`rgba(10, 14, 23, 0.96)`), flexbox centered, `z-index: 9999`, CSS transition `opacity 0.4s ease`.
  - `<div id="loadingTitle">`: Styled title text ("Dungeon Crawler ARPG").
  - `<div id="loadingStatus">`: Status message text (e.g., "Initializing game engine...").
  - `<div id="loadingError">`: Error display box.

---

## 3. Architecture & Interface Design: `GameStateManager`

### 3.1 State Machine Enum & Interface Contracts

```typescript
export enum GameState {
  TOWN_HUB = "TOWN_HUB",
  DUNGEON = "DUNGEON",
  TRANSITIONING = "TRANSITIONING",
}

export interface TransitionOptions {
  seed?: number;
  dungeonWidth?: number;
  dungeonHeight?: number;
}

export interface GameStateChangeEvent {
  from: GameState;
  to: GameState;
}

export interface GameStateManagerConfig {
  scene: Scene;
  gameEngine: GameEngine;
  player: Player;
  cameraRig: CameraRig;
  hud: HUD;
  juiceOverlay: JuiceOverlay;
  audioManager: AudioManager;
  visualPipelineManager: VisualPipelineManager;
}
```

### 3.2 `LoadingCurtain` Controller (`src/ui/LoadingCurtain.ts`)

A clean TypeScript wrapper around the DOM `#loadingOverlay` element to manage transition visibility and status messages:

```typescript
export class LoadingCurtain {
  private overlayEl: HTMLElement | null;
  private statusEl: HTMLElement | null;
  private errorEl: HTMLElement | null;

  constructor() {
    this.overlayEl = document.getElementById("loadingOverlay");
    this.statusEl = document.getElementById("loadingStatus");
    this.errorEl = document.getElementById("loadingError");
  }

  public async show(message: string = "Loading..."): Promise<void> {
    if (this.statusEl) this.statusEl.innerText = message;
    if (this.errorEl) this.errorEl.style.display = "none";
    if (this.overlayEl) {
      this.overlayEl.style.display = "flex";
      // Force reflow for CSS transition
      void this.overlayEl.offsetWidth;
      this.overlayEl.style.opacity = "1";
    }
    // Yield execution to allow DOM repaint before CPU-heavy tasks start
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  public updateStatus(message: string): void {
    console.log(`[LoadingCurtain] ${message}`);
    if (this.statusEl) this.statusEl.innerText = message;
  }

  public async hide(): Promise<void> {
    if (!this.overlayEl) return;
    this.overlayEl.style.opacity = "0";
    await new Promise((resolve) => setTimeout(resolve, 450));
    this.overlayEl.style.display = "none";
  }

  public showError(message: string): void {
    if (this.errorEl) {
      this.errorEl.innerText = message;
      this.errorEl.style.display = "block";
    }
  }
}
```

### 3.3 Scene Lifecycle & Level Node Management

`GameStateManager` orchestrates active level nodes, ensuring clean separation between Town Hub and Dungeon environments:

#### Level Node State Management Rules:
1. **Town Hub Node Management**:
   - `TownHub` builds `townHubRoot` (TransformNode).
   - When transitioning `TOWN_HUB -> DUNGEON`:
     - Hide Town Hub: `townHub.setEnabled(false)` (disables `townHubRoot` transform node and `TownHubAltar` meshes and lights).
   - When transitioning `DUNGEON -> TOWN_HUB`:
     - Show Town Hub: `townHub.setEnabled(true)`.
2. **Dungeon Lifecycle**:
   - When transitioning to `DUNGEON`:
     - If a previous dungeon exists, clean up:
       - Dispose active `Enemy` entities: `enemies.forEach(e => e.dispose())`, clear array.
       - Dispose active `LootDrop` entities: `lootDrops.forEach(d => d.dispose())`, clear array.
       - Dispose active `TileMap` and `builtDungeon.rootNode.dispose()`.
       - Dispose active `NavMeshManager` (`navMeshManager.dispose()`).
     - Asynchronously build new `DungeonGrid`, `TileMap`, and `NavMeshManager`.
     - Spawn player at `builtDungeon.spawnPoint`.
     - Spawn enemy entities in room centers, attach shadow casters and damage listeners.
3. **Shadow Generator Updates**:
   - `shadowGen.addShadowCaster()` and removal management when switching scenes.
4. **Input & UI Pause during Transition**:
   - While in `GameState.TRANSITIONING`, input processing is suppressed so player cannot move/attack while the curtain is active.

---

## 4. `GameStateManager` Implementation Strategy

### 4.1 Transition Flow Sequences

#### `transitionToDungeon(options?: TransitionOptions): Promise<void>`
1. **Guard Check**: If `state === GameState.TRANSITIONING`, abort.
2. **State Transition**: Set `state = GameState.TRANSITIONING`. Notify `onStateChanged`.
3. **Curtain Show**: `await loadingCurtain.show("Entering Procedural Dungeon...")`.
4. **Clean Previous Dungeon**: Dispose old enemies, drops, `dungeonRoot`, and `navMeshManager`.
5. **Hide Town Hub**: `townHub.setEnabled(false)`.
6. **Generate Grid**: `loadingCurtain.updateStatus("Generating Dungeon Layout...")`. Yield main thread (`await setTimeout(0)`).
7. **Build TileMap**: `loadingCurtain.updateStatus("Building 3D Dungeon Tiles...")`. Construct `TileMap` & `builtDungeon`.
8. **Build NavMesh**: `loadingCurtain.updateStatus("Computing Recast NavMesh Pathfinding...")`. Init `NavMeshManager` & `createNavMesh()`.
9. **Spawn Player & Enemies**:
   - Reposition player to `builtDungeon.spawnPoint`.
   - Attach `navMeshManager` to player.
   - Instantiates `Enemy` entities in rooms, wire navmesh, target, and combat events.
10. **State Update**: Set `state = GameState.DUNGEON`. Notify `onStateChanged`.
11. **Curtain Hide**: `await loadingCurtain.hide()`.
12. **Toast Notification**: Notify HUD: `"Entered Procedural Dungeon"`.

#### `transitionToTown(): Promise<void>`
1. **Guard Check**: If `state === GameState.TRANSITIONING`, abort.
2. **State Transition**: Set `state = GameState.TRANSITIONING`. Notify `onStateChanged`.
3. **Curtain Show**: `await loadingCurtain.show("Returning to Town Hub Plaza...")`.
4. **Clean Dungeon**: Dispose enemies, drops, `dungeonRoot`, and `navMeshManager`.
5. **Show Town Hub**: `townHub.setEnabled(true)`.
6. **Spawn Player**: Reposition player to `builtTown.spawnPoint`. Remove player `navMeshManager`.
7. **State Update**: Set `state = GameState.TOWN_HUB`. Notify `onStateChanged`.
8. **Curtain Hide**: `await loadingCurtain.hide()`.
9. **Toast Notification**: Notify HUD: `"Returned to Town Hub"`.

---

## 5. Required File Additions & Modifies

### 5.1 New Files
1. `src/ui/LoadingCurtain.ts` — Loading curtain overlay DOM wrapper.
2. `src/core/GameStateManager.ts` — Central state machine, level node manager, transition orchestrator.

### 5.2 Contract Extensions in Existing Files
1. **`src/town/TownHub.ts`**:
   - Add `public setEnabled(enabled: boolean): void` method to toggle `rootNode` and `altar` visibility.
2. **`src/entities/TownHubAltar.ts`**:
   - Add `public setEnabled(enabled: boolean): void` method to toggle `mesh`, `ringMesh`, and `light`.

### 5.3 Bootstrap Integration (`src/index.ts`)
- Replace inline transition logic with `GameStateManager`.
- Initialize `GameStateManager` after engine, audio, player, camera, and HUD are instantiated.
- Delegate render loop updates (`enemies`, `lootDrops`, `altar` proximity checks) to `GameStateManager.update(deltaTime)`.

---

## 6. Verification & Test Plan

1. **TypeScript Compilation**: `pnpm exec tsc --noEmit` must return 0 errors.
2. **Vite Production Build**: `pnpm run build` must complete cleanly.
3. **Empirical Execution**: Test transition from Town -> Dungeon -> Town via test harness / manual verification:
   - Initial state is `TOWN_HUB`.
   - Interacting with altar triggers `transitionToDungeon()`.
   - Loading curtain appears with updated status messages without freezing browser frame.
   - Dungeon generates, player spawns at dungeon spawn point, enemies spawn.
   - Re-interacting or triggering transition returns player to Town Hub cleanly with zero dangling meshes or double audio.
