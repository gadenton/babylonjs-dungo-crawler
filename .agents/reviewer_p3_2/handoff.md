# Reviewer 2 Handoff Report — Phase 3 Gate Verification

## Review Summary

**Verdict**: REQUEST_CHANGES

The Phase 3 implementation provides a solid functional foundation for the direct-stat component system, throttled FSM enemy AI, 3D spatial Web Audio API manager, and combat juice overlay. TypeScript typechecking (`pnpm exec tsc --noEmit`) and production bundling (`pnpm run build`) pass cleanly with 0 compilation errors.

However, major resource leaks in the Web Audio PannerNode graph and unthrottled raycasting in the Enemy AI update loop were identified that violate Phase 3 performance and memory efficiency requirements.

---

## 1. Observation

- **Build Verification**:
  - `pnpm exec tsc --noEmit` -> Exited code 0 (0 errors).
  - `pnpm run build` -> Exited code 0 (`dist/assets/index-DVzRC7La.js 2,783.97 kB`, built in 38.31s).
- **Web Audio Graph (`src/audio/AudioManager.ts:99-123`)**:
  - `playHitSFX()` creates `const panner = this.audioCtx.createPanner()` for spatialized audio and calls `panner.connect(this.sfxGain)`.
  - When the oscillator stops after 0.1s - 0.2s, the `PannerNode` remains connected to `sfxGain` and is never disconnected or garbage collected.
- **Enemy AI Line-Of-Sight Raycasting (`src/entities/Enemy.ts:194, 261-280`)**:
  - In `Enemy.update(deltaTime)`, `const hasLOS = this.checkLineOfSight(target)` is called on line 194 **every single frame** for every active enemy regardless of AI throttle timer.
  - `checkLineOfSight()` executes `this.scene.pickWithRay(ray, ...)` synchronously on every tick.
- **Fallback Material Cleanup (`src/entities/Enemy.ts:99, 141`)**:
  - `fallbackMat` (`StandardMaterial`) created on line 99 is assigned to capsule mesh. When GLB loads, `this.mesh.dispose()` is called on line 141, but `fallbackMat.dispose()` is omitted.
- **Enemy Lifecycle & Observable Disposal (`src/entities/Enemy.ts:351`)**:
  - `Enemy` class does not implement `dispose()`. Observables on `StatsComponent`, `HealthComponent`, `onStateChanged`, and `onAttackPerformed` are not detached upon enemy death/destruction.

---

## 2. Logic Chain

1. **Web Audio PannerNode Memory Leak**:
   - Every positional melee swing or hit spawns a `PannerNode` connected to `sfxGain`.
   - Because Web Audio nodes remain in memory as long as they are connected to active nodes in the audio context graph, failing to disconnect `panner` after `osc.stop()` causes linear accumulation of orphan audio nodes during extended combat sessions.
2. **Raycast Performance Overhead**:
   - R3 requires throttled enemy AI (~300ms updates) to maintain high frame rates.
   - While path queries in `updateChaseState()` are correctly throttled via `pathUpdateTimer >= 0.3`, `checkLineOfSight()` executes `scene.pickWithRay` every 16ms (60 FPS) for every enemy in the scene. In a dungeon with 15-20 enemies, this introduces unthrottled physics raycast CPU overhead.
3. **Babylon.js Material Leak**:
   - Disposing a `Mesh` in Babylon.js does not automatically dispose its assigned `Material`. Failing to call `fallbackMat.dispose()` when replacing the fallback capsule with loaded GLB meshes leaves orphan materials in `scene.materials`.

---

## 3. Findings

### [Major] Finding 1: Web Audio PannerNode Graph Leak in `AudioManager.ts`
- **Where**: `src/audio/AudioManager.ts`, lines 99–123.
- **Why**: `createPanner()` creates a `PannerNode` connected to `this.sfxGain`. When the oscillator stops (after 100–200ms), `panner` is not disconnected (`panner.disconnect()`). Web Audio graph nodes stay allocated in browser memory when connected to an active `GainNode`.
- **Suggestion**: Disconnect the `panner` node inside an `osc.onended` handler or via `setTimeout` matching the duration of the audio hit.

### [Major] Finding 2: Unthrottled Raycast Line-Of-Sight Execution in `Enemy.ts`
- **Where**: `src/entities/Enemy.ts`, line 194.
- **Why**: `checkLineOfSight(target)` is called on every frame update (`update()`) for all active enemies, executing synchronous `scene.pickWithRay` calls. This bypasses the intended ~300ms AI throttle mechanism.
- **Suggestion**: Cache the LOS result and re-evaluate `checkLineOfSight()` only when `pathUpdateTimer` triggers (~300ms) or during state transitions.

### [Minor] Finding 3: Un-disposed Fallback Material on Async Model Load in `Enemy.ts`
- **Where**: `src/entities/Enemy.ts`, lines 99–102 & line 141.
- **Why**: When GLB mesh loading succeeds, `this.mesh.dispose()` disposes the capsule mesh, but `fallbackMat` remains registered in `scene.materials`.
- **Suggestion**: Store `fallbackMat` reference and call `fallbackMat.dispose()` inside `loadModelAsync()`.

### [Minor] Finding 4: Missing `Enemy.dispose()` Implementation
- **Where**: `src/entities/Enemy.ts`, line 351.
- **Why**: Enemies destroyed or removed from the scene do not unhook their `onStatChanged`, `onDeath`, `onStateChanged`, and `onAttackPerformed` observable observers, leading to object references persisting in memory.
- **Suggestion**: Implement `public override dispose(): void` in `Enemy` that disposes meshes, stats, health components, and clears all observables.

---

## 4. Verified Claims

- `pnpm exec tsc --noEmit` -> Verified PASS (exit code 0, 0 errors).
- `pnpm run build` -> Verified PASS (exit code 0, Vite production bundle generated successfully).
- Decoupled Stats Math (`base + flat * percent`) -> Verified correct calculation in `StatsComponent.ts`.
- Armor mitigation formula ($100 / (100 + \text{Armor})$) -> Verified correct calculation in `DamageSystem.ts`.
- Floating damage text removal -> Verified `item.textBlock.dispose()` called on lifetime expiration in `JuiceOverlay.ts`.

---

## 5. Coverage Gaps

- **Long-running audio session memory footprint**: Audio graph node count over >500 hit calls. Risk level: Medium. Recommendation: Fix `PannerNode` disconnection.
- **Multi-enemy raycast stress test**: 30+ concurrent active enemies in scene. Risk level: Medium. Recommendation: Throttle LOS check to 300ms.

---

## 6. Adversarial Stress-Test Challenges

1. **Audio Node Explosion**: Spawning 100 rapid attack events causes 100 `PannerNode` objects to remain connected to `sfxGain`.
   - *Status*: FAILED (node leak confirmed).
2. **High Enemy Count CPU Spike**: 25 enemies in `Chase` / `Idle` state performing 25 `pickWithRay` operations per frame at 60 FPS = 1500 raycasts/sec.
   - *Status*: FAILED (unthrottled raycasting confirmed).
3. **Stat Modifier Expiration**: Adding 10 temporary speed/damage buffs with expiration durations.
   - *Status*: PASSED (handled correctly in `StatsComponent.update(deltaTime)`).

---

## 7. Caveats

- Recast NavMesh initialization is asynchronous; direct vector pathing fallback works correctly during loading window.
- Audio context resumption on initial user click is properly handled by `ensureContextResumed()`.

---

## 8. Conclusion & Actionable Next Steps

Verdict: **REQUEST_CHANGES**.

Worker `worker_p3` should address the following before gate clearance:
1. Update `AudioManager.ts` to disconnect `PannerNode` when hit SFX finishes.
2. Throttle `checkLineOfSight` in `Enemy.ts` to run alongside the ~300ms AI timer instead of every frame.
3. Dispose `fallbackMat` when GLB loads and implement `Enemy.dispose()`.

---

## 9. Verification Method

To re-verify after fixes:
1. `pnpm exec tsc --noEmit` (Must pass with code 0).
2. `pnpm run build` (Must pass with code 0).
3. Inspect `AudioManager.ts` for `panner.disconnect()` after sound completion.
4. Inspect `Enemy.ts` for `checkLineOfSight` throttling inside `pathUpdateTimer` block.
