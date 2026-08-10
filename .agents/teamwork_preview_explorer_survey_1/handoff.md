# Handoff Report: Dungeon TileMap & Asset Analysis

**Agent**: Survey Explorer 1  
**Working Directory**: `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_survey_1`  
**Date**: 2026-08-06  

---

## 1. Observation

1. **`src/dungeon/Generator.ts` Wall Placement**:
   - Lines 451–505 in `placeWalls()` iterate over `Empty` cells, calculate `floorDirX` and `floorDirY` by summing 8-neighbor offsets, and assign a single cardinal `wallRotation` (0, $\pi/2$, $\pi$, $3\pi/2$).
   - All wall cells receive `cell.type = TileType.Wall`. No metadata is produced for inner corners, outer corners, end caps, or wall variants.

2. **`src/dungeon/TileMap.ts` Instanced Rendering**:
   - Lines 55–62 in `preloadAssets()` load only 6 models: `template-floor.glb`, `template-floor-detail.glb`, `template-wall.glb`, `template-wall-corner.glb`, `gate-door.glb`, `stairs.glb`.
   - Lines 174–195 in `buildFromGrid()` use `wallSources` (`template-wall.glb`) exclusively for all wall cells. `wallCornerSources` is loaded but never instantiated.
   - Lines 157–160 & 178–186 call `src.createInstance(...)` to generate lightweight `InstancedMesh` nodes parented to `rootNode`.
   - Lines 231–256 create merged collision boxes: `mergedFloors` (`checkCollisions = true`, `isPickable = true`) and `mergedWalls` (`checkCollisions = true`, `isPickable = false`).

3. **`public/assets/dungeon/` GLB Models**:
   - Executed GLB accessor inspection on all 44 GLB files in `public/assets/dungeon/`.
   - `template-floor.glb`: vertex min `[-2, 0, -2]`, max `[2, 0, 2]` ($4.0 \times 4.0$ flat plane).
   - `template-floor-detail.glb` & `template-floor-detail-a.glb`: vertex min `[-2, 0, -2]`, max `[2, 0.1, 2]`.
   - `template-wall.glb`: vertex min `[-2, 0, -1.99]`, max `[2, 4.15, 0]` ($4.0$ wide, $2.0$ deep, front face at $Z=0$).
   - `template-wall-corner.glb`: vertex min `[-1.0, 0, -1.0]`, max `[0, 4.05, 0]` ($1.0 \times 1.0$ corner column in $[-1, 0] \times [-1, 0]$).
   - `template-wall-half.glb`: vertex min `[-1, 0, -1.8]`, max `[1, 4.15, 0]` ($2.0$ wide).
   - `template-corner.glb`: vertex min `[-2, 0, -2]`, max `[2, 4.23, 2]` ($4.0 \times 4.0$ solid corner block).
   - `gate-door.glb`: vertex min `[-2.2, 0, -0.7]`, max `[2.2, 4.4, 0.7]` (door arch frame).
   - `stairs.glb`: vertex min `[-2.2, 0, -6.2]`, max `[2.2, 8.55, 2.2]`.

4. **Grid Mapping**:
   - `worldX = gx * 2.0 + 1.0`, `worldZ = gy * 2.0 + 1.0`. Cells are spaced 2.0 units apart. Flat floor tiles ($4 \times 4$) overlap by 50% on $Y=0$, rendering seamlessly.

---

## 2. Logic Chain

1. **Premise 1**: In `TileMap.ts`, every wall cell currently instantiates `template-wall.glb` regardless of whether it is an edge, inner corner, or outer corner (Observation 2).
2. **Premise 2**: `Generator.ts` currently provides only a crude single cardinal rotation angle per wall cell without distinguishing corner topologies (Observation 1).
3. **Premise 3**: Kenney GLB assets include distinct pieces designed for corners (`template-wall-corner.glb`, `template-corner.glb`), detail variants (`template-floor-detail-a.glb`, `template-wall-detail-a.glb`), and half-walls (`template-wall-half.glb`), each with known vertex bounds and alignment axes (Observation 3).
4. **Premise 4**: An 8-neighbor bitmask (checking North, NE, East, SE, South, SW, West, NW walkable floor status) evaluated for each wall cell uniquely identifies straight walls, concave inner corners, convex outer corners, and end caps (Observation 4).
5. **Conclusion**: Introducing an 8-neighbor bitmask selector in `TileMap.ts` (or a helper class) allows picking the exact GLB model (`template-wall.glb`, `template-wall-corner.glb`, `template-wall-half.glb`, etc.) and Y-rotation for every grid cell, while fully preserving `createInstance()` GPU instancing.

---

## 3. Caveats

- **Pre-built Room/Corridor Assemblies**: Pre-built assembly GLBs (`room-small.glb`, `room-large.glb`, `corridor.glb`) were inspected but not recommended for dynamic BSP generation because BSP generates arbitrary room sizes ($4 \times 4$ to $10 \times 10$) and 2-tile wide L-corridors. Modular template tiles are recommended.
- **Assumptions**: Assumed $Y=0$ plane overlap of flat floor quads remains visually artifact-free under Babylon.js standard shader rendering, as verified in current prototype execution.

---

## 4. Conclusion

The dungeon rendering issues (missing corners, misaligned wall rotations, visual incoherence) stem entirely from missing neighbor bitmask classification logic in `TileMap.ts` and `Generator.ts`. 

The solution requires:
1. Expanding `preloadAssets()` in `TileMap.ts` to preload `template-wall-corner.glb`, `template-floor-detail-a.glb`, `template-wall-detail-a.glb`, and `template-wall-half.glb`.
2. Implementing 8-neighbor bitmask lookup in `TileMap.ts` to map cell neighbor configurations to model names and Y-rotations.
3. Randomizing floor tile rotations ($0, \pi/2, \pi, 3\pi/2$) and selecting floor/wall detail variants via deterministic seed hashing.
4. Keeping GPU instancing (`createInstance()`) and merged collision boxes (`mergedFloors`, `mergedWalls`) intact.

---

## 5. Verification Method

To verify these findings independently:
1. **TypeScript Build Verification**:
   ```bash
   pnpm exec tsc --noEmit
   ```
2. **GLB Header Inspection Script**:
   Run node command to inspect GLB bounds and node names:
   ```bash
   node -e "
   const fs = require('fs');
   const buf = fs.readFileSync('./public/assets/dungeon/template-wall-corner.glb');
   const chunkLen = buf.readUInt32LE(12);
   console.log(JSON.parse(buf.toString('utf8', 20, 20 + chunkLen)));
   "
   ```
3. **Inspect Output Files**:
   - Review `analysis.md` for full detailed tables and bitmask logic blueprint.
   - Review `handoff.md` for summary and logic chain.

---
*Handoff report complete.*
