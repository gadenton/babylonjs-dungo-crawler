# Phase 3 Implementation Summary — Combat & AI Systems

## Modified / Created Files

### 1. `src/entities/components/StatsComponent.ts`
- Implemented decoupled stat modifier layer (`base + flat_add + percent_mod`) without stat drift.
- Supported direct stats: `Attack Damage`, `Crit %`, `Armor %`, `Max HP`, `Cooldown Reduction`, `Move Speed`, `Crit Damage`.
- Implemented methods: `addModifier(mod)`, `removeModifier(id)`, `getStat(statType)`, `setBaseStat(statType, val)`, `getBaseStat(statType)`, `update(deltaTime)`, `removeModifiersBySource(source)`.
- Added observable `onStatChanged`.

### 2. `src/entities/components/HealthComponent.ts`
- Implemented current/max HP tracking, invulnerability handling.
- Implemented methods: `takeDamage(amount)`, `heal(amount)`, `isDead()`, `setMaxHp(newMaxHp, scaleRatio)`.
- Added getters for `current`, `max`, `isAlive`, `healthPercent`.
- Added observables: `onHealthChanged`, `onDeath`.

### 3. `src/combat/DamageSystem.ts`
- Implemented `resolveDamage(attacker, defender)` hit calculation.
- Applied armor mitigation formula: `mitigated = raw * (100 / (100 + armor))`.
- Applied critical roll math: `isCrit = Math.random() < critChance` with `1.5x` crit multiplier.
- Added observable `onDamageApplied` notifying listeners `(target, amount, isCrit, isFatal, attacker, result)`.

### 4. `src/entities/Enemy.ts`
- Extended `Entity` base class.
- Implemented throttled FSM AI with states `Idle`, `Aggro`, `Chase`, `Attack`, `Dead`.
- Configured 300ms path query timer throttling Recast NavMesh pathing (`NavMeshManager.findPath`).
- Implemented raycast line-of-sight check against wall geometry (`scene.pickWithRay`).
- Implemented stuck detection with displacement check over rolling time window (1.0s).
- Implemented async GLB model loading from `public/assets/characters/enemies/character-orc.glb` with capsule fallback mesh.
- Integrated `StatsComponent` and `HealthComponent`.

### 5. `src/ui/JuiceOverlay.ts`
- Implemented pre-allocated pool of 40 `@babylonjs/gui` `TextBlock`s for floating combat text (FCT).
- Implemented parabolic 3D->2D projected movement (white for normal damage, gold/large for crit, green for heal).
- Implemented 100ms white hit flash queue (`emissiveColor` pulse on target mesh for Standard/PBR materials with automatic restoration).
- Implemented micro-pause hit-stop freeze frames (`triggerHitStop(durationMs)` / `triggerFreezeFrame(durationMs)`).

### 6. `src/audio/AudioManager.ts`
- Implemented Web Audio API master context with 4 buses (`Master`, `Music`, `SFX`, `UI`) and logarithmic decibel conversion `10^(dB/20)`.
- Implemented 3D Spatial Audio `PannerNode` updating listener position and orientation relative to active camera (`updateListener`).
- Implemented sidechain ducking `triggerSidechainDucking(duckDb, durationMs)` to drop music volume on heavy combat impacts.
- Implemented synthetic oscillator fallback audio for testing when WAV/MP3 files are pending.

### 7. `src/entities/Player.ts`
- Integrated `HealthComponent` and connected `StatsComponent` MaxHp updates to `HealthComponent.setMaxHp()`.

### 8. `src/index.ts`
- Bootstrapped Phase 3 subsystems (player stats/health, enemy AI instances spawned across dungeon rooms).
- Wired player attack input -> `DamageSystem.resolveDamage(player, enemy)`.
- Wired enemy AI attack -> `DamageSystem.resolveDamage(enemy, player)`.
- Connected `DamageSystem.onDamageApplied` to `JuiceOverlay` floating text, hit flash, hit-stop, and `AudioManager` spatial sound effects & sidechain ducking.
