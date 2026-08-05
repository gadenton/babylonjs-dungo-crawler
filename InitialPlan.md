# Game Architecture & Development Plan: Babylon.js ARPG

## Executive Overview

A single-player, isometric Action RPG (ARPG) built using **Babylon.js v9**, **TypeScript**, and **Vite**, utilizing **Kenney 3D Dungeon Assets**.

### Core Pillars

* **Controls:** Click-to-Move + WASD & Gamepad support with instant direction override via Babylon's built-in Ellipsoid Collision system. Features 120ms input buffering and dynamic KBM/Gamepad UI prompt swapping (`input-systems`).
* **Level Design:** 100% procedural grid-based dungeons with dynamic Recast NavMesh pathfinding.
* **Character System:** Classless single-character progression. Decoupled Stat Modifier Layer (`base` + `flat` + `percent`) for gear/buffs without stat drift (`rpg`). Unlock 4 Archetypes (Tank, Healer, Mage, Physical Melee DPS) every 10 levels and swap loadouts in the Town Hub.
* **Itemization:** Direct-impact stats (no abstract Str/Agi/Int math), proximity auto-loot (gold/globes), and weighted slot capacity without inventory Tetris.
* **Visuals, Feel & Camera:** PBR materials, dynamic torch/spell point lights, Babylon's `DefaultRenderingPipeline` (SSAO, Bloom, Tone Mapping), `@babylonjs/gui` UI elements, exponential isometric camera follow with look-ahead, trauma-decay screen shake (`camera-systems`, `game-feel`), and full combat juice (floating damage numbers, hit flashes).

---

## 1. Technical Stack & Dependencies

* **Language:** TypeScript 5.4+
* **Build Tool / Server:** Vite 6+ (`pnpm`)
* **3D Engine & UI:** `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/gui`
* **Pathfinding:** `recast-navigation-js` (see official docs <https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/v2Intro/>)
* **Collision Physics:** Built-in Babylon Ellipsoid Collision System (`mesh.checkCollisions = true`)

---

## 2. Directory Structure (`src/`)

```text
src/
├── core/
│   ├── Engine.ts          # Babylon Engine, Scene lifecycle, resize handlers
│   ├── InputManager.ts    # Unified mouse, WASD, and Gamepad input mapping with input buffering & device prompt swapping
│   └── StorageAdapter.ts  # Versioned Save/Load local storage abstraction layer with schema migrations
│
├── entities/
│   ├── Entity.ts          # Base class for all game entities
│   ├── Player.ts          # Player controller, velocity override, Recast agent, ellipsoid collisions, camera rig target
│   ├── Enemy.ts           # Throttled FSM AI (Idle, Aggro, Chase, Attack) with line-of-sight & stuck timeouts
│   └── components/
│       ├── StatsComponent.ts      # Base stats + Decoupled Modifier Layer (flat + percent) for derived combat math
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
│   └── Skill.ts           # Active skill execution with input buffering, collision, cooldowns
│
├── camera/
│   └── CameraRig.ts       # Exponential smooth follow, target look-ahead, and trauma-decay screen shake offset hook
│
├── ui/
│   ├── HUD.ts             # Health/Mana globes, skill bar, mini-map, dynamic input prompts via @babylonjs/gui
│   ├── InventoryUI.ts     # Item grid, badges (1x, 2x, 3x), equipment slots
│   ├── TalentUI.ts        # Interactive tree node interface
│   └── JuiceOverlay.ts    # Bouncing damage text, health bars, hit-stop/flash coordination
│
├── audio/
│   └── AudioManager.ts    # 3D spatial Web Audio API sound management with bus mixing & sidechain ducking
│
└── index.ts               # Bootstrapper
```

---

## 3. Detailed Technical Subsystems

### A. Input, Movement & Camera System (`core/InputManager.ts`, `camera/CameraRig.ts`, `entities/Player.ts`)

* **Camera System (`camera-systems`):**
  * Fixed perspective camera locked at an isometric angle (e.g. 45° pitch, 45° yaw).
  * **Exponential Follow:** Frame-rate independent camera smoothing (`1 - exp(-rate * dt)`).
  * **Target Look-Ahead:** Offsets camera target towards movement/mouse direction so the player sees combat ahead.
  * **Screen Shake Offset (`game-feel`):** Screen shake driven by a quadratic trauma model (`shake = trauma^2 * noise`). Shake is applied as an additive offset to the camera rig, never moving the player transform.
* **Hybrid Control Logic & Input Buffering (`input-systems`):**
  * **Click-to-Move:** Raycasts mouse click against the ground NavMesh mesh for Recast `NavMeshAgent`.
  * **Direct Vector Override (WASD / Left Stick):** Moving the left stick or pressing `WASD` instantly cancels Recast mouse paths. Driven by Babylon's built-in Ellipsoid Collision System (`mesh.checkCollisions = true`) for smooth wall sliding.
  * **Input Buffering:** Remembers skill/dodge key presses within a short ~120ms window so actions trigger fluidly during animation recovery.
  * **Dynamic Device Prompts:** Listens to active input events and automatically swaps UI prompt icons between Keyboard/Mouse and Gamepad.

### B. Procedural Generation & NavMesh (`dungeon/`)

* **Tile Placement:** Uses Kenney 3D dungeon modular tiles on a uniform grid ($2\text{m} \times 2\text{m}$).
* **Generation Algorithm:** Binary Space Partitioning (BSP) / Room-and-Corridor layout.
* **Performance Optimization:** Merges static dungeon tile meshes per material type using `BABYLON.Mesh.MergeMeshes`.
* **NavMesh & Collision Setup:** Generates a Recast NavMesh over merged floors for pathfinding; sets `checkCollisions = true` on merged wall geometries for WASD sliding collisions.

### C. Enemy AI & Pathfinding Scheduling (`entities/Enemy.ts`, `game-ai`)

* **Throttled FSM AI:** Explicit Finite State Machine (`Idle`, `Aggro`, `Chase`, `Attack`).
* **Path Query Throttling:** Recast NavMesh pathfinding queries are throttled to run every ~300ms (or on cell transition), avoiding CPU spikes when 20+ enemies are active.
* **Line-of-Sight & Stuck Timeout:** Includes raycast line-of-sight checks and a stuck timer to force re-paths if enemies bump into geometry.

### D. User Interface (`ui/`, `game-ui-ux`, `frontend-design`)

* **Engine GUI Integration:** Built using `@babylonjs/gui` (`AdvancedDynamicTexture.CreateFullscreenUI`).
* **HUD (`ui/HUD.ts`):** Health/Mana orb displays, action bar with skill cooldown indicators & dynamic input prompt icons, event room notifications, and mini-map frame.
* **Event-Driven UI:** UI updates subscribe strictly to gameplay event signals (`onHealthChanged`, `onCooldownStarted`) rather than per-frame polling.
* **Menus (`ui/InventoryUI.ts`, `ui/TalentUI.ts`):** Overlaid canvas elements managed using `@babylonjs/gui` `Rectangle` containers with keyboard/gamepad focus navigation.

### E. Progression, Archetypes, Stats & Equipment (`combat/`, `rpg`)

* **Single-Character Model:** Player maintains 1 persistent character. Unlocks new Archetype selection slots at Levels 10, 20, and 30 in the Town Hub.
* **Decoupled Stat Modifier Layer (`rpg`):**
  * Base attributes represent immutable truth.
  * Equipment and temporary buffs push/pop modifiers onto a decoupled modifier stack (`flat_adds` and `percent_modifiers`).
  * Combat attributes (`Attack Damage`, `Crit %`, `Armor %`, `Max HP`, `Cooldown Reduction`) recompute on the fly to prevent base stat drift or save corruption.
* **Archetype Definitions:**
  1. **Tank:** *Seismic Slam* (High aggro, AOE stagger, temporary mitigation).
  2. **Healer:** *Holy Beacon* (Deploys healing aura that damages undead/monsters).
  3. **Mage:** *Arcane Nova* (Teleport with elemental origin blast).
  4. **Physical Melee DPS:** *Whirlwind* (High-mobility multi-target bleed strike).

### F. Itemization, Loot & Inventory (`entities/components/InventoryComponent.ts`, `ui/InventoryUI.ts`)

* **Direct Stats:** Gear modifies explicit combat variables.
* **Proximity Auto-Loot:** Gold, Health Globes, Mana Globes auto-collect within 3 units.
* **Inventory Capacity Model (Option D1):** Uniform grid UI showing item icons with explicit weight cost badges (`1x`, `2x`, `3x`).

### G. Graphics, Juice & Audio (`core/Engine.ts`, `ui/JuiceOverlay.ts`, `audio/AudioManager.ts`, `game-feel`)

* **Post-Processing Pipeline:** `BABYLON.DefaultRenderingPipeline` configured with SSAO2, Bloom, and ACES ToneMapping.
* **Combat Juice:** Bouncing damage numbers, 100ms enemy white hit flashes (`emissiveColor`), brief hit-stop freeze frames, and trauma-decay camera shake.
* **Audio Bus Architecture:** Categorized audio buses (Master, Music, SFX, UI) with sidechain ducking during heavy combat impact SFX.

### H. Data Persistence & Schema Migration (`core/StorageAdapter.ts`)

* **Versioned Save Payload:** Includes save header schema version and migration registry (`migrations: Map<number, (oldData: any) => any>`) to upgrade legacy saves automatically without wiping progress.

---

## 4. Phased Implementation Roadmap

### Phase 1: Engine Foundation, Camera & Hybrid Controls

1. Scaffold Babylon `Engine` and `Scene` in `core/Engine.ts`. Add `@babylonjs/gui` and `recast-navigation-js`.
2. Build `camera/CameraRig.ts` with exponential smoothing, target look-ahead, and trauma-decay screen shake offset hook (`camera-systems`, `game-feel`).
3. Build `InputManager.ts` mapping mouse, WASD, and Gamepad input with a 120ms input buffer and dynamic KBM/Gamepad prompt swapping (`input-systems`).
4. Render basic player capsule/mesh with Babylon built-in ellipsoid collisions (`mesh.checkCollisions = true`).

### Phase 2: Procedural Level Generation & NavMesh

1. Implement grid-based dungeon generator algorithm in `dungeon/Generator.ts`.
2. Load Kenney 3D dungeon GLTF/GLB tiles; place floor/wall meshes and set `checkCollisions = true` on merged wall meshes.
3. Integrate `recast-navigation-js` to generate runtime NavMesh over merged floors.

### Phase 3: Direct-Stat System, Enemy AI & Combat Loop

1. Implement `StatsComponent` with base stats and decoupled modifier layer (`rpg`).
2. Build `Enemy.ts` with throttled FSM AI (300ms pathquery timer + line-of-sight & stuck checks) (`game-ai`).
3. Implement hit detection, `DamageSystem.ts`, `JuiceOverlay.ts` (damage numbers, hit flashes, hit-stop), and `AudioManager.ts` bus mixing & ducking.

### Phase 4: Single-Character Archetypes & Talent Trees

1. Define 4 Archetypes and signature skills in `combat/Archetypes.ts`.
2. Create `TalentTree.ts` data structures and `TalentUI.ts` using `@babylonjs/gui` with event-driven state binding.
3. Build Town Hub zone with Archetype Altar.

### Phase 5: Loot, Auto-Pickup & Weighted Inventory

1. Implement item drop tables with Rarity Tiers (Common, Magic, Rare, Legendary) and proximity auto-loot.
2. Build `InventoryComponent` using Option D1 capacity slot logic.
3. Build `InventoryUI.ts` using `@babylonjs/gui` with dynamic icon grids and capacity progress headers.

### Phase 6: Visual Pipeline, Persistence & Polish

1. Configure `DefaultRenderingPipeline` (SSAO, Bloom, Tone Mapping) and Graphics Settings UI.
2. Complete full sound effect integration in `AudioManager.ts`.
3. Implement `StorageAdapter.ts` with versioned schema migrations for crash-safe local saving.
