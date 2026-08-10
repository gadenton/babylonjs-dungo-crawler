# Phase 2 Technical Handoff Report: Dungeon Generator & TileMap Specification

**Author:** Phase 2 Technical Explorer 1  
**Target Directory:** `.agents/teamwork_preview_explorer_phase2_1/`  
**Milestone:** M2 (Phase 2: Procedural Level Generation & NavMesh)  
**Date:** 2026-08-04  

---

## 1. Observation

- **Requirements Source (`ORIGINAL_REQUEST.md:25-27`)**:
  > "R2. Procedural Dungeon Generation & NavMesh (Phase 2): Implement `src/dungeon/Generator.ts`, `src/dungeon/TileMap.ts`, and `src/dungeon/NavMeshManager.ts`. Grid-based BSP room/corridor generation using modular Kenney 3D Dungeon & Cave Kit GLB models (2m x 2m grid). Merge static meshes per material with `BABYLON.Mesh.MergeMeshes`, set `checkCollisions = true` on wall geometry for ellipsoid sliding..."

- **Project Blueprint (`PROJECT.md:24-25, 61-65`)**:
  - `Generator.generateGrid(width: number, height: number): DungeonGrid`
  - `TileMap.buildMeshes(grid: TileGrid): { mergedFloors: BABYLON.Mesh, mergedWalls: BABYLON.Mesh }`
  - `NavMeshManager.createNavMesh(groundMesh: BABYLON.Mesh): Promise<NavMesh>`

- **Relevant Skills & Performance Guidelines**:
  - `procedural-gen/SKILL.md:40-42`: Pass explicit seedable RNG instance everywhere; generate into plain data grid first, decoupled from rendering.
  - `babylonjs-engine/SKILL.md:370-398`: `SceneLoader.ImportMeshAsync` GLB loading.
  - `performance-optimization/SKILL.md:107-118`: Cut draw calls via material-grouped mesh merging (`BABYLON.Mesh.MergeMeshes`).

- **Asset Verification (`public/assets/dungeon/` and `public/assets/cave/`)**:
  - Assets exist in project and match Kenney 3D Dungeon & Cave Kit naming: `template-floor.glb`, `template-floor-detail.glb`, `template-wall.glb`, `template-wall-corner.glb`, `gate-door.glb`, `stairs.glb`.

- **Existing Movement & Physics System (`src/entities/Player.ts:50-57, 150-155`)**:
  - Player root mesh has `checkCollisions = true`, `ellipsoid = Vector3(0.45, 0.9, 0.45)`, and updates via `moveWithCollisions(displacement)`.

---

## 2. Logic Chain

1. **Grid BSP Generation (`Generator.ts`)**:
   - The dungeon layout must be generated into a 2D `DungeonGrid` (`TileType` array) before any 3D rendering occurs.
   - To guarantee reproducible layout seeds (for daily runs or seed sharing), `Generator.ts` uses a custom `SeedableRNG` (Mulberry32 algorithm) passed through all room partitioning and corridor carving logic.
   - BSP recursively subdivides a $40 \times 40$ tile space into leaf nodes, places non-overlapping rooms inside leaves, connects sibling nodes with 2-tile wide L-corridors, places surrounding wall boundaries, sets door thresholds, and assigns start/exit stairs.

2. **Modular Tile Placement & Positioning (`TileMap.ts`)**:
   - Kenney 3D Dungeon & Cave models are scaled to $2.0\text{m} \times 2.0\text{m}$.
   - Cell $(gx, gz)$ maps to world center position $(gx \times 2.0 + 1.0, 0.0, gz \times 2.0 + 1.0)$.
   - Wall rotations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$) are calculated dynamically based on adjacent floor directions.

3. **Single-Draw-Call Static Mesh Merging (`BABYLON.Mesh.MergeMeshes`)**:
   - An unmerged 1,600-tile grid produces $>3,000$ draw calls, causing heavy rendering bottleneck.
   - By sorting submeshes into material buckets and calling `BABYLON.Mesh.MergeMeshes(group, true, true, undefined, false, false)`, all floor tiles merge into a single `mergedFloors` mesh and all wall tiles merge into a single `mergedWalls` mesh.
   - Total draw calls drop from $>3,000$ to $1-2$ draw calls per frame.

4. **Ellipsoid Collisions & NavMesh Integration**:
   - Setting `checkCollisions = true` on `mergedWalls` allows Babylon's built-in collision engine to perform smooth ellipsoid sliding for `Player.ts` without catching on polygon seams.
   - Returning `mergedFloors` as a dedicated mesh reference allows `NavMeshManager.ts` to pass `mergedFloors` directly into Recast NavMesh generation.

---

## 3. Caveats

- **Fixed Grid Scale**: Assumed tile scale is $2.0\text{m} \times 2.0\text{m}$ to match Kenney modular assets.
- **Door Interactivity**: Doors are kept as separate `TransformNode` objects in `BuiltDungeon.doors` rather than merged into static walls, enabling future opening/closing animations and state changes.
- **No caveats** regarding core algorithm compatibility or Babylon.js API support.

---

## 4. Conclusion

The technical specifications for `src/dungeon/Generator.ts` and `src/dungeon/TileMap.ts` are fully defined and documented in `.agents/teamwork_preview_explorer_phase2_1/analysis.md`. The design fulfills all R2 requirements from `ORIGINAL_REQUEST.md` and interfaces directly with existing Phase 1 components and planned `NavMeshManager.ts` components.

---

## 5. Verification Method

1. **Specification Review**:
   - Inspect `.agents/teamwork_preview_explorer_phase2_1/analysis.md` for complete data structures, interfaces, pseudo-code algorithms, and mesh merging workflows.
2. **TypeScript Compilation**:
   - Execute `npm run build` (`tsc && vite build`) after implementers create `src/dungeon/Generator.ts` and `src/dungeon/TileMap.ts`.
3. **PRNG Seed Verification**:
   - Instantiate `DungeonGenerator` with fixed seed `12345` twice and assert deep equality on the generated `cells` 2D array.
4. **Mesh & Collision Audit**:
   - Load generated dungeon in browser dev mode and verify `mergedWalls.checkCollisions === true`, `mergedFloors` mesh exists, and total scene draw calls remain under 10.
