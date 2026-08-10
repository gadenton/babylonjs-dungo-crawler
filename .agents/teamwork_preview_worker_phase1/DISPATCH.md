## 2026-08-04T21:29:39Z

You are Phase 1 Implementation Worker.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_worker_phase1

MANDATORY FIRST STEP: Read the original request at:
c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Also read PROJECT.md at:
c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read the technical analysis reports from Explorers:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase1_1\analysis.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase1_2\analysis.md

MANDATORY DOMAIN SKILLS: Read and apply:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\camera-systems\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\input-systems\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. Create your working directory `.agents/teamwork_preview_worker_phase1/` if it does not exist.
2. Initialize your `progress.md` and `BRIEFING.md`.
3. Install missing dependencies using run_command:
   Run `pnpm add @babylonjs/gui@^9.0.0 recast-navigation-js`
4. Copy Kenney GLB assets:
   Run PowerShell command to create `public/assets/dungeon/`, `public/assets/cave/`, `public/assets/weapons/`, `public/assets/characters/player/`, `public/assets/characters/enemies/`, `public/assets/props/` and copy GLB models from `C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0\3D assets\`. Include `colormap.png` in dungeon/cave asset folders.
5. Implement source code files:
   - `src/core/Engine.ts`: Engine lifecycle, canvas `#renderCanvas`, Scene, hemispheric ambient light, directional main light with shadow generator, continuous render loop, resize observer, disposal.
   - `src/camera/CameraRig.ts`: Fixed 45°/45° isometric perspective, exponential follow smoothing (`1 - exp(-rate * dt)`), target look-ahead offset, trauma-decay screen shake offset hook (`trauma^2 * noise`).
   - `src/core/InputManager.ts`: Hybrid click-to-move, WASD keys, Gamepad left stick with 0.20 radial deadzone, instant vector override, 120ms sliding window input buffer, dynamic KBM/Gamepad active device prompt swap observable.
   - `src/entities/Entity.ts` & `src/entities/Player.ts`: Base Entity class, Player controller with fallback capsule / GLB mesh, Babylon ellipsoid collisions (`mesh.checkCollisions = true`, `ellipsoid = Vector3(0.45, 0.9, 0.45)`, `ellipsoidOffset = Vector3(0, 0.9, 0)`), wall sliding execution via `moveWithCollisions()`.
   - `src/index.ts`: Bootstrapper wiring Engine, InputManager, CameraRig, Player.
6. Verify build and typecheck:
   - Run `pnpm exec tsc --noEmit`
   - Run `pnpm run build`
   Ensure both commands succeed with 0 exit code.
7. Write your changes summary in `.agents/teamwork_preview_worker_phase1/changes.md` and handoff report in `.agents/teamwork_preview_worker_phase1/handoff.md`.
8. Send a completion message to the parent orchestrator with the build/typecheck outputs.
