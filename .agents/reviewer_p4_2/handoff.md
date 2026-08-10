# Phase 4 Review & Adversarial Audit Report

**Reviewer:** Reviewer 2 (`teamwork_preview_reviewer`)  
**Date:** 2026-08-05  
**Milestone:** Phase 4: Single-Character Archetypes, Skills, 120ms Input Buffering & Talent UI  
**Target Files Reviewed:**
- `src/combat/Skill.ts`
- `src/combat/Archetypes.ts`
- `src/combat/TalentTree.ts`
- `src/ui/TalentUI.ts`
- `src/ui/ArchetypeUI.ts`
- `src/ui/HUD.ts`
- `src/entities/TownHubAltar.ts`
- `src/entities/Player.ts`
- `src/index.ts`

---

## 1. Verdict

**Verdict:** `REQUEST_CHANGES`

---

## 2. Review Summary

| Dimension | Assessment | Status |
|---|---|---|
| **Build & TypeCheck** | `pnpm exec tsc --noEmit` passed with 0 errors. `pnpm run build` succeeded. | PASS |
| **Integrity Verification** | Genuine implementation without dummy facades, mocks, or hardcoded shortcuts. | PASS |
| **Archetype Level Requirements** | Level 1 (Tank), Level 10 (Healer), Level 20 (Mage), Level 30 (Melee DPS) enforced in UI and Entity. | PASS |
| **HUD Reactivity** | Event-driven health/mana/level/XP updates & cooldown overlays. | PASS |
| **120ms Input Buffering** | Input buffering prematurely drops items on frame 1 if skill is on cooldown. | **FAIL** |
| **GUI Overlay Event Handling** | Pointer clicks & WASD inputs bleed through modal UIs (`TalentUI`, `ArchetypeUI`) to world movement. | **FAIL** |
| **Memory Management / Disposal** | `StandardMaterial` for visual ring effects and observable listeners leaked on dispose. | **FAIL** |

---

## 3. Detailed Findings

### [Major] Finding 1: 120ms Input Buffering Premature Consumption Defect

- **What**: In `Player.processInputBuffer()` (`src/entities/Player.ts`, lines 244–258) and `InputManager.consumeBufferedSkill()` (`src/core/InputManager.ts`, lines 264–278), calling `consumeBufferedSkill()` shifts and removes the input from the buffer queue on the first frame it is polled, even if `skillToCast.canCast()` returns `false` (e.g. skill is currently on cooldown).
- **Where**: `src/entities/Player.ts` (lines 244–258), `src/core/InputManager.ts` (lines 264–278).
- **Why**: 120ms input buffering is intended to hold a skill keypress made shortly before a cooldown finishes (e.g., 50ms before CD ends) and execute it as soon as the skill becomes available within the 120ms window. Shifting the item out of the buffer when `canCast` is false drops the input immediately on frame 1 (t=0ms), rendering input buffering ineffective when pressed during active cooldowns.
- **Suggestion**: Update `InputManager` to allow peeking at the buffered input or only call `consumeBufferedSkill()` when `skillToCast.canCast(this.stats).possible` evaluates to `true`.

---

### [Major] Finding 2: GUI Modal Input Bleedthrough & Lack of Pointer/Keyboard Suppression

- **What**: When the `TalentUI` or `ArchetypeUI` modal windows are visible, mouse clicks on GUI buttons pass through to `InputManager.onPointerClickWorld`, and WASD keys continue sending movement vectors to `Player.update()`.
- **Where**: `src/core/InputManager.ts` (lines 109–127), `src/index.ts` (lines 77–89), `src/ui/TalentUI.ts`, `src/ui/ArchetypeUI.ts`.
- **Why**: Players clicking UI buttons (e.g. allocating talent points or equipping archetypes) simultaneously cause the player entity in the 3D scene to walk toward the world position under the UI element. WASD navigation or skill key presses while reading modal UIs trigger unintended character movement and skill execution in the background.
- **Suggestion**: Implement UI modal active state checking in `InputManager` (e.g. `inputManager.setUIOverlayActive(boolean)` or checking GUI modal visibility) to block pointer world picking, move vectors, and skill shortcuts while modal UI windows are open.

---

### [Major] Finding 3: Visual Ring Material Memory Leak in `Skill.ts`

- **What**: In `Skill.triggerVisualEffects()` (`src/combat/Skill.ts`, lines 175–205), `StandardMaterial` instances (`vfx_mat_${this.def.id}`) are created for expanding visual ring meshes on every skill execution. Upon animation completion (`progress >= 1.0`), `ring.dispose()` is called, but `mat.dispose()` is never called.
- **Where**: `src/combat/Skill.ts` (lines 181–204).
- **Why**: In Babylon.js, calling `mesh.dispose()` does not dispose the attached material unless `ring.dispose(false, true)` or `mat.dispose()` is explicitly invoked. Unused `StandardMaterial` instances accumulate in `scene.materials` over time with every skill cast, creating a memory leak.
- **Suggestion**: Call `mat.dispose()` alongside `ring.dispose()` when the visual effect completes, or use `ring.dispose(false, true)`.

---

### [Minor] Finding 4: Uncleaned Observable Observers in Subsystem `dispose()` Methods

- **What**:
  1. `TownHubAltar.ts`: The `scene.onBeforeRenderObservable` animation listener (line 49) is not removed when `townHubAltar.dispose()` is called.
  2. `TalentUI.ts`: Observers attached to `talentTree.onTalentAllocated`, `onTalentReset`, `onArchetypeSwapped`, and `inputManager.onActiveDeviceChanged` are not removed in `dispose()`.
  3. `ArchetypeUI.ts`: Observer attached to `inputManager.onActiveDeviceChanged` is not removed in `dispose()`.
  4. `HUD.ts`: Observers attached to `player.stats` and `player` events are not removed in `dispose()`.
- **Where**: `src/entities/TownHubAltar.ts`:61–65, `src/ui/TalentUI.ts`:388–392, `src/ui/ArchetypeUI.ts`:246–248, `src/ui/HUD.ts`:345–347.
- **Why**: Disposing UI or entity objects without unregistering observers leaves dangling callbacks that can attempt to update disposed GUI textures or meshes if events fire post-disposal.
- **Suggestion**: Store Observer references returned by `.add()` and call `.remove(observer)` inside `dispose()`.

---

## 4. Verified Claims & Evidence Chain

1. **TypeScript Type Check**:
   - Command: `pnpm exec tsc --noEmit`
   - Result: Exit code 0 (0 compilation errors).
2. **Vite Production Build**:
   - Command: `pnpm run build`
   - Result: Exit code 0 (Production build generated successfully in `dist/`).
3. **Archetype Unlock Requirements Verification**:
   - Inspected `Archetypes.ts` lines 39, 63, 87, 111 & `Player.ts` lines 187–193.
   - Result: Tank (L1), Healer (L10), Mage (L20), Physical DPS (L30) correctly configured and enforced in `Player.setArchetype()` and `ArchetypeUI.ts`.

---

## 5. Logic Chain

1. **Observations**:
   - `InputManager.consumeBufferedSkill()` shifts the oldest item from `this.bufferedInputs` unconditionally when called.
   - `Player.processInputBuffer()` calls `consumeBufferedSkill()` every frame and then checks `skillToCast.canCast(this.stats)`. If `canCast()` is false, the input is discarded, having already been removed from the buffer.
   - Clicking on GUI buttons triggers `scene.pick()` in `InputManager.setupPointerListeners()`, emitting `onPointerClickWorld`.
   - `Skill.triggerVisualEffects()` creates a new `StandardMaterial` each execution and disposes `ring` without disposing `mat`.
2. **Inferences**:
   - The 120ms buffer fails to hold inputs pressed during active cooldowns.
   - User interaction with UI modals causes unintended character pathing underneath the modal.
   - Prolonged gameplay sessions casting skills will leak materials in memory.
3. **Conclusion**:
   - The codebase has solid core math and stat mechanics, but contains key architectural flaws in input buffering, modal event isolation, and material cleanup. `REQUEST_CHANGES` is required before Phase 4 can be approved.

---

## 6. Verification Method

To independently verify after fixes are applied:
1. **Input Buffer Verification**: Press a skill key 50ms before its cooldown finishes; verify the skill executes immediately when cooldown expires.
2. **GUI Event Isolation**: Open `TalentUI` or `ArchetypeUI` and click buttons; verify player does not walk towards the clicked location in the 3D scene.
3. **Material Leak Check**: Inspect `scene.materials.length` before and after casting skills repeatedly; verify count does not continuously increase.
4. **Build Verification**:
   ```bash
   pnpm exec tsc --noEmit
   pnpm run build
   ```
