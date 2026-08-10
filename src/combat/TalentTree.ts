import { Observable } from "@babylonjs/core/Misc/observable";
import { StatsComponent, StatType, StatModifier, ModifierType } from "../entities/components/StatsComponent";
import { ArchetypeType, ArchetypeManager, ArchetypeDefinition } from "./Archetypes";

export type TalentNodeType = 'active' | 'passive';

export interface TalentNodeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: TalentNodeType;
  tier: number; // 0: Root/Active, 1: Tier 1, 2: Tier 2, 3: Tier 3 Apex
  gridPosition: { col: number; row: number }; // (col: 0..2, row: 0..3)
  prerequisites: string[]; // Node IDs required before unlocking
  maxRank: number;
  costPerRank: number;
  skillUnlockId?: string; // Identifier for signature active skill
  statModifiers?: Array<{
    stat: StatType;
    type: ModifierType;
    valuePerRank: number;
  }>;
}

export interface TalentAllocatedEvent {
  archetypeId: ArchetypeType;
  nodeId: string;
  rank: number;
  unallocatedPoints: number;
}

export interface TalentResetEvent {
  archetypeId: ArchetypeType;
  refundedPoints: number;
}

export type AllocationError =
  | "INSUFFICIENT_POINTS"
  | "PREREQUISITE_NOT_MET"
  | "MAX_RANK_REACHED"
  | "INVALID_NODE";

export const TALENT_TREES: Record<ArchetypeType, TalentNodeDef[]> = {
  tank: [
    {
      id: "tank_active",
      name: "Seismic Slam",
      description: "Unlocks the Seismic Slam signature active ability.",
      icon: "assets/icons/seismic_slam.png",
      type: "active",
      tier: 0,
      gridPosition: { col: 1, row: 0 },
      prerequisites: [],
      maxRank: 1,
      costPerRank: 1,
      skillUnlockId: "seismic_slam",
    },
    {
      id: "tank_passive_1",
      name: "Hardened Armor",
      description: "Increases flat Armor rating.",
      icon: "assets/icons/shield.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 0, row: 1 },
      prerequisites: ["tank_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.Armor, type: "flat", valuePerRank: 10 }],
    },
    {
      id: "tank_passive_2",
      name: "Iron Vitality",
      description: "Increases Maximum Health.",
      icon: "assets/icons/heart.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 2, row: 1 },
      prerequisites: ["tank_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MaxHp, type: "flat", valuePerRank: 40 }],
    },
    {
      id: "tank_passive_3",
      name: "Unstoppable Force",
      description: "Increases Movement Speed.",
      icon: "assets/icons/boots.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 0, row: 2 },
      prerequisites: ["tank_passive_1"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MoveSpeed, type: "percent", valuePerRank: 0.08 }],
    },
    {
      id: "tank_passive_4",
      name: "Defensive Bulwark",
      description: "Increases Armor by a percentage.",
      icon: "assets/icons/fortress.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 2, row: 2 },
      prerequisites: ["tank_passive_2"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.Armor, type: "percent", valuePerRank: 0.12 }],
    },
    {
      id: "tank_passive_5",
      name: "Titan's Wrath",
      description: "Increases Attack Power percentage while bolstering Max HP.",
      icon: "assets/icons/titan.png",
      type: "passive",
      tier: 3,
      gridPosition: { col: 1, row: 3 },
      prerequisites: ["tank_passive_3", "tank_passive_4"],
      maxRank: 1,
      costPerRank: 1,
      statModifiers: [
        { stat: StatType.AttackDamage, type: "percent", valuePerRank: 0.15 },
        { stat: StatType.MaxHp, type: "percent", valuePerRank: 0.15 },
      ],
    },
  ],
  healer: [
    {
      id: "healer_active",
      name: "Holy Beacon",
      description: "Unlocks the Holy Beacon signature active ability.",
      icon: "assets/icons/holy_beacon.png",
      type: "active",
      tier: 0,
      gridPosition: { col: 1, row: 0 },
      prerequisites: [],
      maxRank: 1,
      costPerRank: 1,
      skillUnlockId: "holy_beacon",
    },
    {
      id: "healer_passive_1",
      name: "Blessed Touch",
      description: "Increases flat Maximum Health.",
      icon: "assets/icons/light.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 0, row: 1 },
      prerequisites: ["healer_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MaxHp, type: "flat", valuePerRank: 30 }],
    },
    {
      id: "healer_passive_2",
      name: "Rapid Haste",
      description: "Grants Cooldown Reduction.",
      icon: "assets/icons/clock.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 2, row: 1 },
      prerequisites: ["healer_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.CooldownReduction, type: "flat", valuePerRank: 0.05 }],
    },
    {
      id: "healer_passive_3",
      name: "Divine Grace",
      description: "Increases Movement Speed.",
      icon: "assets/icons/wing.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 0, row: 2 },
      prerequisites: ["healer_passive_1"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MoveSpeed, type: "percent", valuePerRank: 0.10 }],
    },
    {
      id: "healer_passive_4",
      name: "Sanctuary",
      description: "Increases Max Health percentage.",
      icon: "assets/icons/halo.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 2, row: 2 },
      prerequisites: ["healer_passive_2"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MaxHp, type: "percent", valuePerRank: 0.15 }],
    },
    {
      id: "healer_passive_5",
      name: "Radiant Aura",
      description: "Massively boosts Cooldown Reduction and Armor.",
      icon: "assets/icons/radiance.png",
      type: "passive",
      tier: 3,
      gridPosition: { col: 1, row: 3 },
      prerequisites: ["healer_passive_3", "healer_passive_4"],
      maxRank: 1,
      costPerRank: 1,
      statModifiers: [
        { stat: StatType.CooldownReduction, type: "flat", valuePerRank: 0.10 },
        { stat: StatType.Armor, type: "percent", valuePerRank: 0.20 },
      ],
    },
  ],
  mage: [
    {
      id: "mage_active",
      name: "Arcane Nova",
      description: "Unlocks the Arcane Nova signature active ability.",
      icon: "assets/icons/arcane_nova.png",
      type: "active",
      tier: 0,
      gridPosition: { col: 1, row: 0 },
      prerequisites: [],
      maxRank: 1,
      costPerRank: 1,
      skillUnlockId: "arcane_nova",
    },
    {
      id: "mage_passive_1",
      name: "Arcane Power",
      description: "Increases flat Attack Damage.",
      icon: "assets/icons/orb.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 0, row: 1 },
      prerequisites: ["mage_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.AttackDamage, type: "flat", valuePerRank: 8 }],
    },
    {
      id: "mage_passive_2",
      name: "Spell Precision",
      description: "Increases Critical Strike Chance.",
      icon: "assets/icons/eye.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 2, row: 1 },
      prerequisites: ["mage_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.CritChance, type: "flat", valuePerRank: 0.04 }],
    },
    {
      id: "mage_passive_3",
      name: "Glass Cannon",
      description: "Increases Attack Damage percentage.",
      icon: "assets/icons/staff.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 0, row: 2 },
      prerequisites: ["mage_passive_1"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.AttackDamage, type: "percent", valuePerRank: 0.12 }],
    },
    {
      id: "mage_passive_4",
      name: "Spell Amplification",
      description: "Increases Critical Strike Damage multiplier.",
      icon: "assets/icons/wand.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 2, row: 2 },
      prerequisites: ["mage_passive_2"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.CritDamage, type: "flat", valuePerRank: 0.25 }],
    },
    {
      id: "mage_passive_5",
      name: "Arcane Overload",
      description: "Unleashes maximum critical strike power and damage.",
      icon: "assets/icons/nova_apex.png",
      type: "passive",
      tier: 3,
      gridPosition: { col: 1, row: 3 },
      prerequisites: ["mage_passive_3", "mage_passive_4"],
      maxRank: 1,
      costPerRank: 1,
      statModifiers: [
        { stat: StatType.CritChance, type: "flat", valuePerRank: 0.10 },
        { stat: StatType.AttackDamage, type: "percent", valuePerRank: 0.15 },
      ],
    },
  ],
  physical_dps: [
    {
      id: "dps_active",
      name: "Whirlwind",
      description: "Unlocks the Whirlwind signature active ability.",
      icon: "assets/icons/whirlwind.png",
      type: "active",
      tier: 0,
      gridPosition: { col: 1, row: 0 },
      prerequisites: [],
      maxRank: 1,
      costPerRank: 1,
      skillUnlockId: "whirlwind",
    },
    {
      id: "dps_passive_1",
      name: "Sharp Blades",
      description: "Increases flat Attack Damage.",
      icon: "assets/icons/sword.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 0, row: 1 },
      prerequisites: ["dps_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.AttackDamage, type: "flat", valuePerRank: 10 }],
    },
    {
      id: "dps_passive_2",
      name: "Swift Footwork",
      description: "Increases Movement Speed.",
      icon: "assets/icons/boot_blade.png",
      type: "passive",
      tier: 1,
      gridPosition: { col: 2, row: 1 },
      prerequisites: ["dps_active"],
      maxRank: 3,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.MoveSpeed, type: "percent", valuePerRank: 0.05 }],
    },
    {
      id: "dps_passive_3",
      name: "Lethal Precision",
      description: "Increases Critical Strike Chance.",
      icon: "assets/icons/target.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 0, row: 2 },
      prerequisites: ["dps_passive_1"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.CritChance, type: "flat", valuePerRank: 0.06 }],
    },
    {
      id: "dps_passive_4",
      name: "Ferocity",
      description: "Increases Critical Strike Damage multiplier.",
      icon: "assets/icons/axe.png",
      type: "passive",
      tier: 2,
      gridPosition: { col: 2, row: 2 },
      prerequisites: ["dps_passive_2"],
      maxRank: 2,
      costPerRank: 1,
      statModifiers: [{ stat: StatType.CritDamage, type: "flat", valuePerRank: 0.20 }],
    },
    {
      id: "dps_passive_5",
      name: "Bloodlust",
      description: "Increases total Attack Damage percentage and Critical Chance.",
      icon: "assets/icons/bloodlust.png",
      type: "passive",
      tier: 3,
      gridPosition: { col: 1, row: 3 },
      prerequisites: ["dps_passive_3", "dps_passive_4"],
      maxRank: 1,
      costPerRank: 1,
      statModifiers: [
        { stat: StatType.AttackDamage, type: "percent", valuePerRank: 0.20 },
        { stat: StatType.CritChance, type: "flat", valuePerRank: 0.05 },
      ],
    },
  ],
};

export class TalentTree {
  private activeArchetypeId: ArchetypeType = "tank";
  private playerLevel: number = 1;
  private statsComponent: StatsComponent;

  // Node Ranks Map per Archetype: Map<ArchetypeType, Map<NodeId, number>>
  private nodeRanks: Map<ArchetypeType, Map<string, number>> = new Map();

  // Observables
  public readonly onTalentAllocated: Observable<TalentAllocatedEvent> = new Observable();
  public readonly onTalentReset: Observable<TalentResetEvent> = new Observable();
  public readonly onArchetypeSwapped: Observable<{ previous: ArchetypeType; current: ArchetypeType }> = new Observable();

  constructor(statsComponent: StatsComponent, initialArchetype: ArchetypeType = "tank") {
    this.statsComponent = statsComponent;
    this.activeArchetypeId = initialArchetype;

    // Initialize rank maps for all archetypes
    for (const archId of Object.keys(TALENT_TREES) as ArchetypeType[]) {
      const rankMap = new Map<string, number>();
      for (const node of TALENT_TREES[archId]) {
        rankMap.set(node.id, 0);
      }
      this.nodeRanks.set(archId, rankMap);
    }
  }

  /** Set current player level & trigger point recalculation */
  public setPlayerLevel(level: number): void {
    this.playerLevel = Math.max(1, level);
  }

  public getPlayerLevel(): number {
    return this.playerLevel;
  }

  /** Total talent points earned based on level (1 point per level starting at level 2) */
  public getTotalTalentPoints(): number {
    return Math.max(0, this.playerLevel - 1);
  }

  /** Calculate spent talent points for archetype */
  public getSpentTalentPoints(archetypeId: ArchetypeType = this.activeArchetypeId): number {
    const rankMap = this.nodeRanks.get(archetypeId);
    if (!rankMap) return 0;

    let spent = 0;
    const nodes = TALENT_TREES[archetypeId];
    for (const [nodeId, rank] of rankMap.entries()) {
      const nodeDef = nodes.find((n) => n.id === nodeId);
      if (nodeDef) {
        spent += rank * nodeDef.costPerRank;
      }
    }
    return spent;
  }

  /** Get remaining unallocated talent points */
  public getUnallocatedTalentPoints(archetypeId: ArchetypeType = this.activeArchetypeId): number {
    return this.getTotalTalentPoints() - this.getSpentTalentPoints(archetypeId);
  }

  public getActiveArchetypeId(): ArchetypeType {
    return this.activeArchetypeId;
  }

  public getTalentNodes(archetypeId: ArchetypeType = this.activeArchetypeId): TalentNodeDef[] {
    return TALENT_TREES[archetypeId] ?? [];
  }

  /** Switch active archetype */
  public switchArchetype(newArchetypeId: ArchetypeType): void {
    if (this.activeArchetypeId === newArchetypeId) return;

    const previous = this.activeArchetypeId;
    // Remove previous archetype talent stat modifiers from player
    this.statsComponent.removeModifiersBySource(`talent_tree_${previous}`);

    this.activeArchetypeId = newArchetypeId;

    // Apply new archetype talent stat modifiers to player
    this.applyAllTalentModifiers(newArchetypeId);

    this.onArchetypeSwapped.notifyObservers({ previous, current: newArchetypeId });
  }

  /** Get current allocated rank of a node */
  public getNodeRank(nodeId: string, archetypeId: ArchetypeType = this.activeArchetypeId): number {
    return this.nodeRanks.get(archetypeId)?.get(nodeId) ?? 0;
  }

  /** Validate if node can be allocated */
  public canAllocateNode(nodeId: string, archetypeId: ArchetypeType = this.activeArchetypeId): { canAllocate: boolean; reason?: AllocationError } {
    const nodes = TALENT_TREES[archetypeId];
    const nodeDef = nodes.find((n) => n.id === nodeId);

    if (!nodeDef) return { canAllocate: false, reason: "INVALID_NODE" };

    const currentRank = this.getNodeRank(nodeId, archetypeId);
    if (currentRank >= nodeDef.maxRank) {
      return { canAllocate: false, reason: "MAX_RANK_REACHED" };
    }

    if (this.getUnallocatedTalentPoints(archetypeId) < nodeDef.costPerRank) {
      return { canAllocate: false, reason: "INSUFFICIENT_POINTS" };
    }

    // Verify prerequisites
    for (const preId of nodeDef.prerequisites) {
      const preDef = nodes.find((n) => n.id === preId);
      const preRank = this.getNodeRank(preId, archetypeId);
      if (!preDef || preRank < preDef.maxRank) {
        return { canAllocate: false, reason: "PREREQUISITE_NOT_MET" };
      }
    }

    return { canAllocate: true };
  }

  /** Allocate 1 rank into specified node */
  public allocateNode(nodeId: string, archetypeId: ArchetypeType = this.activeArchetypeId): boolean {
    const check = this.canAllocateNode(nodeId, archetypeId);
    if (!check.canAllocate) return false;

    const rankMap = this.nodeRanks.get(archetypeId)!;
    const newRank = (rankMap.get(nodeId) ?? 0) + 1;
    rankMap.set(nodeId, newRank);

    // Apply stat modifiers if active archetype
    if (archetypeId === this.activeArchetypeId) {
      this.applyNodeStatModifiers(nodeId, newRank, archetypeId);
    }

    this.onTalentAllocated.notifyObservers({
      archetypeId,
      nodeId,
      rank: newRank,
      unallocatedPoints: this.getUnallocatedTalentPoints(archetypeId),
    });

    return true;
  }

  /** Reset/Respec all talents for specified archetype */
  public resetTalents(archetypeId: ArchetypeType = this.activeArchetypeId): number {
    const spent = this.getSpentTalentPoints(archetypeId);
    if (spent === 0) return 0;

    const rankMap = this.nodeRanks.get(archetypeId)!;
    for (const nodeId of rankMap.keys()) {
      rankMap.set(nodeId, 0);
    }

    if (archetypeId === this.activeArchetypeId) {
      this.statsComponent.removeModifiersBySource(`talent_tree_${archetypeId}`);
    }

    this.onTalentReset.notifyObservers({ archetypeId, refundedPoints: spent });
    return spent;
  }

  /** Apply stat modifiers for a specific node rank */
  private applyNodeStatModifiers(nodeId: string, rank: number, archetypeId: ArchetypeType): void {
    const nodes = TALENT_TREES[archetypeId];
    const nodeDef = nodes.find((n) => n.id === nodeId);
    if (!nodeDef || !nodeDef.statModifiers) return;

    const sourceKey = `talent_tree_${archetypeId}`;

    for (let i = 0; i < nodeDef.statModifiers.length; i++) {
      const modDef = nodeDef.statModifiers[i];
      const modId = `talent_${archetypeId}_${nodeId}_${i}`;

      const modifier: StatModifier = {
        id: modId,
        stat: modDef.stat,
        type: modDef.type,
        value: modDef.valuePerRank * rank,
        source: sourceKey,
      };

      this.statsComponent.addModifier(modifier);
    }
  }

  /** Re-apply all node modifiers for active archetype */
  private applyAllTalentModifiers(archetypeId: ArchetypeType): void {
    const rankMap = this.nodeRanks.get(archetypeId);
    if (!rankMap) return;

    for (const [nodeId, rank] of rankMap.entries()) {
      if (rank > 0) {
        this.applyNodeStatModifiers(nodeId, rank, archetypeId);
      }
    }
  }

  /** Check if signature skill is unlocked */
  public isSignatureSkillUnlocked(archetypeId: ArchetypeType = this.activeArchetypeId): boolean {
    const nodes = TALENT_TREES[archetypeId];
    const activeNode = nodes.find((n) => n.type === "active");
    if (!activeNode) return false;
    return this.getNodeRank(activeNode.id, archetypeId) > 0;
  }

  /** Serialize state for save persistence */
  public serialize(): Record<string, Record<string, number>> {
    const data: Record<string, Record<string, number>> = {};
    for (const [archId, rankMap] of this.nodeRanks.entries()) {
      data[archId] = Object.fromEntries(rankMap);
    }
    return data;
  }

  /** Deserialize saved state */
  public deserialize(data: Record<string, Record<string, number>>): void {
    if (!data) return;
    for (const archId of Object.keys(data) as ArchetypeType[]) {
      const rankMap = this.nodeRanks.get(archId);
      if (rankMap && data[archId]) {
        for (const [nodeId, rank] of Object.entries(data[archId])) {
          rankMap.set(nodeId, rank);
        }
      }
    }
    this.applyAllTalentModifiers(this.activeArchetypeId);
  }
}
