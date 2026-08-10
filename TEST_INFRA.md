# Test Infrastructure Specification & Developer Guide

## 1. Overview
The Babylon.js Dungo Crawler testing framework is an opaque-box, requirement-driven end-to-end testing suite built using Babylon.js `NullEngine` and executed via Node `npx tsx`. It enables headless execution without browser DOM dependencies or WebGL hardware requirements while maintaining full operational accuracy for scene graphs, vector transformations, mesh collisions, bitmask autotiling, and WASM pathfinding.

## 2. Test Runner & Execution Environment
- **Test Runner**: `npx tsx` (TypeScript Execute for Node)
- **Engine Framework**: Babylon.js `NullEngine` (`@babylonjs/core/Engines/nullEngine`)
- **Navigation Engine**: `recast-navigation` (Recast WASM)
- **Type Checking**: `pnpm exec tsc --noEmit`

## 3. Test Harness Architecture (`tests/harness.ts`)
The test harness provides:
- **`createHeadlessTestContext(options)`**: Initializes a headless `NullEngine` instance with active `Scene` and `TargetCamera` (preventing render errors).
- **`setupMockAssetLoader(scene)`**: Polyfills/intercepts `SceneLoader.ImportMeshAsync` to return lightweight primitive mock source meshes when Node lacks browser XHR capabilities, enabling full instancing and scene graph verification.
- **Opaque Assertion Utilities**:
  - `assertGridDimensions`: Validates BSP grid width, height, and cell metadata arrays.
  - `assertMergedColliders`: Validates presence, collision settings, picking flags, and visibility of merged floor and wall colliders.
  - `assertNavMeshPath`: Validates pathfinding query generation over Recast WASM NavMesh.
  - `assertProximityInteraction`: Validates distance-based entity interaction logic.
  - `assertSceneHierarchyClean`: Verifies disposal of previous level/town root nodes with 0 leaked nodes.

## 4. Test Tier Structure & Organization
- `tests/tier1-feature-coverage.test.ts` (Tier 1: Basic Feature Coverage)
  - TileMap loading & instancing (`createInstance()`, `mergedFloors`, `mergedWalls`)
  - 8-neighbor connectivity bitmask classification (straight wall, inner corner, outer corner, end cap, detail variants)
  - TownHub static 10x10 plaza creation (floor colliders, perimeter walls, spawn point, 0 enemies)
  - Player spawning & initial transform/metadata (`Vector3(10, 0, 6)`, `isAlive`, `health`, tags)
  - Portal proximity interaction (`dist <= 3.0m` trigger check)

- `tests/tier2-boundary-corner.test.ts` (Tier 2: Boundary & Corner Conditions)
  - Grid edge bitmasking at boundary cells `(0,0)`, `(39,39)`, `(0,39)`, `(39,0)` without index out-of-bounds errors
  - Invalid transition inputs (`dist > 3.0m` proximity refusal, uninitialized state safety)
  - Rapid interaction triggers (stress test 100 rapid `[E]` keypresses within 10ms ensuring single idempotent transition)

- `tests/tier3-cross-feature.test.ts` (Tier 3: Cross-Feature Integration Chains)
  - Town Hub player movement -> Altar portal trigger -> Town Hub disposal -> BSP dungeon grid generation -> `TileMap` GLB instantiation -> Recast WASM NavMesh rebuild.

- `tests/tier4-gameplay-loop.test.ts` (Tier 4: Full Gameplay Loop & Integration)
  - End-to-end opaque gameplay loop from Town Hub bootstrap to altar interaction, procedural dungeon generation, enemy spawning, and pathfinding.
  - Scene graph hierarchy audit verifying 0 leaked Town Hub nodes.
  - Zero TypeScript compilation errors (`pnpm exec tsc --noEmit`).

## 5. Coverage Goals
- **Unit Feature Coverage**: 100% of Milestone 1 feature contracts (`TileMap`, `Autotiler`, `TownHub`, `TownHubAltar`, `Player`).
- **Edge & Stress Coverage**: 100% of boundary conditions (grid edges, out-of-range interactions, re-entrant event spam).
- **Integration Coverage**: Full multi-step level lifecycle transition and pathfinding recalculation.
- **Hierarchy Integrity**: Strict 0-leak assertion on scene node disposal across level transitions.

## 6. Execution Commands
To run the E2E test suite and type check:

```bash
# Run Tier 1 Feature Coverage Tests
npx tsx tests/tier1-feature-coverage.test.ts

# Run Tier 2 Boundary & Corner Tests
npx tsx tests/tier2-boundary-corner.test.ts

# Run Tier 3 Cross-Feature Integration Tests
npx tsx tests/tier3-cross-feature.test.ts

# Run Tier 4 Full Gameplay Loop & Scene Audit Tests
npx tsx tests/tier4-gameplay-loop.test.ts

# Verify TypeScript Compilation
pnpm exec tsc --noEmit
```
