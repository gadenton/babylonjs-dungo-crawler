## 2026-08-06T12:26:53Z
You are the Implementation Worker for Phase 6 (Visual Pipeline, Versioned Save Persistence, Save UI, Audio Ducking, and E2E Integration).

Working directory: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p6

Read:
1. ORIGINAL_REQUEST: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\ORIGINAL_REQUEST.md
2. Master Plan: c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
3. Explorer 1 Handoff (Visual Pipeline): c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p6_1\handoff.md
4. Explorer 2 Handoff (Save Persistence & UI): c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p6_2\handoff.md
5. Explorer 3 Handoff (Audio & E2E Integration): c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p6_3\handoff.md
6. Game Dev Skills:
   - `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md`
   - `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\save-systems\SKILL.md`
   - `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\audio-design\SKILL.md`
   - `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ui-ux\SKILL.md`

Tasks:
1. **Visual Pipeline**: Create `src/rendering/VisualPipelineManager.ts` to set up Babylon.js `DefaultRenderingPipeline` with SSAO2, Bloom, ACES ToneMapping, and graphic quality presets (`low`, `medium`, `high`, `ultra`). Integrate with `Engine.ts` and `src/index.ts`.
2. **Versioned Save Persistence**:
   - Implement `src/core/StorageAdapter.ts` with LocalStorage wrapper, key prefixing, schema versioning (`version: 1`), and upgrade migration registry (`Map<number, (oldData: any) => any>`).
   - Implement `src/persistence/SaveManager.ts` to serialize/deserialize `GameSaveStateV1` (Player level, exp, current HP/MP, archetype, talent allocations, inventory items, gold, equipment slots). Wire auto-save triggers (`onArchetypeSwapped`, `onItemEquipped`, `onLevelUp`).
3. **Save UI Overlay**:
   - Implement `src/ui/SaveLoadUI.ts` using `@babylonjs/gui` with manual save/load slot buttons, auto-save notifications, and reset progress options. Integrate into `HUD.ts` / `src/index.ts`.
4. **Audio Ducking & Polish**:
   - Ensure `src/audio/AudioManager.ts` implements Web Audio API gain buses (Master, Music, SFX, UI), sidechain ducking during skill SFX playback, and hit-stop audio feedback.
5. **E2E Integration & Verification Harness**:
   - Integrate all 11 core systems cleanly in `src/index.ts`.
   - Write `tests/phase6_e2e_verification_harness.ts` testing the complete game loop end-to-end headlessly via NullEngine.
6. **Build & Test Verification**:
   - Run `pnpm exec tsc --noEmit` to verify 0 TypeScript errors.
   - Run `pnpm run build` to verify Vite bundle generation.
   - Run `pnpm exec tsx tests/phase6_e2e_verification_harness.ts` and all phase test harnesses.
