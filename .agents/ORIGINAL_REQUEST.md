# Original User Request

## Initial Request — 2026-08-06T23:52:42Z

Fix dungeon tile connectivity and implement a static town hub as the starting area for an existing Babylon.js ARPG prototype using Kenney 3D Modular Dungeon Kit assets.

Working directory: `c:\Users\greg_\source\babylonjs-dungo-crawler`
Integrity mode: development

## Context

This is an **existing, partially working** Babylon.js v9 + TypeScript + Vite ARPG prototype. The dungeon currently renders Kenney GLB tiles via GPU instancing (`mesh.createInstance()`), but every wall cell uses the same `template-wall.glb` piece regardless of its neighbors — resulting in visually incoherent tile placement (no corners, wrong orientations, walls floating in space). The game also launches directly into the dungeon; it should start in a safe town hub instead.

### CRITICAL: Existing Codebase Rules
- **DO NOT rewrite files from scratch** unless absolutely necessary. Modify existing code.
- **DO NOT replace the GPU instancing approach** in TileMap.ts — `createInstance()` is working and performant. Fix the tile *selection* logic, not the rendering strategy.
- **Read all relevant source files before modifying them.** The codebase has ~20 source files that are interconnected.

### Existing Source Files
- `src/dungeon/Generator.ts` — BSP dungeon generator producing a 40x40 `DungeonGrid` with `CellMetadata` per cell (`type`: Floor/Wall/Door/Stairs/Empty, `roomId`, `isCorridor`, `wallRotation`)
- `src/dungeon/TileMap.ts` — loads Kenney GLB templates via `SceneLoader.ImportMeshAsync`, places them via `mesh.createInstance()`, creates invisible merged box colliders for collision/picking
- `src/dungeon/NavMeshManager.ts` — Recast WASM pathfinding
- `src/index.ts` — 8-step bootstrap sequence, currently goes straight to dungeon generation
- `src/entities/TownHubAltar.ts` — town altar entity (exists but unused as starting area)
- `src/entities/Player.ts`, `src/entities/Enemy.ts` — player/enemy entities
- `src/core/Engine.ts` — Babylon engine + scene + lights + render loop
- `src/core/InputManager.ts` — click-to-move and keyboard input
- `src/camera/CameraRig.ts` — isometric follow camera
- `src/combat/`, `src/items/`, `src/ui/`, `src/audio/`, `src/persistence/` — all exist and work
- `src/rendering/VisualPipelineManager.ts` — SSAO2, Bloom, ACES tone mapping

### Available Kenney Assets (`public/assets/dungeon/`)

**Template tiles** (modular, designed to snap on a 2-unit grid):
- Floors: `template-floor.glb`, `template-floor-detail.glb`, `template-floor-detail-a.glb`, `template-floor-big.glb`, `template-floor-layer.glb`, `template-floor-layer-hole.glb`, `template-floor-layer-raised.glb`
- Walls: `template-wall.glb`, `template-wall-corner.glb`, `template-wall-half.glb`, `template-wall-detail-a.glb`, `template-wall-top.glb`, `template-wall-stairs.glb`
- Other: `template-corner.glb`, `template-detail.glb`

**Pre-built corridor assemblies**:
- `corridor.glb`, `corridor-corner.glb`, `corridor-end.glb`, `corridor-intersection.glb`, `corridor-junction.glb`, `corridor-transition.glb`
- Wide variants: `corridor-wide.glb`, `corridor-wide-corner.glb`, `corridor-wide-end.glb`, `corridor-wide-intersection.glb`, `corridor-wide-junction.glb`

**Pre-built room assemblies**:
- `room-small.glb`, `room-small-variation.glb`, `room-large.glb`, `room-large-variation.glb`
- `room-wide.glb`, `room-wide-variation.glb`, `room-corner.glb`

**Gates/doors**: `gate.glb`, `gate-door.glb`, `gate-door-window.glb`, `gate-metal-bars.glb`
**Stairs**: `stairs.glb`, `stairs-wide.glb`
**Textures**: `colormap.png`, `variation-a.png`, `variation-b.png`

### Key Technical Constraints
- Babylon.js v9 uses aggressive tree-shaking. Side-effect imports are required (e.g., `import "@babylonjs/core/Collisions/collisionCoordinator"` for `checkCollisions`). Check `src/core/Engine.ts` for the existing side-effect imports and add any new ones needed there.
- Source meshes from GLB imports must have `isVisible = false` but `setEnabled(true)` for instances to render.
- The grid uses 2.0 world-unit spacing: `worldX = gx * 2.0 + 1.0`, `worldZ = gy * 2.0 + 1.0`.
- The `buildFromGrid()` loop must yield to the browser periodically (`await setTimeout(0)` every N rows) to avoid freezing the main thread.

## Requirements

### R1. Intelligent Dungeon Tile Selection
The tile placement algorithm in `TileMap.ts` must analyze each cell's neighbors to select the correct Kenney piece and rotation. For each wall cell, determine whether it's a straight wall, inner corner, outer corner, end cap, etc., based on which adjacent cells are floors vs walls vs empty. For floors, use detail variants for visual variety. The agent team should decide the best approach — whether to use purely modular template pieces, pre-built room/corridor assemblies, or a hybrid. The user noted pre-built rooms might be too small, so size compatibility with the generator's rooms should be considered. The result should look like a coherent, connected dungeon — walls forming proper room boundaries with correct corners, floors filling room interiors, and corridors connecting rooms.

### R2. Static Town Hub Starting Area
The game must start in a static (not procedurally generated), hand-designed town hub area with no enemies. The town should be a safe starting zone built from Kenney dungeon assets, containing at minimum a portal or transition point that takes the player into the procedural dungeon. The existing `TownHubAltar.ts` entity can be used or adapted. The bootstrap sequence in `index.ts` should be modified so the player spawns in the town first, with dungeon generation happening when the player chooses to enter the dungeon.

## Acceptance Criteria

### Build & Runtime
- [ ] `pnpm exec tsc --noEmit` passes with zero errors
- [ ] `pnpm run build` (Vite production build) succeeds
- [ ] Opening `http://localhost:5173/` in a browser shows the game without hanging or console errors

### Tile Connectivity (R1)
- [ ] Wall tiles at room edges use the correct piece for their position (straight wall along an edge, corner piece at corners)
- [ ] Wall pieces are rotated to face the correct direction (wall face toward the room interior, not toward void)
- [ ] Floor tiles fill room and corridor interiors without gaps or overlaps
- [ ] At least 2 floor tile variants are used for visual variety
- [ ] Door cells have a visually distinct door/gate piece
- [ ] The dungeon looks like a coherent connected space, not randomly scattered pieces

### Town Hub (R2)
- [ ] The game starts in the town hub, not in the dungeon
- [ ] The town hub is a static, hand-designed area (not procedurally generated)
- [ ] No enemies spawn in the town hub
- [ ] There is a visible, interactive transition point (portal, stairs, altar) to enter the dungeon
- [ ] Entering the dungeon transitions the player to a procedurally generated dungeon level
- [ ] The player character is visible and controllable in the town hub

### Performance
- [ ] The browser tab remains responsive during dungeon generation (no multi-second freezes)
- [ ] The game maintains interactive frame rates (no obvious stuttering during normal gameplay)

## Verification Plan

### Automated
- Run `pnpm exec tsc --noEmit` to verify TypeScript compilation
- Run `pnpm run build` to verify production build

### Manual (by the agent team)
- Launch `pnpm run dev`, open in browser, verify:
  1. Game starts in town hub with player visible
  2. No enemies in town hub
  3. Find and interact with dungeon entrance
  4. Dungeon generates and loads with correct tile placement
  5. Verify walls have corners, floors fill rooms, no floating pieces
