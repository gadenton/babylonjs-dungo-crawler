# Technical Handoff Report: Town Hub Altar & Archetype Swapping Architecture

## 1. Observation

Direct investigation of the codebase revealed the following structural details and integration points:

1. **Dungeon Generation Architecture (`src/dungeon/Generator.ts`)**:
   - `Generator.ts` (lines 1–7) defines `TileType` (`Empty = 0`, `Floor = 1`, `Wall = 2`, `Door = 3`, `Stairs = 4`).
   - `DungeonGrid` (lines 26–34) holds grid metadata including `cells`, `rooms`, `spawnPosition`, and `stairsPosition`.
   - `Generator.generate()` (lines 113–187) uses BSP tree splitting to construct room/corridor layouts. Currently, there is no specialized safe-zone layout for a Town Hub.

2. **Player Entity Architecture (`src/entities/Player.ts`)**:
   - `Player` (lines 13–77) initializes `StatsComponent` and `HealthComponent` with base values (MaxHP 120, AttackDamage 22, Armor 12, CritChance 0.15, CritDamage 1.75, MoveSpeed 7.0).
   - `Player.update()` (lines 165–217) updates stats, movement vectors, NavMesh pathing, and smooth rotation.
   - `Player` currently lacks level tracking, experience points (XP), active archetype state, and proximity interaction hooks.

3. **Stat Modifier Layer (`src/entities/components/StatsComponent.ts`)**:
   - `StatsComponent` (lines 3–17) defines `StatType` enums: `AttackDamage`, `CritChance`, `Armor`, `MaxHp`, `CooldownReduction`, `MoveSpeed`, `CritDamage`, `MaxMana`.
   - Modifiers (lines 21–29) use `StatModifier` (`id`, `stat`, `type: 'flat' | 'percent'`, `value`, `source`).
   - `StatsComponent.addModifier()` (lines 171–175) and `StatsComponent.removeModifiersBySource()` (lines 189–192) allow dynamic stat adjustments by source.
   - `recalculateAll()` (lines 222–284) computes `finalValue = (base + flatSum) * (1.0 + percentSum)` and applies bounds clamping.
   - Currently, `StatsComponent` does not track player Level or XP progression.

4. **Engine & Scene Setup (`src/index.ts`)**:
   - Lines 42–62 instantiate core subsystems, generate a 40x40 procedural dungeon, build tiles, construct Recast NavMesh, and position the player at the spawn point.
   - Main loop (lines 179–209) drives system updates per frame.

---

## 2. Logic Chain

From these observations, we derive the technical architecture for the Town Hub Altar & Archetype Swapping system:

1. **Town Hub Zone Architecture**:
   - **Requirement**: A safe sanctuary zone containing a central Altar, spawn point, and exit portal/stairs leading to procedural dungeon levels.
   - **Design**: Introduce `ZoneType` (`TownHub` | `Dungeon`). Add `Generator.generateTownHub()` or a `TownHub` builder that produces a standard 20x20 grid layout featuring a grand central hall, perimeter walls, an Altar interactive object at grid coordinate `(10, 10)`, and a Dungeon Portal at `(10, 16)`.
   - **Safe Zone Rules**: In `TownHub` zone, enemy spawning is suppressed, combat damage is disabled, and player health/mana automatically refills.

2. **Town Hub Altar Interactive Object & Proximity Zone**:
   - **Requirement**: An interactive object in world space with radial proximity detection, visual feedback, and interaction triggers (Key `E`, Gamepad `A`, or Click).
   - **Design**: Create `src/entities/TownHubAltar.ts` encapsulating an Altar mesh (loaded from Kenney dungeon/props GLB asset, e.g. pillar/altar model with an emissive point light).
   - **Proximity Detection**: Continuous distance calculation in `update()` between `player.position` and `altar.position`. If `distance <= 3.0` meters, set `player.isNearAltar = true` and display a floating prompt `"Press [E] / (A) to Access Altar"` via `JuiceOverlay` or `@babylonjs/gui`.

3. **Level Threshold Unlocking System**:
   - **Requirement**: Level threshold unlocks new archetypes every 10 levels: Level 1 (Starter), Level 10, Level 20, Level 30.
   - **Design**:
     - Extend `StatsComponent` (or add `ProgressionComponent`) to track `level` (default 1) and `currentXp`.
     - Formula: $XP_{required}(L) = 100 \times L^{1.5}$.
     - Archetype Unlock Map:
       - **Physical Melee DPS** (*Whirlwind*): Level 1 (Starter).
       - **Tank** (*Seismic Slam*): Unlocked at Level 10.
       - **Mage** (*Arcane Nova*): Unlocked at Level 20.
       - **Healer** (*Holy Beacon*): Unlocked at Level 30.
     - When player interacts with the Altar, the UI queries `player.level` against each archetype's `requiredLevel` threshold to determine unlock status (`UNLOCKED` vs `LOCKED (Requires Level X)`).

4. **Swapping Active Archetype & Stat Modifier Recalculation**:
   - **Requirement**: Recalculate stat modifiers cleanly, swap active signature skill, and update HUD upon archetype selection.
   - **Design**:
     - Archetype Modifier Definitions:
       - **Physical Melee DPS**: `CritChance` +15% (flat), `CritDamage` +50% (flat), `MoveSpeed` +15% (percent).
       - **Tank**: `MaxHp` +50% (percent), `Armor` +25 (flat), `MoveSpeed` -10% (percent).
       - **Mage**: `CooldownReduction` +35% (flat), `AttackDamage` +30% (percent).
       - **Healer**: `MaxHp` +25% (percent), `CooldownReduction` +20% (flat), `Armor` +15 (flat).
     - **Swap Execution Pipeline**:
       1. Call `player.stats.removeModifiersBySource("ArchetypeBonus")`.
       2. Fetch target archetype's stat modifier array and execute `player.stats.addModifier(mod)` for each.
       3. Clamp current health/mana to new `maxHealth` / `maxMana`.
       4. Update `player.activeArchetypeId` and swap signature skill instance in `player.signatureSkill`.
       5. Trigger visual hit/burst flash, play swap SFX via `AudioManager`, and notify HUD.

5. **Integration with Player Stats & HUD**:
   - Create `ArchetypeUI` modal window (`@babylonjs/gui`) opened when interacting with Altar.
   - Features 4 selectable cards with level requirements, passive bonuses summary, signature skill details, and "EQUIP" / "ACTIVE" buttons.
   - Supports keyboard / gamepad focus navigation (`game-ui-ux` focus manager).
   - Updates HUD status panel showing current Archetype badge, active signature skill icon, level, and XP bar.

---

## 3. Caveats

1. **Skill Data Models**: Archetype signature skills (*Whirlwind*, *Seismic Slam*, *Arcane Nova*, *Holy Beacon*) depend on the core `Skill` class being defined by `explorer_p4_1`. Our blueprint defines the exact contract interface for linking these skills to player slots.
2. **Talent Point Respec**: Archetype swapping does not reset allocated Talent Tree points (handled by `explorer_p4_2`), but stat recalculation integrates cleanly alongside talent passive modifiers using separate `source` tags (`source: "ArchetypeBonus"` vs `source: "TalentBonus"`).
3. **Asset Availability**: Visual GLB models for the Altar (e.g. `public/assets/dungeon/` or `props`) are verified available in Kenney assets. Standard fallback mesh (e.g., stylized cylinder with point light) is specified if GLB loading is delayed.

---

## 4. Conclusion

The Town Hub Altar & Archetype Swapping system requires four modular contracts:
1. `src/dungeon/TownHub.ts` & `src/entities/TownHubAltar.ts` for safe zone generation and 3-unit proximity detection.
2. Extension of `src/entities/components/StatsComponent.ts` to include Level/XP progression and $100 \times L^{1.5}$ threshold checking.
3. `src/combat/Archetypes.ts` defining the 4 Archetypes, unlock thresholds (L1, L10, L20, L30), stat modifier stacks, and signature skill mapping.
4. `src/ui/ArchetypeUI.ts` for event-driven `@babylonjs/gui` selection overlay with gamepad/keyboard focus navigation and direct HUD integration.

### Proposed Code Interfaces & Diffs

#### A. Archetypes Definition (`src/combat/Archetypes.ts`)
```typescript
import { StatType, StatModifier } from "../entities/components/StatsComponent";

export interface ArchetypeDefinition {
  id: string;
  name: string;
  requiredLevel: number;
  description: string;
  signatureSkillId: string;
  signatureSkillName: string;
  iconPath: string;
  statModifiers: StatModifier[];
}

export const ARCHETYPES: Record<string, ArchetypeDefinition> = {
  melee_dps: {
    id: "melee_dps",
    name: "Physical Melee DPS",
    requiredLevel: 1,
    description: "High mobility and critical strike damage for close-quarters combat.",
    signatureSkillId: "whirlwind",
    signatureSkillName: "Whirlwind",
    iconPath: "public/assets/icons/whirlwind.png",
    statModifiers: [
      { id: "arch_crit_chance", stat: StatType.CritChance, type: "flat", value: 0.15, source: "ArchetypeBonus" },
      { id: "arch_crit_dmg", stat: StatType.CritDamage, type: "flat", value: 0.50, source: "ArchetypeBonus" },
      { id: "arch_move_spd", stat: StatType.MoveSpeed, type: "percent", value: 0.15, source: "ArchetypeBonus" },
    ],
  },
  tank: {
    id: "tank",
    name: "Tank",
    requiredLevel: 10,
    description: "Massive health pool and armor mitigation to withstand heavy damage.",
    signatureSkillId: "seismic_slam",
    signatureSkillName: "Seismic Slam",
    iconPath: "public/assets/icons/seismic_slam.png",
    statModifiers: [
      { id: "arch_max_hp", stat: StatType.MaxHp, type: "percent", value: 0.50, source: "ArchetypeBonus" },
      { id: "arch_armor", stat: StatType.Armor, type: "flat", value: 25, source: "ArchetypeBonus" },
      { id: "arch_move_spd", stat: StatType.MoveSpeed, type: "percent", value: -0.10, source: "ArchetypeBonus" },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    requiredLevel: 20,
    description: "Devastating spell damage with high cooldown reduction.",
    signatureSkillId: "arcane_nova",
    signatureSkillName: "Arcane Nova",
    iconPath: "public/assets/icons/arcane_nova.png",
    statModifiers: [
      { id: "arch_cdr", stat: StatType.CooldownReduction, type: "flat", value: 0.35, source: "ArchetypeBonus" },
      { id: "arch_atk_dmg", stat: StatType.AttackDamage, type: "percent", value: 0.30, source: "ArchetypeBonus" },
    ],
  },
  healer: {
    id: "healer",
    name: "Healer",
    requiredLevel: 30,
    description: "Sustained health pool and holy area support capabilities.",
    signatureSkillId: "holy_beacon",
    signatureSkillName: "Holy Beacon",
    iconPath: "public/assets/icons/holy_beacon.png",
    statModifiers: [
      { id: "arch_max_hp", stat: StatType.MaxHp, type: "percent", value: 0.25, source: "ArchetypeBonus" },
      { id: "arch_cdr", stat: StatType.CooldownReduction, type: "flat", value: 0.20, source: "ArchetypeBonus" },
      { id: "arch_armor", stat: StatType.Armor, type: "flat", value: 15, source: "ArchetypeBonus" },
    ],
  },
};
```

#### B. Town Hub Altar Entity (`src/entities/TownHubAltar.ts`)
```typescript
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";

export class TownHubAltar {
  public mesh: Mesh;
  public position: Vector3;
  private light: PointLight;
  private interactionRadius: number = 3.0;

  constructor(scene: Scene, position: Vector3) {
    this.position = position.clone();
    this.mesh = CreateCylinder("townHubAltar", { height: 1.5, diameter: 1.8 }, scene);
    this.mesh.position = this.position.clone();
    this.mesh.position.y = 0.75;

    this.light = new PointLight("altarGlow", this.position.add(new Vector3(0, 2, 0)), scene);
    this.light.diffuse = new Color3(0.2, 0.6, 1.0);
    this.light.intensity = 1.5;
  }

  public isPlayerInProximity(playerPosition: Vector3): boolean {
    const dist = Vector3.Distance(this.position, playerPosition);
    return dist <= this.interactionRadius;
  }

  public dispose(): void {
    this.light.dispose();
    this.mesh.dispose();
  }
}
```

#### C. Level & Archetype Integration in Player (`src/entities/Player.ts`)
```typescript
// Proposed additions to Player class:
public activeArchetypeId: string = "melee_dps";

public setArchetype(archetypeId: string): boolean {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) return false;
  if (this.stats.level < archetype.requiredLevel) return false;

  // 1. Clear previous archetype modifiers
  this.stats.removeModifiersBySource("ArchetypeBonus");

  // 2. Apply new archetype modifiers
  for (const mod of archetype.statModifiers) {
    this.stats.addModifier(mod);
  }

  // 3. Update active archetype state & signature skill
  this.activeArchetypeId = archetypeId;
  // Trigger signature skill swap callback
  this.onArchetypeSwapped.notifyObservers(archetype);

  return true;
}
```

---

## 5. Verification Method

To independently verify this technical blueprint:

1. **Type Checking & Compilation**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```
2. **Architectural Verification**:
   - Inspect `src/combat/Archetypes.ts` to confirm 4 archetypes defined with required level thresholds (1, 10, 20, 30).
   - Inspect `src/entities/TownHubAltar.ts` to confirm 3.0m radius proximity check.
   - Inspect `src/entities/components/StatsComponent.ts` to confirm `removeModifiersBySource("ArchetypeBonus")` cleanly strips old modifiers prior to applying new ones without stat drift.
3. **Invalidation Conditions**:
   - If swapping archetypes causes stat values to stack infinitely (stat drift), verification fails.
   - If an archetype can be equipped below its `requiredLevel` threshold, verification fails.
   - If player interaction is triggered outside the 3.0m proximity radius, verification fails.
