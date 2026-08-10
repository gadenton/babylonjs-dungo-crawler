# Handoff Report: Phase 6 Technical Exploration — Audio Bus Polish & E2E Integration

## 1. Observation

### 1.1 Audio Architecture Inspection (`src/audio/AudioManager.ts`)
* **Audio Bus Graph Routing** (Lines 44-64):
  ```typescript
  // Node Hierarchy Routing:
  // Music -> MusicDucking -> Master
  this.musicGain.connect(this.musicDuckingGain);
  this.musicDuckingGain.connect(this.masterGain);

  // SFX -> Master
  this.sfxGain.connect(this.masterGain);

  // UI -> Master
  this.uiGain.connect(this.masterGain);

  // Master -> Destination
  this.masterGain.connect(this.audioCtx.destination);
  ```
* **Decibel Gain Math & Linear Conversion** (Lines 15-21, 100-143):
  - Bus initial volume defaults in dB: `master: 0`, `music: -6`, `sfx: 0`, `ui: -3`.
  - Math utilities: `dbToLinear(db) = Math.pow(10, db / 20)`, `linearToDb(gain) = 20 * Math.log10(Math.max(gain, 0.0001))`.
  - Volume setters (`setMasterVolume`, `setMusicVolume`, etc.) take linear `0..1` values, map via `linearToDb`, and update `busVolumes[bus]`.
* **Sidechain Ducking** (Lines 169-196):
  - `triggerSidechainDucking(duckDb = -10, durationMs = 350)`: applies fast attack (`setTargetAtTime(duckedLinear, now, 0.015)`) to dip `musicDuckingGain`, followed by smooth exponential release (`setTargetAtTime(1.0, releaseTime, 0.3)`) after `durationMs`.
  - `duckMusic(durationMs, duckDb)` provides backward-compatible alias.
  - Automatically triggered on critical hits in `playHitSFX(position, isCrit)` (`triggerSidechainDucking(-12, 350)`).
* **3D Spatial Audio & Listener Tracking** (Lines 146-166, 227-262):
  - `updateListener(position, forward, up)` tracks spatial camera transform node every frame.
  - `playSpatialSound` and `playHitSFX` configure `PannerNode` with HRTF panning model, inverse distance model (`refDistance = 3.0`, `maxDistance = 50.0`, `rolloffFactor = 1.0`).
  - Supports pitch variance (`1.0 + (Math.random() - 0.5) * 2 * pitchVariance`) to prevent SFX repetition.

### 1.2 System Integration Inspection (`src/index.ts`)
* **11 Core Systems Interlocking**:
  1. `GameEngine` (`src/core/Engine.ts`): Scene lifecycle, clear color (`#0d0d14`), ambient/directional lights, shadow generator.
  2. `CameraRig` (`src/camera/CameraRig.ts`): Target isometric camera, 45° pitch/yaw, exponential smoothing (`1 - exp(-rate * dt)`), look-ahead, trauma decay screen shake.
  3. `InputManager` (`src/core/InputManager.ts`): Click-to-move pointer picking, WASD direct vector override, 120ms input buffer, dynamic prompt swapping, UI modal gate.
  4. `Generator` & `TileMap` (`src/dungeon/`): 40x40 grid BSP dungeon generation, Kenney GLB tile assembly, static mesh merging (`Mesh.MergeMeshes`), wall ellipsoid collision sliding (`checkCollisions = true`).
  5. `NavMeshManager` (`src/dungeon/NavMeshManager.ts`): Recast runtime NavMesh over merged floor geometry, pathfinding queries for Player & Enemies.
  6. `Player` & `StatsComponent` (`src/entities/Player.ts`, `StatsComponent.ts`): Decoupled stat layer (`base + flat + percent`), health/mana, level/XP, skills (`Skill.ts`), archetype (`Archetypes.ts`), inventory (`InventoryComponent.ts`).
  7. `Enemy` FSM AI & `DamageSystem` (`src/entities/Enemy.ts`, `DamageSystem.ts`): Throttled ~300ms FSM state machine (`Idle`, `Aggro`, `Chase`, `Attack`), line-of-sight & stuck detection, armor/crit damage calculation, `onDamageApplied` global observable.
  8. `JuiceOverlay` (`src/ui/JuiceOverlay.ts`): 40-item pre-allocated floating combat text pool, 100ms mesh emissive hit flash, 60ms hit-stop freeze frame micro-pause.
  9. `TownHubAltar` & UI (`ArchetypeUI.ts`, `TalentUI.ts`, `HUD.ts`): Town Hub Altar 3.0m proximity interaction, swappable 4 Archetypes, event-driven UI overlays with keyboard/gamepad focus navigation.
  10. `LootDrop` & `LootTable` (`src/items/`, `src/entities/LootDrop.ts`): Drop tables across standard, elite, boss tiers, 3.0m proximity vacuum auto-loot, weighted grid inventory UI.
  11. `AudioManager` (`src/audio/AudioManager.ts`): Master/Music/SFX/UI bus mixing, sidechain ducking, spatial listener tracking, synthetic fallback sound synthesis.

### 1.3 Synthesis of Peer Explorations
* **`explorer_p6_1` (Visual Pipeline)**:
  - Designed `VisualPipelineManager` (`src/rendering/VisualPipelineManager.ts`) configuring `DefaultRenderingPipeline` (SSAO2, Bloom, ACES Tone Mapping, FXAA, MSAA) with graphics presets (`low`, `medium`, `high`, `ultra`).
* **`explorer_p6_2` (Save Persistence)**:
  - Designed `StorageAdapter` (`src/core/StorageAdapter.ts`) with schema versioning & migration pipeline, atomic writes + `.bak` key fallbacks, and `SaveManager` (`src/persistence/SaveManager.ts`) capturing player, inventory, talent tree, and world state into `GameSaveStateV1`.

---

## 2. Logic Chain

1. **Decibel Bus Architecture & Loudness Balancing**:
   - Sound intensity is perceived logarithmically by human hearing (`audio-design` skill). Managing volume controls in decibels (`dB`) rather than raw linear amplitude prevents abrupt jumpy slider responses. Mapping `linearToDb` and `dbToLinear` at gain node boundaries maintains physical audio accuracy while presenting intuitive decibel controls.
2. **Sidechain Ducking & Hit-Stop Audio Sync**:
   - Heavy combat impacts and critical hits require clear sonic separation. Ducking the `Music` bus by `-12 dB` with a fast 15ms attack time frees up headroom for impact SFX. Releasing over 300ms prevents audible "pumping".
   - Synchronizing this with `JuiceOverlay`'s 60ms hit-stop freeze frame (`isHitStopped()`) micro-pauses frame updates while audio ducking occurs, resulting in crisp combat feedback.
3. **Decoupled System Integration**:
   - Systems in `src/index.ts` communicate via event observables (`DamageSystem.onDamageApplied`, `enemy.onLootDropped`, `player.onLevelUp`). This prevents tight coupling and ensures clean disposal of observers when teardown occurs.
4. **Automated E2E Verification Harness**:
   - Creating `tests/phase6_e2e_verification_harness.ts` allows verifying all 11 subsystems end-to-end in a headless Node environment (`NullEngine` + DOM polyfills). The harness quantitatively asserts audio bus decibel math, graphics preset configurations, save schema migrations (v0 -> v1), combat damage & juice overlay hit-stop cycles, proximity auto-loot, and observer memory leak cleanup.

---

## 3. Caveats

* **Browser AudioContext Autoplay Restrictions**: Browsers suspend `AudioContext` until the first user interaction gesture. `AudioManager` handles this cleanly via `setupUnlockListener()` (listening on `pointerdown`, `keydown`, `touchstart`) and `ensureContextResumed()`.
* **Headless Node Polyfills**: In headless test environments (`NullEngine`), Web Audio API nodes are absent or polyfilled. Audio decibel conversion math, bus volume getters, sidechain parameter logic, and event triggers are verified deterministically without requiring native Web Audio rendering.
* **SSAO2 Hardware Support**: `SSAO2RenderingPipeline` relies on WebGL2 depth textures. `VisualPipelineManager` verifies `SSAO2RenderingPipeline.IsSupported` before instantiation to avoid WebGL fallback warnings.

---

## 4. Conclusion & Technical Specifications

### Assessment
All 6 phases of the project (Engine, Dungeon, Combat, Archetypes, Loot, Persistence, Visual Pipeline, and Audio) are architected for seamless integration. `src/audio/AudioManager.ts` provides complete decibel bus control, sidechain ducking, spatial listener tracking, and synthetic fallback sound synthesis.

### Implementation Specification for Test Harness (`tests/phase6_e2e_verification_harness.ts`)
The proposed E2E test harness has been written to `.agents/explorer_p6_3/proposed_phase6_e2e_verification_harness.ts`. The implementation worker can place this file at `tests/phase6_e2e_verification_harness.ts`.

#### Key Test Modules in Harness:
1. **Audio Bus & Decibel Math**: Verifies initial bus volumes (`master: 0`, `music: -6`, `sfx: 0`, `ui: -3`), `dbToLinear` and `linearToDb` conversion precision, sidechain ducking trigger (`triggerSidechainDucking(-12, 350)`), and synthetic SFX triggers.
2. **Visual Pipeline Presets**: Verifies `VisualPipelineManager` preset switching (`low` -> `medium` -> `high` -> `ultra`) and bloom/SSAO toggles.
3. **Save Persistence & Migration**: Verifies `StorageAdapter` save/load with payload validation, atomic write backup recovery, and schema migration (v0 -> v1).
4. **E2E Combat, Juice & Loot Loop**: Verifies global damage event resolution -> floating text in `JuiceOverlay` -> 60ms hit-stop freeze frame -> sidechain audio ducking -> proximity auto-loot of `LootDrop` items.
5. **Observer Memory Leak Cleanup Audit**: Verifies that calling `dispose()` on all UI overlays, audio manager, player, and scene unsubscribes all registered observers.

---

## 5. Verification Method

To verify the Phase 6 implementation and E2E integration:

1. **TypeScript Build & Lint Verification**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```
   *Expected Result*: 0 compilation errors, Vite production build completes cleanly.

2. **Execute Phase 6 E2E Verification Harness**:
   ```bash
   npx ts-node tests/phase6_e2e_verification_harness.ts
   ```
   (or run against proposed harness: `npx ts-node .agents/explorer_p6_3/proposed_phase6_e2e_verification_harness.ts`)
   *Expected Result*: Console outputs `VERDICT: APPROVE - All empirical E2E integration tests passed cleanly.` with exit code 0.

3. **Runtime Browser Inspection**:
   - Run `npm run dev`.
   - Open browser, trigger attacks, score critical hits -> verify floating numbers pop, screen shakes, hit-stop micro-pauses frame, and music dips during impact.
