## 2026-08-06T23:52:48Z
You are the Project Orchestrator leading the implementation for the user request described in `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\ORIGINAL_REQUEST.md`.

Your working directory is `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\orchestrator`.
Please create your working directory if needed, initialize `BRIEFING.md`, `plan.md`, and `progress.md`.

Objectives:
1. R1: Fix dungeon tile connectivity in `TileMap.ts` using neighbor lookup to select appropriate Kenney 3D Modular Dungeon Kit pieces (straight walls, corners, end caps, detail floors, doors) and rotations, while strictly preserving GPU instancing (`createInstance()`).
2. R2: Implement a static town hub starting area with no enemies, interactive transition point (portal/altar), controllable player, and seamless transition to procedural dungeon generation when entering the dungeon.
3. Ensure `pnpm exec tsc --noEmit` passes with 0 errors and `pnpm run build` succeeds.
4. Maintain `progress.md` regularly so Sentinel and user can track progress.
5. When all work and verification are complete, notify Sentinel of victory claim.
