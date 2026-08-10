# Phase 5 Technical Handoff Report: Auto-Loot Physics, 3D Drop Meshes & Stat Modifiers

## Executive Summary
This report presents the architectural analysis, technical investigation, and implementation roadmap for **Phase 5 (Loot System, Auto-Pickup Physics, Weighted Inventory & Equipment Stat Modifiers)** of the Babylon.js ARPG Dungeon Crawler.

---

## 1. Observation

### 1.1 Existing Component & System State
- **`StatsComponent.ts`** (`src/entities/components/StatsComponent.ts`):
  - Implements decoupled stat modifier math: `finalValue = (base + flatSum) * (1.0 + percentSum)` (lines 242–268).
  - Contains clamping bounds for `CritChance` [0, 1.0], `CooldownReduction` [0, 0.50], `Armor` [>=0], `MaxHp`/`MaxMana` [>=1.0], `MoveSpeed` [>=0.1].
  - Modifiers supported by ID (`addModifier`, `removeModifier`) and by source (`removeModifiersBySource(source)`).
  - Health & Mana pools (`_currentHealth`, `_currentMana`) with `modifyHealth(amount)` and `modifyMana(amount)` notifying `onHealthChanged`, `onManaChanged`, and `onDeath` observables.
- **`Enemy.ts`** (`src/entities/Enemy.ts`):
  - Enemy death triggers `die()` (line 355), updating state to `EnemyState.Dead`, disabling collision, and notifying `stats.onDeath` and `health.onDeath`.
- **`Player.ts`** (`src/entities/Player.ts`):
  - Integrates `StatsComponent` and `HealthComponent`. Exposes `level`, `xp`, `gainXp(amount)`.
- **`HUD.ts`** (`src/ui/HUD.ts`):
  - Displays level, XP, health/mana bars, skill hotbar, and interaction banner (`showInteractionPrompt`, `hideInteractionPrompt`).
- **Assets Available**:
  - `public/assets/props/`: Contains `coin.glb`, `chest.glb`, `weapon-sword.glb`, `weapon-spear.glb`, `shield-rectangle.glb`, `shield-round.glb`, `barrel.glb`, `trap.glb`.
  - `public/assets/weapons/`: Contains `machinegun.glb`, `shotgun.glb`, `sniper.glb`, `knife_sharp.glb`, `uziGold.glb`, `grenade.glb`.
  - Kenney All-in-1 Source: `C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0\3D assets\` contains full 3D GLB kits.
- **Testing Infrastructure**:
  - Headless test execution configured with `tsx` (`"tsx": "^4.23.5"` in `package.json`).
  - Executed existing tests (`tests/phase4_empirical_test.ts` and `tests/phase3_empirical.test.ts`) via `npx tsx` — all passed in < 2 seconds.

---

## 2. Logic Chain

1. **Item Drop Spawning on Enemy Death**:
   - When `Enemy.die()` is invoked or `enemy.stats.onDeath` fires, `LootSystem` rolls against a weighted drop table across 4 rarity tiers (`Common`, `Magic`, `Rare`, `Legendary`).
   - An `ItemDrop` 3D entity is spawned at enemy ground position (`Y = 0.05`).
   - The drop consists of:
     - 3D GLB mesh (`coin.glb` for gold, potion/gem model for globes, weapon/shield/armor GLBs for gear).
     - Base Rarity Glow Ring (Torus/Disc mesh with emissive material matching rarity tier color).
     - Floating 3D Billboard Text Block (`@babylonjs/gui` 3D or 2D GUI overlay projected over mesh position) displaying item name and rarity.
     - Idle float animation (`Y` position `sin(time * 3.0) * 0.1`) and Y-axis rotation (`yaw += 1.5 * dt`).

2. **Proximity Magnet Motion (3-Unit Radius)**:
   - On each frame, `LootSystem.update(dt)` calculates `Vector3.Distance(item.position, player.position)`.
   - If distance $\le 3.0$ units, item enters magnet mode:
     - Vector direction: `dir = player.position.subtract(item.position).normalize()`.
     - Velocity accelerates over time towards player: `velocity = dir.scale(magnetSpeed)`.
     - Item position updates: `item.position.addInPlace(velocity * dt)`.
   - When distance $\le 0.5$ units, pickup completes instantly.

3. **Instant Stat / Resource Restoration (Globes & Gold)**:
   - **Gold**: Added directly to player's gold currency counter (`inventory.addGold(amount)`). Triggers gold pickup SFX and floating text `+25 Gold`.
   - **Health Globe**: Calls `player.stats.modifyHealth(40)`. Triggers heal SFX and green floating text `+40 HP`.
   - **Mana Globe**: Calls `player.stats.modifyMana(25)`. Triggers mana SFX and blue floating text `+25 MP`.
   - Consumable/Currency items dispose 3D item drop mesh immediately.

4. **Equipment Stat Modifiers & Stat Drift Prevention**:
   - `Item` data structure contains an array of `StatModifier` definitions (e.g. `StatType.AttackDamage` +15 flat, `StatType.CritChance` +10% percent).
   - When equipped into slot $S$ (`Weapon`, `Armor`, `Helmet`, `Accessory`):
     - If slot $S$ has an existing item, unequip it first via `player.stats.removeModifiersBySource("equip_" + S)`.
     - Apply new item modifiers via `player.stats.addModifier({ ...mod, id: "equip_" + S + "_" + mod.stat, source: "equip_" + S })`.
   - Because `StatsComponent` evaluates `(base + flat) * (1 + percent)` on demand without mutating `baseStats`, equipping and unequipping an item $N$ times guarantees zero cumulative stat drift.

5. **Option D1 Weighted Slot Inventory (`InventoryComponent` & `InventoryUI`)**:
   - Max weight capacity (e.g., 20 weight units).
   - Item Weight Badges: `1x` (light: gold, globes, rings), `2x` (medium: swords, helmets, shields), `3x` (heavy: plate armor, heavy weapons).
   - Uniform Grid UI (`InventoryUI.ts`) built with `@babylonjs/gui`. Each slot displays item icon/label, rarity border, and explicit `1x`, `2x`, `3x` weight badge.
   - Controller / Keyboard navigation support: Focus border updates with Arrow/WASD keys and Gamepad D-pad (`game-ui-ux` focus pattern).

---

## 3. Caveats

1. **Headless GLB Loading in Unit Tests**:
   - In Node.js environment (`NullEngine`), `SceneLoader.ImportMeshAsync` fails due to missing `XMLHttpRequest` / `DOM` environment unless polyfilled or mocked.
   - *Resolution*: Unit tests for `LootSystem` and `InventoryComponent` should mock item drop creation using primitive meshes (`CreateSphere`/`CreateBox`) or test data structures directly.
2. **Inventory Full State during Magnet Motion**:
   - If player's inventory weight capacity is reached while magnetized towards an equipment drop, the item should pause magnet acceleration and rest on the ground with a visual "Inventory Full" toast message.
3. **Graphics & FX Scaling**:
   - Glow ring emissive material and floating text billboards should be pooled or disposed cleanly on item pickup to avoid memory leaks.

---

## 4. Conclusion

The existing codebase architecture (`StatsComponent`, `Enemy`, `Player`, `HUD`) is fully prepared for Phase 5 implementation. `StatsComponent` already possesses the necessary modifier stack algorithms (`addModifier`, `removeModifiersBySource`, base-relative recalculations) to support equipment stat modifiers without stat drift.

By adding `Item.ts`, `LootSystem.ts`, `ItemDrop.ts`, `InventoryComponent.ts`, and `InventoryUI.ts`, Phase 5 will complete the ARPG core loot loop.

---

## 5. Implementation Roadmap for Phase 5

```
Phase 5: Loot System, Auto-Pickup Physics & Equipment Stat Modifiers
├── 1. Data Models & Drop Tables (`src/entities/Item.ts`, `src/combat/LootTable.ts`)
│   ├── Item definitions, Equipment slots (Weapon, Armor, Helmet, Accessory)
│   ├── Rarity tiers (Common, Magic, Rare, Legendary) & color palette
│   ├── StatModifier array per item definition
│   └── Weighted drop table generator per enemy tier
├── 2. 3D World Drop Meshes & Magnet Physics (`src/entities/ItemDrop.ts`, `src/entities/LootSystem.ts`)
│   ├── GLB mesh spawning at enemy death location (props/ weapons GLBs)
│   ├── Torus/Disc rarity glow ring + floating 3D billboarding text
│   ├── Y-axis oscillation bobbing & rotation animation loop
│   ├── 3-unit player proximity detection & magnet acceleration vector math
│   └── Instant pickup handling (Gold / Health Globe / Mana Globe / Inventory item)
├── 3. Equipment & Decoupled Stat Modifiers (`src/entities/components/InventoryComponent.ts`)
│   ├── Inventory weight capacity management (`1x`, `2x`, `3x` weight costs)
│   ├── Equip item: `removeModifiersBySource("equip_" + slot)`, `addModifier(...)`
│   └── Unequip item: `removeModifiersBySource("equip_" + slot)`, return item to grid
├── 4. Option D1 Inventory UI (`src/ui/InventoryUI.ts`)
│   ├── Fullscreen toggleable `@babylonjs/gui` grid overlay
│   ├── Rarity colored slot borders & explicit weight badges (`1x`, `2x`, `3x`)
│   ├── Equip / Unequip / Drop context actions
│   └── Keyboard & Gamepad focus navigation (`game-ui-ux` focus highlight)
└── 5. Empirical Verification Suite (`tests/phase5_empirical_test.ts`)
    ├── Drop table probability distribution test
    ├── Magnet motion acceleration & pickup range test
    ├── Globe instant HP/MP restoration test
    ├── 100-cycle equip/unequip stat drift verification test
    └── Weighted inventory weight capacity overflow test
```

---

## 6. Verification Method

To independently verify Phase 5 implementation:
1. **Compilation Check**:
   ```bash
   npm run build
   ```
   Must pass without any TypeScript compilation errors (`tsc --noEmit`).
2. **Empirical Unit Tests**:
   ```bash
   npx tsx tests/phase5_empirical_test.ts
   ```
   Must pass all tests:
   - Drop table weighted generation across 4 rarities.
   - Magnet physics distance calculation ($\le 3.0$ units) and acceleration vector.
   - Globe health/mana instant restoration (`modifyHealth`/`modifyMana`).
   - Stat drift test: 100 equip/unequip cycles resulting in $0.000$ stat error.
   - Inventory weight capacity bounds checking.
3. **Gameplay / Visual Verification**:
   - Defeat enemies and observe GLB 3D item drops spawning with glowing rarity rings and floating rarity text.
   - Move within 3 units of drops and verify magnetic pull towards player.
   - Open inventory (`[I]` key) and verify Option D1 uniform grid with `1x`, `2x`, `3x` weight badges.
