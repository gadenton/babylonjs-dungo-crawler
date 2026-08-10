# Soft Handoff Report: Phase 3 Combat & AI Systems Technical Specification

**Agent**: Phase 3 Technical Explorer 1  
**Working Directory**: `.agents/teamwork_preview_explorer_phase3_1`  
**Target Milestone**: Phase 3 (Combat Engine, Direct Stats & Throttled Enemy AI)  
**Status**: Exploration & Technical Design Complete (Soft Handoff to Implementer)  

---

## 1. Observations

1. **Existing Core Architecture**:
   - `src/entities/Entity.ts`: Abstract base class defining `id`, `name`, `scene`, `transformNode`, `position`, `rotation`, `getForwardVector()`, and lifecycle methods.
   - `src/entities/Player.ts`: Implements capsule collision (`checkCollisions = true`, `ellipsoid = (0.45, 0.9, 0.45)`, `ellipsoidOffset = (0, 0.9, 0)`), hybrid movement (click-to-move NavMesh + WASD/stick direct vector override), and smooth slerp rotation.
   - `src/dungeon/NavMeshManager.ts`: Recast NavMesh wrapper with WASM initialization, `createNavMesh(groundMesh)`, `findPath(start, end)`, and debug visualization.
   - `src/core/Engine.ts`: Scene setup, clear color, lights (`HemisphericLight`, `DirectionalLight`), shadow generator, and render loop.

2. **Asset Pipeline Verification**:
   - `public/assets/characters/enemies/character-orc.glb` and `character-human.glb` exist in `public/assets/characters/enemies/`.
   - GLB loading tested via `@babylonjs/loaders/glTF` async loader in `SceneLoader.ImportMeshAsync`.

3. **Relevant Gamedev Skills Applied**:
   - `rpg`: Decoupled Stat Modifier Layer (`base + flat_add + percent_mod`), preventing stat drift by keeping base stats immutable.
   - `game-ai`: Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`), 300ms path query timer, line-of-sight raycasts against wall geometry, and stuck detection.
   - `babylonjs-engine`: Scene picking with raycast, ellipsoid movement with `moveWithCollisions()`, mesh hierarchy, and observables.

---

## 2. Logic Chain

1. **Stat Drift Prevention (`StatsComponent.ts`)**:
   - *Observation*: Modifying base stat fields directly for temporary buffs or equipment results in stat drift upon removal or save reload.
   - *Logic*: By storing base stats as immutable values and computing `(Base + Sum(Flat)) * (1 + Sum(Percent))`, modifiers can be added or removed without corrupting the base truth.
   - *Conclusion*: `StatsComponent` maintains `baseStats: Map<StatType, number>` and `modifiers: StatModifier[]`, recalculating effective stats when marked dirty or updated.

2. **Armor Mitigation & Damage Formula (`DamageSystem.ts`)**:
   - *Observation*: Requirements specify armor mitigation math: `damage * (100 / (100 + armor))` and critical hit rolling `Math.random() < critChance`.
   - *Logic*: Armor formula converts raw damage into mitigated damage via a non-linear diminishing returns curve ($100$ armor = $50\%$ damage reduction). Crit rolls test against attacker crit chance and apply a $1.5\times$ multiplier. Final damage is applied directly to the target's `HealthComponent`.
   - *Conclusion*: `DamageSystem.resolveDamage()` serves as a pure, static combat resolution entry point notifying `DamageSystem.onDamageApplied` observers for UI hit flash and floating numbers.

3. **Throttled AI Performance & Stuck Detection (`Enemy.ts`)**:
   - *Observation*: Continuous pathfinding queries on every frame drop framerate significantly when multiple enemies are active.
   - *Logic*: Decoupling waypoint movement (runs every frame) from path querying (runs on a 300ms timer) reduces Recast recalculations by over 90%. Raycast line-of-sight tests ensure enemies do not aggro through solid walls. Stuck detection monitors position displacement over a 1.0s window, triggering an instant repath if an enemy is blocked by geometry.
   - *Conclusion*: `Enemy.ts` incorporates a 5-state FSM (`Idle`, `Aggro`, `Chase`, `Attack`, `Dead`) with 300ms path query throttling and raycast line-of-sight checking.

---

## 3. Caveats

- **GLB Animation Blending**: Mini Characters GLB assets contain basic skeletons. While `Enemy.ts` loads GLBs asynchronously with fallback capsule geometry, explicit skeletal animation group blending (`Idle`, `Run`, `Attack` animations) will be wired when animation clip naming for Kenney characters is standardized in Phase 4.
- **Wall Geometry Reference**: The line-of-sight raycast predicate checks `mesh.checkCollisions`. Implementers should ensure `TileMap.buildMeshes()` assigns `checkCollisions = true` to `mergedWalls`.

---

## 4. Conclusion

The exact technical specifications for Phase 3 (`StatsComponent.ts`, `HealthComponent.ts`, `DamageSystem.ts`, and `Enemy.ts`) are fully documented in `analysis.md`. The design is completely decoupled, type-safe, performance-optimized, and aligns with all requirements in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

---

## 5. Verification Method

To verify the Phase 3 implementation once created:
1. **Type Checking & Build Verification**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```
2. **Stat Modifier Integrity Test**:
   - Instantiating `StatsComponent`, adding a flat (+10) and percent (+0.50) modifier to base 10 AD should result in $(10 + 10) \times 1.50 = 30$ AD. Removing the modifier must restore base 10 AD exactly.
3. **Damage System Math Test**:
   - Raw damage 100 against Armor 100 must equal $100 \times (100 / 200) = 50$ damage.
4. **Enemy AI Throttling Test**:
   - Monitor `pathUpdateTimer` in `Enemy.ts` to confirm `findPath()` is called no more than once per 300ms interval during `Chase` state.

---

## 6. Remaining Work (For Implementer Agent)

1. Create `src/entities/components/StatsComponent.ts` following the specification in `analysis.md`.
2. Create `src/entities/components/HealthComponent.ts` following the specification in `analysis.md`.
3. Create `src/combat/DamageSystem.ts` following the specification in `analysis.md`.
4. Create `src/entities/Enemy.ts` implementing the throttled FSM AI, raycast line-of-sight, stuck detection, and GLB loading.
5. Create `src/ui/JuiceOverlay.ts` and `src/audio/AudioManager.ts` (Phase 3 juice and spatial audio hooks).
