## 2026-08-05T21:41:46Z
You are Worker (Phase 3 Implementation) for the Babylon.js ARPG project.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p3

Please read:
1. c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md (Requirement R3)
2. c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
3. c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p3\handoff.md (Full class blueprints & step-by-step implementation plan)

Relevant game-dev skills to apply:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ai\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\audio-design\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\babylonjs-engine\SKILL.md

Tasks:
1. Create `src/entities/components/StatsComponent.ts`: Decoupled stat modifier layer (`base + flat + percent`), stat types, resource pools (Health, Mana), observables (`onHealthChanged`, `onManaChanged`, `onDeath`).
2. Create `src/combat/DamageSystem.ts`: Damage calculation math (`calculateDamage`), armor mitigation (armor / (armor + 100)), crit rolls, `applyDamage`.
3. Create `src/ui/JuiceOverlay.ts`: Bouncing 3D-projected floating numbers (`spawnFloatingText`), 100ms white material hit flash (`flashWhite`), and freeze frame (`triggerFreezeFrame`).
4. Create `src/audio/AudioManager.ts`: Web Audio API 3D spatial sound management with Master/Music/SFX/UI buses, sidechain ducking (`duckMusic`), listener updates (`updateListener`), and synthesized procedural audio fallbacks (`playHitSFX`, `playSwingSFX`).
5. Create `src/entities/Enemy.ts` and update `src/entities/Player.ts`:
   - `Player.ts`: Attach `public stats: StatsComponent`, add `performAttack(targetEnemy: Enemy)`.
   - `Enemy.ts`: Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`) updated every ~300ms, raycast line-of-sight check, stuck detection, visual mesh + ellipsoid collision.
6. Update `src/index.ts`: Wire Player stats, Enemy AI spawning in dungeon room centers, attack controls (e.g. Spacebar / click combat trigger), DamageSystem, JuiceOverlay, camera shake, and spatial audio in render loop.
7. Verify build & typecheck:
   - Run `pnpm exec tsc --noEmit` (must exit 0).
   - Run `pnpm run build` (must exit 0).
