import { StatType, StatModifier } from "../entities/components/StatsComponent";
import { Entity } from "../entities/Entity";
import { StatsComponent } from "../entities/components/StatsComponent";
import {
  Skill,
  SeismicSlamSkill,
  HolyBeaconSkill,
  ArcaneNovaSkill,
  WhirlwindSkill,
} from "./Skill";

export type ArchetypeType = 'tank' | 'healer' | 'mage' | 'physical_dps';

export interface ArchetypeDefinition {
  id: ArchetypeType;
  name: string;
  title: string;
  description: string;
  icon: string;
  unlockLevel: number; // Level 1 Tank, Level 10 Healer, Level 20 Mage, Level 30 Melee DPS
  baseStats: Partial<Record<StatType, number>>;
  signatureSkill: Skill;
  passiveModifiers: StatModifier[];
}

export class ArchetypeManager {
  private static archetypes: Map<ArchetypeType, ArchetypeDefinition> = new Map();

  public static initialize(): void {
    if (this.archetypes.size > 0) return;

    // 1. TANK (Unlocked at Level 1)
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

    // 2. HEALER (Unlocked at Level 10)
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

    // 3. MAGE (Unlocked at Level 20)
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

    // 4. PHYSICAL MELEE DPS (Unlocked at Level 30)
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

  public static isArchetypeUnlocked(type: ArchetypeType, playerLevel: number): boolean {
    const arch = this.getArchetype(type);
    return playerLevel >= arch.unlockLevel;
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
