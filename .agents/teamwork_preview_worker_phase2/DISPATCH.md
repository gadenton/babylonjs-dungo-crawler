## 2026-08-04T21:45:37Z
You are Phase 2 Implementation Worker.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_worker_phase2

MANDATORY FIRST STEP: Read the original request at:
c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Also read PROJECT.md at:
c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read Phase 2 technical blueprints:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase2_1\analysis.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase2_2\analysis.md

MANDATORY DOMAIN SKILLS: Read and apply:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\procedural-gen\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\performance-optimization\SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. Create your working directory `.agents/teamwork_preview_worker_phase2/` if needed.
2. Initialize `progress.md` and `BRIEFING.md`.
3. Implement `src/dungeon/Generator.ts`:
   - Grid BSP room/corridor algorithm on a 2m x 2m grid ($40 \times 40$ cells).
   - Seedable PRNG (Mulberry32).
   - Subdivide into non-overlapping rooms, connect with 2-tile wide L-corridors, place door cells, start stairs, and exit stairs.
   - Include BFS flood fill validation ensuring player start can reach exit stairs and all rooms.
4. Implement `src/dungeon/TileMap.ts`:
   - Load Kenney 3D Dungeon & Cave GLB models from `public/assets/dungeon/` and `public/assets/cave/`.
   - Position tiles at `(gx * 2.0 + 1.0, 0.0, gz * 2.0 + 1.0)`.
   - Merge floor meshes per material using `BABYLON.Mesh.MergeMeshes(floorMeshes, true, true, undefined, false, false)` to produce `mergedFloors`.
   - Merge wall meshes per material using `BABYLON.Mesh.MergeMeshes(wallMeshes, true, true, undefined, false, false)` to produce `mergedWalls`, and set `mergedWalls.checkCollisions = true`.
5. Implement `src/dungeon/NavMeshManager.ts`:
   - Async WASM initialization (`init()`).
   - Extract world vertices and indices from `mergedFloors` and build Recast solo NavMesh using `generateSoloNavMesh`.
   - Implement `findPath(start: Vector3, end: Vector3): Vector3[]`.
   - Include `createDebugMesh(scene)` method rendering green translucent Debug Mesh overlay.
6. Update `src/index.ts` bootstrapper:
   - Instantiate `Engine`, `Generator`, `TileMap`, `NavMeshManager`, `CameraRig`, `InputManager`, `Player`.
   - Generate dungeon level, build merged meshes, generate NavMesh.
   - Wire `InputManager.onPointerClickWorld` -> `NavMeshManager.findPath` -> `Player.setNavPath`.
   - Player position placed at start stairs.
7. Verify build and typecheck:
   - Run `pnpm exec tsc --noEmit`
   - Run `pnpm run build`
   Ensure both exit with 0 code.
8. Write `changes.md` and `handoff.md`.
9. Send completion message to parent orchestrator with build/typecheck results.
