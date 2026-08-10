# Analysis & Concrete Fix Strategy — Challenger 2 Findings Audit

## Executive Summary

During Iteration 1, Challenger 2 issued a **REJECT** verdict on the M4/M5 E2E test suite due to 5 critical test harness and application defects:
1. **Unprotected Altar Interaction**: `TownHubAltar.interact()` lacked internal player position/proximity validation.
2. **Town Hub Mesh Leak**: `src/index.ts` level transition (`transitionToDungeon()`) failed to dispose Town Hub root node and meshes, leaving 136 town meshes lingering in the scene graph.
3. **Tautological Assertions**: `tier2-boundary-corner.test.ts` performed 320 checks of `mask.fullMask >= 0` which is a mathematical tautology in JS.
4. **Weak Type Assertions**: `tier1-feature-coverage.test.ts` checked `typeof yRotation === "number"` instead of exact value `0`.
5. **Test-Side Disposal Hacks**: Tier 3 and Tier 4 tests manually invoked `builtTown.rootNode.dispose()` inside the test script, masking the production memory leak in `src/index.ts`.

This document details the exact root cause analysis and step-by-step fix strategy for each finding.

---

## 1. TownHubAltar Proximity Validation (`src/entities/TownHubAltar.ts`)

### Problem & Evidence
- **File**: `src/entities/TownHubAltar.ts` (lines 67–76)
- **Defect**: `interact()` took 0 parameters and unconditionally notified `onInteract` observers regardless of player position:
  ```typescript
  public interact(): void {
    this.onInteract.notifyObservers();
  }
  ```
- `tier2-boundary-corner.test.ts` hid this bug by wrapping `interact()` in a test helper `attemptInteraction(playerPos)` that checked proximity before calling `altar.interact()`.

### Concrete Fix Strategy
1. **Update `TownHubAltar.ts`**:
   Update `interact(playerPos?: Vector3): boolean` to validate proximity internally:
   ```typescript
   /**
    * Triggers interaction with the altar if the player is within proximity (<= 3.0m).
    * @param playerPos Optional player position vector to validate proximity.
    * @returns true if interaction succeeded; false if rejected due to proximity or invalid vector.
    */
   public interact(playerPos?: Vector3): boolean {
     if (playerPos) {
       if (isNaN(playerPos.x) || isNaN(playerPos.y) || isNaN(playerPos.z)) {
         return false;
       }
       if (!this.isPlayerInProximity(playerPos)) {
         return false;
       }
     }
     this.onInteract.notifyObservers();
     return true;
   }
   ```
2. **Update Application Callers (`src/index.ts`)**:
   Pass `player.position` when invoking `townHubAltar.interact(player.position)` in keyboard listeners:
   ```typescript
   } else if (e.code === "KeyE" || e.code === "KeyF") {
     townHubAltar.interact(player.position);
   }
   ```
3. **Update Test Assertions (`tests/tier2-boundary-corner.test.ts`)**:
   Remove test-side `attemptInteraction` helper. Directly invoke `altar.interact(player.position)` and assert:
   ```typescript
   const result = altar.interact(player.position);
   assert(result === false, "Interaction attempt refused when outside proximity (dist 5.0m)");
   assert(transitionTriggered === false, "onInteract observable did not fire for refused interaction");
   ```

---

## 2. Town Hub Scene Hierarchy & Resource Leak Cleanup (`src/index.ts`, `src/town/TownHub.ts`)

### Problem & Evidence
- **File**: `src/index.ts` (lines 167–233)
- **Defect**: When `transitionToDungeon()` ran during level transition, it created the procedural dungeon, `TileMap`, and `NavMeshManager`, but **never disposed `builtTown.rootNode` or `townHub`**.
- **Impact**: 136 town meshes, colliders, and point lights remained active in the Babylon scene graph alongside the dungeon meshes.

### Concrete Fix Strategy
1. **Update `transitionToDungeon()` in `src/index.ts`**:
   Call disposal routines on `builtTown.altar`, `builtTown.rootNode`, and `townHub` at the beginning of the level transition:
   ```typescript
   const transitionToDungeon = async () => {
     if (inDungeon) return;
     inDungeon = true;
     hud.showPickupNotification("Entering Procedural Dungeon...", "#3B82F6");

     // Dispose Town Hub resources to prevent scene graph node & mesh leakage
     if (builtTown) {
       if (builtTown.altar) {
         builtTown.altar.dispose();
       }
       if (builtTown.rootNode) {
         builtTown.rootNode.dispose(false, true);
       }
     }
     if (townHub) {
       townHub.dispose();
     }

     const generator = new Generator({ width: 40, height: 40 });
     // ... rest of dungeon loading logic
   };
   ```
2. **Guard Render Loop Proximity Updates (`src/index.ts`)**:
   Guard render loop calls so `townHubAltar` proximity checks are skipped once transitioning or after disposal:
   ```typescript
   if (!inDungeon && townHubAltar && !townHubAltar.mesh.isDisposed()) {
     if (townHubAltar.isPlayerInProximity(player.position)) {
       hud.showInteractionPrompt("Press [E] or (A) to Access Archetype Altar");
     } else {
       hud.hideInteractionPrompt();
     }
   } else {
     hud.hideInteractionPrompt();
   }
   ```

---

## 3. Bitmask & Autotiler Edge Boundary Assertions (`tests/tier2-boundary-corner.test.ts`)

### Problem & Evidence
- **File**: `tests/tier2-boundary-corner.test.ts` (lines 80–93)
- **Defect**: Edge scan loop over 160 perimeter cells generated 320 assertions of `assert(mask.fullMask >= 0)`. Since bitwise operations in JS always produce numbers `>= 0`, this check is a mathematical tautology.

### Concrete Fix Strategy
1. **Replace Tautology Loop with Strict Autotiler Invariants**:
   Validate bitmask range limits, valid GLB model selection, discrete cardinal Y-rotations, and boundary orientation invariants:
   ```typescript
   const validWallModels = [
     "template-wall.glb",
     "template-wall-detail-a.glb",
     "template-wall-corner.glb",
     "template-wall-half.glb",
   ];
   const validRotations = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

   for (let i = 0; i < 40; i++) {
     const edgePoints = [
       { gx: 0, gy: i },
       { gx: 39, gy: i },
       { gx: i, gy: 0 },
       { gx: i, gy: 39 },
     ];
     for (const p of edgePoints) {
       const mask = getNeighborBitmask(grid, p.gx, p.gy);
       const sel = selectWallTile(grid, p.gx, p.gy);

       assert(
         mask.fullMask >= 0 && mask.fullMask <= 255,
         `Edge cell (${p.gx}, ${p.gy}) fullMask is valid 8-bit uint (got ${mask.fullMask})`
       );
       assert(
         mask.cardinalMask >= 0 && mask.cardinalMask <= 15,
         `Edge cell (${p.gx}, ${p.gy}) cardinalMask is valid 4-bit uint (got ${mask.cardinalMask})`
       );
       assert(
         validWallModels.includes(sel.modelName),
         `Edge cell (${p.gx}, ${p.gy}) selected valid wall GLB model '${sel.modelName}'`
       );
       assert(
         validRotations.some((rot) => Math.abs(sel.yRotation - rot) < 1e-4),
         `Edge cell (${p.gx}, ${p.gy}) yRotation is valid cardinal angle (got ${sel.yRotation})`
       );
     }
   }
   ```

---

## 4. Exact Numerical Rotation Assertions (`tests/tier1-feature-coverage.test.ts`)

### Problem & Evidence
- **File**: `tests/tier1-feature-coverage.test.ts` (line 132)
- **Defect**: Checked `typeof wallSel.yRotation === "number"`. In JavaScript, `typeof NaN === "number"` evaluates to `true`, allowing `NaN` to pass silently.

### Concrete Fix Strategy
1. **Contract Check**: `Autotiler.ts` line 98 returns `{ modelName: "template-wall-corner.glb", yRotation: 0 }` for Outer Corner with NE diagonal walkable.
2. **Update Test Assertion**:
   Replace line 132 in `tests/tier1-feature-coverage.test.ts` with exact value check:
   ```typescript
   assert(wallSel.yRotation === 0, "Outer Corner Y-rotation is exactly 0 for NE diagonal walkable");
   ```

---

## 5. Audit Genuine Application-Level Level Transitions (`tests/tier3-cross-feature.test.ts`, `tests/tier4-gameplay-loop.test.ts`)

### Problem & Evidence
- **Files**: `tests/tier3-cross-feature.test.ts` (lines 80–86), `tests/tier4-gameplay-loop.test.ts` (lines 79–93)
- **Defect**: Both tests manually executed `builtTown.altar.dispose()`, `builtTown.rootNode.dispose()`, and `townHub.dispose()` inside the test runner script before asserting scene hierarchy cleanliness, masking the production bug in `src/index.ts`.

### Concrete Fix Strategy
1. **Remove Manual Disposal Hacks from Tests**:
   Remove manual calls to `builtTown.rootNode.dispose()` and `townHub.dispose()` from Tier 3 and Tier 4 tests.
2. **Audit Genuine Transition Logic**:
   In Tier 3 and Tier 4 tests, perform level transition through application transition routines (such as calling `transitionToDungeon()` or encapsulating transition lifecycle cleanup in `GameStateManager`).
3. **Verify Scene Hierarchy Cleanliness**:
   Directly assert `assertSceneHierarchyClean(ctx.scene, "townHubRoot")` and verify `leakedTownNodes.length === 0` and `leakedTownMeshes.length === 0` after the transition completes.
