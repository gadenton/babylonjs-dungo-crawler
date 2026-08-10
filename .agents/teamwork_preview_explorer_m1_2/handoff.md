# Handoff Report — Explorer 2 (Milestone 1: Tile Connectivity & GPU Instancing)

## 1. Observation

### Codebase Inspection Findings
- `src/dungeon/TileMap.ts` (lines 55-62): Currently loads a hardcoded list of assets:
  ```ts
  const models = [
    "template-floor.glb",
    "template-floor-detail.glb",
    "template-wall.glb",
    "template-wall-corner.glb",
    "gate-door.glb",
    "stairs.glb",
  ];
  ```
- `src/dungeon/TileMap.ts` (lines 174-187): Wall placement currently uses `template-wall.glb` for all wall cells, ignoring neighbor topology and applying simple cardinal rotation derived in `Generator.ts`:
  ```ts
  if (cell.type === TileType.Wall) {
    const rotation = cell.wallRotation ?? 0;
    const sources = wallSources;
    for (const src of sources) {
      const inst = src.createInstance(`wall_${gx}_${gy}_${src.name}`);
      inst.position.set(worldX, 0, worldZ);
      inst.rotationQuaternion = null;
      inst.rotation.set(0, rotation, 0);
      inst.parent = rootNode;
      allInstances.push(inst);
    }
  }
  ```
- `src/dungeon/Generator.ts` (lines 491-499): The existing `placeWalls` method derived `wallRotation` as follows:
  ```ts
  if (floorDirY < 0) {
    rotation = Math.PI; // Floor to South (-Y in grid)
  } else if (floorDirY > 0) {
    rotation = 0; // Floor to North (+Y in grid)
  } else if (floorDirX > 0) {
    rotation = (3 * Math.PI) / 2; // Floor to East (+X in grid)
  } else if (floorDirX < 0) {
    rotation = Math.PI / 2; // Floor to West (-X in grid)
  }
  ```

### Asset Audit Findings (`public/assets/dungeon/`)
39 GLB models exist in `public/assets/dungeon/`. Key template asset geometry and bounds measured via Node.js GLTF parsing:
1. `template-floor.glb`:
   - Bounding Box: X `[-2.00, 2.00]`, Z `[-2.00, 2.00]`, Y `[0.00, 0.00]` (flat quad centered at origin).
2. `template-floor-detail-a.glb` / `template-floor-detail.glb`:
   - Bounding Box: X `[-2.00, 2.00]`, Z `[-2.00, 2.00]`, Y `[0.00, 0.10]` (cobblestone/detail variant).
3. `template-wall.glb`:
   - Bounding Box: X `[-2.00, 2.00]`, Z `[-0.80, 0.00]`, Y `[0.90, 4.15]`.
   - Wall Face Normal Analysis: Primary front face normal points along **+Z** (`(0.00, 0.00, 1.00)`), located along the South edge (`Z = -0.80..0.00`). At Y-rotation `0`, the decorated wall face points **North (+Z)** into the cell center.
4. `template-wall-detail-a.glb`:
   - Bounding Box: X `[-2.00, 2.00]`, Z `[-1.15, 0.00]`, Y `[0.60, 4.23]` (straight wall with wall torch fixture). Same alignment and orientation as `template-wall.glb`.
5. `template-wall-corner.glb`:
   - Bounding Box: X `[-0.60, 0.00]`, Z `[-0.60, 0.00]`, Y `[0.90, 4.05]` (0.6x0.6 pillar/corner post block).
6. `template-wall-half.glb`:
   - Bounding Box: X `[-1.00, 1.00]`, Z `[-0.80, 0.00]`, Y `[0.90, 4.15]` (half-width straight wall segment).
7. `gate-door.glb`:
   - Bounding Box: X `[-2.16, 2.16]`, Z `[-0.63, 0.63]`, Y `[0.95, 4.40]` (width along X = 4.40, depth along Z = 1.40).
   - Frame orientation at Y-rotation `0`: Frame spans across the **X-axis** (East-West), opening through the **Z-axis** (North-South corridor).

---

## 2. Logic Chain

1. **Coordinate System & Alignment**:
   - Grid cell `(gx, gy)` maps to world space `worldX = gx * 2.0 + 1.0` and `worldZ = gy * 2.0 + 1.0`.
   - Increasing `gy` (+Y in grid) corresponds to increasing `worldZ` (**North**).
   - Increasing `gx` (+X in grid) corresponds to increasing `worldX` (**East**).
   - Decreasing `gy` (-Y in grid) corresponds to decreasing `worldZ` (**South**).
   - Decreasing `gx` (-X in grid) corresponds to decreasing `worldX` (**West**).

2. **Analysis of Rotation Error in Legacy Code**:
   - In legacy `Generator.ts`, `floorDirX > 0` (floor to East) produced rotation `3*Math.PI/2` (270°).
   - However, rotating `template-wall.glb` by 270° counterclockwise around +Y turns its front face from +Z (North) to -X (West). Facing West when floor is to East causes the wall face to point away from the room (into the void!).
   - Correct Y-rotation for East floor (+X) is `Math.PI / 2` (90°), which rotates +Z to +X (East).
   - Correct Y-rotation for West floor (-X) is `3 * Math.PI / 2` (270°), which rotates +Z to -X (West).

3. **8-Neighbor Bitmasking Algorithm Design**:
   - For any cell `(x, y)` in `DungeonGrid`, define `isWalkable(x, y)` as `true` if `cells[y][x].type` is `Floor`, `Door`, or `Stairs`.
   - Construct an 8-bit neighbor bitmask for wall tile connectivity:
     - Bit 0 (`1`): **North (N)** `(x, y + 1)`
     - Bit 1 (`2`): **North-East (NE)** `(x + 1, y + 1)`
     - Bit 2 (`4`): **East (E)** `(x + 1, y)`
     - Bit 3 (`8`): **South-East (SE)** `(x + 1, y - 1)`
     - Bit 4 (`16`): **South (S)** `(x, y - 1)`
     - Bit 5 (`32`): **South-West (SW)** `(x - 1, y - 1)`
     - Bit 6 (`64`): **West (W)** `(x - 1, y)`
     - Bit 7 (`128`): **North-West (NW)** `(x - 1, y + 1)`
   - Extract `cardinalMask = mask & 85` (bits 1, 4, 16, 64).

4. **Lookup Table Mapping**:

   - **Straight Walls** (`cardinalMask` has 1 bit set):
     - `cardinalMask === 1` (North floor): Model `template-wall.glb` (or `template-wall-detail-a.glb` on 15% seed hash), Y-Rotation = `0` (0°). Wall face points +Z (North).
     - `cardinalMask === 4` (East floor): Model `template-wall.glb` (or `template-wall-detail-a.glb`), Y-Rotation = `Math.PI / 2` (90°). Wall face points +X (East).
     - `cardinalMask === 16` (South floor): Model `template-wall.glb` (or `template-wall-detail-a.glb`), Y-Rotation = `Math.PI` (180°). Wall face points -Z (South).
     - `cardinalMask === 64` (West floor): Model `template-wall.glb` (or `template-wall-detail-a.glb`), Y-Rotation = `3 * Math.PI / 2` (270°). Wall face points -X (West).

   - **Inner Corners / Convex Corners** (`cardinalMask` has 2 adjacent bits set):
     - `cardinalMask === 5` (North + East floors): Model `template-wall-corner.glb`, Y-Rotation = `0` (0°).
     - `cardinalMask === 20` (East + South floors): Model `template-wall-corner.glb`, Y-Rotation = `Math.PI / 2` (90°).
     - `cardinalMask === 80` (South + West floors): Model `template-wall-corner.glb`, Y-Rotation = `Math.PI` (180°).
     - `cardinalMask === 65` (West + North floors): Model `template-wall-corner.glb`, Y-Rotation = `3 * Math.PI / 2` (270°).

   - **Outer Corners / Concave Corners** (`cardinalMask === 0`, 1 diagonal bit set):
     - `mask === 2` (NE floor): Model `template-wall-corner.glb`, Y-Rotation = `0` (0°).
     - `mask === 8` (SE floor): Model `template-wall-corner.glb`, Y-Rotation = `Math.PI / 2` (90°).
     - `mask === 32` (SW floor): Model `template-wall-corner.glb`, Y-Rotation = `Math.PI` (180°).
     - `mask === 128` (NW floor): Model `template-wall-corner.glb`, Y-Rotation = `3 * Math.PI / 2` (270°).

   - **End Caps / Wall Stubs** (`cardinalMask` has 3 bits set):
     - `cardinalMask === 21` (N + E + S floors, W is wall): Model `template-wall-half.glb`, Y-Rotation = `Math.PI / 2` (90°).
     - `cardinalMask === 84` (E + S + W floors, N is wall): Model `template-wall-half.glb`, Y-Rotation = `Math.PI` (180°).
     - `cardinalMask === 81` (S + W + N floors, E is wall): Model `template-wall-half.glb`, Y-Rotation = `3 * Math.PI / 2` (270°).
     - `cardinalMask === 69` (W + N + E floors, S is wall): Model `template-wall-half.glb`, Y-Rotation = `0` (0°).

   - **Door Cells** (`TileType.Door`):
     - Check adjacent walkable cells:
       - If North & South are walkable (North-South corridor): Model `gate-door.glb`, Y-Rotation = `0` (0°). Frame stretches East-West.
       - If East & West are walkable (East-West corridor): Model `gate-door.glb`, Y-Rotation = `Math.PI / 2` (90°). Frame stretches North-South.

   - **Floor Variety** (`TileType.Floor`):
     - Seeded hash: `const useDetail = (gx * 31 + gy * 17 + grid.seed) % 100 < 15;`
     - If `useDetail`: place `template-floor-detail-a.glb`.
     - Else: place `template-floor.glb`.
     - Deterministic Y-rotation for floor tile visual variation: `((gx * 13 + gy * 7 + grid.seed) % 4) * (Math.PI / 2)`.

---

## 3. Caveats

- **Pre-built Room Assemblies**: `room-large.glb` (20x20 units), `room-small.glb` (12x12 units), `corridor.glb` were evaluated. Because the generator produces variable BSP rooms (minRoomSize 4 to maxRoomSize 10 tiles, i.e., 8x8 to 20x20 world units) and 2-tile wide corridors, using pre-built GLB assemblies would require rigid room dimensions or complex scaling that breaks instancing. Modular template pieces (`template-wall.glb`, `template-wall-corner.glb`, `template-wall-detail-a.glb`, `template-floor-detail-a.glb`) are 100% compatible with BSP tile grids and preserve GPU instancing (~1 draw call per tile type).
- **Collision Mesh Merging**: Invisible box colliders for floors (`fc_*`) and walls (`wc_*`) must continue to be merged via `Mesh.MergeMeshes` into `mergedFloors` and `mergedWalls`. This maintains 60 FPS physics/picking performance.

---

## 4. Conclusion & Actionable Recommendations

### Recommendations for Worker Implementation in `TileMap.ts` & `Generator.ts`:

1. **Update `preloadAssets()` in `TileMap.ts`**:
   Add `template-wall-half.glb`, `template-wall-detail-a.glb`, and `template-floor-detail-a.glb` to the asset loading array:
   ```ts
   const models = [
     "template-floor.glb",
     "template-floor-detail-a.glb",
     "template-wall.glb",
     "template-wall-corner.glb",
     "template-wall-half.glb",
     "template-wall-detail-a.glb",
     "gate-door.glb",
     "stairs.glb",
   ];
   ```

2. **Implement Helper Functions in `TileMap.ts`**:
   - Add an 8-neighbor bitmask evaluator `getNeighborBitmask(grid: DungeonGrid, gx: number, gy: number): number`.
   - Add a tile selection helper `selectWallTile(mask: number, seed: number, gx: number, gy: number): { model: string, rotation: number }`.

3. **Update `buildFromGrid()` Tile Placement Loop**:
   - Replace hardcoded `cell.wallRotation` logic with bitmask-driven tile model & rotation selection.
   - For `TileType.Wall`: query `selectWallTile(...)`, retrieve preloaded `Mesh[]` source for the chosen GLB, create instances, and set `inst.rotation.set(0, rotation, 0)`.
   - For `TileType.Door`: check corridor orientation (N-S vs E-W) and set Y-rotation (`0` or `Math.PI / 2`).
   - For `TileType.Floor`: use `template-floor-detail-a.glb` when seeded hash condition is met, and apply deterministic Y-rotations to floor instances for visual texture variety.

---

## 5. Verification Method

To verify the implementation once applied by the Worker:

1. **TypeScript Typecheck**:
   ```bash
   pnpm exec tsc --noEmit
   ```
   Must pass with zero errors.

2. **Vite Production Build**:
   ```bash
   pnpm run build
   ```
   Must compile cleanly without asset loading or type errors.

3. **Visual & Behavior Invalidation Conditions**:
   - Walls facing into the void (back of wall visible from room interior) -> Rotation offset error.
   - Gaps or unaligned corner pieces at room corners -> Bitmask lookup table mismatch.
   - Door frames blocking corridor path perpendicular to player movement -> Door rotation inverted.
