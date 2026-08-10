## 2026-08-05T20:47:01Z

You are Phase 4 Implementation Remediation Worker (teamwork_preview_worker).

Working directory: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p4_iter2

Read the original request: c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Read project scope: c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read previous worker handoff: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p4\handoff.md
Read gate status: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\orchestrator\GATE_STATUS.md

Relevant skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\input-systems\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ui-ux\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Remediation Tasks for Phase 4:
1. Fix StatType.MaxMana in StatsComponent.ts:
   - Include StatType.MaxMana in statsToCalculate in StatsComponent.recalculateAll() so Healer's passive (+20% MaxMana) correctly scales MaxMana.
2. Fix 120ms Input Buffering Cooldown Queueing:
   - In InputManager.ts / Player.ts: Do NOT prematurely consume/discard a buffered skill input if the skill is currently on cooldown. Peek or conditionally consume so that when cooldown expires within the 120ms window, the skill executes.
3. Fix GUI Modal Click Bleedthrough:
   - In InputManager.ts: Ensure pointer clicks on GUI elements (TalentUI, ArchetypeUI, modal dialogs) do NOT fire onPointerClickWorld ground movement / click-to-move pathing underneath open UI modal windows.
4. Fix Visual Ring Material Memory Leak in Skill.ts:
   - In Skill.ts: Explicitly call mat.dispose() when ring mesh is disposed after animation finish.
5. Clean Observer Disposal:
   - Ensure TownHubAltar, TalentUI, ArchetypeUI, and HUD clean up all scene/GUI event observers in their dispose() methods.

Run Verification:
- `pnpm exec tsc --noEmit`
- `pnpm run build`

Write your handoff report to: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p4_iter2\handoff.md
Notify parent via send_message when complete.
