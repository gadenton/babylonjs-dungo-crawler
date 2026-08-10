# Handoff Report & Review Verdict — Milestone 1: Tile Connectivity & GPU Instancing

**Reviewer**: Reviewer 2 (`teamwork_preview_reviewer_m1_2`)  
**Target Milestone**: Milestone 1 (Tile Connectivity & GPU Instancing - `TileMap.ts` & `Autotiler.ts`)  
**Date**: 2026-08-06  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

**Rationale**:  
Build verification (`tsc --noEmit` and `pnpm run build`) succeeded with 0 errors, GPU instancing, collision geometry properties (`checkCollisions`, `isPickable`, `freezeWorldMatrix`), and missing asset fallbacks are correctly implemented. However, an adversarial geometric audit revealed a **Major finding** in `src/dungeon/Autotiler.ts`: all outer corner wall tile Y-rotations (`cardinalMask === 0` with diagonal walkable bits) are inverted by 180° (`Math.PI`). This causes outer corner wall pieces to face backwards (into the void/exterior wall mass) rather than facing forward into room corners.

---

## 1. Observation

1. **Build Verification**:
   - `pnpm exec tsc --noEmit` executed clean with code 0 (zero errors).
   - `pnpm run build` executed clean with code 0 (Vite build output: `dist/assets/index-Bo0xM_-e.js  589.44 kB`).

2. **Collision Meshes & Instancing (`src/dungeon/TileMap.ts`)**:
   - `mergedFloors`: `isVisible = false`, `checkCollisions = true`, `isPickable = true`, `parent = rootNode`, `freezeWorldMatrix()` applied.
   - `mergedWalls`: `isVisible = false`, `checkCollisions = true`, `isPickable = false`, `parent = rootNode`, `freezeWorldMatrix()` applied.
   - `inst.rotationQuaternion = null;` is called before setting `inst.rotation.set(0, yRotation, 0)`.
   - Multi-mesh GLB preloading iterates `m instanceof Mesh && m.getTotalVertices() > 0`, instantiating all child sub-meshes per cell.
   - Fallbacks for missing assets (`|| templateMeshes.get("template-floor.glb") || []`) handle failed GLB loads gracefully.
   - Microtask yields (`await new Promise(resolve => setTimeout(resolve, 0))`) are called every 10 rows and prior to `Mesh.MergeMeshes`.

3. **Bitmask Edge Conditions (`src/dungeon/Autotiler.ts:11-17`)**:
   - `isWalkable()` checks out-of-bounds `gx < 0 || gx >= grid.width || gy < 0 || gy >= grid.height` and returns `false`, safely handling grid boundaries (`x=0`, `x=W-1`, `y=0`, `y=H-1`).

4. **Outer Corner Rotation Bug (`src/dungeon/Autotiler.ts:95-109`)**:
   - In `selectWallTile()`:
     ```ts
     case 0:
     default:
       if (fullMask & 16) { // NE diagonal walkable
         return { modelName: "template-wall-corner.glb", yRotation: Math.PI };
       }
       if (fullMask & 32) { // SE diagonal walkable
         return { modelName: "template-wall-corner.glb", yRotation: (3 * Math.PI) / 2 };
       }
       if (fullMask & 64) { // SW diagonal walkable
         return { modelName: "template-wall-corner.glb", yRotation: 0 };
       }
       if (fullMask & 128) { // NW diagonal walkable
         return { modelName: "template-wall-corner.glb", yRotation: Math.PI / 2 };
       }
     ```
   - For `fullMask & 16` (NE diagonal is Floor at `gx+1, gy+1`), cell `(gx, gy)` forms the outer room corner facing NE. The inner wall faces of `template-wall-corner.glb` at `yRotation = 0` point North (+Z) and East (+X), facing into the room. Returning `yRotation = Math.PI` (180°) points the wall faces South (-Z) and West (-X) away from the room interior.
   - Similarly, SE diagonal (`fullMask & 32`) returns `270°` (should be `90°`), SW diagonal (`fullMask & 64`) returns `0°` (should be `180°`), and NW diagonal (`fullMask & 128`) returns `90°` (should be `270°`).

---

## 2. Findings

### [Major] Finding 1: Outer Corner Wall Tile Y-Rotations are Inverted (180° Off)

- **What**: In `src/dungeon/Autotiler.ts` (lines 97-108), outer corner Y-rotations for diagonal walkable neighbors are inverted by `Math.PI` (180 degrees).
- **Where**: `src/dungeon/Autotiler.ts:97-108`
- **Why**: 
  - `fullMask & 16` (NE floor): returns `Math.PI` (180°) instead of `0` (0°).
  - `fullMask & 32` (SE floor): returns `(3 * Math.PI) / 2` (270°) instead of `Math.PI / 2` (90°).
  - `fullMask & 64` (SW floor): returns `0` (0°) instead of `Math.PI` (180°).
  - `fullMask & 128` (NW floor): returns `Math.PI / 2` (90°) instead of `(3 * Math.PI) / 2` (270°).
- **Impact**: Outer corner wall tiles present backwards wall panels facing into the void/outer wall mass rather than pointing into the dungeon room corner interior.
- **Suggested Fix**: Update `selectWallTile` diagonal cases in `src/dungeon/Autotiler.ts`:
  ```ts
  if (fullMask & 16) { // NE diagonal walkable
    return { modelName: "template-wall-corner.glb", yRotation: 0 };
  }
  if (fullMask & 32) { // SE diagonal walkable
    return { modelName: "template-wall-corner.glb", yRotation: Math.PI / 2 };
  }
  if (fullMask & 64) { // SW diagonal walkable
    return { modelName: "template-wall-corner.glb", yRotation: Math.PI };
  }
  if (fullMask & 128) { // NW diagonal walkable
    return { modelName: "template-wall-corner.glb", yRotation: (3 * Math.PI) / 2 };
  }
  ```

### [Minor] Finding 2: Unregistered Kenney Model `template-corner.glb`

- **What**: `template-corner.glb` exists in `public/assets/dungeon/` but is not preloaded in `TileMap.ts:56-66`.
- **Where**: `src/dungeon/TileMap.ts:56-66`
- **Why**: `models` array lists `template-wall-corner.glb` but omits `template-corner.glb`.
- **Impact**: Minor. While `template-wall-corner.glb` handles autotiling corners, `template-corner.glb` is unavailable if needed for pillar/column accents.
- **Suggested Fix**: Optionally add `"template-corner.glb"` to `models` list in `TileMap.ts`.

---

## 3. Verified Claims

- `pnpm exec tsc --noEmit` -> **PASS** (exited code 0)
- `pnpm run build` -> **PASS** (exited code 0)
- `mergedFloors` properties (`isVisible = false`, `checkCollisions = true`, `isPickable = true`, `freezeWorldMatrix()`) -> **PASS**
- `mergedWalls` properties (`isVisible = false`, `checkCollisions = true`, `isPickable = false`, `freezeWorldMatrix()`) -> **PASS**
- `inst.rotationQuaternion = null;` before rotation -> **PASS**
- Asset preloading multi-mesh GLB support -> **PASS**
- Asset fallback handling -> **PASS**
- Grid boundary safety (`x=0, x=width-1, y=0, y=height-1`) in `isWalkable()` -> **PASS**
- Main thread microtask yielding (`gy % 10 === 0` and pre-merge `setTimeout(0)`) -> **PASS**

---

## 4. Coverage Gaps & Unverified Items

- **Visual Rendering**: GLB asset loading and mesh placement were verified via static analysis, type checking, and production build. Live browser visual rendering of room corners should be visually inspected after applying the outer corner rotation fix.

---

## 5. Logic Chain

1. `isWalkable()` safely guards against `gx < 0 || gx >= grid.width || gy < 0 || gy >= grid.height`, returning `false` for out-of-bounds checks without throwing `TypeError`.
2. `TileMap.ts` enforces `rotationQuaternion = null` on all instanced meshes, enabling Euler Y-rotation transformation.
3. Colliders are merged into `mergedFloors` and `mergedWalls` with correct pickability (`isPickable = true` for floors, `false` for walls), collision flag (`checkCollisions = true`), and frozen world matrices (`freezeWorldMatrix()`).
4. Microtask yields break up execution during row loop instancing and collision mesh merging.
5. In `Autotiler.ts`, diagonal bitmask evaluation (`fullMask & 16`, `32`, `64`, `128`) returns inverted Y-rotations (`Math.PI` offset), causing outer corner wall tiles to face away from room interiors into outer wall masses. Fixing these rotations resolves corner visual alignment.

---

## 6. Verification Method

To verify the fix for Finding 1:
1. Edit `src/dungeon/Autotiler.ts` to update lines 97-108 with the corrected rotations (`0`, `Math.PI / 2`, `Math.PI`, `(3 * Math.PI) / 2`).
2. Run `pnpm exec tsc --noEmit` to confirm zero compilation errors.
3. Run `pnpm run build` to confirm production build success.
4. Launch `pnpm run dev` and inspect generated dungeon room outer corners to confirm wall panels face inward towards the room interior.
