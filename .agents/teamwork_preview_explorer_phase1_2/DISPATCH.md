## 2026-08-04T21:28:48Z
You are Phase 1 Technical Explorer 2.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase1_2

MANDATORY FIRST STEP: Read the original request at:
c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Also read PROJECT.md at:
c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read the relevant skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\camera-systems\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\input-systems\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md

Task:
1. Create your working directory `.agents/teamwork_preview_explorer_phase1_2/` if it does not exist.
2. Initialize `progress.md` and `BRIEFING.md`.
3. Design the exact technical specification for Phase 1 Camera, Input & Player Systems:
   - `src/camera/CameraRig.ts`: Fixed isometric camera (45° pitch, 45° yaw), exponential follow smoothing (`1 - exp(-rate * dt)`), mouse/stick look-ahead offset, trauma-decay screen shake hook (`trauma^2 * noise` additive offset without mutating player transform).
   - `src/core/InputManager.ts`: Unified mouse click-to-move, WASD key tracking, gamepad left stick tracking, instant direction vector override, 120ms input buffer for skill/dodge triggers, dynamic KBM/Gamepad UI prompt swap observable.
   - `src/entities/Entity.ts` & `src/entities/Player.ts`: Base entity class, player mesh creation/loading, ellipsoid collision configuration (`mesh.checkCollisions = true`, `ellipsoid`, `ellipsoidOffset`), movement execution with wall sliding.
4. Write your findings to `.agents/teamwork_preview_explorer_phase1_2/analysis.md` and soft handoff report to `.agents/teamwork_preview_explorer_phase1_2/handoff.md`.
5. Send a message to the orchestrator (parent) when complete.
