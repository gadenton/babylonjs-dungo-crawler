# Handoff Report: Phase 5 Investigation (Loot System, Proximity Auto-Pickup & Weighted Inventory)

## 1. Observation

### Codebase Inspection & Direct References
- **`src/entities/Entity.ts`**:
  - `Entity` is an abstract class with `id: string`, `name: string`, `scene: Scene`, `transformNode: TransformNode`, `isAlive: boolean`.
  - Position/rotation getters/setters mutate `transformNode.position` and `transformNode.rotation`.
  - Defines `public abstract update(deltaTime: number): void;` and `public dispose(): void`.
- **`src/entities/Player.ts`**:
  - Holds `stats: StatsComponent`, `health: HealthComponent`, `level: number`, `xp: number`, `activeArchetypeId: ArchetypeType`, `equippedSkills: (Skill | null)[]`, `talentTree: TalentTree`.
  - Exposes `onLevelUp: Observable<number>` and `onArchetypeSwapped: Observable<ArchetypeDefinition>`.
  - Movement uses `checkCollisions = true` with ellipsoid sliding `Vector3(0.45, 0.9, 0.45)`.
  - Inputs handled via `InputManager` with 120ms buffer processing in `processInputBuffer()`.
  - Leveling curve in `getRequiredXpForNextLevel()`: `Math.floor(100 * Math.pow(this.level, 1.5))`.
- **`src/entities/Enemy.ts`**:
  - Holds `stats: StatsComponent`, `health: HealthComponent`, `state: EnemyState` (`Idle`, `Aggro`, `Chase`, `Attack`, `Dead`).
  - Throttled AI loop using `pathUpdateInterval = 0.3` (~300ms) with raycast line-of-sight (`checkLineOfSight()`) and 1.0s stuck window detection (`checkStuckCondition()`).
  - Emits `onAttackPerformed: Observable<{ target: Entity; damage: number }>`.
  - On death (`die()`), sets `isAlive = false`, `state = EnemyState.Dead`, disables `checkCollisions = false` and sets `mesh.isVisible = false`.
- **`src/combat/DamageSystem.ts`**:
  - Armor mitigation formula: `mitigatedDamage = rawDamage * (100 / (100 + Math.max(0, defenderArmor)))`.
  - Crit calculation: `isCrit = Math.random() < critChance`, scaling damage by `critMultiplier` (default 1.5x).
  - Applies health reduction via `defender.stats.modifyHealth(-finalDamage)` or `defender.health.takeDamage(finalDamage)`.
  - Emits `onDamageApplied: Observable<DamageAppliedEvent>` containing `isFatal`, `target`, `attacker`, and `result`.
- **`src/ui/HUD.ts`**:
  - Uses `@babylonjs/gui` `AdvancedDynamicTexture.CreateFullscreenUI("HUDOverlay", true, scene)`.
  - Displays status bar (Level, Archetype badge, Health bar, Mana bar, XP bar), bottom hotbar with 5 slots (Slot 0 signature skill + cooldown sweep overlay, Slots 1-4), interaction banner for Altar.
  - Subscribes to `onHealthChanged`, `onManaChanged`, `onStatChanged`, `onLevelUp`, `onArchetypeSwapped`.

### Applied Skill Guidelines
- **`rpg` skill**: Stat modifiers must never edit base stats directly; keep stats decoupled. Equipment stats push/pop `StatModifier` instances to/from `StatsComponent`. Items defined as clean data structures. XP and leveling curve handled systematically.
- **`game-ui-ux` skill**: Anchors + containers layout model, scaling to reference resolution, keyboard/gamepad focus navigation, event-driven HUD updates (no per-frame polling of UI state), clear safe-area margins.
- **`save-systems` skill**: Plain data serialization for items and inventory state (no engine node references). Schema versioning and atomic write support ready for Phase 6.

---

## 2. Logic Chain

From the observations above, Phase 5 can be implemented seamlessly without breaking existing Phase 1–4 systems by layering the Loot and Inventory architecture as follows:

```
[Enemy Death / Chest Container]
          │
          ▼ (triggers Loot Table Roll)
[LootDrop Mesh Entity in Scene] (Gold, Health/Mana Globe, Equipment)
          │
          ▼ (Player within 3.0m proximity)
┌─────────────────────────────────────────────────────────────┐
│  Proximity Auto-Pickup Check (Player.update / Inventory)    │
│  - Gold & Globes: Auto-vacuum magnet towards player (<0.5m) │
│    -> Gold added to InventoryComponent.gold                 │
│    -> HP / Mana Globes restore StatsComponent pools         │
│  - Equipment / Consumables: Auto-looted if capacity allows, │
│    or manual interaction prompt [E] / (A)                   │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  InventoryComponent (Weighted Slot Capacity: Option D1)    │
│  - Total Weight <= maxWeight (Default: 30)                  │
│  - Weight Badges: 1x (Small), 2x (Medium), 3x (Large)       │
│  - Stat Modifiers pushed to StatsComponent on Equip         │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  InventoryUI (@babylonjs/gui Fullscreen Modal)               │
│  - Toggled via [I] / [B] / Gamepad Select                    │
│  - Left: Character Sheet & Equipment Slots                  │
│  - Right: Uniform 5x4 Grid + Capacity Gauge + Gold Counter  │
│  - Focus Navigation (D-Pad/Arrows) & Drag-and-Drop          │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  HUD Integration (src/ui/HUD.ts Updates)                   │
│  - Resource Globes (HP Red / MP Blue)                        │
│  - Gold Counter display                                     │
│  - Dynamic KBM / Gamepad prompt hints ([E] / (A))           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Roadmap & Technical Specifications

### Component 1: Item Data Structures & Drop Tables (`src/entities/components/InventoryComponent.ts` & `src/combat/LootTable.ts`)

#### 1. Item Rarity & Data Contracts
```typescript
export enum Rarity {
  Common = "common",
  Magic = "magic",
  Rare = "rare",
  Legendary = "legendary",
}

export enum ItemType {
  Weapon = "weapon",
  Armor = "armor",
  Consumable = "consumable",
  Currency = "currency",
  Globe = "globe",
}

export enum EquipmentSlot {
  MainHand = "mainHand",
  OffHand = "offHand",
  Head = "head",
  Chest = "chest",
  Legs = "legs",
}

export interface ItemStatModifier {
  stat: StatType;
  type: "flat" | "percent";
  value: number;
}

export interface Item {
  id: string; // Unique instance UUID
  templateId: string; // Base template reference
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  weight: 1 | 2 | 3; // Option D1 Slot Weight Cost
  equipmentSlot?: EquipmentSlot;
  iconUrl?: string; // Icon or fallback text badge
  modelUrl?: string; // GLB drop mesh path (Kenney weapon/prop)
  stats?: ItemStatModifier[];
  stackable?: boolean;
  stackCount?: number;
  maxStack?: number;

  // Consumable & Globe effects
  healAmount?: number;
  manaAmount?: number;
  goldAmount?: number;
}
```

#### 2. Item Rarity Styling & Weight Classifications
| Rarity | Hex Color | Bonus Stat Affixes | Example Items |
|---|---|---|---|
| **Common** | `#FFFFFF` (White) | 0 bonus affixes | Iron Sword, Leather Cap, Health Potion |
| **Magic** | `#3B82F6` (Blue) | 1 bonus affix (+5–15%) | Fine Steel Sword (+12 Attack Damage), Reinforced Vest |
| **Rare** | `#EAB308` (Yellow) | 2–3 bonus affixes | Gilded Warhammer (+20 Attack, +5% Crit), Dragonhide Armor |
| **Legendary** | `#A855F7` (Purple) | 3–4 bonus affixes + Unique Effect | Sunfire Blade (+35 Attack, +10% Crit, +15% Crit Dmg), Crown of the Fallen |

| Weight Badge | Cost | Category | Examples |
|---|---|---|---|
| **`1x`** | 1 Unit | Small / Consumables | Health Potions, Mana Potions, Rings, Gold Pouch |
| **`2x`** | 2 Units | Medium Equipment | Helmets, Boots, Gloves, One-Handed Swords, Shields |
| **`3x`** | 3 Units | Large Equipment | Two-Handed Axes, Heavy Body Plate Armor, Greatswords |

#### 3. Drop Table Engine & Enemy Configurations
```typescript
export interface DropTableEntry {
  itemTemplateId?: string;
  isCurrency?: boolean;
  isGlobe?: "health" | "mana";
  minGold?: number;
  maxGold?: number;
  weight: number; // Chance weight
  rarityWeights?: Record<Rarity, number>;
}

export interface EnemyDropTable {
  goldChance: number;
  minGold: number;
  maxGold: number;
  globeChance: number;
  itemDropChance: number;
  itemRolls: number;
  rarityWeights: Record<Rarity, number>;
}

export const DROP_TABLES: Record<string, EnemyDropTable> = {
  standard: {
    goldChance: 0.65,
    minGold: 5,
    maxGold: 25,
    globeChance: 0.35,
    itemDropChance: 0.40,
    itemRolls: 1,
    rarityWeights: {
      [Rarity.Common]: 0.70,
      [Rarity.Magic]: 0.24,
      [Rarity.Rare]: 0.055,
      [Rarity.Legendary]: 0.005,
    },
  },
  elite: {
    goldChance: 1.00,
    minGold: 25,
    maxGold: 80,
    globeChance: 0.60,
    itemDropChance: 0.85,
    itemRolls: 2,
    rarityWeights: {
      [Rarity.Common]: 0.30,
      [Rarity.Magic]: 0.50,
      [Rarity.Rare]: 0.17,
      [Rarity.Legendary]: 0.03,
    },
  },
  boss: {
    goldChance: 1.00,
    minGold: 100,
    maxGold: 300,
    globeChance: 1.00,
    itemDropChance: 1.00,
    itemRolls: 4,
    rarityWeights: {
      [Rarity.Common]: 0.10,
      [Rarity.Magic]: 0.40,
      [Rarity.Rare]: 0.40,
      [Rarity.Legendary]: 0.10,
    },
  },
};
```

#### 4. Proximity Auto-Pickup & Loot Drop Entity (`src/entities/LootDrop.ts`)
- **Visuals**: Spawns a floating 3D mesh (Kenney GLB or color-coded glowing sphere) at enemy death coordinates.
- **Animation**: Y-axis hover rotation + vertical sine bobbing `y = baseHeight + Math.sin(time * 4) * 0.12`.
- **Particle Beam / Light**: Rare & Legendary items emit a vertical light pillar matching rarity hex color.
- **3-Unit Proximity Vacuum**:
  - `Player.update()` scans scene `LootDrop` entities.
  - If `Vector3.Distance(player.position, loot.position) <= 3.0m`:
    - **Gold & Globes (Auto-Pickup)**: Magnetized towards player at $12.0\text{m/s}$.
    - When distance $< 0.5\text{m}$:
      - **Gold**: `inventory.addGold(amount)` + Floating `+X Gold` text + audio chime.
      - **Health Globe**: `player.stats.modifyHealth(maxHp * 0.25)` + Green floating text `+25% HP` + heal SFX.
      - **Mana Globe**: `player.stats.modifyMana(maxMana * 0.25)` + Blue floating text `+25% MP` + mana SFX.
      - Dispose `LootDrop`.
    - **Equipment Items**: Auto-looted into inventory if `inventory.canAddItem(item)` is true; otherwise remains on ground with prompt hint `[E] Pick up <Item Name>`.

#### 5. `InventoryComponent.ts` Methods & Logic
```typescript
export class InventoryComponent {
  public maxWeight: number = 30; // Option D1 Capacity Limit
  public items: Item[] = [];
  public equipment: Map<EquipmentSlot, Item | null> = new Map([
    [EquipmentSlot.MainHand, null],
    [EquipmentSlot.OffHand, null],
    [EquipmentSlot.Head, null],
    [EquipmentSlot.Chest, null],
    [EquipmentSlot.Legs, null],
  ]);
  public gold: number = 0;

  // Observables
  public readonly onInventoryChanged: Observable<void> = new Observable<void>();
  public readonly onGoldChanged: Observable<number> = new Observable<number>();
  public readonly onItemEquipped: Observable<{ slot: EquipmentSlot; item: Item | null }> = new Observable();

  public getCurrentWeight(): number {
    return this.items.reduce((acc, item) => acc + item.weight * (item.stackCount ?? 1), 0);
  }

  public canAddItem(item: Item): boolean {
    const itemWeight = item.weight * (item.stackCount ?? 1);
    return this.getCurrentWeight() + itemWeight <= this.maxWeight;
  }

  public addItem(item: Item): boolean {
    if (!this.canAddItem(item)) return false;

    if (item.stackable) {
      const existing = this.items.find((i) => i.templateId === item.templateId);
      if (existing) {
        existing.stackCount = (existing.stackCount ?? 1) + (item.stackCount ?? 1);
        this.onInventoryChanged.notifyObservers();
        return true;
      }
    }

    this.items.push(item);
    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public removeItem(itemId: string): boolean {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      this.onInventoryChanged.notifyObservers();
      return true;
    }
    return false;
  }

  public equipItem(item: Item, playerStats: StatsComponent): boolean {
    if (!item.equipmentSlot) return false;
    const slot = item.equipmentSlot;

    // 1. Unequip current item in slot if present
    const currentEquipped = this.equipment.get(slot);
    if (currentEquipped) {
      this.unequipItem(slot, playerStats);
    }

    // 2. Remove from inventory bag
    this.removeItem(item.id);

    // 3. Place in equipment map
    this.equipment.set(slot, item);

    // 4. Apply item stat modifiers to player stats
    if (item.stats) {
      for (let i = 0; i < item.stats.length; i++) {
        const mod = item.stats[i];
        playerStats.addModifier({
          id: `equip_${slot}_${i}`,
          stat: mod.stat,
          type: mod.type,
          value: mod.value,
          source: `equipment_${slot}`,
        });
      }
    }

    this.onItemEquipped.notifyObservers({ slot, item });
    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public unequipItem(slot: EquipmentSlot, playerStats: StatsComponent): boolean {
    const item = this.equipment.get(slot);
    if (!item) return false;

    if (!this.canAddItem(item)) {
      return false; // Cannot unequip if inventory bag is full
    }

    // 1. Remove stat modifiers
    playerStats.removeModifiersBySource(`equipment_${slot}`);

    // 2. Clear equipment slot
    this.equipment.set(slot, null);

    // 3. Add item back to inventory bag
    this.addItem(item);

    this.onItemEquipped.notifyObservers({ slot, item: null });
    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public addGold(amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
    this.onGoldChanged.notifyObservers(this.gold);
  }
}
```

---

### Component 2: Inventory UI Specifications (`src/ui/InventoryUI.ts`)

#### 1. Screen Layout & Containers
- Built with `@babylonjs/gui` `AdvancedDynamicTexture`.
- Fullscreen semi-transparent backdrop: `rgba(5, 10, 18, 0.85)`.
- Main Container: `Rectangle` (`width: "900px"`, `height: "560px"`), centered with gold border (`#DAA520`).
- **Left Panel (Character & Equipment)**:
  - Width: `380px`.
  - Equipment Slot Buttons (Head, Chest, Legs, MainHand, OffHand).
  - Stat Summary List: HP, Mana, Attack Power, Armor, Crit Chance %, Move Speed.
- **Right Panel (Inventory Bag)**:
  - Width: `480px`.
  - Top: Header Title "INVENTORY" + Capacity Weight Bar ("18 / 30 Weight").
  - Center: **Uniform 5x4 Grid** (20 slots, each `80px x 80px`).
  - Bottom: Gold Counter ("Gold: 1,450").

#### 2. Slot Badge & Weight Badges
- Item slots in Grid feature:
  - Rarity Border Color: Common `#6B7280`, Magic `#3B82F6`, Rare `#EAB308`, Legendary `#A855F7`.
  - Top-Right Weight Badge: Small pill rectangle showing `1x` (Green `#22C55E`), `2x` (Yellow `#EAB308`), `3x` (Purple/Red `#EF4444`).
  - Bottom-Right Stack Count: `x5` text block for stackables.

#### 3. Focus Navigation & Controller Support (`game-ui-ux` Compliance)
- Supports D-Pad / Arrow Key grid focus switching.
- Focused slot receives glowing `#FFD700` border animation.
- Action mapping:
  - Click / Press `(A)` / `Enter`: Equip or Use Item.
  - Right-Click / Press `(X)`: Drop Item onto ground.
  - Press `[I]` / `[Escape]` / `(B)`: Close Inventory modal.

---

### Component 3: HUD Integration (`src/ui/HUD.ts`)

#### 1. Resource Globes & Status Bars
- Health Globe / Bar: Deep Red (`#DC2626`) fill with text `180 / 180`.
- Mana Globe / Bar: Royal Blue (`#2563EB`) fill with text `80 / 80`.
- Event-driven updates via `onHealthChanged` and `onManaChanged` without per-frame polling.

#### 2. Skill Hotbar & Cooldown Sweeps
- Hotbar displays 5 slots:
  - Slot 0: Signature Skill (with cooldown overlay sweep + timer text).
  - Slot 1: Archetype Ability 2.
  - Slot 2: Archetype Ability 3.
  - Slot 3: Quick Consumable (Health Potion from inventory).
  - Slot 4: Dodge Roll.
- Dynamic Input Prompt Labels:
  - Subscribes to `InputManager.onActiveDeviceChanged`.
  - When input device switches:
    - KBM: Hotbar displays `[1]`, `[2]`, `[3]`, `[4]`, `[Space]`. Pickup prompt shows `[E] Pick up`.
    - Gamepad: Hotbar displays `(X)`, `(Y)`, `(B)`, `(LB)`, `(RB)`. Pickup prompt shows `(A) Pick up`.

#### 3. Gold Counter Widget
- Gold Widget located next to Resource status panel or top-right UI.
- Displays golden coin icon + formatted gold text `1,450 Gold`.
- Subscribes to `InventoryComponent.onGoldChanged`.

---

## 4. Caveats
1. **Model Assets for Items**: Kenney Weapon Pack GLBs in `public/assets/weapons/` provide great models for weapons/shields. Generic items (potions, globes, rings) can fallback to primitive glowing spheres/cylinders with PBR materials if specific GLB models are unavailable.
2. **NavMesh Dropping**: When dropping items from inventory onto ground, use scene raycasting down to floor geometry (`groundPredicate`) to guarantee items land cleanly on walkable surfaces rather than floating in space.
3. **No Direct Code Modifications Performed**: As an explorer subagent, all findings, data contracts, and implementation architectures are documented here for the implementer agent. No source code under `src/` was mutated.

---

## 5. Conclusion

Phase 5 (Loot System, Proximity Auto-Pickup & Weighted Inventory) has a clear, robust, decoupled design that integrates perfectly with existing `Entity`, `Player`, `Enemy`, `DamageSystem`, `StatsComponent`, `InputManager`, and `HUD` architectures.

Key Architectural Decisions:
1. **Option D1 Weighted Inventory**: `InventoryComponent` enforces a 30-unit weight capacity limit using explicit item weight badges (`1x`, `2x`, `3x`), leaving base stats untouched and clean.
2. **Proximity Auto-Vacuum**: 3-unit ($3.0\text{m}$) radius auto-pickup vacuum for Gold and Health/Mana globes with smooth lerp movement into player.
3. **Decoupled Equipment Stat Modifiers**: Equipping items pushes `StatModifier` instances to `StatsComponent` tagged by slot ID; unequipping pops them by source tag without stat drift.
4. **Event-Driven `@babylonjs/gui` UI**: `InventoryUI` and `HUD` observe player/inventory events and update widgets reactively with complete keyboard/gamepad focus navigation.

---

## 6. Verification Method

To independently verify the Phase 5 implementation once coded:
1. **TypeScript Type Safety**:
   ```bash
   npx tsc --noEmit
   ```
   Must compile cleanly with zero type or syntax errors.

2. **Vite Production Build**:
   ```bash
   npm run build
   ```
   Must successfully generate bundle files in `dist/`.

3. **Runtime & E2E Gameplay Checks**:
   - Defeat enemy -> verify `LootDrop` spawns in world with rarity light beam/hover effect.
   - Walk within 3.0m of Gold or Globe -> verify auto-vacuum magnet effect triggers and restores HP/MP or adds Gold.
   - Open Inventory `[I]` -> verify Uniform 5x4 Grid, Weight Capacity Bar (`18 / 30`), and `1x`, `2x`, `3x` badges.
   - Equip item -> verify stat modifiers apply to `StatsComponent` and update HUD character stats.
   - Plug in Gamepad -> verify HUD prompts dynamically update from `[E]`/`[1]` to `(A)`/`(X)` and D-Pad navigates inventory grid focus.
