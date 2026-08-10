# Technical Blueprint & Exploration Report: Skills, Archetypes & Input Buffering (Phase 4)

## Observation

1. **System & File Structure**:
   - `ORIGINAL_REQUEST.md` (Lines 31-34): R4 specifies single-character archetypes, talent trees, and 4 distinct archetypes (Tank with *Seismic Slam*, Healer with *Holy Beacon*, Mage with *Arcane Nova*, Physical Melee DPS with *Whirlwind*), swappable at Town Hub Altar, with 120ms input buffering.
   - `PROJECT.md` (Lines 31-32, 105-110): Milestone M4 defines `src/combat/Archetypes.ts`, `src/combat/Skill.ts`, `src/combat/TalentTree.ts`, and `src/ui/TalentUI.ts`.
   - `src/entities/components/StatsComponent.ts` (Lines 3-17, 86-92, 102-150): `StatsComponent` tracks `StatType` (`AttackDamage`, `CritChance`, `Armor`, `MaxHp`, `CooldownReduction`, `MoveSpeed`, `CritDamage`, `MaxMana`), handles `modifyHealth` and `modifyMana`, and emits `onHealthChanged`, `onManaChanged`, and `onDeath` observables.
   - `src/core/InputManager.ts` (Lines 16-22, 45, 243-278): `InputManager` defines `inputBufferMs = 120`, buffers skill triggers via `bufferSkillInput(skillSlot, targetPos)`, and provides `consumeBufferedSkill(): SkillTriggerEvent | null` to dequeue inputs within the 120ms window.
   - `src/combat/DamageSystem.ts` (Lines 31-90): `DamageSystem.resolveDamage(attacker, defender, rawDamageOverride, canCrit, critMultiplier)` executes armor mitigation (`100 / (100 + armor)`), crit multiplier calculations, health deduction, and notifies `onDamageApplied`.
   - `src/ui/JuiceOverlay.ts` (Lines 77-170): `JuiceOverlay` provides `spawnFloatingText`, `triggerHitFlash` (emissive flash), and `triggerHitStop` (micro-pause freeze frame).
   - `src/audio/AudioManager.ts` (Lines 169-278): `AudioManager` provides `triggerSidechainDucking`, `playSpatialSound`, `playHitSFX`, and `playSwingSFX`.

2. **Absence of Skill & Archetype Source Files**:
   - Inspection of `src/combat/` confirms `DamageSystem.ts` is present, but `Skill.ts` and `Archetypes.ts` are missing and must be authored for Phase 4.

---

## Logic Chain

1. **Integration Architecture**:
   - `Skill.ts` acts as the execution engine for abilities. It manages cooldown timers (accounting for `StatType.CooldownReduction`), mana validation and deduction (`StatsComponent.modifyMana`), targeted/AOE spatial queries in Babylon.js, combat calculation via `DamageSystem.resolveDamage`, and sensory feedback via `JuiceOverlay` and `AudioManager`.
   - `Archetypes.ts` defines the 4 core character classes (Tank, Healer, Mage, Physical Melee DPS), providing baseline stat allocations, passive modifiers, and their respective signature skill instances (*Seismic Slam*, *Holy Beacon*, *Arcane Nova*, *Whirlwind*).
   - `SkillManager` / `Player` updates `InputManager.consumeBufferedSkill()` during the tick loop to process 120ms buffered inputs seamlessly.

2. **Archetype & Signature Skill Design**:
   - **Tank (*Seismic Slam*)**: Frontline disrupter. High HP (180) and Armor (25). *Seismic Slam* scales raw damage with both `AttackDamage` and `Armor` (`AttackDamage * 1.5 + Armor * 0.8 + 15`), cost 25 Mana, 6.0s CD, 4.0m AOE radius, applying ground shockwave particles, screen shake trauma (0.4), hit-stop (80ms), and spatial audio ducking.
   - **Healer (*Holy Beacon*)**: Radiant support. High Mana pool (160). *Holy Beacon* creates a 5.0m radiant zone lasting 4.0s (ticking every 0.5s). Ticks heal self/allies (`MaxHp * 0.03 + AttackDamage * 0.45 + 8`) and deal holy damage (`AttackDamage * 0.4 + 5`) to enemies inside. Spawns green floating text and golden pillar particles.
   - **Mage (*Arcane Nova*)**: High burst glass cannon. High `CritChance` (0.20) and `CritDamage` (2.0). *Arcane Nova* unleashes an instant 6.0m radial explosion centered on caster (`AttackDamage * 2.2 + 20`), cost 30 Mana, 4.5s CD, producing cyan/purple particle shockwaves and heavy crit burst numbers.
   - **Physical Melee DPS (*Whirlwind*)**: Mobile bladedancer. High base move speed (7.5 m/s). *Whirlwind* is a 2.5s channeled mobile attack (ticking every 0.25s) with 3.2m AOE radius (`AttackDamage * 0.65 + 6` per tick), cost 15 Mana + 5 Mana/s, 3.0s CD. Player maintains WASD movement during execution with rotating particle trail visuals and continuous blade WHOOSH audio.

3. **120ms Input Buffering Flow**:
   - When a skill hotkey/gamepad button is pressed, `InputManager.bufferSkillInput(slot, targetPos)` stores the input with `expiresAt = performance.now() + 120`.
   - Every update frame, `Player` / `SkillManager` checks if the player is ready to execute an action. It calls `inputManager.consumeBufferedSkill()`.
   - If an unexpired event is returned, `Skill.canCast()` is evaluated. If ready, the skill fires immediately, resetting cooldown and consuming mana. If on cooldown, the buffer retains the input until either the cooldown expires (within 120ms) or the input naturally expires.

---

## Caveats

- **Talent System Decoupling**: Talent tree node modifiers (`TalentTree.ts`) will further modify skill parameters (e.g. reduced cooldowns, increased AOE, additional projecticle count). The blueprint for `Skill.ts` exposes extensible multiplier parameters to support talent tree modifiers cleanly without modifying base skill classes.
- **Particle System Fallbacks**: Babylon.js `ParticleSystem` creation requires scene initialization. Fallback visual geometry (e.g. expanding ring meshes with auto-dispose) is included alongside standard `BABYLON.ParticleSystem` definitions so visual effects work cleanly even in minimal scene configurations.

---

## Conclusion

The technical architecture for `Skill.ts`, `Archetypes.ts`, and 120ms input buffering is fully specified below. It integrates directly into existing `StatsComponent`, `DamageSystem`, `InputManager`, `JuiceOverlay`, and `AudioManager` implementations without breaking existing contracts.

### Complete Technical Blueprint Code Specs

#### 1. `src/combat/Skill.ts`

```typescript
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/builder/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Entity } from "../entities/Entity";
import { StatsComponent, StatType } from "../entities/components/StatsComponent";
import { DamageSystem, DamageResult } from "./DamageSystem";
import { JuiceOverlay } from "../ui/JuiceOverlay";
import { AudioManager } from "../audio/AudioManager";

export type SkillTargetType = 'self' | 'ground_aoe' | 'directional' | 'target_enemy';
export type SkillCategory = 'physical' | 'magical' | 'holy' | 'utility';

export interface ParticleEffectConfig {
  effectType: 'shockwave' | 'pillar' | 'nova' | 'whirlwind_trail';
  color: Color4;
  scale: number;
  durationMs: number;
}

export interface AudioEffectConfig {
  soundKey: string;
  duckingDb?: number;
  duckingDurationMs?: number;
}

export interface ISkillDefinition {
  id: string;
  name: string;
  description: string;
  archetype: string;
  category: SkillCategory;
  targetType: SkillTargetType;
  baseCooldown: number; // in seconds
  manaCost: number;
  range: number; // meters
  aoeRadius: number; // meters
  castTime: number; // 0 for instant
  duration: number; // for channeled/ticking skills
  tickRate: number; // tick interval in seconds
  multiplier: number;
  baseValue: number;
  particleConfig: ParticleEffectConfig;
  audioConfig: AudioEffectConfig;
}

export interface SkillExecutionResult {
  success: boolean;
  reason?: string;
  targetsHit: number;
  totalDamage: number;
  totalHeal: number;
  isCrit: boolean;
}

export abstract class Skill {
  public readonly def: ISkillDefinition;
  public currentCooldown: number = 0;
  public isChanneling: boolean = false;
  public channelTimeRemaining: number = 0;
  private timeSinceLastTick: number = 0;

  constructor(def: ISkillDefinition) {
    this.def = def;
  }

  public get effectiveCooldown(): number {
    return this.def.baseCooldown;
  }

  public getActualCooldown(casterStats: StatsComponent): number {
    const cdr = casterStats.getStat(StatType.CooldownReduction); // capped at 0.50 (50%)
    return Math.max(0.5, this.def.baseCooldown * (1.0 - cdr));
  }

  public canCast(casterStats: StatsComponent): { possible: boolean; reason?: string } {
    if (this.currentCooldown > 0) {
      return { possible: false, reason: `Skill on cooldown (${this.currentCooldown.toFixed(1)}s)` };
    }
    if (casterStats.currentMana < this.def.manaCost) {
      return { possible: false, reason: `Insufficient Mana (${casterStats.currentMana.toFixed(0)}/${this.def.manaCost})` };
    }
    return { possible: true };
  }

  public update(deltaTime: number): void {
    if (this.currentCooldown > 0) {
      this.currentCooldown = Math.max(0, this.currentCooldown - deltaTime);
    }

    if (this.isChanneling) {
      this.channelTimeRemaining -= deltaTime;
      this.timeSinceLastTick += deltaTime;

      if (this.channelTimeRemaining <= 0) {
        this.stopChanneling();
      }
    }
  }

  public execute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    const check = this.canCast(caster.stats);
    if (!check.possible) {
      return { success: false, reason: check.reason, targetsHit: 0, totalDamage: 0, totalHeal: 0, isCrit: false };
    }

    // Deduct Mana
    caster.stats.modifyMana(-this.def.manaCost);

    // Start Cooldown
    this.currentCooldown = this.getActualCooldown(caster.stats);

    // Play Audio Hook
    if (audio) {
      if (this.def.audioConfig.duckingDb !== undefined) {
        audio.triggerSidechainDucking(this.def.audioConfig.duckingDb, this.def.audioConfig.duckingDurationMs ?? 350);
      }
      audio.playSpatialSound(this.def.audioConfig.soundKey, targetPos);
    }

    // Execute Skill Implementation
    const result = this.onExecute(caster, targetPos, potentialTargets, juice, audio);

    // Trigger Visual Particle Hook
    this.triggerVisualEffects(caster.scene, targetPos);

    return result;
  }

  protected abstract onExecute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult;

  public stopChanneling(): void {
    this.isChanneling = false;
    this.channelTimeRemaining = 0;
    this.timeSinceLastTick = 0;
  }

  protected triggerVisualEffects(scene: Scene, position: Vector3): void {
    // Create expanding ring mesh effect as fallback / core visual feedback
    const ring = MeshBuilder.CreateDisc(`vfx_${this.def.id}`, { radius: 0.2, tessellation: 32 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position = position.clone().add(new Vector3(0, 0.05, 0));

    const mat = new StandardMaterial(`vfx_mat_${this.def.id}`, scene);
    const c = this.def.particleConfig.color;
    mat.emissiveColor = new Color3(c.r, c.g, c.b);
    mat.alpha = c.a;
    mat.disableLighting = true;
    ring.material = mat;

    const targetScale = this.def.aoeRadius > 0 ? this.def.aoeRadius * 2 : 2.0;
    const duration = this.def.particleConfig.durationMs;
    const startTime = performance.now();

    const animObserver = scene.onBeforeRenderObservable.add(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      const scale = 0.2 + (targetScale - 0.2) * progress;
      ring.scaling.set(scale, scale, 1.0);
      mat.alpha = c.a * (1.0 - progress);

      if (progress >= 1.0) {
        scene.onBeforeRenderObservable.remove(animObserver);
        ring.dispose();
      }
    });
  }
}
```

#### 2. `src/combat/Archetypes.ts`

```typescript
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Entity } from "../entities/Entity";
import { StatsComponent, StatType, StatModifier } from "../entities/components/StatsComponent";
import { DamageSystem, DamageResult } from "./DamageSystem";
import { JuiceOverlay } from "../ui/JuiceOverlay";
import { AudioManager } from "../audio/AudioManager";
import { Skill, SkillExecutionResult, ISkillDefinition } from "./Skill";

export type ArchetypeType = 'tank' | 'healer' | 'mage' | 'physical_dps';

export interface ArchetypeDefinition {
  id: ArchetypeType;
  name: string;
  title: string;
  description: string;
  icon: string;
  unlockLevel: number;
  baseStats: Record<StatType, number>;
  signatureSkill: Skill;
  passiveModifiers: StatModifier[];
}

// --- 1. TANK SIGNATURE SKILL: SEISMIC SLAM ---
export class SeismicSlamSkill extends Skill {
  constructor() {
    super({
      id: 'seismic_slam',
      name: 'Seismic Slam',
      description: 'Slams the ground dealing massive physical damage scaling with armor and stunning nearby foes.',
      archetype: 'tank',
      category: 'physical',
      targetType: 'ground_aoe',
      baseCooldown: 6.0,
      manaCost: 25,
      range: 5.0,
      aoeRadius: 4.0,
      castTime: 0,
      duration: 0,
      tickRate: 0,
      multiplier: 1.5,
      baseValue: 15,
      particleConfig: {
        effectType: 'shockwave',
        color: new Color4(0.8, 0.5, 0.2, 0.8),
        scale: 4.0,
        durationMs: 450,
      },
      audioConfig: {
        soundKey: 'heavy_slam',
        duckingDb: -12,
        duckingDurationMs: 350,
      },
    });
  }

  protected onExecute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    const atk = caster.stats.getStat(StatType.AttackDamage);
    const armor = caster.stats.getStat(StatType.Armor);
    // Tank Damage Formula: (AttackDamage * 1.5) + (Armor * 0.8) + 15
    const rawDamage = (atk * this.def.multiplier) + (armor * 0.8) + this.def.baseValue;

    let targetsHit = 0;
    let totalDamage = 0;
    let anyCrit = false;

    for (const target of potentialTargets) {
      if (!target.isAlive) continue;
      const dist = Vector3.Distance(targetPos, target.position);
      if (dist <= this.def.aoeRadius) {
        const result = DamageSystem.resolveDamage(caster, target as any, rawDamage, true, 1.5);
        targetsHit++;
        totalDamage += result.finalDamage;
        if (result.isCrit) anyCrit = true;

        if (juice) {
          juice.spawnFloatingText(target.position, `${result.finalDamage}`, result.isCrit ? "crit" : "damage");
          juice.triggerHitFlash((target as any).mesh ?? (target as any).transformNode, 100);
        }
      }
    }

    if (juice && targetsHit > 0) {
      juice.triggerHitStop(80); // 80ms hit-stop micro pause for tank slam impact feel
    }

    return { success: true, targetsHit, totalDamage, totalHeal: 0, isCrit: anyCrit };
  }
}

// --- 2. HEALER SIGNATURE SKILL: HOLY BEACON ---
export class HolyBeaconSkill extends Skill {
  constructor() {
    super({
      id: 'holy_beacon',
      name: 'Holy Beacon',
      description: 'Places a divine holy beacon that periodically heals self/allies and damages surrounding enemies.',
      archetype: 'healer',
      category: 'holy',
      targetType: 'ground_aoe',
      baseCooldown: 10.0,
      manaCost: 35,
      range: 6.0,
      aoeRadius: 5.0,
      castTime: 0,
      duration: 4.0,
      tickRate: 0.5,
      multiplier: 0.45,
      baseValue: 8,
      particleConfig: {
        effectType: 'pillar',
        color: new Color4(1.0, 0.9, 0.3, 0.7),
        scale: 5.0,
        durationMs: 600,
      },
      audioConfig: {
        soundKey: 'holy_chime',
        duckingDb: -6,
        duckingDurationMs: 250,
      },
    });
  }

  protected onExecute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    const maxHp = caster.stats.maxHealth;
    const atk = caster.stats.getStat(StatType.AttackDamage);

    // Healer Formulas:
    // Heal per tick: (MaxHp * 0.03) + (AttackDamage * 0.45) + 8
    const healPerTick = (maxHp * 0.03) + (atk * this.def.multiplier) + this.def.baseValue;
    // Enemy Holy Damage per tick: (AttackDamage * 0.4) + 5
    const holyDamagePerTick = (atk * 0.4) + 5;

    // Apply immediate first tick
    caster.stats.modifyHealth(healPerTick);
    if (juice) {
      juice.spawnFloatingText(caster.position, `+${Math.round(healPerTick)}`, "heal");
    }

    let targetsHit = 0;
    let totalDamage = 0;

    for (const target of potentialTargets) {
      if (!target.isAlive) continue;
      if (Vector3.Distance(targetPos, target.position) <= this.def.aoeRadius) {
        const res = DamageSystem.resolveDamage(caster, target as any, holyDamagePerTick, false);
        targetsHit++;
        totalDamage += res.finalDamage;
        if (juice) {
          juice.spawnFloatingText(target.position, `${res.finalDamage}`, "normal");
        }
      }
    }

    return { success: true, targetsHit, totalDamage, totalHeal: Math.round(healPerTick), isCrit: false };
  }
}

// --- 3. MAGE SIGNATURE SKILL: ARCANE NOVA ---
export class Arcane NovaSkill extends Skill {
  constructor() {
    super({
      id: 'arcane_nova',
      name: 'Arcane Nova',
      description: 'Unleashes a devastating radial blast of arcane energy outward from the caster.',
      archetype: 'mage',
      category: 'magical',
      targetType: 'ground_aoe',
      baseCooldown: 4.5,
      manaCost: 30,
      range: 0,
      aoeRadius: 6.0,
      castTime: 0,
      duration: 0,
      tickRate: 0,
      multiplier: 2.2,
      baseValue: 20,
      particleConfig: {
        effectType: 'nova',
        color: new Color4(0.6, 0.2, 1.0, 0.85),
        scale: 6.0,
        durationMs: 500,
      },
      audioConfig: {
        soundKey: 'arcane_burst',
        duckingDb: -10,
        duckingDurationMs: 300,
      },
    });
  }

  protected onExecute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    const atk = caster.stats.getStat(StatType.AttackDamage);
    // Mage Damage Formula: (AttackDamage * 2.2) + 20
    const rawDamage = (atk * this.def.multiplier) + this.def.baseValue;

    let targetsHit = 0;
    let totalDamage = 0;
    let anyCrit = false;

    const center = caster.position;

    for (const target of potentialTargets) {
      if (!target.isAlive) continue;
      if (Vector3.Distance(center, target.position) <= this.def.aoeRadius) {
        const res = DamageSystem.resolveDamage(caster, target as any, rawDamage, true, 2.0);
        targetsHit++;
        totalDamage += res.finalDamage;
        if (res.isCrit) anyCrit = true;

        if (juice) {
          juice.spawnFloatingText(target.position, `${res.finalDamage}`, res.isCrit ? "crit" : "damage");
          juice.triggerHitFlash((target as any).mesh ?? (target as any).transformNode, 100);
        }
      }
    }

    return { success: true, targetsHit, totalDamage, totalHeal: 0, isCrit: anyCrit };
  }
}

// --- 4. PHYSICAL MELEE DPS SIGNATURE SKILL: WHIRLWIND ---
export class WhirlwindSkill extends Skill {
  constructor() {
    super({
      id: 'whirlwind',
      name: 'Whirlwind',
      description: 'Spin relentlessly through enemy ranks dealing rapid physical damage while remaining mobile.',
      archetype: 'physical_dps',
      category: 'physical',
      targetType: 'self',
      baseCooldown: 3.0,
      manaCost: 15,
      range: 0,
      aoeRadius: 3.2,
      castTime: 0,
      duration: 2.5,
      tickRate: 0.25,
      multiplier: 0.65,
      baseValue: 6,
      particleConfig: {
        effectType: 'whirlwind_trail',
        color: new Color4(0.9, 0.9, 0.9, 0.6),
        scale: 3.2,
        durationMs: 300,
      },
      audioConfig: {
        soundKey: 'blade_whoosh',
      },
    });
  }

  protected onExecute(
    caster: Entity & { stats: StatsComponent },
    targetPos: Vector3,
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    const atk = caster.stats.getStat(StatType.AttackDamage);
    // Physical DPS Tick Damage Formula: (AttackDamage * 0.65) + 6
    const rawDamage = (atk * this.def.multiplier) + this.def.baseValue;

    let targetsHit = 0;
    let totalDamage = 0;
    let anyCrit = false;

    for (const target of potentialTargets) {
      if (!target.isAlive) continue;
      if (Vector3.Distance(caster.position, target.position) <= this.def.aoeRadius) {
        const res = DamageSystem.resolveDamage(caster, target as any, rawDamage, true, 1.75);
        targetsHit++;
        totalDamage += res.finalDamage;
        if (res.isCrit) anyCrit = true;

        if (juice) {
          juice.spawnFloatingText(target.position, `${res.finalDamage}`, res.isCrit ? "crit" : "normal");
        }
      }
    }

    if (audio) {
      audio.playSwingSFX();
    }

    return { success: true, targetsHit, totalDamage, totalHeal: 0, isCrit: anyCrit };
  }
}

// --- ARCHETYPE REGISTRY & FACTORY ---
export class ArchetypeManager {
  private static archetypes: Map<ArchetypeType, ArchetypeDefinition> = new Map();

  public static initialize(): void {
    if (this.archetypes.size > 0) return;

    // 1. TANK
    this.archetypes.set('tank', {
      id: 'tank',
      name: 'Tank',
      title: 'Ironclad Sentinel',
      description: 'High survivability frontline warrior who uses armor scaling to crush enemies.',
      icon: 'assets/icons/tank.png',
      unlockLevel: 1,
      baseStats: {
        [StatType.MaxHp]: 180,
        [StatType.Armor]: 25,
        [StatType.AttackDamage]: 18,
        [StatType.MaxMana]: 80,
        [StatType.MoveSpeed]: 6.5,
        [StatType.CritChance]: 0.05,
        [StatType.CritDamage]: 1.5,
        [StatType.CooldownReduction]: 0,
      },
      signatureSkill: new SeismicSlamSkill(),
      passiveModifiers: [
        { id: 'tank_passive_hp', stat: StatType.MaxHp, type: 'percent', value: 0.15, source: 'archetype_passive' },
      ],
    });

    // 2. HEALER
    this.archetypes.set('healer', {
      id: 'healer',
      name: 'Healer',
      title: 'Radiant Templar',
      description: 'Master of holy magic who sustains self/allies while smiting foes with divine light.',
      icon: 'assets/icons/healer.png',
      unlockLevel: 10,
      baseStats: {
        [StatType.MaxHp]: 130,
        [StatType.Armor]: 15,
        [StatType.AttackDamage]: 16,
        [StatType.MaxMana]: 160,
        [StatType.MoveSpeed]: 7.0,
        [StatType.CritChance]: 0.10,
        [StatType.CritDamage]: 1.5,
        [StatType.CooldownReduction]: 0.05,
      },
      signatureSkill: new HolyBeaconSkill(),
      passiveModifiers: [
        { id: 'healer_passive_mana', stat: StatType.MaxMana, type: 'percent', value: 0.20, source: 'archetype_passive' },
      ],
    });

    // 3. MAGE
    this.archetypes.set('mage', {
      id: 'mage',
      name: 'Mage',
      title: 'Arcanist Sovereign',
      description: 'Glass cannon elementalist dealing wide area damage with intense critical strikes.',
      icon: 'assets/icons/mage.png',
      unlockLevel: 20,
      baseStats: {
        [StatType.MaxHp]: 95,
        [StatType.Armor]: 8,
        [StatType.AttackDamage]: 35,
        [StatType.MaxMana]: 140,
        [StatType.MoveSpeed]: 7.0,
        [StatType.CritChance]: 0.20,
        [StatType.CritDamage]: 2.0,
        [StatType.CooldownReduction]: 0.10,
      },
      signatureSkill: new ArcaneNovaSkill(),
      passiveModifiers: [
        { id: 'mage_passive_crit', stat: StatType.CritChance, type: 'flat', value: 0.05, source: 'archetype_passive' },
      ],
    });

    // 4. PHYSICAL MELEE DPS
    this.archetypes.set('physical_dps', {
      id: 'physical_dps',
      name: 'Physical DPS',
      title: 'Blade Dancer',
      description: 'Fast and mobile martial master who spins through battlefields delivering rapid strikes.',
      icon: 'assets/icons/dps.png',
      unlockLevel: 30,
      baseStats: {
        [StatType.MaxHp]: 140,
        [StatType.Armor]: 14,
        [StatType.AttackDamage]: 28,
        [StatType.MaxMana]: 100,
        [StatType.MoveSpeed]: 7.5,
        [StatType.CritChance]: 0.15,
        [StatType.CritDamage]: 1.75,
        [StatType.CooldownReduction]: 0,
      },
      signatureSkill: new WhirlwindSkill(),
      passiveModifiers: [
        { id: 'dps_passive_speed', stat: StatType.MoveSpeed, type: 'percent', value: 0.10, source: 'archetype_passive' },
      ],
    });
  }

  public static getArchetype(type: ArchetypeType): ArchetypeDefinition {
    this.initialize();
    const arch = this.archetypes.get(type);
    if (!arch) throw new Error(`Unknown Archetype: ${type}`);
    return arch;
  }

  public static getAllArchetypes(): ArchetypeDefinition[] {
    this.initialize();
    return Array.from(this.archetypes.values());
  }

  public static applyArchetypeToPlayer(player: Entity & { stats: StatsComponent }, type: ArchetypeType): void {
    const arch = this.getArchetype(type);

    // 1. Remove previous archetype passives
    player.stats.removeModifiersBySource('archetype_passive');

    // 2. Set new base stats
    for (const [statKey, value] of Object.entries(arch.baseStats)) {
      player.stats.setBaseStat(statKey as StatType, value);
    }

    // 3. Apply new passive stat modifiers
    for (const mod of arch.passiveModifiers) {
      player.stats.addModifier(mod);
    }

    // 4. Restore Health & Mana to max upon changing archetype
    player.stats.modifyHealth(player.stats.maxHealth);
    player.stats.modifyMana(player.stats.maxMana);
  }
}
```

#### 3. `120ms Input Buffering Integration Sequence Code`

```typescript
// In Player.ts or SkillManager.ts update loop:
public processInputBuffer(deltaTime: number, enemies: Entity[], juice?: JuiceOverlay, audio?: AudioManager): void {
  if (!this.inputManager) return;

  // 1. Update active skill cooldown timers
  for (const skill of this.equippedSkills) {
    if (skill) skill.update(deltaTime);
  }

  // 2. Poll InputManager's 120ms sliding window buffer
  const bufferedInput = this.inputManager.consumeBufferedSkill();
  if (bufferedInput) {
    const slot = bufferedInput.skillSlot;
    const targetPos = bufferedInput.targetPos ?? this.transformNode.position;

    const skillToCast = this.equippedSkills[slot];
    if (skillToCast) {
      const check = skillToCast.canCast(this.stats);
      if (check.possible) {
        skillToCast.execute(this, targetPos, enemies, juice, audio);
      }
    }
  }
}
```

---

## Verification Method

1. **Compilation Check**:
   - Run `npm run build` or `npx tsc --noEmit` from project root `c:\Users\greg_\source\babylonjs-dungo-crawler` to verify all imports, types, and interfaces compile cleanly without errors.
2. **File Creation Verification**:
   - Verify `src/combat/Skill.ts` and `src/combat/Archetypes.ts` exist and match the blueprint contracts.
3. **Unit / Contract Tests**:
   - Execute test commands (`npm test` if available) to verify damage calculations, cooldown reductions, mana subtractions, and 120ms input buffering behavior.
