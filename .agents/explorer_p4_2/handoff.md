# Phase 4 Handoff Report: Talent Tree & Talent UI Architecture Blueprint

**Agent:** explorer_p4_2  
**Date:** 2026-08-05  
**Milestone:** Phase 4 — Single-Character Archetypes & Talent Trees (M4)  
**Target Files:** `src/combat/Archetypes.ts`, `src/combat/TalentTree.ts`, `src/ui/TalentUI.ts`

---

## 1. Observation

Direct inspection of the current project codebase (`src/`) reveals the following foundational components:

1. **Decoupled Stat System (`src/entities/components/StatsComponent.ts`)**:
   - `StatsComponent` calculates stats dynamically using the formula: `finalValue = (base + flatSum) * (1.0 + percentSum)` (lines 240–252).
   - Supports `StatModifier` with `id`, `stat` (`StatType`), `type` (`'flat'` | `'percent'`), `value`, and `source` string (lines 21–29).
   - Supports batch modifier removal via `removeModifiersBySource(source: string)` (lines 189–192).
   - Exposes `onStatChanged` Observable emitting `StatChangeEvent` when calculated values change (lines 49, 157, 274).

2. **Input & Device Management (`src/core/InputManager.ts`)**:
   - Tracks active input device (`'kbm'` vs `'gamepad'`) and emits `onActiveDeviceChanged` Observable (lines 30, 227–232).
   - Supports 120ms input buffering for skill triggers (`bufferSkillInput`, `consumeBufferedSkill`) (lines 243–278).
   - Handles WASD / Stick direction vector overrides (`onMoveVectorChanged`).

3. **Visual UI Overlay Foundation (`src/ui/JuiceOverlay.ts`)**:
   - Uses `@babylonjs/gui` `AdvancedDynamicTexture.CreateFullscreenUI("UI_Name", true, scene)` for 2D UI overlays (line 51).
   - Operates in resolution-independent fullscreen mode with responsive controls.

4. **Project Requirements & Feature Inventory (`ORIGINAL_REQUEST.md` & `PROJECT.md`)**:
   - Requirement R4: 4 Archetypes (Tank with *Seismic Slam*, Healer with *Holy Beacon*, Mage with *Arcane Nova*, Physical Melee DPS with *Whirlwind*).
   - 1 Signature Skill Unlock node + 5 passive/stat modifier nodes per archetype.
   - Node allocation using Talent Points gained on level up.
   - Event-driven `@babylonjs/gui` UI layout (tree visualization, node buttons, tooltips).
   - Keyboard & Gamepad focus navigation complying with `game-ui-ux` skill practices.

---

## 2. Logic Chain

From the observations above, the system flow for the Talent Tree & UI is designed as follows:

```
[Level Up Event] ──► +1 Talent Point ──► [TalentTree Model] ──► Notifies UI
                                                 │
                                     Allocates Point to Node
                                                 │
                 ┌───────────────────────────────┴──────────────────────────────┐
                 ▼                                                              ▼
        [Passive Stat Node]                                           [Active Skill Node]
                 │                                                              │
   Creates `StatModifier`                                          Unlocks Signature Skill
   source: "talent_<archetype>"                                   in Player Skill Manager
                 │                                                              │
                 ▼                                                              ▼
   `StatsComponent.addModifier()`                                `InputManager` / `Player`
   Recalculates (base + flat) * (1 + %)                           Executes Skill on Slot 0
                 │                                                              │
                 └───────────────────────────────┬──────────────────────────────┘
                                                 ▼
                                     [Event-Driven TalentUI]
                                 Re-renders Node States & Tooltips
                               Updates Focus Navigation Matrix
```

1. **Character Level & Talent Points**:
   - As the player gains XP and levels up, `TalentTree` computes `totalPoints = playerLevel - 1`.
   - `unallocatedPoints = totalPoints - spentPoints`.

2. **Archetype Talent Graphs**:
   - Each of the 4 archetypes (Tank, Healer, Mage, DPS) has a deterministic 6-node directional graph (1 root signature active skill node + 5 passive modifier nodes in a 4-tier tree).
   - Prerequisites enforce graph progression (e.g., Tier 2 passive nodes require Tier 1 or Root active node).

3. **Allocation & Stat Modifier Integration**:
   - When a node is allocated, `TalentTree.allocateNode(nodeId)` validates prerequisites and point availability.
   - On success, passive nodes construct a `StatModifier` with `source: "talent_tree_<archetypeId>"` and push it directly into `StatsComponent.addModifier()`.
   - Active skill nodes set `isUnlocked = true`, allowing the combat engine to register the archetype's signature skill on the primary skill slot.

4. **Event-Driven UI Sync**:
   - `TalentUI` listens to `onTalentAllocated`, `onTalentReset`, `onArchetypeSwapped`, and `onActiveDeviceChanged`.
   - UI controls do NOT poll state in `scene.onBeforeRenderObservable`. All state updates occur in direct response to event signals.

5. **Gamepad & Keyboard Focus Navigation (`game-ui-ux`)**:
   - Maintains a 2D Focus Matrix `(x, y)` over node buttons, archetype tabs, and the reset button.
   - Highlights the currently focused element with a 3px gold/cyan border (`#00FFFF`) and scale pop (`1.05x`).
   - Automatically switches focus prompts based on `InputManager.onActiveDeviceChanged` (`'kbm'` vs `'gamepad'`).

---

## 3. Caveats

1. **Respec & Archetype Swapping in Town Hub**:
   - Archetype swapping is strictly allowed in Town Hub zones (near the Archetype Altar).
   - When swapping archetypes, active talent modifiers from the previous archetype are stripped via `StatsComponent.removeModifiersBySource("talent_tree_<oldArchetype>")`, and the new archetype's allocated talent modifiers are applied.

2. **Modifier ID Uniqueness & Overwrite Protection**:
   - Talent stat modifiers use predictable deterministic IDs (`talent_<archetype>_<nodeId>_r<rank>`) to prevent duplicate modifier stacking or orphaned stat buffs.

3. **`@babylonjs/gui` Focus & Pointer Conflicts**:
   - In `@babylonjs/gui`, pointer hovering over controls can deselect focused buttons unless focus state is explicitly managed by a custom `FocusManager` overlay layer. `TalentUI` handles focus explicitly to ensure seamless switching between mouse hover and gamepad D-Pad navigation.

4. **Screen Aspect Ratios & Safe Area**:
   - Talent UI panel is anchored to center (`Control.HORIZONTAL_ALIGNMENT_CENTER`, `Control.VERTICAL_ALIGNMENT_CENTER`) with percentage-based dynamic sizing (`width: 80%`, `height: 85%`, max `960px` x `720px`) to prevent clipping on ultrawide or mobile screens.

---

## 4. Conclusion & Technical Blueprint

### A. Data Structures & Archetype Definitions (`src/combat/Archetypes.ts`)

```typescript
import { StatType, ModifierType } from "../entities/components/StatsComponent";

export type ArchetypeId = "tank" | "healer" | "mage" | "dps";
export type TalentNodeType = "active" | "passive";

export interface TalentNodeDef {
  id: string;
  name: string;
  description: string;
  icon: string; // Icon badge or texture key
  type: TalentNodeType;
  tier: number; // 0: Root/Active, 1: Tier 1, 2: Tier 2, 3: Tier 3 Apex
  gridPosition: { col: number; row: number }; // Relative position for visual graph (col: 0..2, row: 0..3)
  prerequisites: string[]; // Node IDs required before unlocking
  maxRank: number;
  costPerRank: number;
  skillUnlockId?: string; // Identifier for active skill (e.g. "seismic_slam")
  statModifiers?: Array<{
    stat: StatType;
    type: ModifierType;
    valuePerRank: number;
  }>;
}

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  description: string;
  role: string;
  primaryStat: StatType;
  signatureSkill: {
    id: string;
    name: string;
    description: string;
    cooldownMs: number;
    manaCost: number;
    icon: string;
  };
  talentNodes: TalentNodeDef[];
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  tank: {
    id: "tank",
    name: "Guardian",
    description: "Impenetrable frontline protector utilizing crowd control and earth damage.",
    role: "Tank",
    primaryStat: StatType.Armor,
    signatureSkill: {
      id: "seismic_slam",
      name: "Seismic Slam",
      description: "Slams the ground in a 4m radius, dealing 150% attack damage and stunning enemies for 1.5s.",
      cooldownMs: 8000,
      manaCost: 25,
      icon: "skill_seismic_slam",
    },
    talentNodes: [
      {
        id: "tank_active",
        name: "Seismic Slam",
        description: "Unlocks the Seismic Slam active signature ability.",
        icon: "skill_seismic_slam",
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
        icon: "passive_shield",
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
        icon: "passive_heart",
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
        icon: "passive_boots",
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
        icon: "passive_fortress",
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
        icon: "passive_titan",
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
  },
  healer: {
    id: "healer",
    name: "Cleric",
    description: "Holy divine caster focusing on area heals, cooldown reduction, and survivability.",
    role: "Healer",
    primaryStat: StatType.CooldownReduction,
    signatureSkill: {
      id: "holy_beacon",
      name: "Holy Beacon",
      description: "Places a holy light beam healing allies for 30 HP/sec over 5 seconds.",
      cooldownMs: 12000,
      manaCost: 35,
      icon: "skill_holy_beacon",
    },
    talentNodes: [
      {
        id: "healer_active",
        name: "Holy Beacon",
        description: "Unlocks the Holy Beacon active signature ability.",
        icon: "skill_holy_beacon",
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
        icon: "passive_light",
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
        icon: "passive_clock",
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
        icon: "passive_wing",
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
        icon: "passive_halo",
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
        icon: "passive_radiance",
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
  },
  mage: {
    id: "mage",
    name: "Archmage",
    description: "Elemental master inflicting catastrophic burst damage and critical strikes.",
    role: "Mage",
    primaryStat: StatType.CritChance,
    signatureSkill: {
      id: "arcane_nova",
      name: "Arcane Nova",
      description: "Discharges a 360-degree shockwave dealing 220% magic attack damage.",
      cooldownMs: 6000,
      manaCost: 30,
      icon: "skill_arcane_nova",
    },
    talentNodes: [
      {
        id: "mage_active",
        name: "Arcane Nova",
        description: "Unlocks the Arcane Nova active signature ability.",
        icon: "skill_arcane_nova",
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
        icon: "passive_orb",
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
        icon: "passive_eye",
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
        icon: "passive_staff",
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
        icon: "passive_wand",
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
        icon: "passive_nova_apex",
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
  },
  dps: {
    id: "dps",
    name: "Berserker",
    description: "Relentless physical warrior slicing foes with swift attacks and critical execution.",
    role: "Physical Melee DPS",
    primaryStat: StatType.AttackDamage,
    signatureSkill: {
      id: "whirlwind",
      name: "Whirlwind",
      description: "Spins rapidly for 2.5s, dealing 60% attack damage every 0.25s to surrounding enemies.",
      cooldownMs: 5000,
      manaCost: 20,
      icon: "skill_whirlwind",
    },
    talentNodes: [
      {
        id: "dps_active",
        name: "Whirlwind",
        description: "Unlocks the Whirlwind active signature ability.",
        icon: "skill_whirlwind",
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
        icon: "passive_sword",
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
        icon: "passive_boot_blade",
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
        icon: "passive_target",
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
        icon: "passive_axe",
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
        description: "Increases total Attack Damage percentage and Attack Speed.",
        icon: "passive_bloodlust",
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
  },
};
```

---

### B. Talent Tree Model (`src/combat/TalentTree.ts`)

```typescript
import { Observable } from "@babylonjs/core/Misc/observable";
import { StatsComponent, StatModifier } from "../entities/components/StatsComponent";
import { ARCHETYPES, ArchetypeId, ArchetypeDef, TalentNodeDef } from "./Archetypes";

export interface NodeAllocationState {
  rank: number;
}

export interface TalentAllocatedEvent {
  archetypeId: ArchetypeId;
  nodeId: string;
  rank: number;
  unallocatedPoints: number;
}

export interface TalentResetEvent {
  archetypeId: ArchetypeId;
  refundedPoints: number;
}

export type AllocationError = 
  | "INSUFFICIENT_POINTS"
  | "PREREQUISITE_NOT_MET"
  | "MAX_RANK_REACHED"
  | "INVALID_NODE";

export class TalentTree {
  private activeArchetypeId: ArchetypeId = "tank";
  private playerLevel: number = 1;
  private statsComponent: StatsComponent;

  // Node Ranks Map per Archetype: Map<ArchetypeId, Map<NodeId, number>>
  private nodeRanks: Map<ArchetypeId, Map<string, number>> = new Map();

  // Observables
  public readonly onTalentAllocated: Observable<TalentAllocatedEvent> = new Observable();
  public readonly onTalentReset: Observable<TalentResetEvent> = new Observable();
  public readonly onArchetypeSwapped: Observable<{ previous: ArchetypeId; current: ArchetypeId }> = new Observable();

  constructor(statsComponent: StatsComponent, initialArchetype: ArchetypeId = "tank") {
    this.statsComponent = statsComponent;
    this.activeArchetypeId = initialArchetype;

    // Initialize rank maps for all archetypes
    for (const archId of Object.keys(ARCHETYPES) as ArchetypeId[]) {
      const rankMap = new Map<string, number>();
      for (const node of ARCHETYPES[archId].talentNodes) {
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

  /** Total talent points earned based on level */
  public getTotalTalentPoints(): number {
    return Math.max(0, this.playerLevel - 1);
  }

  /** Calculate spent talent points for active archetype */
  public getSpentTalentPoints(archetypeId: ArchetypeId = this.activeArchetypeId): number {
    const rankMap = this.nodeRanks.get(archetypeId);
    if (!rankMap) return 0;

    let spent = 0;
    const archDef = ARCHETYPES[archetypeId];
    for (const [nodeId, rank] of rankMap.entries()) {
      const nodeDef = archDef.talentNodes.find((n) => n.id === nodeId);
      if (nodeDef) {
        spent += rank * nodeDef.costPerRank;
      }
    }
    return spent;
  }

  /** Get remaining unallocated talent points */
  public getUnallocatedTalentPoints(archetypeId: ArchetypeId = this.activeArchetypeId): number {
    return this.getTotalTalentPoints() - this.getSpentTalentPoints(archetypeId);
  }

  public getActiveArchetype(): ArchetypeDef {
    return ARCHETYPES[this.activeArchetypeId];
  }

  public getActiveArchetypeId(): ArchetypeId {
    return this.activeArchetypeId;
  }

  /** Switch active archetype (allowed in Town Hub Altar) */
  public switchArchetype(newArchetypeId: ArchetypeId): void {
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
  public getNodeRank(nodeId: string, archetypeId: ArchetypeId = this.activeArchetypeId): number {
    return this.nodeRanks.get(archetypeId)?.get(nodeId) ?? 0;
  }

  /** Validate if node can be allocated */
  public canAllocateNode(nodeId: string, archetypeId: ArchetypeId = this.activeArchetypeId): { canAllocate: boolean; reason?: AllocationError } {
    const archDef = ARCHETYPES[archetypeId];
    const nodeDef = archDef.talentNodes.find((n) => n.id === nodeId);

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
      const preDef = archDef.talentNodes.find((n) => n.id === preId);
      const preRank = this.getNodeRank(preId, archetypeId);
      if (!preDef || preRank < preDef.maxRank) {
        return { canAllocate: false, reason: "PREREQUISITE_NOT_MET" };
      }
    }

    return { canAllocate: true };
  }

  /** Allocate 1 rank into specified node */
  public allocateNode(nodeId: string, archetypeId: ArchetypeId = this.activeArchetypeId): boolean {
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
  public resetTalents(archetypeId: ArchetypeId = this.activeArchetypeId): number {
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
  private applyNodeStatModifiers(nodeId: string, rank: number, archetypeId: ArchetypeId): void {
    const archDef = ARCHETYPES[archetypeId];
    const nodeDef = archDef.talentNodes.find((n) => n.id === nodeId);
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

      // StatsComponent.addModifier replaces existing modifier with same ID automatically
      this.statsComponent.addModifier(modifier);
    }
  }

  /** Re-apply all node modifiers for active archetype */
  private applyAllTalentModifiers(archetypeId: ArchetypeId): void {
    const rankMap = this.nodeRanks.get(archetypeId);
    if (!rankMap) return;

    for (const [nodeId, rank] of rankMap.entries()) {
      if (rank > 0) {
        this.applyNodeStatModifiers(nodeId, rank, archetypeId);
      }
    }
  }

  /** Check if signature skill is unlocked */
  public isSignatureSkillUnlocked(archetypeId: ArchetypeId = this.activeArchetypeId): boolean {
    const archDef = ARCHETYPES[archetypeId];
    const activeNode = archDef.talentNodes.find((n) => n.type === "active");
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
    for (const archId of Object.keys(data) as ArchetypeId[]) {
      const rankMap = this.nodeRanks.get(archId);
      if (rankMap && data[archId]) {
        for (const [nodeId, rank] of Object.entries(data[archId])) {
          rankMap.set(nodeId, rank);
        }
      }
    }
    if (this.statsComponent) {
      this.statsComponent.removeModifiersBySource(`talent_tree_${this.activeArchetypeId}`);
      this.applyAllTalentModifiers(this.activeArchetypeId);
    }
  }
}
```

---

### C. Talent Tree GUI Interface (`src/ui/TalentUI.ts`)

```typescript
import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Line } from "@babylonjs/gui/2D/controls/line";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { InputManager, InputDeviceType } from "../core/InputManager";
import { TalentTree } from "../combat/TalentTree";
import { ARCHETYPES, ArchetypeId, TalentNodeDef } from "../combat/Archetypes";

export class TalentUI {
  private scene: Scene;
  private talentTree: TalentTree;
  private inputManager: InputManager;

  private guiTexture: AdvancedDynamicTexture;
  private mainOverlayPanel: Rectangle;
  private nodeButtons: Map<string, Button> = new Map();
  private connectionLines: Line[] = [];

  // Focus Navigation state
  private activeDevice: InputDeviceType = "kbm";
  private focusedControlId: string | null = null;
  private focusableControls: string[] = []; // Array of control IDs for gamepad navigation

  // Header & Info UI
  private pointsText: TextBlock;
  private archetypeTabs: Map<ArchetypeId, Button> = new Map();
  private resetButton: Button;

  // Tooltip Controls
  private tooltipPanel: Rectangle;
  private tooltipTitle: TextBlock;
  private tooltipDesc: TextBlock;
  private tooltipStats: TextBlock;
  private tooltipStatus: TextBlock;

  private isVisible: boolean = false;

  constructor(scene: Scene, talentTree: TalentTree, inputManager: InputManager) {
    this.scene = scene;
    this.talentTree = talentTree;
    this.inputManager = inputManager;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("TalentTreeUI", true, this.scene);

    this.createUIElements();
    this.setupEventHandlers();
    this.hide();
  }

  private createUIElements(): void {
    // 1. Root Darkened Backdrop
    this.mainOverlayPanel = new Rectangle("TalentMainPanel");
    this.mainOverlayPanel.width = "90%";
    this.mainOverlayPanel.height = "90%";
    this.mainOverlayPanel.maxWidth = "1000px";
    this.mainOverlayPanel.maxHeight = "760px";
    this.mainOverlayPanel.background = "#0c0d14EE";
    this.mainOverlayPanel.color = "#FFD700";
    this.mainOverlayPanel.thickness = 2;
    this.mainOverlayPanel.cornerRadius = 10;
    this.mainOverlayPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.mainOverlayPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.guiTexture.addControl(this.mainOverlayPanel);

    // 2. Header Container (Title, Tabs, Points)
    const headerGrid = new Grid("HeaderGrid");
    headerGrid.height = "80px";
    headerGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    headerGrid.addColumnDefinition(0.3); // Archetype Title
    headerGrid.addColumnDefinition(0.5); // Archetype Tabs
    headerGrid.addColumnDefinition(0.2); // Talent Points & Reset
    this.mainOverlayPanel.addControl(headerGrid);

    // Title
    const titleText = new TextBlock("TitleText", "TALENT TREE");
    titleText.color = "#FFD700";
    titleText.fontSize = 24;
    titleText.fontWeight = "bold";
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.paddingLeft = "20px";
    headerGrid.addControl(titleText, 0, 0);

    // Archetype Tabs Container
    const tabsPanel = new StackPanel("TabsPanel");
    tabsPanel.isVertical = false;
    tabsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    headerGrid.addControl(tabsPanel, 0, 1);

    const archetypes: ArchetypeId[] = ["tank", "healer", "mage", "dps"];
    for (const archId of archetypes) {
      const tabBtn = Button.CreateSimpleButton(`tab_${archId}`, ARCHETYPES[archId].name.toUpperCase());
      tabBtn.width = "100px";
      tabBtn.height = "36px";
      tabBtn.color = "#FFFFFF";
      tabBtn.background = "#1f2233";
      tabBtn.cornerRadius = 4;
      tabBtn.paddingRight = "5px";

      tabBtn.onPointerClickObservable.add(() => {
        this.talentTree.switchArchetype(archId);
      });

      tabsPanel.addControl(tabBtn);
      this.archetypeTabs.set(archId, tabBtn);
    }

    // Points & Reset
    const pointsContainer = new StackPanel("PointsPanel");
    pointsContainer.isVertical = true;
    pointsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    pointsContainer.paddingRight = "20px";
    headerGrid.addControl(pointsContainer, 0, 2);

    this.pointsText = new TextBlock("PointsText", "Points: 0");
    this.pointsText.color = "#00FFFF";
    this.pointsText.fontSize = 18;
    this.pointsText.height = "25px";
    pointsContainer.addControl(this.pointsText);

    this.resetButton = Button.CreateSimpleButton("resetBtn", "RESET");
    this.resetButton.width = "90px";
    this.resetButton.height = "28px";
    this.resetButton.color = "#FF5252";
    this.resetButton.background = "#2a1515";
    this.resetButton.cornerRadius = 4;
    this.resetButton.onPointerClickObservable.add(() => {
      this.talentTree.resetTalents();
    });
    pointsContainer.addControl(this.resetButton);

    // 3. Tree Graph Area (Canvas Grid for Nodes)
    const treeGrid = new Rectangle("TreeGridArea");
    treeGrid.width = "100%";
    treeGrid.height = "520px";
    treeGrid.top = "40px";
    treeGrid.thickness = 0;
    this.mainOverlayPanel.addControl(treeGrid);

    this.buildTreeNodes(treeGrid);

    // 4. Tooltip Popup Overlay
    this.createTooltipPanel();
  }

  private buildTreeNodes(container: Rectangle): void {
    // Clear old lines & buttons
    for (const line of this.connectionLines) line.dispose();
    this.connectionLines = [];
    for (const btn of this.nodeButtons.values()) btn.dispose();
    this.nodeButtons.clear();
    this.focusableControls = [];

    // Add Tabs & Reset to focus list
    for (const tabBtn of this.archetypeTabs.values()) {
      this.focusableControls.push(tabBtn.name!);
    }
    this.focusableControls.push(this.resetButton.name!);

    const currentArch = this.talentTree.getActiveArchetype();

    // Map column & row to relative pixel positions inside 900x500 box
    const colX = [-220, 0, 220]; // 3 columns
    const rowY = [-180, -60, 60, 180]; // 4 rows (tiers 0..3)

    // First pass: Draw connections (Lines)
    for (const node of currentArch.talentNodes) {
      const startX = colX[node.gridPosition.col];
      const startY = rowY[node.gridPosition.row];

      for (const preId of node.prerequisites) {
        const preNode = currentArch.talentNodes.find((n) => n.id === preId);
        if (preNode) {
          const endX = colX[preNode.gridPosition.col];
          const endY = rowY[preNode.gridPosition.row];

          const line = new Line(`line_${preId}_${node.id}`);
          line.x1 = endX;
          line.y1 = endY;
          line.x2 = startX;
          line.y2 = startY;
          line.lineWidth = 3;
          line.color = "#444455"; // Grey default
          container.addControl(line);
          this.connectionLines.push(line);
        }
      }
    }

    // Second pass: Create Node Buttons
    for (const node of currentArch.talentNodes) {
      const btn = Button.CreateSimpleButton(`btn_${node.id}`, "");
      btn.width = "72px";
      btn.height = "72px";
      btn.cornerRadius = node.type === "active" ? 36 : 8; // Circle for active skill, square for passives
      btn.left = `${colX[node.gridPosition.col]}px`;
      btn.top = `${rowY[node.gridPosition.row]}px`;
      btn.thickness = 2;
      btn.color = "#888899";
      btn.background = "#181a24";

      // Label inside button
      const rankText = new TextBlock(`rank_${node.id}`, `${this.talentTree.getNodeRank(node.id)}/${node.maxRank}`);
      rankText.color = "#FFFFFF";
      rankText.fontSize = 14;
      rankText.fontWeight = "bold";
      btn.addControl(rankText);

      // Mouse Hover Tooltip & Click
      btn.onPointerEnterObservable.add(() => {
        this.setFocusControl(btn.name!);
        this.showTooltip(node);
      });
      btn.onPointerOutObservable.add(() => {
        this.hideTooltip();
      });

      btn.onPointerClickObservable.add(() => {
        this.talentTree.allocateNode(node.id);
      });

      container.addControl(btn);
      this.nodeButtons.set(node.id, btn);
      this.focusableControls.push(btn.name!);
    }
  }

  private createTooltipPanel(): void {
    this.tooltipPanel = new Rectangle("TalentTooltip");
    this.tooltipPanel.width = "260px";
    this.tooltipPanel.height = "160px";
    this.tooltipPanel.background = "#05060aFB";
    this.tooltipPanel.color = "#00FFFF";
    this.tooltipPanel.thickness = 2;
    this.tooltipPanel.cornerRadius = 6;
    this.tooltipPanel.isVisible = false;
    this.mainOverlayPanel.addControl(this.tooltipPanel);

    const stack = new StackPanel("TooltipStack");
    stack.paddingLeft = "10px";
    stack.paddingRight = "10px";
    stack.paddingTop = "8px";
    this.tooltipPanel.addControl(stack);

    this.tooltipTitle = new TextBlock("ttTitle", "");
    this.tooltipTitle.color = "#FFD700";
    this.tooltipTitle.fontSize = 16;
    this.tooltipTitle.fontWeight = "bold";
    this.tooltipTitle.height = "24px";
    stack.addControl(this.tooltipTitle);

    this.tooltipDesc = new TextBlock("ttDesc", "");
    this.tooltipDesc.color = "#CCCCCC";
    this.tooltipDesc.fontSize = 12;
    this.tooltipDesc.textWrapping = true;
    this.tooltipDesc.height = "55px";
    stack.addControl(this.tooltipDesc);

    this.tooltipStats = new TextBlock("ttStats", "");
    this.tooltipStats.color = "#32CD32";
    this.tooltipStats.fontSize = 13;
    this.tooltipStats.fontWeight = "bold";
    this.tooltipStats.height = "25px";
    stack.addControl(this.tooltipStats);

    this.tooltipStatus = new TextBlock("ttStatus", "");
    this.tooltipStatus.color = "#FF5252";
    this.tooltipStatus.fontSize = 12;
    this.tooltipStatus.height = "22px";
    stack.addControl(this.tooltipStatus);
  }

  private showTooltip(node: TalentNodeDef): void {
    const rank = this.talentTree.getNodeRank(node.id);
    this.tooltipTitle.text = `${node.name} (${rank}/${node.maxRank})`;
    this.tooltipDesc.text = node.description;

    if (node.statModifiers && node.statModifiers.length > 0) {
      const statsStr = node.statModifiers
        .map((m) => `+${m.valuePerRank * Math.max(1, rank)} ${m.type === "percent" ? "%" : ""} ${m.stat}`)
        .join(", ");
      this.tooltipStats.text = statsStr;
    } else {
      this.tooltipStats.text = "Unlocks Active Skill";
    }

    const check = this.talentTree.canAllocateNode(node.id);
    if (rank >= node.maxRank) {
      this.tooltipStatus.text = "MAX RANK REACHED";
      this.tooltipStatus.color = "#FFD700";
    } else if (check.canAllocate) {
      this.tooltipStatus.text = "Click / Press A to Allocate (1 Point)";
      this.tooltipStatus.color = "#32CD32";
    } else {
      this.tooltipStatus.text = `LOCKED: ${check.reason}`;
      this.tooltipStatus.color = "#FF5252";
    }

    // Position tooltip relative to button
    const btn = this.nodeButtons.get(node.id);
    if (btn) {
      this.tooltipPanel.left = `${parseFloat(btn.left as string) + 160}px`;
      this.tooltipPanel.top = `${parseFloat(btn.top as string)}px`;
    }

    this.tooltipPanel.isVisible = true;
  }

  private hideTooltip(): void {
    this.tooltipPanel.isVisible = false;
  }

  private setupEventHandlers(): void {
    // 1. Talent Tree State Observables
    this.talentTree.onTalentAllocated.add(() => this.updateUIState());
    this.talentTree.onTalentReset.add(() => this.updateUIState());
    this.talentTree.onArchetypeSwapped.add(() => {
      this.buildTreeNodes(this.mainOverlayPanel.getChildByName("TreeGridArea") as Rectangle);
      this.updateUIState();
    });

    // 2. Device Swap Listener
    this.inputManager.onActiveDeviceChanged.add((device) => {
      this.activeDevice = device;
      if (this.isVisible && device === "gamepad" && !this.focusedControlId) {
        this.setFocusControl(this.focusableControls[0]);
      }
    });

    // 3. Keydown Listener for Gamepad/Keyboard Focus Navigation
    window.addEventListener("keydown", (evt) => {
      if (!this.isVisible) return;

      if (evt.code === "Escape" || evt.code === "KeyN") {
        this.toggle();
      } else if (evt.code === "ArrowUp" || evt.code === "KeyW") {
        this.navigateFocus(0, -1);
      } else if (evt.code === "ArrowDown" || evt.code === "KeyS") {
        this.navigateFocus(0, 1);
      } else if (evt.code === "ArrowLeft" || evt.code === "KeyA") {
        this.navigateFocus(-1, 0);
      } else if (evt.code === "ArrowRight" || evt.code === "KeyD") {
        this.navigateFocus(1, 0);
      } else if (evt.code === "Enter" || evt.code === "Space") {
        this.activateFocusedControl();
      }
    });
  }

  private updateUIState(): void {
    const points = this.talentTree.getUnallocatedTalentPoints();
    this.pointsText.text = `Points: ${points}`;

    const currentArch = this.talentTree.getActiveArchetype();

    // Update Tab Colors
    for (const [archId, tabBtn] of this.archetypeTabs.entries()) {
      if (archId === this.talentTree.getActiveArchetypeId()) {
        tabBtn.background = "#FFD700";
        tabBtn.color = "#000000";
      } else {
        tabBtn.background = "#1f2233";
        tabBtn.color = "#FFFFFF";
      }
    }

    // Update Node Button Colors & Badges
    for (const node of currentArch.talentNodes) {
      const btn = this.nodeButtons.get(node.id);
      if (!btn) continue;

      const rank = this.talentTree.getNodeRank(node.id);
      const check = this.talentTree.canAllocateNode(node.id);

      const rankText = btn.getChildByName(`rank_${node.id}`) as TextBlock;
      if (rankText) rankText.text = `${rank}/${node.maxRank}`;

      if (rank >= node.maxRank) {
        btn.background = "#1E88E5"; // Allocated / Maxed Blue
        btn.color = "#FFD700"; // Gold Border
      } else if (check.canAllocate) {
        btn.background = "#2E7D32"; // Available Green
        btn.color = "#00FF00";
      } else {
        btn.background = "#181a24"; // Locked Dark
        btn.color = "#555566";
      }
    }
  }

  private setFocusControl(controlId: string): void {
    this.focusedControlId = controlId;

    // Apply focus highlight
    for (const btnName of this.focusableControls) {
      const ctrl = this.guiTexture.getControlByName(btnName);
      if (ctrl) {
        if (btnName === controlId) {
          ctrl.color = "#00FFFF"; // Bright Cyan Focus Halo
          (ctrl as any).thickness = 4;
        } else if (!btnName.startsWith("tab_")) {
          (ctrl as any).thickness = 2;
        }
      }
    }
  }

  private navigateFocus(dx: number, dy: number): void {
    if (!this.focusedControlId) {
      if (this.focusableControls.length > 0) this.setFocusControl(this.focusableControls[0]);
      return;
    }

    const idx = this.focusableControls.indexOf(this.focusedControlId);
    if (idx === -1) return;

    let nextIdx = (idx + (dx !== 0 ? dx : dy * 3) + this.focusableControls.length) % this.focusableControls.length;
    this.setFocusControl(this.focusableControls[nextIdx]);

    // Update tooltip if focused control is a talent node button
    const nodeBtnPrefix = "btn_";
    if (this.focusedControlId.startsWith(nodeBtnPrefix)) {
      const nodeId = this.focusedControlId.replace(nodeBtnPrefix, "");
      const currentArch = this.talentTree.getActiveArchetype();
      const nodeDef = currentArch.talentNodes.find((n) => n.id === nodeId);
      if (nodeDef) this.showTooltip(nodeDef);
    }
  }

  private activateFocusedControl(): void {
    if (!this.focusedControlId) return;

    const ctrl = this.guiTexture.getControlByName(this.focusedControlId);
    if (ctrl && ctrl instanceof Button) {
      // Direct trigger
      ctrl.onPointerClickObservable.notifyObservers({} as any);
    }
  }

  public show(): void {
    this.isVisible = true;
    this.mainOverlayPanel.isVisible = true;
    this.updateUIState();
    this.setFocusControl(this.focusableControls[0]);
  }

  public hide(): void {
    this.isVisible = false;
    this.mainOverlayPanel.isVisible = false;
    this.hideTooltip();
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  public dispose(): void {
    this.guiTexture.dispose();
    this.nodeButtons.clear();
    this.archetypeTabs.clear();
  }
}
```

---

## 5. Verification Method

To verify this implementation during Phase 4 development:

1. **Static Analysis & Type Verification**:
   - Run `npx tsc --noEmit` to verify type safety across `StatsComponent`, `TalentTree`, `Archetypes`, and `TalentUI`.

2. **Unit Test Verification (`src/combat/TalentTree.test.ts`)**:
   - Verify level-to-point calculation: Level 1 -> 0 points, Level 5 -> 4 points.
   - Verify node prerequisite gating: Attempting to allocate Tier 2 passive before Tier 1 yields `PREREQUISITE_NOT_MET`.
   - Verify stat modifier stacking: Allocating `Hardened Armor` (Rank 2) adds `+20` flat armor to `StatsComponent`.
   - Verify archetype swap: Switching from Tank to Mage strips Tank stat modifiers and applies Mage stat modifiers.

3. **UI Focus & Gamepad Manual Verification**:
   - Open Talent UI in browser via `KeyN`.
   - Press Arrow Keys / WASD or Gamepad D-Pad: confirm focus border moves with cyan halo (`#00FFFF`) and scale feedback.
   - Press Enter/Space or Gamepad Button A on node: confirm node rank updates, talent points decrement, and tooltip updates dynamically.
   - Resize window to ultrawide / 4:3 aspect ratios: confirm center anchoring and grid alignment remain perfectly intact without edge clipping.
