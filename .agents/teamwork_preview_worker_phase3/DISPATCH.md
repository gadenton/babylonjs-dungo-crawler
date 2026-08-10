## 2026-08-05T21:42:11Z
You are Phase 3 Implementation Worker.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_worker_phase3

MANDATORY FIRST STEP: Read the original request at:
c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md
Also read PROJECT.md at:
c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
Read Phase 3 technical blueprints:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase3_1\analysis.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_phase3_2\analysis.md

MANDATORY DOMAIN SKILLS: Read and apply:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ai\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\audio-design\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. Create your working directory `.agents/teamwork_preview_worker_phase3/` if needed.
2. Initialize `progress.md` and `BRIEFING.md`.
3. Implement `src/entities/components/StatsComponent.ts`:
   - Decoupled stat modifier layer (`base + flat_add + percent_mod`).
   - Direct stats: `Attack Damage`, `Crit %`, `Armor %`, `Max HP`, `Cooldown Reduction`.
   - Methods: `addModifier(mod)`, `removeModifier(id)`, `getStat(statType)`, `setBaseStat(statType, val)`.
4. Implement `src/entities/components/HealthComponent.ts`:
   - Current/Max HP tracking, `takeDamage(amount)`, `heal(amount)`, `isDead()`, `onHealthChanged`, `onDeath` observables.
5. Implement `src/combat/DamageSystem.ts`:
   - `resolveDamage(attacker, defender)` hit calculation.
   - Armor mitigation formula: `mitigated = raw * (100 / (100 + armor))`.
   - Crit roll: `isCrit = Math.random() < critChance`, applying `1.5x` crit multiplier.
   - Observables: `onDamageApplied(target, amount, isCrit)`.
6. Implement `src/entities/Enemy.ts`:
   - Extends `Entity`.
   - Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`, `Dead`).
   - 300ms path query timer for Recast NavMesh pathing (`NavMeshManager.findPath`).
   - Raycast line-of-sight check against wall geometry (`scene.pickWithRay`).
   - Stuck detection (position displacement check over 1.0s window).
   - Async GLB model loading from `public/assets/characters/enemies/character-orc.glb` with fallback mesh.
7. Implement `src/ui/JuiceOverlay.ts`:
   - Pre-allocated pool of 40 `@babylonjs/gui` `TextBlock`s for floating combat text (FCT).
   - Parabolic 3D->2D projected movement, white for normal damage, gold/large for crit, green for heal.
   - 100ms white hit flash queue (`emissiveColor` pulse on target mesh).
   - Micro-pause hit-stop freeze frames (`triggerHitStop(durationMs)`).
8. Implement `src/audio/AudioManager.ts`:
   - Web Audio API master context, 4 buses (`Master`, `Music`, `SFX`, `UI`) with `GainNode` routing and dB gain conversion `10^(dB/20)`.
   - 3D Spatial Audio `PannerNode` updating listener position from camera.
   - Sidechain ducking `triggerSidechainDucking(duckDb, durationMs)` dropping music volume during heavy combat impacts.
   - Synthetic oscillator fallback audio for testing when `.wav`/`.mp3` files are pending.
9. Update `src/index.ts` bootstrapper:
   - Wire player stats and health, spawn multiple enemies in dungeon rooms.
   - Wire player attack input -> `DamageSystem.resolveDamage(player, enemy)`.
   - Wire enemy AI attack -> `DamageSystem.resolveDamage(enemy, player)`.
   - Connect damage events to `JuiceOverlay` floating text, hit flash, hit-stop, and `AudioManager` spatial sounds & sidechain ducking.
10. Verify build and typecheck:
    - Run `pnpm exec tsc --noEmit`
    - Run `pnpm run build`
    Ensure both exit with 0 code.
11. Write `changes.md` and `handoff.md`.
12. Send completion message to parent orchestrator with build/typecheck outputs.
