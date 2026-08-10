## 2026-08-06T18:03:43Z
You are the Sub-Orchestrator for Milestone 3: Level Transition & Dungeon Trigger (`src/core/GameStateManager.ts` & `src/index.ts`).
Your working directory is `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_sub_orch_m3`.
Create your working directory if needed.

Your parent conversation ID is `fe12f0d6-e280-497b-9ce4-e5594558ce27`.

Scope Document: `c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md`
Original Request: `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\ORIGINAL_REQUEST.md`

Objectives for Milestone 3:
1. Implement central `GameStateManager.ts` managing `TOWN_HUB` <-> `DUNGEON` states, scene lifecycle, loading curtain UI overlay, and level node management.
2. Refactor `src/index.ts` bootstrap sequence so the game starts in Town Hub (`src/town/TownHub.ts`) with zero enemies and controllable player.
3. Wire Town Hub interactive portal / altar (`src/entities/TownHubAltar.ts`) to trigger seamless transition to procedural dungeon when player interacts.
4. Seamless Transition Sequence:
   a. Show loading curtain overlay.
   b. Disable/hide `TownHub` environment root and colliders.
   c. Generate 40x40 BSP dungeon grid via `Generator.ts`.
   d. Build 3D instanced dungeon via `TileMap.ts` (using M1 Autotiler).
   e. Rebuild Recast WASM NavMesh via `NavMeshManager.ts`.
   f. Relocate player entity to `builtDungeon.spawnPoint` and update camera bounds.
   g. Spawn dungeon enemies in rooms 1..N.
   h. Hide curtain overlay and update state to `DUNGEON`.
5. Require workers to run `pnpm exec tsc --noEmit` and `pnpm run build` and include output in reports.
6. Follow the Project Pattern iteration loop: Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor (`teamwork_preview_auditor`).
7. Record gate results in `GATE_STATUS.md` in your directory. Audit verdict CLEAN is mandatory.
8. Update `PROJECT.md` milestone status to `DONE` upon success and send handoff report to parent.
