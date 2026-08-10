# Project Orchestration Plan — Dungo Crawler Enhancements

## Core Requirements
1. **R1: Tile Connectivity & Modular Pieces** (`TileMap.ts`):
   - Neighbor lookup algorithm to select appropriate Kenney 3D Modular Dungeon Kit pieces (straight walls, corners, end caps, detail floors, doors) and rotations.
   - Strictly preserve GPU instancing (`createInstance()`).
2. **R2: Static Town Hub & Level Transition**:
   - Static starting area (town hub) with no enemies.
   - Interactive transition point (portal/altar).
   - Controllable player in town.
   - Seamless transition to procedural dungeon generation upon entering portal.
3. **Build & Quality Gates**:
   - `pnpm exec tsc --noEmit` passes with 0 errors.
   - `pnpm run build` succeeds.
   - All tests pass.
   - Integrity forensics audit passes (CLEAN).

## Phase 0: Survey & Specification Mining
- Dispatch 3 parallel Explorers (`explorer_1`, `explorer_2`, `explorer_3`) to analyze existing codebase, available GLTF/GLB models in `public/` / `assets/`, current `TileMap.ts` implementation, player movement / scene management, build tools, and test suites.
- Consolidate survey into `PROJECT.md`.

## Phase 1: Dual-Track Execution
- **Track 1: E2E & Verification Suite Orchestration**:
  - Build test suite covering town hub, level transition, tile map mesh instancing, neighbor connectivity, and build/typecheck validation.
- **Track 2: Core Feature Implementation**:
  - Milestone 1: Tile Connectivity & Asset Mesh Selection (`TileMap.ts` refactor with neighbor bitmask / lookup & instancing).
  - Milestone 2: Town Hub Area & Player Controls (Scene / state setup, town layout, interaction).
  - Milestone 3: Seamless Level Transition & Procedural Dungeon Trigger.

## Phase 2: Final Verification & Audit Gate
- Reviewer, Challenger, and Forensic Auditor verification across all milestones.
- Ensure 100% build pass and victory claim to Sentinel.
