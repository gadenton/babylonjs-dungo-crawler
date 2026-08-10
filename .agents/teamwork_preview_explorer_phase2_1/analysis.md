# Phase 2 Technical Analysis & Specification: Procedural Level Generation & TileMap Mesh Merging

**Author:** Phase 2 Technical Explorer 1  
**Target Modules:** `src/dungeon/Generator.ts` & `src/dungeon/TileMap.ts`  
**Milestone:** M2 (Phase 2: Procedural Level Generation & NavMesh)  
**Date:** 2026-08-04  

---

## Executive Summary

This document presents the complete technical specification for **Phase 2 Procedural Level Generation** in the Babylon.js ARPG. It covers:
1. **`src/dungeon/Generator.ts`**: A seedable, deterministic Grid BSP (Binary Space Partitioning) algorithm generating rooms, corridors, wall boundaries, doors, and stairs on a $2\text{m} \times 2\text{m}$ grid.
2. **`src/dungeon/TileMap.ts`**: An asset loader and modular 3D builder consuming Kenney 3D Dungeon/Cave GLB assets from `public/assets/dungeon/` and `public/assets/cave/`, placing tiles based on grid metadata, and executing single-draw-call material mesh merging via `BABYLON.Mesh.MergeMeshes` with native ellipsoid collision support (`checkCollisions = true`).

---

## 1. Architectural Overview & Component Contracts

```
 +----------------------------------+
 |    Seedable PRNG (Mulberry32)    |
 +----------------------------------+
                  |
                  v
 +----------------------------------+
 |      src/dungeon/Generator.ts    |
 |  - Grid BSP Room Partitioning    |
 |  - L-Corridor Connectivity       |
 |  - Wall & Door Border Placement  |
 |  - Spawn & Exit Stairs Selection |
 |  - Reachability Validation       |
 +----------------------------------+
                  |
                  v  (DungeonGrid payload)
 +----------------------------------+
 |      src/dungeon/TileMap.ts      |
 |  - Asset Preloader (Kenney GLBs) |
 |  - 2m Grid World Positioning     |
 |  - Neighbor-Based Rotation Rules |
 |  - BABYLON.Mesh.MergeMeshes      |
 |  - checkCollisions Wall Setup    |
 +----------------------------------+
                  |
        +---------+---------+
        |                   |
        v                   v
+------------------+  +-------------------+
|  mergedFloors    |  |    mergedWalls    |
| (NavMesh Input)  |  | (Ellipsoid Slide) |
+------------------+  +-------------------+
```

### Component Contracts

#### 1. `Generator.ts` Exported Interface
```typescript
export enum TileType {
  Empty = 0,
  Floor = 1,
  Wall = 2,
  Door = 3,
  Stairs = 4,
}

export interface Room {
  id: number;
  x: number;          // Grid left
  y: number;          // Grid top (z in 3D grid)
  width: number;      // Grid width
  height: number;     // Grid height
  centerX: number;
  centerY: number;
}

export interface CellMetadata {
  type: TileType;
  roomId: number | null;
  isCorridor: boolean;
  wallRotation?: number; // 0, Math.PI/2, Math.PI, 3*Math.PI/2
}

export interface DungeonGrid {
  width: number;
  height: number;
  cells: CellMetadata[][];
  rooms: Room[];
  spawnPosition: { x: number; y: number };
  stairsPosition: { x: number; y: number };
  seed: number;
}

export interface GeneratorOptions {
  width?: number;         // Default 40
  height?: number;        // Default 40
  minRoomSize?: number;   // Default 4
  maxRoomSize?: number;   // Default 10
  maxDepth?: number;      // Default 4
  corridorWidth?: number; // Default 2
  seed?: number;          // Optional seed (auto-generated if undefined)
}
```

#### 2. `TileMap.ts` Exported Interface
```typescript
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DungeonGrid } from "./Generator";

export enum DungeonTheme {
  Dungeon = "dungeon",
  Cave = "cave",
}

export interface BuiltDungeon {
  rootNode: TransformNode;
  mergedFloors: Mesh | null;
  mergedWalls: Mesh | null;
  doors: TransformNode[];
  spawnPoint: Vector3;      // World position for player spawn
  stairsPoint: Vector3;     // World position for level exit
}

export class TileMap {
  constructor(scene: Scene, theme?: DungeonTheme);
  public async preloadAssets(): Promise<void>;
  public async buildFromGrid(grid: DungeonGrid): Promise<BuiltDungeon>;
  public dispose(): void;
}
```

---

## 2. Technical Specification: `src/dungeon/Generator.ts`

### 2.1 Seedable Deterministic RNG (PRNG)
To satisfy the strict requirement for seedable, reproducible generation (`procedural-gen` skill rule 1), `Generator.ts` must encapsulate a **Mulberry32** or **LCG** random generator.

```typescript
export class SeedableRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns pseudo-random float in range [0, 1) */
  public random(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns random integer in inclusive range [min, max] */
  public rangeInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Returns random item from array */
  public choice<T>(array: T[]): T {
    return array[Math.floor(this.random() * array.length)];
  }
}
```

### 2.2 Grid BSP Room Partitioning Algorithm
1. **Initialize Grid**: Allocate a 2D array `CellMetadata[height][width]` initialized to `TileType.Empty`.
2. **BSP Tree Structure**:
   ```typescript
   class BSPNode {
     x: number; y: number; width: number; height: number;
     leftChild: BSPNode | null = null;
     rightChild: BSPNode | null = null;
     room: Room | null = null;
   }
   ```
3. **Recursive Partitioning**:
   - Stop split if `depth >= maxDepth` OR `width < minRoomSize * 2 + 2` OR `height < minRoomSize * 2 + 2`.
   - Choose split direction:
     - If `width / height > 1.25` -> Split vertically (vertical cut line, left/right sub-nodes).
     - If `height / width > 1.25` -> Split horizontally (horizontal cut line, top/bottom sub-nodes).
     - Otherwise -> 50% random split direction.
   - Calculate split point: `split = rng.rangeInt(minSize, totalSize - minSize)`.
4. **Room Carving**:
   - For each leaf node, carve a room of size `[roomW, roomH]`:
     - `roomW = rng.rangeInt(minRoomSize, Math.min(maxRoomSize, node.width - 2))`
     - `roomH = rng.rangeInt(minRoomSize, Math.min(maxRoomSize, node.height - 2))`
     - `roomX = node.x + rng.rangeInt(1, node.width - roomW - 1)`
     - `roomY = node.y + rng.rangeInt(1, node.height - roomH - 1)`
   - Set `cells[y][x]` for `roomX..roomX+roomW-1`, `roomY..roomY+roomH-1` to `TileType.Floor` with `roomId`.

### 2.3 L-Shaped Corridor Connection Algorithm
1. Connect leaf node rooms bottom-up through the BSP tree.
2. For any internal BSP node, retrieve a representative room center from `leftChild` ($C_1$) and `rightChild` ($C_2$).
3. Carve a 2-tile wide L-corridor between $C_1 = (x_1, y_1)$ and $C_2 = (x_2, y_2)$:
   - **Horizontal-then-Vertical**:
     - Segment A: $(x_1 \to x_2, y_1)$ with width 2.
     - Segment B: $(x_2, y_1 \to y_2)$ with width 2.
   - **Vertical-then-Horizontal**:
     - Segment A: $(x_1, y_1 \to y_2)$ with width 2.
     - Segment B: $(x_1 \to x_2, y_2)$ with width 2.
4. Carving sets target cells to `TileType.Floor`, `isCorridor = true`.

### 2.4 Wall, Door, and Stair Placement
1. **Wall Outer Boundary**:
   - Scan all `TileType.Empty` cells.
   - If a cell has at least one horizontal, vertical, or diagonal neighbor that is `TileType.Floor`, change it to `TileType.Wall`.
   - Calculate `wallRotation` based on neighbor direction:
     - Floor to North (+Y) -> Wall faces South (rotation 0)
     - Floor to South (-Y) -> Wall faces North (rotation $\pi$)
     - Floor to East (+X) -> Wall faces West (rotation $3\pi/2$)
     - Floor to West (-X) -> Wall faces East (rotation $\pi/2$)
2. **Door Placement**:
   - Identify corridor cells (`isCorridor = true`) that intersect a room's outer perimeter wall line.
   - Convert matching cell to `TileType.Door`.
3. **Spawn & Exit Placement**:
   - `spawnPosition`: Center of `rooms[0]`.
   - `stairsPosition`: Center of `rooms[rooms.length - 1]` (farthest room from `rooms[0]`). Set cell to `TileType.Stairs`.

### 2.5 Flood-Fill Reachability Safety Check
- Execute BFS from `spawnPosition`.
- Verify every `TileType.Floor`, `Door`, and `Stairs` cell is visited.
- If unreachable cells exist, repair by carving direct 2-tile wide corridor to nearest reachable room.

---

## 3. Technical Specification: `src/dungeon/TileMap.ts`

### 3.1 Asset Catalog Mapping (Kenney 3D Dungeon & Cave Kits)

The project includes GLB assets in both `public/assets/dungeon/` and `public/assets/cave/`. Both directories share identical modular naming conventions:

| TileType / Grid Role | GLB Model Name | Orientation / Usage |
| :--- | :--- | :--- |
| `TileType.Floor` (Standard) | `template-floor.glb` | Base $2\text{m} \times 2\text{m}$ ground plane |
| `TileType.Floor` (Variant) | `template-floor-detail.glb` / `template-floor-detail-a.glb` | 15% random distribution for visual flavor |
| `TileType.Wall` (Straight) | `template-wall.glb` | Oriented toward adjacent floor cell |
| `TileType.Wall` (Corner) | `template-wall-corner.glb` | Used when walls meet at $90^\circ$ angles |
| `TileType.Wall` (Half / Edge) | `template-wall-half.glb` | Pillars or narrow edges |
| `TileType.Door` | `gate-door.glb` (Dungeon) / `gate.glb` (Cave) | Placed at room-corridor transitions |
| `TileType.Stairs` | `stairs.glb` / `stairs-wide.glb` | Level completion exit |

### 3.2 Coordinate Transformation & World Scale
- **Grid Tile Size**: $2.0\text{m} \times 2.0\text{m}$.
- Grid Cell $(gx, gz)$ maps to 3D World Origin $(x, y, z)$:
  $$x = gx \times 2.0 + 1.0$$
  $$y = 0.0$$
  $$z = gz \times 2.0 + 1.0$$
- Positioning pivot at cell center $(+1.0, +1.0)$ ensures seamless tile snapping.

### 3.3 Asset Preloading & Template Caching
To eliminate I/O stalls during generation:
```typescript
private templateMeshes: Map<string, Mesh> = new Map();

public async preloadAssets(): Promise<void> {
  const models = [
    "template-floor.glb",
    "template-floor-detail.glb",
    "template-wall.glb",
    "template-wall-corner.glb",
    "gate-door.glb",
    "stairs.glb",
  ];

  const basePath = `assets/${this.theme}/`;
  for (const model of models) {
    const result = await SceneLoader.ImportMeshAsync("", basePath, model, this.scene);
    // Combine submeshes into a single template mesh & hide it
    const root = result.meshes[0];
    root.setEnabled(false);
    // Store reference in template container
  }
}
```

### 3.4 High-Performance Mesh Merging Strategy (`BABYLON.Mesh.MergeMeshes`)

#### The Performance Problem
A $40 \times 40$ dungeon grid contains up to 1,600 tiles. If instantiated as separate GLB nodes:
- Scene Graph: $>4,000$ TransformNodes / Meshes.
- Draw Calls: $>3,000$ draw calls per frame.
- Frame Rate Impact: Severe CPU/GPU rendering bottleneck.

#### The Solution: Material-Grouped Mesh Merging
Merging static geometry into unified meshes per material drops draw call counts from thousands down to **1-2 draw calls total**!

```typescript
public mergeStaticMeshes(
  meshes: Mesh[],
  meshName: string,
  enableCollision: boolean
): Mesh | null {
  if (meshes.length === 0) return null;

  // 1. Group source meshes by material instance to prevent multi-material overhead
  const materialGroups = new Map<BABYLON.Material, Mesh[]>();

  for (const mesh of meshes) {
    const mat = mesh.material || this.defaultMaterial;
    if (!materialGroups.has(mat)) {
      materialGroups.set(mat, []);
    }
    materialGroups.get(mat)!.push(mesh);
  }

  const subMergedMeshes: Mesh[] = [];

  // 2. Merge each material bucket
  for (const [mat, group] of materialGroups.entries()) {
    const merged = Mesh.MergeMeshes(
      group,
      true,  // disposeSource = true (cleanup unmerged nodes)
      true,  // allow32BitsIndices = true (handle large vertex counts)
      undefined,
      false, // subTransform = false
      false  // useMultiMaterial = false (single material per group)
    );

    if (merged) {
      merged.material = mat;
      subMergedMeshes.push(merged);
    }
  }

  // 3. Combine sub-merged material meshes if multiple materials exist
  let finalMesh: Mesh | null = null;
  if (subMergedMeshes.length === 1) {
    finalMesh = subMergedMeshes[0];
    finalMesh.name = meshName;
  } else if (subMergedMeshes.length > 1) {
    finalMesh = Mesh.MergeMeshes(
      subMergedMeshes,
      true,  // disposeSource
      true,  // allow32BitsIndices
      undefined,
      false,
      true   // useMultiMaterial = true (combines distinct materials)
    );
    if (finalMesh) finalMesh.name = meshName;
  }

  // 4. Configure Physics / Ellipsoid Collisions
  if (finalMesh) {
    finalMesh.checkCollisions = enableCollision;
    finalMesh.isPickable = true;
    finalMesh.freezeWorldMatrix(); // Lock transform matrix for zero CPU overhead
  }

  return finalMesh;
}
```

### 3.5 Collision Setup for Smooth Ellipsoid Wall Sliding
- In Phase 1 `Player.ts`:
  - `rootMesh.checkCollisions = true`
  - `rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45)`
  - `rootMesh.moveWithCollisions(displacement)`
- In `TileMap.ts`:
  - `mergedWalls.checkCollisions = true`
  - Merged walls provide smooth, seam-free wall geometry. Player ellipsoid slides cleanly without getting stuck on mesh joints.
  - `mergedFloors.checkCollisions = true` (enables raycasting and click-to-move path targeting).

---

## 4. Implementation Guidelines & Next Steps for Phase 2

1. **`Generator.ts` Implementation**:
   - Place in `src/dungeon/Generator.ts`.
   - Ensure `SeedableRNG` is exported for seed debugging.
   - Unit tests: verify reproducible grid output given the same seed.
2. **`TileMap.ts` Implementation**:
   - Place in `src/dungeon/TileMap.ts`.
   - Connect asset paths to `public/assets/dungeon/` and `public/assets/cave/`.
   - Verify `mergedFloors` is returned in `BuiltDungeon` struct for consumption by `NavMeshManager.ts` (Recast runtime navigation).

---

## 5. Verification Matrix

| Claim / Feature | Verification Method | Target Criteria |
| :--- | :--- | :--- |
| **Deterministic Seed PRNG** | Run `Generator.generate({ seed: 12345 })` twice | Identical `DungeonGrid` output arrays |
| **Grid BSP Dungeon Layout** | Validate cell room boundaries & corridor connections | 100% floor cells connected (BFS flood fill pass) |
| **Mesh Merging Performance** | Measure draw calls via Babylon Inspector / Profiler | $< 10$ draw calls for 1600-tile dungeon |
| **Ellipsoid Collisions** | Player `moveWithCollisions` against `mergedWalls` | Zero wall clipping or seam catching |
