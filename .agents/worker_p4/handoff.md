# Phase 4 Handoff Report: Single-Character Archetypes, Skills, 120ms Input Buffering & Talent UI

**Agent:** worker_p4  
**Date:** 2026-08-05  
**Milestone:** Phase 4 (M4) — Character Progression, Archetypes & Skill/Talent UI  
**Target Files:**
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

## 1. Observation

1. **Architecture & Scope**:
   - `ORIGINAL_REQUEST.md` (Lines 31–34) & `PROJECT.md` (Lines 31–32): Milestone M4 mandates single-character archetypes, talent trees, 4 distinct archetypes (Tank with *Seismic Slam*, Healer with *Holy Beacon*, Mage with *Arcane Nova*, Physical Melee DPS with *Whirlwind*), swappable at Town Hub Archetype Altar, 120ms input buffering, and event-driven `@babylonjs/gui` UI.
   - Initial code inspection revealed missing core combat modules (`Skill.ts`, `Archetypes.ts`, `TalentTree.ts`, `TalentUI.ts`, `ArchetypeUI.ts`, `HUD.ts`, `TownHubAltar.ts`), which have now been fully authored and integrated into `Player.ts` and `index.ts`.

2. **Build & Type Check Output**:
   - Running `pnpm run build` (`tsc && vite build`) completed cleanly with **exit code 0**.
   - Vite transformed 1345 modules and built production assets in `33.35s`.
   - `pnpm exec tsc --noEmit` returned **0 type or compilation errors**.

---

## 2. Logic Chain

The architecture for Phase 4 follows a decoupled, event-driven progression and combat execution pipeline:

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                      Player Entity                      │
                  │   Level, XP, activeArchetypeId, equippedSkills[0..4]    │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         [Archetype Altar (3.0m Zone)]                        [120ms Input Buffer]
                       │                                               │
                       ▼                                               ▼
          `Player.setArchetype(type)`                      `Player.processInputBuffer()`
                       │                                               │
      ┌────────────────┴────────────────┐                              ▼
      ▼                                 ▼                   `Skill.execute(caster, target)`
[Base Stats Recalc]          [Archetype Passive Modifiers]             │
(MaxHp, Armor, ATK...)       `source: "archetype_passive"`             ├─ Damage Math (`DamageSystem`)
      │                                 │                              ├─ Combat Juice (`JuiceOverlay`)
      └────────────────┬────────────────┘                              └─ Spatial SFX (`AudioManager`)
                       │
                       ▼
        [TalentTree & TalentUI Overlay]
        Allocates points (1 per level)
        `source: "talent_tree_<archetype>"`
                       │
                       ▼
            [Event-Driven HUD Sync]
```

1. **Skill System (`src/combat/Skill.ts`)**:
   - Implements abstract `Skill` base class and 4 signature skills:
     - **Tank (*Seismic Slam*)**: Frontline disrupter. Deals physical AOE damage scaling with attack power and armor rating: `(AttackDamage * 1.5) + (Armor * 0.8) + 15`. Costs 25 Mana, 6.0s CD, 4.0m radius, triggers screen shake (trauma 0.4), hit-stop (80ms), and audio ducking (-12dB).
     - **Healer (*Holy Beacon*)**: Radiant templar support. Creates a 5.0m radiant zone lasting 4.0s (ticking every 0.5s). Ticks heal self/allies (`(MaxHp * 0.03) + (AttackDamage * 0.45) + 8`) and deal holy damage (`(AttackDamage * 0.4) + 5`) to enemies inside. Spawns green floating text and radiant light.
     - **Mage (*Arcane Nova*)**: High burst glass cannon. Instant 6.0m radial arcane explosion: `(AttackDamage * 2.2) + 20`. Costs 30 Mana, 4.5s CD, 2.0x crit multiplier with freeze frame juice.
     - **Physical Melee DPS (*Whirlwind*)**: Channeled mobile blade dancer. 2.5s duration ticking every 0.25s: `(AttackDamage * 0.65) + 6`. Costs 15 Mana, 3.0s CD, 3.2m radius. Allows continuous player WASD movement during execution.

2. **Archetype Registry (`src/combat/Archetypes.ts`)**:
   - Registers the 4 classes with unlock thresholds unlocked every 10 levels:
     - **Tank**: Level 1 (Starter).
     - **Healer**: Level 10.
     - **Mage**: Level 20.
     - **Physical Melee DPS**: Level 30.
   - Handles base stat resets and passive modifier replacement without stat drift.

3. **120ms Input Buffering**:
   - `InputManager` buffers skill keypresses and gamepad face buttons with a sliding 120ms window (`expiresAt = performance.now() + 120`).
   - `Player.update()` polls `inputManager.consumeBufferedSkill()` every tick to process queued skill triggers immediately upon readiness.

4. **Talent Tree & Talent UI (`src/combat/TalentTree.ts` & `src/ui/TalentUI.ts`)**:
   - Data model features 1 active skill unlock node + 5 passive/stat modifier nodes per archetype (6 nodes total per class).
   - Talent Points earned per level: `totalPoints = level - 1`.
   - Modifiers applied using `StatsComponent.addModifier()` with source `talent_tree_<archetype>`.
   - Event-driven `@babylonjs/gui` overlay modal with tab selection, node status colors, detailed tooltips, respec button, and keyboard/gamepad prompt swapping.

5. **Town Hub Archetype Altar (`src/entities/TownHubAltar.ts` & `src/ui/ArchetypeUI.ts`)**:
   - Interactive Altar object positioned at `spawnPoint + Vector3(3, 0, 3)` with a 3.0m radial proximity zone and glowing runed ring.
   - Approaching Altar displays a floating HUD prompt banner: `"Press [E] or (A) to Access Archetype Altar"`.
   - Pressing `E` or gamepad `A` opens the `ArchetypeUI` modal to swap active classes (enforcing level requirements).

6. **HUD & Subsystem Integration (`src/ui/HUD.ts` & `src/index.ts`)**:
   - 100% event-driven HUD tracking Health Globe/Bar, Mana Globe/Bar, XP Bar, Level indicator, Active Archetype Badge, Skill Hotbar with Cooldown Overlay Sweeps, and Altar interaction banner.

---

## 3. Caveats

- **Particle Fallbacks**: `Skill.ts` provides expanding emissive ring meshes with auto-disposal for visual feedback, ensuring clean visual representation across all web browser environments.
- **Stat Drift Protection**: Stat recalculations and archetype swaps strictly clear previous modifiers by source tag (`archetype_passive` vs `talent_tree_<archetype>`), preventing stat accumulation or memory leaks.

---

## 4. Conclusion

Phase 4 deliverables are fully implemented, compiled, built, and integrated into the project without breaking existing contracts.

### Summary of Created/Modified Files:
- `src/combat/Skill.ts`: Base class & 4 signature skill implementations (*Seismic Slam*, *Holy Beacon*, *Arcane Nova*, *Whirlwind*).
- `src/combat/Archetypes.ts`: Class definitions, unlock thresholds (L1, L10, L20, L30), base stat maps, and stat recalculation.
- `src/combat/TalentTree.ts`: Progression model, prerequisites, point math, and stat modifier binding.
- `src/ui/TalentUI.ts`: Fullscreen `@babylonjs/gui` talent tree overlay with focus navigation.
- `src/entities/TownHubAltar.ts`: 3.0m proximity zone altar object with visual glow ring.
- `src/ui/ArchetypeUI.ts`: Modal window for selecting unlocked archetypes at the Altar.
- `src/ui/HUD.ts`: Event-driven HUD overlay for health, mana, XP, hotbar cooldown sweeps, and altar prompt.
- `src/entities/Player.ts`: Updated to support Leveling/XP, active archetype state, talent tree instance, and 120ms buffered input consumption.
- `src/index.ts`: Bootstrapped Altar, TalentUI, ArchetypeUI, HUD, enemy kill XP rewards, and render loop integrations.

---

## 5. Verification Method

To independently verify the implementation:

1. **TypeScript Type Check**:
   ```bash
   pnpm exec tsc --noEmit
   ```
   *Expected Output*: Exits with 0 errors.

2. **Production Build**:
   ```bash
   pnpm run build
   ```
   *Expected Output*: Vite production build succeeds and outputs bundled assets into `dist/`.

3. **Invalidation Conditions**:
   - If `pnpm exec tsc --noEmit` reports any type mismatch or missing property, verification fails.
   - If switching archetypes retains previous archetype passive stat modifiers (stat drift), verification fails.
   - If an archetype can be equipped below its `unlockLevel` threshold, verification fails.
