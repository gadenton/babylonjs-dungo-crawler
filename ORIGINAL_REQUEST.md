# Original User Request

## Initial Request — 2026-08-05T03:26:02Z

Single-player, isometric Action RPG (ARPG) built using Babylon.js v9, TypeScript, Vite, and Kenney 3D Dungeon Assets, following the architecture and 6-phase implementation roadmap in `InitialPlan.md`.

Working directory: `c:\Users\greg_\source\babylonjs-dungo-crawler`
Integrity mode: development

## Asset & Skill Instructions
- **Game Dev Skills:** Each agent must read and apply relevant game development skills (`babylonjs-engine`, `camera-systems`, `input-systems`, `game-ai`, `game-feel`, `game-ui-ux`, `rpg`, `save-systems`, `procedural-gen`, `performance-optimization`, `audio-design`).
- **Asset Source Path:** `C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0`
- **Asset Directory Structure:** Copy GLB models into project folder `public/assets/`:
  - `3D assets\Modular Dungeon Kit\Models\GLB format` -> `public/assets/dungeon/`
  - `3D assets\Modular Cave Kit\Models\GLB format` -> `public/assets/cave/`
  - `3D assets\Weapon Pack\Models\GLB format` -> `public/assets/weapons/`
  - `3D assets\Animated Characters Bundle` / `Mini Characters` -> `public/assets/characters/`
  - Agents may select additional GLB models from the Kenney Assets pack as needed for items or environment details.

## Requirements

### R1. Engine Architecture, Camera Rig & Input System (Phase 1)
Implement `src/core/Engine.ts`, `src/camera/CameraRig.ts`, and `src/core/InputManager.ts`. Fixed isometric perspective with exponential smoothing (`1 - exp(-rate * dt)`), mouse/stick look-ahead, quadratic trauma-decay screen shake hook (`camera-systems`, `game-feel`), click-to-move NavMesh pathing with instant WASD/stick direct vector override (`mesh.checkCollisions = true`), 120ms input buffering, and dynamic KBM/Gamepad UI prompt swapping (`input-systems`).

### R2. Procedural Dungeon Generation & NavMesh (Phase 2)
Implement `src/dungeon/Generator.ts`, `src/dungeon/TileMap.ts`, and `src/dungeon/NavMeshManager.ts`. Grid-based BSP room/corridor generation using modular Kenney 3D Dungeon & Cave Kit GLB models ($2\text{m} \times 2\text{m}$ grid). Merge static meshes per material with `BABYLON.Mesh.MergeMeshes`, set `checkCollisions = true` on wall geometry for ellipsoid sliding, and generate Recast runtime NavMesh over merged floors (`procedural-gen`).

### R3. Combat Engine, Direct Stats & Throttled Enemy AI (Phase 3)
Implement `src/entities/components/StatsComponent.ts`, `src/entities/Enemy.ts`, `src/combat/DamageSystem.ts`, `src/ui/JuiceOverlay.ts`, and `src/audio/AudioManager.ts`. Decoupled stat modifier layer (`base` + `flat` + `percent`) (`rpg`). Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`) updated every ~300ms with raycast line-of-sight and stuck detection (`game-ai`). Combat juice (floating damage numbers, 100ms white hit flash, freeze frames) and 3D spatial Web Audio API sound management with bus mixing & ducking (`audio-design`, `game-feel`).

### R4. Character Progression, Archetypes & Skill/Talent UI (Phase 4)
Implement `src/combat/Archetypes.ts`, `src/combat/TalentTree.ts`, `src/ui/TalentUI.ts`, and Town Hub zone with Archetype Altar. Unlock 4 Archetypes (Tank with *Seismic Slam*, Healer with *Holy Beacon*, Mage with *Arcane Nova*, Physical Melee DPS with *Whirlwind*) every 10 levels, swappable at Town Hub Altar. Event-driven `@babylonjs/gui` UI with keyboard/gamepad focus navigation (`game-ui-ux`).

### R5. Loot System, Weighted Inventory & Versioned Persistence (Phases 5 & 6)
Implement `src/entities/components/InventoryComponent.ts`, `src/ui/InventoryUI.ts`, `src/core/StorageAdapter.ts`, and `src/ui/HUD.ts`. Item drop tables across 4 rarity tiers (Common, Magic, Rare, Legendary) with 3-unit proximity auto-loot. Uniform grid UI with explicit item weight cost badges (`1x`, `2x`, `3x`). Versioned save/load schema with upgrade migration registry (`save-systems`). Configure `DefaultRenderingPipeline` (SSAO2, Bloom, ACES ToneMapping).

## Acceptance Criteria

### Engine & Build Verification
- [ ] TypeScript compilation (`tsc --noEmit` / `npm run build`) passes cleanly without any syntax or type errors.
- [ ] Vite production build completes successfully (`npm run build`).

### Core Gameplay & Physics
- [ ] Player moves via click-to-move NavMesh or direct WASD/Gamepad stick input with smooth wall collisions (`checkCollisions = true`).
- [ ] Camera smoothly tracks player with look-ahead and applies screen shake on combat impacts without mutating player transform.
- [ ] Procedural dungeon generates connected rooms and corridors with merged Kenney 3D Dungeon & Cave tiles and valid Recast NavMesh.

### Combat, AI & Systems
- [ ] Enemies transition between FSM states without pathing lag (throttled ~300ms updates).
- [ ] Decoupled stats compute correctly (`base` + `flat` + `percent`) without stat drift.
- [ ] All 4 Archetype signature skills execute with 120ms input buffering.
- [ ] HUD displays health/mana globes, skill cooldowns, dynamic input prompts, inventory slot capacities, and talent trees.
- [ ] Save data persists reliably with schema versioning.

## Follow-up — 2026-08-05T20:43:36Z

# Teamwork Project Prompt

Single-player, isometric Action RPG (ARPG) built using Babylon.js v9, TypeScript, Vite, and Kenney 3D Dungeon Assets, following the architecture and 6-phase implementation roadmap in `InitialPlan.md`.

Working directory: `c:\Users\greg_\source\babylonjs-dungo-crawler`
Integrity mode: development

## IMPORTANT: Previous Progress
Phases 1-3 have already been implemented and audited by a previous run. Check the existing codebase — files in `src/core/`, `src/camera/`, `src/dungeon/`, `src/entities/`, `src/combat/`, `src/ui/`, and `src/audio/` should already exist. Review what's already built and continue from where the previous run left off (Phase 4 was in progress). Do NOT rewrite already-completed code unless it has issues.

## Asset & Skill Instructions
- **Game Dev Skills:** Each agent must read and apply relevant game development skills (`babylonjs-engine`, `camera-systems`, `input-systems`, `game-ai`, `game-feel`, `game-ui-ux`, `rpg`, `save-systems`, `procedural-gen`, `performance-optimization`, `audio-design`).
- **Asset Source Path:** `C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0`
- **Asset Directory Structure:** Copy GLB models into project folder `public/assets/`:
  - `3D assets\Modular Dungeon Kit\Models\GLB format` -> `public/assets/dungeon/`
  - `3D assets\Modular Cave Kit\Models\GLB format` -> `public/assets/cave/`
  - `3D assets\Weapon Pack\Models\GLB format` -> `public/assets/weapons/`
  - `3D assets\Animated Characters Bundle` / `Mini Characters` -> `public/assets/characters/`
  - Agents may select additional GLB models from the Kenney Assets pack as needed for items or environment details.

## Requirements

### R1. Engine Architecture, Camera Rig & Input System (Phase 1) — ALREADY COMPLETE
Implement `src/core/Engine.ts`, `src/camera/CameraRig.ts`, and `src/core/InputManager.ts`. Fixed isometric perspective with exponential smoothing (`1 - exp(-rate * dt)`), mouse/stick look-ahead, quadratic trauma-decay screen shake hook (`camera-systems`, `game-feel`), click-to-move NavMesh pathing with instant WASD/stick direct vector override (`mesh.checkCollisions = true`), 120ms input buffering, and dynamic KBM/Gamepad UI prompt swapping (`input-systems`).

### R2. Procedural Dungeon Generation & NavMesh (Phase 2) — ALREADY COMPLETE
Implement `src/dungeon/Generator.ts`, `src/dungeon/TileMap.ts`, and `src/dungeon/NavMeshManager.ts`. Grid-based BSP room/corridor generation using modular Kenney 3D Dungeon & Cave Kit GLB models ($2\text{m} \times 2\text{m}$ grid). Merge static meshes per material with `BABYLON.Mesh.MergeMeshes`, set `checkCollisions = true` on wall geometry for ellipsoid sliding, and generate Recast runtime NavMesh over merged floors (`procedural-gen`).

### R3. Combat Engine, Direct Stats & Throttled Enemy AI (Phase 3) — ALREADY COMPLETE
Implement `src/entities/components/StatsComponent.ts`, `src/entities/Enemy.ts`, `src/combat/DamageSystem.ts`, `src/ui/JuiceOverlay.ts`, and `src/audio/AudioManager.ts`. Decoupled stat modifier layer (`base` + `flat` + `percent`) (`rpg`). Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`) updated every ~300ms with raycast line-of-sight and stuck detection (`game-ai`). Combat juice (floating damage numbers, 100ms white hit flash, freeze frames) and 3D spatial Web Audio API sound management with bus mixing & ducking (`audio-design`, `game-feel`).

### R4. Character Progression, Archetypes & Skill/Talent UI (Phase 4) — RESUME HERE
Implement `src/combat/Archetypes.ts`, `src/combat/TalentTree.ts`, `src/ui/TalentUI.ts`, and Town Hub zone with Archetype Altar. Unlock 4 Archetypes (Tank with *Seismic Slam*, Healer with *Holy Beacon*, Mage with *Arcane Nova*, Physical Melee DPS with *Whirlwind*) every 10 levels, swappable at Town Hub Altar. Event-driven `@babylonjs/gui` UI with keyboard/gamepad focus navigation (`game-ui-ux`).

### R5. Loot System, Weighted Inventory & Versioned Persistence (Phases 5 & 6)
Implement `src/entities/components/InventoryComponent.ts`, `src/ui/InventoryUI.ts`, `src/core/StorageAdapter.ts`, and `src/ui/HUD.ts`. Item drop tables across 4 rarity tiers (Common, Magic, Rare, Legendary) with 3-unit proximity auto-loot. Uniform grid UI with explicit item weight cost badges (`1x`, `2x`, `3x`). Versioned save/load schema with upgrade migration registry (`save-systems`). Configure `DefaultRenderingPipeline` (SSAO2, Bloom, ACES ToneMapping).

## Acceptance Criteria

### Engine & Build Verification
- [ ] TypeScript compilation (`tsc --noEmit` / `npm run build`) passes cleanly without any syntax or type errors.
- [ ] Vite production build completes successfully (`npm run build`).

### Core Gameplay & Physics
- [ ] Player moves via click-to-move NavMesh or direct WASD/Gamepad stick input with smooth wall collisions (`checkCollisions = true`).
- [ ] Camera smoothly tracks player with look-ahead and applies screen shake on combat impacts without mutating player transform.
- [ ] Procedural dungeon generates connected rooms and corridors with merged Kenney 3D Dungeon & Cave tiles and valid Recast NavMesh.

### Combat, AI & Systems
- [ ] Enemies transition between FSM states without pathing lag (throttled ~300ms updates).
- [ ] Decoupled stats compute correctly (`base` + `flat` + `percent`) without stat drift.
- [ ] All 4 Archetype signature skills execute with 120ms input buffering.
- [ ] HUD displays health/mana globes, skill cooldowns, dynamic input prompts, inventory slot capacities, and talent trees.
- [ ] Save data persists reliably with schema versioning.

