# Phase 3 Technical Specification: Combat & AI Systems

## Executive Summary
This document provides the complete, authoritative technical specification for **Phase 3 Combat & AI Systems** of the Babylon.js Dungeon Crawler ARPG. Phase 3 establishes the core combat loop, data-driven stats layer, throttled enemy state machine AI, and damage calculation pipeline.

---

## 1. System Architecture Overview

```
                          +-------------------------+
                          |      Game Engine        |
                          +------------+------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
         +---------v---------+                   +---------v---------+
         |   Player Entity   |                   |   Enemy Entity    |
         +---------+---------+                   +---------+---------+
                   |                                       |
    +--------------+--------------+         +--------------+--------------+
    |                             |         |                             |
+---v------------+       +--------v----+  +-v--------------+       +------v------+
| StatsComponent |       | HealthComp  |  | StatsComponent |       | HealthComp  |
+----------------+       +-------------+  +----------------+       +-------------+
                                  ^                                       ^
                                  |         +-------------------+         |
                                  +---------+   DamageSystem    +---------+
                                            +---------+---------+
                                                      |
                                            +---------v---------+
                                            |   Juice & Audio   |
                                            +-------------------+
```

---

## 2. Decoupled Stat Modifier System (`StatsComponent.ts`)

### 2.1 Problem & Design Goal
Traditional RPG systems often mutate base stat fields directly when applying temporary buffs, equipment bonuses, or talent passives. This causes **stat drift**, where values fail to restore cleanly upon buff expiration, equipment removal, or game saving/loading.

`StatsComponent` solves this by maintaining **strict immutability of base stats**. Computed stats are dynamically recalculated on-demand or upon modifier stack changes:

$$\text{FinalStat} = \left( \text{BaseStat} + \sum \text{FlatModifiers} \right) \times \left( 1 + \sum \text{PercentModifiers} \right)$$

### 2.2 Core Interfaces & Data Contracts

```typescript
export enum StatType {
  AttackDamage = "attackDamage",
  CritChance = "critChance",
  Armor = "armor",
  MaxHp = "maxHp",
  CooldownReduction = "cooldownReduction",
  MoveSpeed = "moveSpeed",
}

export type ModifierType = "flat" | "percent";

export interface StatModifier {
  id: string;                  // Unique identifier (e.g., "buff_berserk_ad", "item_sword_01")
  stat: StatType;              // Targeted stat
  type: ModifierType;          // 'flat' (+5 AD) or 'percent' (+0.10 = +10%)
  value: number;               // Numerical value
  source?: string;             // Origin tag (e.g. "talent", "equipment", "buff")
  duration?: number;           // Timed duration in seconds (undefined = permanent)
  elapsedTime?: number;        // Accumulated active time
}

export interface StatChangeEvent {
  stat: StatType;
  oldValue: number;
  newValue: number;
  baseValue: number;
}
```

### 2.3 `StatsComponent` Class Implementation Specification

```typescript
import { Observable } from "@babylonjs/core/Misc/observable";

export class StatsComponent {
  private baseStats: Map<StatType, number> = new Map();
  private modifiers: StatModifier[] = [];
  private cachedCalculatedStats: Map<StatType, number> = new Map();
  private isDirty: boolean = true;

  public readonly onStatChanged: Observable<StatChangeEvent> = new Observable<StatChangeEvent>();

  constructor(initialBaseStats?: Partial<Record<StatType, number>>) {
    // Set baseline default stats
    this.setBaseStat(StatType.AttackDamage, 10);
    this.setBaseStat(StatType.CritChance, 0.05); // 5% base crit
    this.setBaseStat(StatType.Armor, 0);         // 0 base armor
    this.setBaseStat(StatType.MaxHp, 100);       // 100 base max HP
    this.setBaseStat(StatType.CooldownReduction, 0); // 0% base CDR
    this.setBaseStat(StatType.MoveSpeed, 7.0);   // 7m/s movement speed

    if (initialBaseStats) {
      for (const [statKey, value] of Object.entries(initialBaseStats)) {
        this.setBaseStat(statKey as StatType, value as number);
      }
    }
  }

  /** Modify base stat value without affecting modifiers */
  public setBaseStat(stat: StatType, value: number): void {
    const oldCalc = this.getStat(stat);
    this.baseStats.set(stat, value);
    this.markDirty();
    const newCalc = this.getStat(stat);
    if (oldCalc !== newCalc) {
      this.onStatChanged.notifyObservers({
        stat,
        oldValue: oldCalc,
        newValue: newCalc,
        baseValue: value,
      });
    }
  }

  public getBaseStat(stat: StatType): number {
    return this.baseStats.get(stat) ?? 0;
  }

  /** Add a stat modifier to the active stack */
  public addModifier(modifier: StatModifier): void {
    // Avoid duplicate modifier IDs
    this.removeModifier(modifier.id, false);

    this.modifiers.push({ ...modifier, elapsedTime: 0 });
    this.markDirty();
  }

  /** Remove a stat modifier by unique ID */
  public removeModifier(id: string, notify: boolean = true): void {
    const index = this.modifiers.findIndex((m) => m.id === id);
    if (index !== -1) {
      const removedMod = this.modifiers[index];
      this.modifiers.splice(index, 1);
      this.markDirty();
      if (notify) {
        this.getStat(removedMod.stat); // Trigger recompute & notification if changed
      }
    }
  }

  /** Remove all modifiers from a specific source */
  public removeModifiersBySource(source: string): void {
    this.modifiers = this.modifiers.filter((m) => m.source !== source);
    this.markDirty();
  }

  /** Calculate and retrieve the effective current stat value */
  public getStat(stat: StatType): number {
    if (this.isDirty || !this.cachedCalculatedStats.has(stat)) {
      this.recalculateAll();
    }
    return this.cachedCalculatedStats.get(stat) ?? this.getBaseStat(stat);
  }

  /** Tick method for processing temporary timed buffs */
  public update(deltaTime: number): void {
    let modified = false;
    for (let i = this.modifiers.length - 1; i >= 0; i--) {
      const mod = this.modifiers[i];
      if (mod.duration !== undefined) {
        mod.elapsedTime = (mod.elapsedTime ?? 0) + deltaTime;
        if (mod.elapsedTime >= mod.duration) {
          this.modifiers.splice(i, 1);
          modified = true;
        }
      }
    }
    if (modified) {
      this.markDirty();
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private recalculateAll(): void {
    const oldValues = new Map(this.cachedCalculatedStats);
    this.cachedCalculatedStats.clear();

    for (const stat of Object.values(StatType)) {
      const base = this.getBaseStat(stat);
      const statMods = this.modifiers.filter((m) => m.stat === stat);

      let flatSum = 0;
      let percentSum = 0;

      for (const mod of statMods) {
        if (mod.type === "flat") {
          flatSum += mod.value;
        } else if (mod.type === "percent") {
          percentSum += mod.value;
        }
      }

      let finalValue = (base + flatSum) * (1 + percentSum);

      // Stat bounds and limits
      if (stat === StatType.CritChance) {
        finalValue = Math.max(0, Math.min(1.0, finalValue)); // Clamp crit between 0% and 100%
      } else if (stat === StatType.CooldownReduction) {
        finalValue = Math.max(0, Math.min(0.50, finalValue)); // Cap CDR at 50%
      } else if (stat === StatType.Armor) {
        finalValue = Math.max(0, finalValue); // Armor cannot be negative
      } else if (stat === StatType.MaxHp) {
        finalValue = Math.max(1, finalValue); // Minimum 1 Max HP
      }

      this.cachedCalculatedStats.set(stat, finalValue);

      const oldVal = oldValues.get(stat);
      if (oldVal !== undefined && oldVal !== finalValue) {
        this.onStatChanged.notifyObservers({
          stat,
          oldValue: oldVal,
          newValue: finalValue,
          baseValue: base,
        });
      }
    }

    this.isDirty = false;
  }
}
```

---

## 3. Health & Life Cycle Management (`HealthComponent.ts`)

`HealthComponent` manages current health state, damage intake, healing, invulnerability frames, and death events.

```typescript
import { Observable } from "@babylonjs/core/Misc/observable";

export interface HealthChangeEvent {
  currentHp: number;
  maxHp: number;
  delta: number;
  isFatal: boolean;
}

export class HealthComponent {
  private currentHp: number;
  private maxHp: number;
  public isInvulnerable: boolean = false;

  public readonly onHealthChanged: Observable<HealthChangeEvent> = new Observable();
  public readonly onDeath: Observable<void> = new Observable();

  constructor(maxHp: number = 100) {
    this.maxHp = maxHp;
    this.currentHp = maxHp;
  }

  public get current(): number {
    return this.currentHp;
  }

  public get max(): number {
    return this.maxHp;
  }

  public get isAlive(): boolean {
    return this.currentHp > 0;
  }

  public get healthPercent(): number {
    return this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
  }

  /** Update Max HP (e.g. from StatsComponent changes) */
  public setMaxHp(newMaxHp: number, scaleCurrentRatio: boolean = false): void {
    const oldMax = this.maxHp;
    this.maxHp = Math.max(1, newMaxHp);

    if (scaleCurrentRatio && oldMax > 0) {
      const ratio = this.currentHp / oldMax;
      this.currentHp = Math.round(this.maxHp * ratio);
    } else {
      this.currentHp = Math.min(this.currentHp, this.maxHp);
    }

    this.onHealthChanged.notifyObservers({
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      delta: 0,
      isFatal: false,
    });
  }

  /** Apply damage after mitigation calculations */
  public takeDamage(amount: number): { actualDamage: number; isFatal: boolean } {
    if (!this.isAlive || this.isInvulnerable || amount <= 0) {
      return { actualDamage: 0, isFatal: false };
    }

    const actualDamage = Math.min(this.currentHp, amount);
    this.currentHp -= actualDamage;
    const isFatal = this.currentHp <= 0;

    this.onHealthChanged.notifyObservers({
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      delta: -actualDamage,
      isFatal,
    });

    if (isFatal) {
      this.onDeath.notifyObservers();
    }

    return { actualDamage, isFatal };
  }

  /** Heal entity */
  public heal(amount: number): number {
    if (!this.isAlive || amount <= 0) return 0;

    const oldHp = this.currentHp;
    this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    const actualHeal = this.currentHp - oldHp;

    if (actualHeal > 0) {
      this.onHealthChanged.notifyObservers({
        currentHp: this.currentHp,
        maxHp: this.maxHp,
        delta: actualHeal,
        isFatal: false,
      });
    }

    return actualHeal;
  }
}
```

---

## 4. Combat Damage Engine & Armor Formula (`DamageSystem.ts`)

### 4.1 Required Mathematical Formulas

1. **Armor Mitigation Ratio**:
   $$\text{MitigationFactor} = \frac{100}{100 + \text{Armor}}$$
   $$\text{MitigatedDamage} = \text{RawDamage} \times \left( \frac{100}{100 + \text{Armor}} \right)$$

2. **Critical Roll**:
   $$\text{isCrit} = \text{Math.random()} < \text{AttackerCritChance}$$

3. **Critical Multiplier**:
   $$\text{FinalDamage} = \begin{cases} \text{MitigatedDamage} \times \text{CritMultiplier} & \text{if isCrit} \\ \text{MitigatedDamage} & \text{otherwise} \end{cases}$$

### 4.2 Class Architecture & Implementation

```typescript
import { Entity } from "../entities/Entity";
import { StatsComponent, StatType } from "../entities/components/StatsComponent";
import { HealthComponent } from "../entities/components/HealthComponent";
import { Observable } from "@babylonjs/core/Misc/observable";

export interface DamageRequest {
  attacker: Entity & { stats?: StatsComponent };
  target: Entity & { health?: HealthComponent; stats?: StatsComponent };
  rawDamage: number;
  critMultiplier?: number; // Default 1.5x
  canCrit?: boolean;       // Default true
  skillId?: string;
}

export interface DamageResult {
  attacker: Entity;
  target: Entity;
  rawDamage: number;
  mitigatedDamage: number;
  finalDamage: number;
  isCrit: boolean;
  isFatal: boolean;
  timestamp: number;
  skillId?: string;
}

export class DamageSystem {
  public static readonly onDamageApplied: Observable<DamageResult> = new Observable();

  /** Calculate and resolve damage between attacker and target */
  public static resolveDamage(request: DamageRequest): DamageResult {
    const { attacker, target, rawDamage, skillId } = request;
    const canCrit = request.canCrit ?? true;
    const critMultiplier = request.critMultiplier ?? 1.5;

    // 1. Gather defender armor
    const defenderArmor = target.stats ? target.stats.getStat(StatType.Armor) : 0;

    // 2. Armor Mitigation Math
    const armorMitigationFactor = 100 / (100 + Math.max(0, defenderArmor));
    const mitigatedDamage = rawDamage * armorMitigationFactor;

    // 3. Critical Roll
    const attackerCritChance = (canCrit && attacker.stats) ? attacker.stats.getStat(StatType.CritChance) : 0;
    const isCrit = canCrit && Math.random() < attackerCritChance;

    // 4. Final Damage Computation
    const finalDamage = Math.round(isCrit ? mitigatedDamage * critMultiplier : mitigatedDamage);

    // 5. Apply to Target Health Component
    let isFatal = false;
    if (target.health) {
      const outcome = target.health.takeDamage(finalDamage);
      isFatal = outcome.isFatal;
    }

    const result: DamageResult = {
      attacker,
      target,
      rawDamage,
      mitigatedDamage,
      finalDamage,
      isCrit,
      isFatal,
      timestamp: performance.now(),
      skillId,
    };

    // Notify listeners (UI juice overlay, spatial audio, combat log)
    DamageSystem.onDamageApplied.notifyObservers(result);

    return result;
  }
}
```

---

## 5. Throttled FSM Enemy AI Engine (`Enemy.ts`)

### 5.1 FSM State Machine & Transitions

```
                    +--------------------+
                    |        Idle        |
                    +---------+----------+
                              |
                     Player in Aggro Range
                     & Clear Raycast Line of Sight
                              |
                              v
                    +--------------------+
                    |       Aggro        |
                    +---------+----------+
                              |
                        Alert Done (0.4s)
                              |
                              v
                    +--------------------+
     +-------------->       Chase        <--------------+
     |              +---------+----------+              |
     |                        |                         |
     |                In Attack Range                   |
     |                        |                         |
Target out of Range           v               Lost Line-of-Sight
     |              +--------------------+     or Stuck Timeout
     +--------------+       Attack       +--------------+
                    +--------------------+
```

### 5.2 Technical Requirements for Enemy AI

1. **Throttled Path Queries (~300ms Timer)**:
   - Requesting Recast NavMesh path computations every frame ($60\text{ FPS}$) causes severe CPU stutter.
   - Enemy updates path queries on a **$300\text{ms}$ accumulator timer** (`pathUpdateInterval = 0.3`).
   - Waypoint following runs every frame; path recalculation is deferred.

2. **Line-of-Sight (LOS) Raycasting**:
   - Uses `scene.pickWithRay()` cast from `enemy.position + 0.9m Y` to `player.position + 0.9m Y`.
   - Obstacle predicate tests against merged wall geometry (`mergedWalls`). If ray hits a wall before reaching the player's distance, LOS is blocked.

3. **Stuck Detection**:
   - Tracks displacement over a rolling time window ($1.0\text{s}$).
   - If displacement in `Chase` state is $< 0.15\text{m}$ while velocity > 0, increment stuck timer.
   - When stuck timer exceeds threshold ($1.5\text{s}$), force immediate path recalculation or nudge agent vector perpendicular to obstacle.

4. **Attack Range Triggers & Cooldowns**:
   - Attack range: $1.8\text{m}$.
   - Attack cooldown: $1.5\text{s}$ between strikes.

5. **Asset Loading**:
   - Enemy models loaded asynchronously from `public/assets/characters/enemies/character-orc.glb` and `character-human.glb`.
   - Roots mesh configured with `checkCollisions = true`, `ellipsoid = (0.45, 0.9, 0.45)`, and `ellipsoidOffset = (0, 0.9, 0)`.

### 5.3 Complete `Enemy.ts` Class Specification

```typescript
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Entity } from "./Entity";
import { StatsComponent, StatType } from "./components/StatsComponent";
import { HealthComponent } from "./components/HealthComponent";
import { NavMeshManager } from "../dungeon/NavMeshManager";
import { DamageSystem } from "../combat/DamageSystem";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";

export enum EnemyAIState {
  Idle = "Idle",
  Aggro = "Aggro",
  Chase = "Chase",
  Attack = "Attack",
  Dead = "Dead",
}

export interface EnemyConfig {
  id: string;
  name: string;
  modelUrl: string; // e.g. "/assets/characters/enemies/character-orc.glb"
  aggroRadius: number; // e.g. 10.0m
  attackRadius: number; // e.g. 1.8m
  moveSpeed: number; // e.g. 4.5m/s
  attackDamage: number; // e.g. 15
  attackCooldown: number; // e.g. 1.5s
  maxHp: number; // e.g. 80
  armor: number; // e.g. 10
}

export class Enemy extends Entity {
  public stats: StatsComponent;
  public health: HealthComponent;

  private currentState: EnemyAIState = EnemyAIState.Idle;
  private config: EnemyConfig;
  private mesh: Mesh;

  // AI Timers & Throttling
  private pathUpdateTimer: number = 0;
  private readonly pathUpdateInterval: number = 0.3; // Throttled ~300ms
  private attackCooldownTimer: number = 0;
  private aggroTimer: number = 0;
  private readonly aggroDelay: number = 0.4; // 400ms aggro alert phase

  // Navigation State
  private navPath: Vector3[] = [];
  private currentWaypointIdx: number = 0;
  private navMeshManager: NavMeshManager | null = null;
  private targetEntity: Entity | null = null;
  private wallMeshRef: Mesh | null = null;

  // Stuck Detection State
  private lastPosition: Vector3 = Vector3.Zero();
  private stuckCheckTimer: number = 0;
  private stuckDuration: number = 0;

  constructor(id: string, scene: Scene, config: EnemyConfig) {
    super(id, config.name, scene);
    this.config = config;

    // Components
    this.stats = new StatsComponent({
      [StatType.AttackDamage]: config.attackDamage,
      [StatType.MaxHp]: config.maxHp,
      [StatType.Armor]: config.armor,
      [StatType.MoveSpeed]: config.moveSpeed,
    });

    this.health = new HealthComponent(this.stats.getStat(StatType.MaxHp));

    // Listen to stat changes to update health component max HP
    this.stats.onStatChanged.add((evt) => {
      if (evt.stat === StatType.MaxHp) {
        this.health.setMaxHp(evt.newValue);
      }
    });

    // Create root mesh container
    const rootMesh = new Mesh(`enemyRoot_${id}`, scene);
    this.transformNode.dispose();
    this.transformNode = rootMesh;

    // Fallback mesh until GLB finishes loading
    this.mesh = CreateCapsule(`enemyFallback_${id}`, { height: 1.8, radius: 0.4 }, scene);
    this.mesh.position = new Vector3(0, 0.9, 0);
    this.mesh.parent = this.transformNode;

    this.setupEllipsoidCollision();
    this.loadModelAsync(config.modelUrl);

    // Death callback
    this.health.onDeath.add(() => {
      this.transitionTo(EnemyAIState.Dead);
    });
  }

  private setupEllipsoidCollision(): void {
    const rootMesh = this.transformNode as Mesh;
    rootMesh.checkCollisions = true;
    rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45);
    rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
  }

  private async loadModelAsync(url: string): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", url, this.scene);
      if (result.meshes.length > 0) {
        this.mesh.dispose(); // Remove capsule fallback
        const loadedRoot = result.meshes[0] as Mesh;
        loadedRoot.parent = this.transformNode;
        loadedRoot.position = Vector3.Zero();
        loadedRoot.scaling = new Vector3(1, 1, 1);
        this.mesh = loadedRoot;
      }
    } catch (err) {
      console.warn(`[Enemy] GLB model failed to load from ${url}, using capsule fallback.`, err);
    }
  }

  public setNavMeshManager(navMeshManager: NavMeshManager): void {
    this.navMeshManager = navMeshManager;
  }

  public setWallMeshRef(wallMesh: Mesh): void {
    this.wallMeshRef = wallMesh;
  }

  public setTarget(target: Entity): void {
    this.targetEntity = target;
  }

  public getAIState(): EnemyAIState {
    return this.currentState;
  }

  /** Core FSM Update Loop */
  public update(deltaTime: number): void {
    if (!this.isAlive || this.currentState === EnemyAIState.Dead || deltaTime <= 0) {
      return;
    }

    // Tick stat component timed buffs
    this.stats.update(deltaTime);

    // Tick timers
    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= deltaTime;
    }

    if (!this.targetEntity || !this.targetEntity.isAlive) {
      this.transitionTo(EnemyAIState.Idle);
      return;
    }

    const distToTarget = Vector3.Distance(this.position, this.targetEntity.position);
    const hasLOS = this.checkLineOfSight(this.targetEntity);

    // FSM State Dispatcher
    switch (this.currentState) {
      case EnemyAIState.Idle:
        if (distToTarget <= this.config.aggroRadius && hasLOS) {
          this.transitionTo(EnemyAIState.Aggro);
        }
        break;

      case EnemyAIState.Aggro:
        this.aggroTimer += deltaTime;
        this.facePosition(this.targetEntity.position, deltaTime);
        if (this.aggroTimer >= this.aggroDelay) {
          this.transitionTo(EnemyAIState.Chase);
        }
        break;

      case EnemyAIState.Chase:
        this.updateChaseState(deltaTime, distToTarget, hasLOS);
        break;

      case EnemyAIState.Attack:
        this.updateAttackState(deltaTime, distToTarget, hasLOS);
        break;
    }
  }

  private updateChaseState(deltaTime: number, distToTarget: number, hasLOS: boolean): void {
    // 1. Transition to Attack if in range
    if (distToTarget <= this.config.attackRadius) {
      this.transitionTo(EnemyAIState.Attack);
      return;
    }

    // 2. Throttled path calculation (~300ms)
    this.pathUpdateTimer += deltaTime;
    if (this.pathUpdateTimer >= this.pathUpdateInterval) {
      this.pathUpdateTimer = 0;
      this.recalculatePathToTarget();
    }

    // 3. Move along current path waypoints
    this.moveAlongPath(deltaTime);

    // 4. Stuck Detection
    this.checkStuckCondition(deltaTime);
  }

  private updateAttackState(deltaTime: number, distToTarget: number, hasLOS: boolean): void {
    // Face player
    this.facePosition(this.targetEntity!.position, deltaTime);

    // Target out of attack range -> return to chase
    if (distToTarget > this.config.attackRadius + 0.5) {
      this.transitionTo(EnemyAIState.Chase);
      return;
    }

    // Execute attack when cooldown expires
    if (this.attackCooldownTimer <= 0) {
      this.executeAttack();
      this.attackCooldownTimer = this.config.attackCooldown;
    }
  }

  private executeAttack(): void {
    if (!this.targetEntity) return;

    const rawDamage = this.stats.getStat(StatType.AttackDamage);
    DamageSystem.resolveDamage({
      attacker: this,
      target: this.targetEntity,
      rawDamage,
      canCrit: true,
      critMultiplier: 1.5,
    });
  }

  /** Raycast against merged wall geometry for Line-of-Sight */
  private checkLineOfSight(target: Entity): boolean {
    const origin = this.position.add(new Vector3(0, 0.9, 0));
    const targetPos = target.position.add(new Vector3(0, 0.9, 0));
    const dir = targetPos.subtract(origin);
    const dist = dir.length();

    if (dist === 0) return true;
    dir.normalize();

    const ray = new Ray(origin, dir, dist);
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      // Pick against wall geometry or collideable environment meshes
      return mesh.checkCollisions && mesh !== this.transformNode && mesh !== target.transformNode;
    });

    if (pickInfo && pickInfo.hit && pickInfo.distance < dist - 0.2) {
      return false; // Obstacle blocks line of sight
    }

    return true;
  }

  private recalculatePathToTarget(): void {
    if (!this.targetEntity || !this.navMeshManager) {
      this.navPath = [this.targetEntity!.position.clone()];
      this.currentWaypointIdx = 0;
      return;
    }

    const path = this.navMeshManager.findPath(this.position, this.targetEntity.position);
    if (path && path.length > 0) {
      this.navPath = path;
      this.currentWaypointIdx = 0;
    }
  }

  private moveAlongPath(deltaTime: number): void {
    if (this.navPath.length === 0 || this.currentWaypointIdx >= this.navPath.length) {
      return;
    }

    const waypoint = this.navPath[this.currentWaypointIdx];
    const toWaypoint = waypoint.subtract(this.position);
    toWaypoint.y = 0;

    const dist = toWaypoint.length();
    if (dist < 0.4) {
      this.currentWaypointIdx++;
      return;
    }

    const moveDir = toWaypoint.normalizeToNew();
    const moveSpeed = this.stats.getStat(StatType.MoveSpeed);
    const displacement = moveDir.scale(moveSpeed * deltaTime);

    (this.transformNode as Mesh).moveWithCollisions(displacement);
    this.facePosition(this.position.add(moveDir), deltaTime);
  }

  private checkStuckCondition(deltaTime: number): void {
    this.stuckCheckTimer += deltaTime;
    if (this.stuckCheckTimer >= 0.5) {
      const movedDist = Vector3.Distance(this.position, this.lastPosition);
      if (movedDist < 0.1) {
        this.stuckDuration += this.stuckCheckTimer;
        if (this.stuckDuration >= 1.2) {
          // Agent is stuck: force immediate repath
          this.recalculatePathToTarget();
          this.stuckDuration = 0;
        }
      } else {
        this.stuckDuration = 0;
      }
      this.lastPosition.copyFrom(this.position);
      this.stuckCheckTimer = 0;
    }
  }

  private facePosition(targetPos: Vector3, deltaTime: number): void {
    const dir = targetPos.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() < 0.001) return;

    const targetYaw = Math.atan2(dir.x, dir.z);
    const targetQuat = Quaternion.RotationYawPitchRoll(targetYaw, 0, 0);

    if (!this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = Quaternion.Identity();
    }

    Quaternion.SlerpToRef(this.mesh.rotationQuaternion, targetQuat, 1.0 - Math.exp(-15.0 * deltaTime), this.mesh.rotationQuaternion);
  }

  private transitionTo(newState: EnemyAIState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;

    if (newState === EnemyAIState.Aggro) {
      this.aggroTimer = 0;
    } else if (newState === EnemyAIState.Chase) {
      this.pathUpdateTimer = this.pathUpdateInterval; // Immediate path query
    } else if (newState === EnemyAIState.Dead) {
      this.dispose();
    }
  }
}
```

---

## 6. Integration Contract Verification

| Source File | Destination File | Interface Contract / Function Call | Status |
|-------------|------------------|------------------------------------|--------|
| `Player.ts` / `Enemy.ts` | `StatsComponent.ts` | `stats.getStat(StatType.AttackDamage)` | Verified |
| `Enemy.ts` | `DamageSystem.ts` | `DamageSystem.resolveDamage({ attacker, target, rawDamage })` | Verified |
| `DamageSystem.ts` | `HealthComponent.ts` | `target.health.takeDamage(finalDamage)` | Verified |
| `DamageSystem.ts` | `JuiceOverlay.ts` | `DamageSystem.onDamageApplied.notifyObservers(result)` | Verified |
| `Enemy.ts` | `NavMeshManager.ts` | `navMeshManager.findPath(start, end)` | Verified |
| `Enemy.ts` | `SceneLoader` | `ImportMeshAsync("", "", "/assets/characters/enemies/character-orc.glb")` | Verified |
