# Phase 4 Challenge Handoff Report: Single-Character Archetypes, Skills, 120ms Input Buffering & Talent UI

**Agent:** Challenger 1 (`teamwork_preview_challenger`)  
**Date:** 2026-08-05  
**Milestone:** Phase 4 (M4) — Single-Character Archetypes, Skills, 120ms Input Buffering & Talent UI  
**Target Directory:** `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\challenger_p4_1`  
**Verdict:** **REJECT**

---

## 1. Observation

Empirical test suite executed via `pnpm exec tsx .agents/challenger_p4_1/test_runner.ts` against Phase 4 implementation. Out of 22 empirical checks, 20 PASSED and 2 FAILED:

1. **Failure 1 — Healer Archetype Passive Stat Calculation (`StatType.MaxMana` missing in `StatsComponent`)**:
   - `ArchetypeManager.ts` defines Healer's passive modifier: `{ id: 'healer_passive_mana', stat: StatType.MaxMana, type: 'percent', value: 0.20, source: 'archetype_passive' }`.
   - Healer base MaxMana is `160`. Expected MaxMana with passive: `192`.
   - Empirical result: `stats.getStat(StatType.MaxMana)` returns `160` (passive NOT applied).
   - Code inspection in `src/entities/components/StatsComponent.ts` (lines 226–236) revealed that `StatType.MaxMana` is **omitted** from `statsToCalculate` array in `recalculateAll()`. Thus, `MaxMana` stat modifiers are ignored by `StatsComponent`.

2. **Failure 2 — Input Buffer Cooldown Queueing Premature Discard**:
   - Requirement: 120ms sliding window input buffer must queue skill execution upon cooldown expiry if triggered within the 120ms window.
   - Code inspection in `src/entities/Player.ts` (lines 244–258) shows `player.processInputBuffer()` calls `this.inputManager.consumeBufferedSkill()`.
   - `consumeBufferedSkill()` calls `this.bufferedInputs.shift()`, removing the input from the queue unconditionally on the first frame after keypress.
   - If the skill is on cooldown (e.g. 50ms remaining out of 120ms window), `canCast()` returns `false`, and `Player.processInputBuffer()` skips execution. However, the input has already been shifted out of `bufferedInputs`.
   - Empirical result: On tick 4 (56ms later, when cooldown expires), `bufferedInputs` is empty. The skill **fails to execute upon cooldown expiry** (Skill CD after cooldown expiry frame remains `0.000s`, expected `~6.0s`).

3. **Successful Verifications**:
   - **Stat Drift**: Executed 10,000 rapid archetype swaps between Tank, Healer, Mage, and Physical DPS. Base stats and active passives for Tank, Mage, and DPS return exactly to base values without float accumulation or modifier array memory leaks (`modifiers` array size remains 1).
   - **Talent Tree Respec**: Verified level 10 point math (9 total points), prerequisite enforcement, active stat modifier application, point refund math, and complete cleanup of stat modifiers by source tag (`talent_tree_<archetype>`).
   - **Skill Damage Formulas**:
     - *Seismic Slam (Tank)*: Raw damage `(AttackDamage * 1.5) + (Armor * 0.8) + 15 = 69` (for ATK=20, Armor=30).
     - *Holy Beacon (Healer)*: Heal per tick `(MaxHp * 0.03) + (AttackDamage * 0.45) + 8 = 23` (for MaxHp=200, ATK=20). Enemy holy damage per tick `(AttackDamage * 0.4) + 5 = 13`.
     - *Arcane Nova (Mage)*: Raw damage `(AttackDamage * 2.2) + 20 = 108` (for ATK=40).
     - *Whirlwind (Physical Melee DPS)*: Raw tick damage `(AttackDamage * 0.65) + 6 = 25.5` -> rounded to `26` (for ATK=30).
   - **TypeScript Compilation**: `pnpm exec tsc --noEmit` passed with 0 errors.

---

## 2. Logic Chain

1. **MaxMana Stat Recalculation Defect**:
   - `StatsComponent.recalculateAll()` iterates through `statsToCalculate = [AttackDamage, CritChance, Armor, MaxHp, CooldownReduction, MoveSpeed, CritDamage]`.
   - Because `StatType.MaxMana` is missing from this list, percent/flat modifiers targeting `MaxMana` are never evaluated into `cachedStats`.
   - When `getStat(StatType.MaxMana)` is called, it falls back to `this.getBaseStat(StatType.MaxMana)`, bypassing all applied modifiers.
   - Fix required: Add `StatType.MaxMana` to `statsToCalculate` in `StatsComponent.ts`.

2. **Input Buffer Cooldown Queueing Defect**:
   - In `InputManager.ts`, `consumeBufferedSkill()` removes the oldest input from `this.bufferedInputs` via `shift()`.
   - In `Player.ts`, `processInputBuffer()` calls `consumeBufferedSkill()` before checking `canCast()`.
   - If `canCast()` returns `false` due to active cooldown, the input is discarded.
   - Fix required: `InputManager` should provide a `peekBufferedSkill()` method or `consumeBufferedSkill()` should only consume an input if it can be successfully executed, or `Player.processInputBuffer()` should check readiness without discarding unexpired buffered inputs.

---

## 3. Caveats

- All other Phase 4 requirements (Archetype Altar proximity interaction, Talent Tree UI, Skill damage math, Stat drift protection) are implemented cleanly and verified empirically.
- Fixes for the 2 identified bugs are straightforward and localized.

---

## 4. Conclusion

**Verdict: REJECT**

Phase 4 cannot be approved until:
1. `StatType.MaxMana` is added to `statsToCalculate` in `StatsComponent.ts` so Healer passive (+20% MaxMana) and any item/talent MaxMana modifiers take effect.
2. `InputManager` / `Player.processInputBuffer()` is updated so that inputs buffered within 120ms remain in the buffer queue and execute upon skill cooldown expiry.

---

## 5. Verification Method

To verify the findings and test fixes:

1. **Run Empirical Test Suite**:
   ```bash
   pnpm exec tsx .agents/challenger_p4_1/test_runner.ts
   ```
   - *Expected Result before fix*: 2 FAILURES (Healer MaxMana = 160 vs 192; Input Buffer cooldown queue execution fails).
   - *Expected Result after fix*: 22/22 PASSED.

2. **TypeScript & Production Build Verification**:
   ```bash
   pnpm exec tsc --noEmit
   pnpm run build
   ```
   - *Expected Result*: Both commands exit with code 0.
