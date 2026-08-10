# Handoff Report: Phase 3 Juice & Audio Systems Specification

**Agent:** Phase 3 Technical Explorer 2  
**Date:** 2026-08-05  
**Working Directory:** `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase3_2`  
**Handoff Type:** Soft Handoff (Investigation & Specification Phase Complete)

---

## 1. Observation

- **Project Constraints & Requirements**:
  - `ORIGINAL_REQUEST.md:29`: Requirement R3 demands combat juice (bouncing floating damage text, 100ms white hit flash, freeze frames) and 3D spatial Web Audio API sound management with bus mixing & sidechain ducking.
  - `PROJECT.md:29-30`: Feature 11 (`JuiceOverlay.ts`) and Feature 12 (`AudioManager.ts`) form the visual/audio polish tier of Milestone 3.
  - `@babylonjs/gui` (v9.19.0) and `@babylonjs/core` (v9.0.0) are installed in `package.json:12-13`.
- **Existing Architecture**:
  - `src/core/Engine.ts`: Contains `GameEngine` class wrapping Babylon `Engine` and `Scene` with `runRenderLoop` and `stopRenderLoop`.
  - `src/camera/CameraRig.ts`: Manages isometric camera position, focus vector, and screen shake trauma.
- **Relevant Skills Applied**:
  - `game-feel`: Principles of layered feedback (damage pop, white flash, freeze frames) and time-scale micro-pauses.
  - `audio-design`: Bus/mixer architecture, decibel gain scale, sidechain ducking under impacts, pitch variation, and Web Audio user interaction unlock.

---

## 2. Logic Chain

1. **Juice Overlay (`src/ui/JuiceOverlay.ts`)**:
   - Floating Combat Text (FCT) requires low overhead to handle dense mob combat. Using a pre-allocated pool of 40 `@babylonjs/gui` `TextBlock` instances avoids continuous GC allocations. Projection from 3D world space to 2D UI screen space via `Vector3.Project` combined with parabolic velocity and cubic ease-out scale pop ensures smooth 60 FPS floating numbers.
   - Material hit flashing requires zero material leaks. Storing original material emissive properties (`emissiveColor` and `emissiveIntensity`) in a active flash queue (`Map<string, FlashRecord>`) guarantees clean restoration after 100ms across `StandardMaterial` and `PBRMaterial`.
   - Freeze frames/hit-stop sell critical impact weight. Invoking `engine.stopRenderLoop()` with a 50ms-100ms `setTimeout` resume guard provides crisp hit-stop micro-freezes without corrupting engine delta-time state.

2. **Audio Manager (`src/audio/AudioManager.ts`)**:
   - Direct Web Audio API usage ensures zero external audio library bloat. Creating a 4-bus hierarchy (`Master`, `Music`, `SFX`, `UI`) with `GainNode` routing allows independent logarithmic decibel control (`setBusVolumeDb`).
   - 3D Spatial Audio uses `PannerNode` with HRTF panning and inverse distance attenuation. Updating `AudioContext.listener` position/orientation in sync with `CameraRig` each frame ensures accurate directional audio.
   - Heavy impact events trigger sidechain ducking on `musicDuckingGain`, dropping music volume by -10 dB to -12 dB with a 15ms attack and 300ms release to let impact SFX slice through the mix cleanly.
   - Browser autoplay policies require user interaction unlocking. Attaching one-shot `pointerdown`/`keydown` listeners to resume `AudioContext` handles autoplay restrictions safely.

---

## 3. Caveats

- **Audio Asset Files**: Sound effects and music `.wav`/`.mp3` files are not yet included in `public/assets/audio/`. Synthetic oscillator fallback methods (`playSyntheticBeep`, `playSyntheticSpatialBeep`) were specified so the audio engine functions seamlessly out of the box during developer testing prior to asset acquisition.
- **Hit-Stop & Multi-Hit Stacking**: If multiple critical hits land within a 50ms window, the timer resets to prevent duplicate `runRenderLoop` callbacks, ensuring stability during multi-target area-of-effect (AoE) skills.

---

## 4. Conclusion

The technical specifications for `src/ui/JuiceOverlay.ts` and `src/audio/AudioManager.ts` are completely defined, fully aligned with Babylon.js v9 and Web Audio API standards, and detailed in `.agents/teamwork_preview_explorer_phase3_2/analysis.md`. The design guarantees zero memory leaks, high-performance object pooling, decoupled event integration, and production-grade audio-visual polish.

---

## 5. Verification Method

To verify the implementation once coded:

1. **TypeScript Build Verification**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```
   Must pass without any type errors or missing symbol warnings.

2. **Juice Systems Inspection**:
   - Inspect `JuiceOverlay.ts` for object pooling of `TextBlock` controls (40 pre-allocated).
   - Check `triggerHitFlash` for `emissiveColor` restore logic.
   - Verify `triggerHitStop` calls `engine.stopRenderLoop()` and resumes cleanly.

3. **Audio Systems Inspection**:
   - Verify 4 audio buses (`master`, `music`, `sfx`, `ui`) in `AudioManager.ts`.
   - Check `dbToLinear` math: $10^{(\text{dB}/20)}$.
   - Confirm spatial `PannerNode` configuration and `triggerSidechainDucking` gain scheduling.

---

## Remaining Work (For Implementation Phase)

1. Implement `src/ui/JuiceOverlay.ts` adhering strictly to the specification in `analysis.md`.
2. Implement `src/audio/AudioManager.ts` adhering strictly to the specification in `analysis.md`.
3. Integrate `JuiceOverlay` and `AudioManager` into `src/combat/DamageSystem.ts` and main render loop tick.
