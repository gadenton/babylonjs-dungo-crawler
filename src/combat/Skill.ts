import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
  icon: string;
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
  protected timeSinceLastTick: number = 0;

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

  public updateChannelTick(
    caster: Entity & { stats: StatsComponent },
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult | null {
    if (!this.isChanneling) return null;
    if (this.def.tickRate > 0 && this.timeSinceLastTick >= this.def.tickRate) {
      this.timeSinceLastTick -= this.def.tickRate;
      return this.onChannelTick(caster, potentialTargets, juice, audio);
    }
    return null;
  }

  protected onChannelTick(
    caster: Entity & { stats: StatsComponent },
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult | null {
    return null;
  }

  public stopChanneling(): void {
    this.isChanneling = false;
    this.channelTimeRemaining = 0;
    this.timeSinceLastTick = 0;
  }

  protected triggerVisualEffects(scene: Scene, position: Vector3): void {
    if (!scene) return;
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
        mat.dispose();
        ring.dispose();
      }
    });
  }
}

// --- 1. TANK SIGNATURE SKILL: SEISMIC SLAM ---
export class SeismicSlamSkill extends Skill {
  constructor() {
    super({
      id: 'seismic_slam',
      name: 'Seismic Slam',
      description: 'Slams the ground dealing massive physical damage scaling with armor and knocking back nearby foes.',
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
      icon: 'assets/icons/seismic_slam.png',
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
          const targetMesh = (target as any).mesh ?? (target as any).transformNode;
          if (targetMesh) juice.triggerHitFlash(targetMesh, 100);
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
      icon: 'assets/icons/holy_beacon.png',
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

    // Apply immediate first tick heal
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
export class ArcaneNovaSkill extends Skill {
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
      icon: 'assets/icons/arcane_nova.png',
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
          const targetMesh = (target as any).mesh ?? (target as any).transformNode;
          if (targetMesh) juice.triggerHitFlash(targetMesh, 100);
        }
      }
    }

    if (juice && anyCrit) {
      juice.triggerHitStop(60); // Freeze frame juice on mage critical nova
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
      icon: 'assets/icons/whirlwind.png',
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
    // Start channeling
    this.isChanneling = true;
    this.channelTimeRemaining = this.def.duration;
    this.timeSinceLastTick = 0;

    // Apply immediate first tick
    return this.performWhirlwindTick(caster, potentialTargets, juice, audio);
  }

  protected override onChannelTick(
    caster: Entity & { stats: StatsComponent },
    potentialTargets: Entity[],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): SkillExecutionResult {
    return this.performWhirlwindTick(caster, potentialTargets, juice, audio);
  }

  private performWhirlwindTick(
    caster: Entity & { stats: StatsComponent },
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
