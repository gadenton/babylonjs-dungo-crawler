# Game Architecture & Development Plan: Babylon.js ARPG

## Executive Overview

A single-player, isometric Action RPG (ARPG) built using **Babylon.js v9**, **TypeScript**, and **Vite**, utilizing **Kenney 3D Dungeon Assets**.

### Core Pillars

* **Controls:** Click-to-Move + WASD & Gamepad support with instant direction override.
* **Level Design:** 100% procedural grid-based dungeons with dynamic Recast NavMesh pathfinding.
* **Character System:** Classless single-character progression. Unlock 4 Archetypes (Tank, Healer, Mage, Physical Melee DPS) every 10 levels and swap loadouts in the Town Hub.
* **Itemization:** Direct-impact stats (no abstract Str/Agi/Int math), proximity auto-loot (gold/globes), and weighted slot capacity without inventory Tetris.
* **Visuals & Feel:** PBR materials, dynamic torch/spell point lights, Babylon's `DefaultRenderingPipeline` (SSAO, Bloom, Tone Mapping), and full combat juice (floating damage numbers, hit flashes, screen shake).

---

## 1. Technical Stack & Dependencies

* **Language:** TypeScript 5.4+
* **Build Tool / Server:** Vite 6+ (`pnpm`)
* **3D Engine:** `@babylonjs/core`, `@babylonjs/loaders`
* **Pathfinding:** `recast-navigation-js` (see their official docs <https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/v2Intro/>)

---

## 2. Directory Structure (`src/`)

```text
src/
├── core/
│   ├── Engine.ts          # Babylon Engine, Scene lifecycle, resize handlers
│   ├── InputManager.ts    # Unified mouse, WASD, and Gamepad input mapping
│   └── StorageAdapter.ts  # Save/Load local storage abstraction layer
│
├── entities/
│   ├── Entity.ts          # Base class for all game entities
│   ├── Player.ts          # Player controller, velocity override, Recast agent
│   ├── Enemy.ts           # State-machine AI (Idle, Chase, Attack)
│   └── components/
│       ├── StatsComponent.ts      # Direct combat math stats
│       ├── HealthComponent.ts     # Current/Max HP, damage/heal events
│       └── InventoryComponent.ts  # Slot capacity and item storage
│
├── dungeon/
│   ├── Generator.ts       # Grid BSP/Corridor procedural dungeon generator
│   ├── TileMap.ts         # Kenney asset modular tile placement & mesh merging
│   └── NavMeshManager.ts  # Recast NavMesh creation & path generation
│
├── combat/
│   ├── DamageSystem.ts    # Hit calculation (Armor, Crit %, Crit Multiplier)
│   ├── Archetypes.ts      # Tank, Healer, Mage, Physical Melee DPS definitions
│   ├── TalentTree.ts      # Node progression, 1 ability + 5 modifier clusters
│   └── Skill.ts           # Active skill execution, collision, cooldowns
│
├── ui/
│   ├── HUD.ts             # Health/Mana globes, skill bar, mini-map
│   ├── InventoryUI.ts     # Item grid, badges (1x, 2x, 3x), equipment slots
│   ├── TalentUI.ts        # Interactive tree node interface
│   └── JuiceOverlay.ts    # Bouncing damage text, health bars, screen shake
│
├── audio/
│   └── AudioManager.ts    # 3D spatial Web Audio API sound management
│
└── index.ts               # Bootstrapper

```

---

## 3. Detailed Technical Subsystems

### A. Input & Movement System (`core/InputManager.ts`, `entities/Player.ts`)

* **Camera:** Fixed Orthographic or perspective camera locked at an isometric offset (e.g., Position Offset: `(0, 15, -12)`, Alpha: `-π/2`, Beta: `π/3`).
* **Hybrid Dual Control Logic:**
* **Click-to-Move:** Raycasts mouse click against the ground NavMesh mesh. Sets path destination for Recast `NavMeshAgent`.
* **Direct Vector Override (WASD / Left Stick):** Moving the left stick or pressing `W`, `A`, `S`, or `D` calculates a camera-relative direction vector.
* **Rule:** Direct directional input **instantly cancels** any active Recast mouse path and drives direct velocity via collision/sliding vectors. Releasing directional inputs stops the player immediately.
* **Gamepad Targeting:** Auto-targets the nearest enemy within a $45^\circ$ forward cone when executing attacks.

### B. Procedural Generation & NavMesh (`dungeon/`)

* **Tile Placement:** Uses Kenney 3D dungeon modular tiles (floors, walls, doors, stairs) on a uniform grid (e.g., $2\text{m} \times 2\text{m}$ per cell).
* **Generation Algorithm:** Binary Space Partitioning (BSP) or Room-and-Corridor layout.
* Spawns standard rooms (Aggro Pack AI) and sealed Event Rooms (doors lock until all spawned enemies are cleared).

* **Performance Optimization:** Static dungeon tile meshes (floors/walls) are merged into single unified geometries per material type using `BABYLON.Mesh.MergeMeshes`.
* **NavMesh:** Generates a Recast NavMesh over merged floor geometry at runtime. Exposes pathing query interfaces for Player (click-to-move) and Enemy AI.

### C. Progression, Archetypes & Talents (`combat/`)

* **Single-Character Model:** Player maintains 1 persistent character.
* **Unlocks:** Player selects 1 starting Archetype at Level 1. Automatically unlocks a new Archetype selection slot at **Levels 10, 20, and 30**.
* **Town Hub Restrictions:** Swapping active Archetypes and resetting Talent points is **only permitted when inside the Town Hub**.
* **Archetype Definitions:**

1. **Tank:** *Seismic Slam* (High aggro, AOE stagger, temporary mitigation).
2. **Healer:** *Holy Beacon* (Deploys healing aura that damages undead/monsters).
3. **Mage:** *Arcane Nova* (Teleport with elemental origin blast).
4. **Physical Melee DPS:** *Whirlwind* (High-mobility multi-target bleed strike).

* **Talent Tree Architecture:**
* Each archetype unlocks its own branch attached to a **Shared Universal Core** (Max HP, Armor, Speed, Cooldown Reduction).
* Each Archetype branch contains: **1 Core Ability Node** + **5 Modifier Nodes**.
* Modifiers include flat stat upgrades and **mutually exclusive Mutator nodes** (e.g., Frost Nova vs. Fire Combustion Nova).

### D. Itemization, Loot & Inventory (`entities/components/InventoryComponent.ts`, `ui/InventoryUI.ts`)

* **Direct Stats:** All gear directly modifies explicit combat variables:
* `Attack Damage`, `Crit Chance %`, `Crit Damage %`, `Armor` (% mitigation), `Max HP`, `Movement Speed`, `Cooldown Reduction`.

* **Proximity Auto-Loot:** Gold, Health Globes, Mana Globes, and Crafting Materials auto-collect when the player walks within 3 units.
* **Inventory Capacity Model (Option D1):**
* Uniform grid UI showing item icons.
* Items do **not** require spatial rotation or manual Tetris placement.
* Items possess a explicit weight cost badge: `1x` (Rings/Potions), `2x` (Helmets/Boots/1H Weapons), `3x` (2H Weapons/Chest Armor).
* Inventory header tracks total capacity (e.g., `24 / 40 Slots`).
* *Fallback Flag:* Data model must support setting `itemSlotCost = 1` globally via a single config line to convert to pure 1-slot uniform inventory if needed.

### E. Graphics & Post-Processing Pipeline (`core/Engine.ts`)

* **Materials:** Standard PBR materials mapping Kenney textures.
* **Lighting:** Hemispheric ambient darkness + dynamic Point Lights attached to torches, spell effects, and legendary loot beams.
* **Post-Processing Pipeline:** `BABYLON.DefaultRenderingPipeline` configured with:
* `SSAO2Configuration` (Contact shadows in dungeon wall/floor seams).
* `BloomEffect` (Radiant glow on spells and drops).
* `ToneMapping` (ACES mapping for bright fire/arcane highlights).

* **Graphics Settings:** Pipeline toggle exposed via UI options menu (`pipeline.bloomEnabled = boolean`, `pipeline.depthOfFieldEnabled = boolean`).

### F. Combat Juice & Audio (`ui/JuiceOverlay.ts`, `audio/AudioManager.ts`)

* **Damage Numbers:** Dynamic 2D HTML/Canvas or World-Space GUI text instances that bounce upward, scale based on damage, fade out, and color-code (Yellow = Crit, White = Normal, Green = Heal).
* **Hit Feedback:** Enemies flash white (`pbr.emissiveColor`) for 100ms on impact. Camera triggers subtle position micro-shake on heavy hits/crit strikes.
* **Audio:** 3D spatial positioning via Babylon Sound/Web Audio API for weapon swings, impacts, spell casting, and ambient dungeon audio.

### G. Data Persistence (`core/StorageAdapter.ts`)

* **Interface:**

```typescript
export interface IStorageAdapter {
  save(key: string, data: unknown): Promise<void>;
  load(key: string): Promise<unknown>;
}

```

* **Implementation:** `LocalStorageAdapter` for Web deployment; writes serialized JSON file to disk when packaged via Desktop/Native wrappers.
* **Auto-Save Triggers:** Entering Town Hub, leveling up, clearing an Event Room, or manually closing the game.

---

## 4. Phased Implementation Roadmap

### Phase 1: Engine Foundation & Hybrid Controls

1. Scaffold Babylon `Engine` and `Scene` inside `core/Engine.ts`.
2. Configure isometric fixed camera with pan bounds.
3. Build `InputManager.ts` mapping KBM mouse position, WASD keys, and Gamepad axis inputs.
4. Render basic player capsule/mesh. Implement hybrid movement: click-to-move pathfinding coexisting with instant WASD/stick velocity overrides.

### Phase 2: Procedural Level Generation & NavMesh

1. Implement grid-based dungeon generator algorithm in `dungeon/Generator.ts`.
2. Load Kenney 3D dungeon GLTF/GLB tiles; place floor, wall, and doorway meshes.
3. Merge static tile geometries into unified meshes.
4. Integrate babylons suggested navmesh solution recast-navigation-js to generate runtime NavMesh over merged floors; verify player pathing.

### Phase 3: Direct-Stat System & Combat Loop

1. Implement `StatsComponent` and `HealthComponent` with direct attributes.
2. Build `Enemy.ts` AI state machine (Idle, Chase via NavMesh, Attack).
3. Build target selection (KBM raycast click vs. Gamepad auto-target cone).
4. Implement hit detection, `DamageSystem.ts` (Armor, Crits), and `JuiceOverlay.ts` (bouncing numbers, hit flashes).

### Phase 4: Single-Character Archetypes & Talent Trees

1. Define 4 Archetypes and signature skills in `combat/Archetypes.ts`.
2. Create `TalentTree.ts` data structures (Shared Core + 4 Archetype Branches with 1 Ability + 5 Modifiers).
3. Implement Level 10/20/30 archetype unlock thresholds.
4. Build Town Hub zone. Restrict archetype swapping and talent respecs strictly to Town Hub bounds.

### Phase 5: Loot, Auto-Pickup & Weighted Inventory

1. Implement item drop tables with Rarity Tiers (Common, Magic, Rare, Legendary).
2. Create ground loot drops with light beams and proximity auto-loot trigger for Gold/Globes.
3. Build `InventoryComponent` using Option D1 capacity slot logic.
4. Build `InventoryUI.ts` rendering uniform icon grids with `1x/2x/3x` badges and capacity progress headers.

### Phase 6: Visual Pipeline, Town Hub & Polish

1. Configure `DefaultRenderingPipeline` (SSAO, Bloom, Tone Mapping) and add Graphics Settings UI toggle.
2. Build Town Hub scene with Staging Portal, Vendors, and Archetype Altar.
3. Wire up `AudioManager.ts` with 3D spatial sound effects.
4. Implement `StorageAdapter.ts` for full game state JSON auto-saving.
