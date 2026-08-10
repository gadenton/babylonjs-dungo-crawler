# Phase 4 Iteration 2 Remediation Handoff Report

**Agent:** worker_p4_iter2  
**Date:** 2026-08-05  
**Milestone:** Phase 4 (M4) — Character Progression, Archetypes & Skill/Talent UI Remediation  
**Target Files:**
- `src/entities/components/StatsComponent.ts`
- `src/core/InputManager.ts`
- `src/entities/Player.ts`
- `src/combat/Skill.ts`
- `src/entities/TownHubAltar.ts`
- `src/ui/TalentUI.ts`
- `src/ui/ArchetypeUI.ts`
- `src/ui/HUD.ts`

---

## 1. Observation

1. **Gate Failure Remediation Directives**:
   - `GATE_STATUS.md` recorded Phase 4 Iteration 1 failure due to 5 issues:
     - Missing `StatType.MaxMana` in `statsToCalculate` array in `StatsComponent.ts`.
     - Premature pop / discard of skill inputs in 120ms input buffer while skill is on cooldown in `InputManager.ts` / `Player.ts`.
     - Pointer clicks on GUI modal elements bleeding through to ground movement `onPointerClickWorld`.
     - Visual ring material memory leak in `Skill.ts` (`mat.dispose()` missing when ring mesh disposed).
     - Missing observer disposal in `TownHubAltar`, `TalentUI`, `ArchetypeUI`, and `HUD`.

2. **Verification Command Results**:
   - Running `pnpm exec tsc --noEmit` returned **0 errors** (Exit Code: 0):
     ```
     The command exited with code 0.
     Stdout:
     Stderr:
     ```
   - Running `pnpm run build` (`tsc && vite build`) completed cleanly with **Exit Code: 0**:
     ```
     vite v6.4.3 building for production...
     transforming...
     ✓ built in 35.05s
     ```

---

## 2. Logic Chain

1. **Fix StatType.MaxMana in `StatsComponent.ts`**:
   - Observation: `StatsComponent.recalculateAll()` previously iterated over `statsToCalculate = [StatType.AttackDamage, StatType.CritChance, StatType.Armor, StatType.MaxHp, StatType.CooldownReduction, StatType.MoveSpeed, StatType.CritDamage]`, omitting `StatType.MaxMana`.
   - Action: Added `StatType.MaxMana` to base stats defaults (`100`) in constructor, updated `maxMana` getter to return `this.getStat(StatType.MaxMana)`, added `StatType.MaxMana` to `statsToCalculate`, and added bounds clamping (`Math.max(1.0, finalValue)`) and resource clamping (`this._currentMana = finalValue`).
   - Outcome: Equipping Healer archetype passive (`+20% MaxMana`) now correctly scales `MaxMana` from 160 to 192 without stat drift or missing calculations.

2. **Fix 120ms Input Buffering Cooldown Queueing in `InputManager.ts` / `Player.ts`**:
   - Observation: `Player.processInputBuffer()` previously called `inputManager.consumeBufferedSkill()`, which called `bufferedInputs.shift()`, unconditionally discarding queued skill inputs even when `canCast()` returned `false` due to active cooldown.
   - Action: Added `peekBufferedSkill()` and `consumeBufferedSkillIf(predicate)` to `InputManager.ts`. Updated `Player.processInputBuffer()` to evaluate `consumeBufferedSkillIf((input) => { const check = skill.canCast(this.stats); if (check.possible) { skill.execute(...); return true; } return false; })`.
   - Outcome: Skill inputs pressed during cooldown remain queued in the sliding 120ms buffer and execute automatically as soon as cooldown expires within the window.

3. **Fix GUI Modal Click Bleedthrough in `InputManager.ts`**:
   - Observation: `InputManager.setupPointerListeners()` listened to `POINTERDOWN` and called `scene.pick()`, notifying `onPointerClickWorld` ground movement even when clicking over GUI modal windows.
   - Action: Added modal tracking (`openModals: Set<string>`, `setModalOpen(modalId, isOpen)`, `isUIModalOpen`) to `InputManager.ts`. Guarded `setupPointerListeners()` with `if (this.isUIModalOpen) return;`. Updated `TalentUI.ts` and `ArchetypeUI.ts` `show()`, `hide()`, and `dispose()` to register modal state.
   - Outcome: Clicks on GUI modal elements (`TalentUI`, `ArchetypeUI`) no longer trigger ground pathing/movement underneath open windows.

4. **Fix Visual Ring Material Memory Leak in `Skill.ts`**:
   - Observation: In `Skill.triggerVisualEffects()`, `StandardMaterial` `mat` was created dynamically for the visual ring mesh, but when `ring.dispose()` was called upon animation finish, `mat.dispose()` was omitted.
   - Action: Updated `triggerVisualEffects()` animation observable cleanup to call `mat.dispose()` immediately before `ring.dispose()`.
   - Outcome: Eliminates material memory leak when casting visual skills.

5. **Clean Observer Disposal in `TownHubAltar`, `TalentUI`, `ArchetypeUI`, and `HUD`**:
   - Observation: `TownHubAltar` registered `scene.onBeforeRenderObservable.add(...)` without removing it in `dispose()`. `TalentUI`, `ArchetypeUI`, and `HUD` registered event observers (`onTalentAllocated`, `onTalentReset`, `onArchetypeSwapped`, `onActiveDeviceChanged`, `onHealthChanged`, `onManaChanged`, `onStatChanged`, `onLevelUp`) without storing references or unregistering them in `dispose()`.
   - Action: Stored all observer instances as typed class fields (`Observer<T>`) across all four classes and explicitly called `.remove(...)` in their respective `dispose()` methods. Also added material disposal in `TownHubAltar.dispose()`.
   - Outcome: 100% clean observer unsubscription upon entity/UI destruction, preventing memory leaks and orphaned observer callbacks.

---

## 3. Caveats

No caveats.

---

## 4. Conclusion

All 5 Phase 4 remediation tasks have been genuinely implemented, type-checked, and built without breaking any existing contracts.

### Modified Files:
- `src/entities/components/StatsComponent.ts`: MaxMana defaults, calculation loop, getter, and clamping.
- `src/core/InputManager.ts`: Modal state tracking, pointer listener modal guard, `peekBufferedSkill`, and `consumeBufferedSkillIf`.
- `src/entities/Player.ts`: Updated `processInputBuffer` with conditional buffer consumption.
- `src/combat/Skill.ts`: `mat.dispose()` in visual ring animation cleanup.
- `src/entities/TownHubAltar.ts`: Stored renderObserver & materials and cleaned up in `dispose()`.
- `src/ui/TalentUI.ts`: Stored 4 event observers, wired modal tracking, cleaned up in `dispose()`.
- `src/ui/ArchetypeUI.ts`: Stored deviceObserver, wired modal tracking, cleaned up in `dispose()`.
- `src/ui/HUD.ts`: Stored 5 event observers and cleaned up in `dispose()`.

---

## 5. Verification Method

To independently verify the remediation work:

1. **TypeScript Compilation Check**:
   ```bash
   pnpm exec tsc --noEmit
   ```
   *Expected Output*: Exits with code 0 and 0 errors.

2. **Production Build**:
   ```bash
   pnpm run build
   ```
   *Expected Output*: Vite production build succeeds and outputs bundled assets into `dist/` with exit code 0.

3. **Invalidation Conditions**:
   - If `pnpm exec tsc --noEmit` reports any type mismatch or missing property, verification fails.
   - If Healer passive does not scale `MaxMana`, verification fails.
   - If pressing a skill key during the final 50ms of cooldown fails to execute when cooldown expires within 120ms, verification fails.
   - If clicking on a modal window triggers ground click-to-move pathing underneath, verification fails.
   - If disposing `TownHubAltar`, `TalentUI`, `ArchetypeUI`, or `HUD` leaves active observers on `scene.onBeforeRenderObservable` or event observables, verification fails.
