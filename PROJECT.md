# Project: Babylon.js Dungo Crawler Enhancements

## Architecture
- **Rendering & Engine**: Babylon.js v9, WebGL2, GPU instancing via `mesh.createInstance()`, `VisualPipelineManager` (SSAO2, Bloom, ACES tone mapping).
- **Grid & World**: 40x40 grid, 2.0 unit spacing (`worldX = gx * 2.0 + 1.0`, `worldZ = gy * 2.0 + 1.0`).
- **Tile System (`src/dungeon/TileMap.ts`)**: Preloads Kenney 3D Modular Dungeon GLB assets (`template-floor.glb`, `template-floor-detail-a.glb`, `template-wall.glb`, `template-wall-corner.glb`, `template-wall-half.glb`, `gate-door.glb`, `stairs.glb`). Uses an 8-neighbor bitmask lookup algorithm to evaluate cell neighbor configurations and select exact GLB models (straight wall, inner corner, outer corner, end cap, detail variants) and Y-rotations while strictly preserving GPU instancing (`createInstance()`) and merged collision meshes (`mergedFloors`, `mergedWalls`).
- **Town Hub & Scene Transition (`src/town/TownHub.ts`, `src/core/GameStateManager.ts`)**: Hand-designed static 10x10 safe courtyard plaza constructed from Kenney GLB assets with zero enemies. Features a controllable player, camera rig, and interactive transition altar/portal (`TownHubAltar.ts`). Transition triggers loading curtain, disposes/hides town root, generates 40x40 BSP dungeon grid via `Generator.ts`, constructs `TileMap`, builds Recast WASM NavMesh via `NavMeshManager.ts`, and spawns player and enemies in the procedural dungeon.
- **Navigation & Pathfinding**: Recast WASM (`src/dungeon/NavMeshManager.ts`).
- **Code Layout**:
  - `src/dungeon/Generator.ts`: BSP dungeon grid generator (40x40 grid with `CellMetadata`).
  - `src/dungeon/TileMap.ts`: Asset preloader, 8-neighbor bitmask algorithm, GPU mesh instancing, merged colliders.
  - `src/town/TownHub.ts`: Static town hub environment builder (10x10 plaza, colliders, lighting, spawn points).
  - `src/core/GameStateManager.ts`: Central state manager (`TOWN_HUB` <-> `DUNGEON`), scene lifecycle, level loading & curtain transitions.
  - `src/entities/TownHubAltar.ts`: Interactive portal / altar entity in Town Hub.
  - `src/entities/Player.ts`, `src/camera/CameraRig.ts`: Persistent player entity and isometric camera rig.
  - `src/index.ts`: Game entry point bootstrap sequence (starts in Town Hub, transitions to Dungeon on interaction).

## Feature Inventory
Every feature from the Survey phase is enumerated below with its assigned milestone.
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Neighbor Lookup Bitmask | 8-neighbor bitmask algorithm in `TileMap.ts` to classify cell topologies (straight wall, inner corner, outer corner, end cap) | M1 | survey |
| 2 | Model & Rotation Selection | Select precise Kenney GLB model (`template-wall.glb`, `template-wall-corner.glb`, `template-wall-half.glb`, etc.) and Y-rotation per cell | M1 | survey |
| 3 | GPU Instancing Preservation | Preload GLBs and instantiate via `mesh.createInstance()`, maintaining `mergedFloors` and `mergedWalls` | M1 | survey |
| 4 | Floor & Detail Variety | Floor & wall detail variants (`template-floor-detail-a.glb`, `template-wall-detail-a.glb`) via seeded hash | M1 | survey |
| 5 | Door & Gate Placement | Visually distinct `gate-door.glb` piece and colliders for door cells | M1 | survey |
| 6 | Static Town Hub Layout | 10x10 hand-designed safe courtyard plaza using Kenney GLB tiles with zero enemies | M2 | survey |
| 7 | Town Player Control | Controllable player & isometric camera rig in Town Hub | M2 | survey |
| 8 | Interactive Altar/Portal | Proximity interaction (`[E]`/`[F]`) on `TownHubAltar` / Dungeon Portal | M2 | survey |
| 9 | State & Scene Transition | `GameStateManager` handling `TOWN_HUB` -> `DUNGEON` transition with loading curtain & mesh lifecycle | M3 | survey |
| 10 | On-Demand Dungeon & NavMesh | Generate BSP dungeon, `TileMap`, and Recast WASM NavMesh on transition | M3 | survey |
| 11 | Main Thread Yield | Yield every 10 rows (`await setTimeout(0)`) and before heavy merge/navmesh steps | M1 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Tile Connectivity & GPU Instancing | `TileMap.ts` & `Generator.ts`: neighbor bitmask, asset preload, corner/straight/end-cap selection, floor variety, door placement, instancing preservation | None | DONE |
| M2 | Static Town Hub & Player Setup | `src/town/TownHub.ts` & `TownHubAltar.ts`: static 10x10 plaza, colliders, player spawning, interaction prompt | None | DONE |
| M3 | Level Transition & Dungeon Trigger | `GameStateManager.ts` & `index.ts`: bootstrap update, portal interaction trigger, loading curtain, transition to procedural dungeon & navmesh | M1, M2 | PLANNED |
| M4 | Final E2E Suite & Hardening | E2E test suite (Tiers 1-4), adversarial coverage, build & typecheck verification, forensic audit | M1, M2, M3 | PLANNED |

## Interface Contracts
### TownHub ↔ GameStateManager
- `TownHub.build(scene: Scene): { rootNode: TransformNode, mergedFloors: Mesh, mergedWalls: Mesh, spawnPoint: Vector3 }`
- `GameStateManager.transitionToDungeon(): Promise<void>`

### TileMap ↔ Generator
- `TileMap.buildFromGrid(grid: DungeonGrid): Promise<BuiltDungeon>`
