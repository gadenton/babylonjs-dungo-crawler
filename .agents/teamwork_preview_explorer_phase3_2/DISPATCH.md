## 2026-08-05T15:40:58Z

You are Phase 3 Technical Explorer 2.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase3_2

MANDATORY FIRST STEP: Read the original request at:
c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Also read PROJECT.md at:
c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read the relevant skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\audio-design\SKILL.md

Task:
1. Create your working directory `.agents/teamwork_preview_explorer_phase3_2/` if needed.
2. Initialize `progress.md` and `BRIEFING.md`.
3. Design exact technical specification for Phase 3 Juice & Audio Systems:
   - `src/ui/JuiceOverlay.ts`: Bouncing 3D/GUI floating damage numbers (white for normal, gold/large for crit, green for heal), 100ms enemy white hit flash (`emissiveColor` pulse), hit-stop freeze frames (`engine.stopRenderLoop()` / micro-pause or delta-time scaling).
   - `src/audio/AudioManager.ts`: Web Audio API 3D spatial sound management, Master/Music/SFX/UI audio buses, gain in decibels, sidechain ducking (ducking music/ambient SFX during heavy impact hits), Web Audio user interaction unlock listener.
4. Write your findings to `.agents/teamwork_preview_explorer_phase3_2/analysis.md` and soft handoff report to `.agents/teamwork_preview_explorer_phase3_2/handoff.md`.
5. Send a message to parent orchestrator when complete.
