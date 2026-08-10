# Phase 3 Technical Blueprint: Combat Engine, Stats, Throttled Enemy AI, Juice Overlay & Audio

## 1. Observation
Direct observations of codebase, requirements, and skill guidelines:
- **Files Examined**:
  - `ORIGINAL_REQUEST.md`: Requirement R3 specifies decoupled stat modifier layer (`base + flat + percent`), throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`) with ~300ms updates, LOS raycasts, stuck detection, combat juice (floating damage text, 100ms white hit flash, freeze frames), and Web Audio 3D spatial sound with sidechain ducking.
  - `PROJECT.md`: Features 9, 10, 11, 12 assigned to Phase 3 Milestone (M3).
  - Existing `src/core/Engine.ts`: Manages `Scene`, `Engine`, render loop, lights, shadow generator.
  - Existing `src/entities/Entity.ts`: Abstract base class with `id`, `name`, `scene`, `transformNode`, `position`, `rotation`, `update(deltaTime)`, `dispose()`.
  - Existing `src/entities/Player.ts`: Implements hybrid WASD/click-to-move pathing, ellipsoid collision sliding (`checkCollisions = true`, `ellipsoid = (0.45, 0.9, 0.45)`).
  - Existing `src/dungeon/NavMeshManager.ts`: Handles Recast WASM initialization, `createNavMesh(groundMesh)`, and `findPath(start, end)`.
  - Existing `src/index.ts`: Boots engine, input, camera, dungeon generator, tilemap, navmesh, and player.
- **Skill Instructions Applied**:
  - `rpg`: Derived stats formula `(base + sum(flat)) * (1 + sum(percent))`, never edit base stats directly for temporary buffs/gear.
  - `game-ai`: Decouple decisions from motion; throttle path queries (~300ms); implement stuck detection and line-of-sight checks.
  - `game-feel`: Layer 5-8 feedback channels (sound, screen shake, hit-stop/freeze frame, white hit flash, damage pop) into transient combat events; decay trauma quadratically.
  - `audio-design`: Bus hierarchy (`Master` -> `Music`, `SFX`, `UI`), linear-to-dB conversion, sidechain ducking on SFX hit triggers, spatial audio panners.
- **Compilation Check**:
  - Command: `npx tsc --noEmit`
  - Result: Codebase compiles cleanly with **0 errors**.

---

## 2. Logic Chain

1. **Stat Component Architecture (`src/entities/components/StatsComponent.ts`)**:
   - Modifiers must be stored in a collection (`Map<string, StatModifier>`) separating flat adds from percentage multipliers.
   - Recomputing stat values dynamically on query (`getStat(statType)`) prevents desynchronization and stat drift.
   - Resource pools (`Health`, `Mana`) are stored as current state values bounded by `[0, MaxHealth]` and `[0, MaxMana]`.

2. **Enemy FSM AI Architecture (`src/entities/Enemy.ts`)**:
   - Inheriting from `Entity` integrates `Enemy` with Babylon scene transform nodes and update loops.
   - Throttling AI logic with `aiTimer += deltaTime; if (aiTimer >= 0.3)` limits pathfinding overhead to ~3 times per second per enemy instead of 60fps.
   - Line-of-sight via `scene.pickWithRay` prevents enemies from detecting or attacking players through solid dungeon walls.
   - Track `lastPosition` and `stuckTimer` to trigger path recalculation if an enemy is stuck against geometry.

3. **Damage Calculation Math (`src/combat/DamageSystem.ts`)**:
   - Pure stateless utility function `calculateDamage(attacker, defender, skillMultiplier)`:
     - Base damage = $\text{AttackPower} \times \text{skillMultiplier}$
     - Armor mitigation multiplier = $\frac{100}{100 + \text{defender.Armor}}$
     - Crit roll = $\text{Math.random()} < \text{attacker.CritChance}$
     - Final damage = $\text{Math.max}(1, \text{Math.round}(\text{MitigatedDamage} \times (\text{isCrit} ? \text{attacker.CritDamage} : 1.0)))$

4. **Combat Juice Overlay (`src/ui/JuiceOverlay.ts`)**:
   - Floating text uses `@babylonjs/gui` `AdvancedDynamicTexture` with 3D-to-2D screen projection (`Vector3.Project`). Animates scale pop, upward float, and alpha fade.
   - White hit flash temporarily assigns a solid white emissive `StandardMaterial` to target mesh for 100ms.
   - Freeze frame (hit stop) freezes render delta or skips frame updates for 60ms on heavy/crit hits to emphasize impact weight.

5. **Audio Management (`src/audio/AudioManager.ts`)**:
   - Web Audio API bus tree: `MasterGainNode` -> `MusicGainNode`, `SFXGainNode`, `UIGainNode`.
   - Sidechain ducking: when SFX triggers, `musicGainNode.gain` dips by -10dB over 50ms and recovers over 350ms.
   - 3D spatial panner nodes positioned in world space, with listener updated to camera/player transform.
   - Built-in Web Audio synthesis fallbacks (oscillators/noise bursts) for hit, crit, heal, swing SFX guarantee combat sound works even before external audio files are loaded.

6. **System Integration (`src/index.ts`)**:
   - Attach `StatsComponent` to `Player` and `Enemy`.
   - Spawn enemies in room centers from `TileGrid`.
   - Wire player attack input (e.g. `Spacebar` / proximity click) to trigger combat loop, executing `DamageSystem`, `JuiceOverlay`, camera shake, and `AudioManager`.

---

## 3. Caveats
- **GLB Loading Fallback**: Kenney character GLBs (Mini Characters) may load asynchronously or require specific paths. `Enemy` must create a robust fallback visual mesh (e.g. colored cylinder/capsule with eye indicator) if GLB loading is delayed or model is missing.
- **Audio Context User Gesture Policy**: Browsers require a user gesture (click/keypress) before resuming `AudioContext`. `AudioManager` must handle `suspended` audio state gracefully and auto-resume on first input.
- **GUI Overlay Cleanup**: The `AdvancedDynamicTexture` overlay and linked text blocks must be properly disposed on entity death or scene unload to prevent memory leaks.

---

## 4. Conclusion & Precise Class Blueprints

The implementation for Phase 3 consists of 5 new modules and updates to 2 existing files (`Player.ts`, `index.ts`). Below are the exact technical blueprints and interface contracts for the Worker agent.

### Module 1: `src/entities/components/StatsComponent.ts`
```typescript
import { Observable } from "@babylonjs/core/Misc/observable";

export enum StatType {
  Health = "Health",
  MaxHealth = "MaxHealth",
  Mana = "Mana",
  MaxMana = "MaxMana",
  AttackPower = "AttackPower",
  Armor = "Armor",
  CritChance = "CritChance",
  CritDamage = "CritDamage",
  MoveSpeed = "MoveSpeed",
}

export type ModifierType = "flat" | "percent";

export interface StatModifier {
  id: string;
  stat: StatType;
  type: ModifierType;
  value: number;
  duration?: number; // Optional duration in seconds
}

export class StatsComponent {
  private baseStats: Map<StatType, number> = new Map();
  private modifiers: Map<string, StatModifier> = new Map();
  private currentHealth: number = 100;
  private currentMana: number = 50;

  public readonly onHealthChanged = new Observable<{ current: number; max: number; delta: number }>();
  public readonly onManaChanged = new Observable<{ current: number; max: number; delta: number }>();
  public readonly onDeath = new Observable<void>();

  constructor(initialBaseStats?: Partial<Record<StatType, number>>) {
    // Defaults
    this.baseStats.set(StatType.MaxHealth, initialBaseStats?.MaxHealth ?? 100);
    this.baseStats.set(StatType.MaxMana, initialBaseStats?.MaxMana ?? 50);
    this.baseStats.set(StatType.AttackPower, initialBaseStats?.AttackPower ?? 15);
    this.baseStats.set(StatType.Armor, initialBaseStats?.Armor ?? 10);
    this.baseStats.set(StatType.CritChance, initialBaseStats?.CritChance ?? 0.1);
    this.baseStats.set(StatType.CritDamage, initialBaseStats?.CritDamage ?? 1.5);
    this.baseStats.set(StatType.MoveSpeed, initialBaseStats?.MoveSpeed ?? 7.0);

    this.currentHealth = this.getStat(StatType.MaxHealth);
    this.currentMana = this.getStat(StatType.MaxMana);
  }

  public getStat(stat: StatType): number {
    if (stat === StatType.Health) return this.currentHealth;
    if (stat === StatType.Mana) return this.currentMana;

    const base = this.baseStats.get(stat) ?? 0;
    let flatSum = 0;
    let percentSum = 0;

    for (const mod of this.modifiers.values()) {
      if (mod.stat === stat) {
        if (mod.type === "flat") flatSum += mod.value;
        else if (mod.type === "percent") percentSum += mod.value;
      }
    }

    const calculated = (base + flatSum) * (1.0 + percentSum);

    // Clamping
    if (stat === StatType.CritChance) return Math.min(1.0, Math.max(0.0, calculated));
    if (stat === StatType.CritDamage) return Math.max(1.0, calculated);
    if (stat === StatType.MoveSpeed) return Math.max(0.1, calculated);
    if (stat === StatType.MaxHealth || stat === StatType.MaxMana) return Math.max(1.0, Math.round(calculated));
    return Math.max(0.0, calculated);
  }

  public setBaseStat(stat: StatType, value: number): void {
    this.baseStats.set(stat, value);
    if (stat === StatType.MaxHealth) this.modifyHealth(0);
    if (stat === StatType.MaxMana) this.modifyMana(0);
  }

  public addModifier(mod: StatModifier): void {
    this.modifiers.set(mod.id, { ...mod });
  }

  public removeModifier(id: string): void {
    this.modifiers.delete(id);
  }

  public modifyHealth(delta: number): number {
    const maxHp = this.getStat(StatType.MaxHealth);
    const oldHp = this.currentHealth;
    this.currentHealth = Math.min(maxHp, Math.max(0, this.currentHealth + delta));
    const actualDelta = this.currentHealth - oldHp;

    this.onHealthChanged.notifyObservers({ current: this.currentHealth, max: maxHp, delta: actualDelta });

    if (oldHp > 0 && this.currentHealth === 0) {
      this.onDeath.notifyObservers();
    }

    return actualDelta;
  }

  public modifyMana(delta: number): boolean {
    const maxMana = this.getStat(StatType.MaxMana);
    if (delta < 0 && this.currentMana + delta < 0) return false;

    const oldMana = this.currentMana;
    this.currentMana = Math.min(maxMana, Math.max(0, this.currentMana + delta));
    const actualDelta = this.currentMana - oldMana;

    this.onManaChanged.notifyObservers({ current: this.currentMana, max: maxMana, delta: actualDelta });
    return true;
  }

  public update(deltaTime: number): void {
    for (const [id, mod] of Array.from(this.modifiers.entries())) {
      if (mod.duration !== undefined) {
        mod.duration -= deltaTime;
        if (mod.duration <= 0) {
          this.modifiers.delete(id);
        }
      }
    }
  }
}
```

---

### Module 2: `src/entities/Enemy.ts`
```typescript
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Observable } from "@babylonjs/core/Misc/observable";
import { Entity } from "./Entity";
import { StatsComponent, StatType } from "./components/StatsComponent";
import { NavMeshManager } from "../dungeon/NavMeshManager";

export enum EnemyState {
  Idle = "Idle",
  Aggro = "Aggro",
  Chase = "Chase",
  Attack = "Attack",
  Dead = "Dead",
}

export class Enemy extends Entity {
  public mesh: Mesh;
  public stats: StatsComponent;
  public state: EnemyState = EnemyState.Idle;

  private navMeshManager: NavMeshManager | null = null;
  private navPath: Vector3[] = [];
  private currentWaypointIdx: number = 0;

  // AI & Throttling
  private aiTimer: number = 0;
  private readonly aiInterval: number = 0.3; // ~300ms update loop
  private attackTimer: number = 0;
  private readonly attackCooldown: number = 1.2;

  // Detection Parameters
  private readonly aggroRange: number = 9.0;
  private readonly attackRange: number = 1.8;

  // Stuck Detection
  private lastPosition: Vector3 = Vector3.Zero();
  private stuckTimer: number = 0;

  public readonly onStateChanged = new Observable<EnemyState>();
  public readonly onAttackPerformed = new Observable<{ target: Entity; damage: number }>();

  constructor(id: string, name: string, scene: Scene, initialPosition: Vector3) {
    super(id, name, scene);

    const rootMesh = new Mesh(`enemyRoot_${id}`, scene);
    this.transformNode.dispose();
    this.transformNode = rootMesh;
    this.transformNode.position.copyFrom(initialPosition);

    // Create fallback enemy visual mesh (Red Cylinder with Eye Indicator)
    this.mesh = CreateCylinder(`enemyMesh_${id}`, { height: 1.8, diameter: 0.8 }, scene);
    this.mesh.position = new Vector3(0, 0.9, 0);
    this.mesh.parent = this.transformNode;

    const mat = new StandardMaterial(`enemyMat_${id}`, scene);
    mat.diffuseColor = new Color3(0.8, 0.2, 0.2);
    this.mesh.material = mat;

    // Ellipsoid collision
    rootMesh.checkCollisions = true;
    rootMesh.ellipsoid = new Vector3(0.4, 0.9, 0.4);
    rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);

    // Stats
    this.stats = new StatsComponent({
      MaxHealth: 60,
      AttackPower: 10,
      Armor: 5,
      MoveSpeed: 4.5,
    });

    this.stats.onDeath.add(() => this.die());
  }

  public setNavMeshManager(navMeshManager: NavMeshManager): void {
    this.navMeshManager = navMeshManager;
  }

  public setState(newState: EnemyState): void {
    if (this.state === newState || this.state === EnemyState.Dead) return;
    this.state = newState;
    this.onStateChanged.notifyObservers(newState);
  }

  public update(deltaTime: number, targetEntity?: Entity): void {
    if (!this.isAlive || this.state === EnemyState.Dead) return;

    this.stats.update(deltaTime);
    this.attackTimer += deltaTime;
    this.aiTimer += deltaTime;

    // 1. Throttled FSM AI Logic (Every ~300ms)
    if (this.aiTimer >= this.aiInterval && targetEntity && targetEntity.isAlive) {
      this.aiTimer = 0;
      this.updateAI(targetEntity);
    }

    // 2. Continuous Movement Execution
    if (this.state === EnemyState.Chase && this.navPath.length > 0) {
      this.moveAlongPath(deltaTime);
    }
  }

  private updateAI(target: Entity): void {
    const distToTarget = Vector3.Distance(this.position, target.position);
    const hasLOS = this.checkLineOfSight(target.position);

    switch (this.state) {
      case EnemyState.Idle:
        if (distToTarget <= this.aggroRange && hasLOS) {
          this.setState(EnemyState.Aggro);
        }
        break;

      case EnemyState.Aggro:
        this.setState(EnemyState.Chase);
        this.recalculatePathTo(target.position);
        break;

      case EnemyState.Chase:
        if (distToTarget <= this.attackRange && hasLOS) {
          this.setState(EnemyState.Attack);
          this.navPath = [];
        } else if (distToTarget > this.aggroRange * 1.5) {
          this.setState(EnemyState.Idle);
          this.navPath = [];
        } else {
          this.recalculatePathTo(target.position);
        }
        break;

      case EnemyState.Attack:
        if (distToTarget > this.attackRange || !hasLOS) {
          this.setState(EnemyState.Chase);
        } else {
          this.facePosition(target.position);
          if (this.attackTimer >= this.attackCooldown) {
            this.attackTimer = 0;
            this.onAttackPerformed.notifyObservers({ target, damage: this.stats.getStat(StatType.AttackPower) });
          }
        }
        break;
    }
  }

  private checkLineOfSight(targetPos: Vector3): boolean {
    const rayOrigin = this.position.add(new Vector3(0, 1.0, 0));
    const rayDir = targetPos.add(new Vector3(0, 1.0, 0)).subtract(rayOrigin);
    const dist = rayDir.length();
    if (dist < 0.001) return true;

    const ray = new Ray(rayOrigin, rayDir.normalizeToNew(), dist);
    const pick = this.scene.pickWithRay(ray, (mesh) => {
      // Ignore enemy and target meshes; check wall/obstacle collision
      return mesh.checkCollisions && mesh !== this.mesh && mesh !== this.transformNode;
    });

    return !pick || !pick.hit || pick.distance >= dist - 0.5;
  }

  private recalculatePathTo(targetPos: Vector3): void {
    if (this.navMeshManager) {
      const path = this.navMeshManager.findPath(this.position, targetPos);
      if (path && path.length > 0) {
        this.navPath = path;
        this.currentWaypointIdx = 0;
      }
    } else {
      this.navPath = [targetPos.clone()];
      this.currentWaypointIdx = 0;
    }
  }

  private moveAlongPath(deltaTime: number): void {
    if (this.currentWaypointIdx >= this.navPath.length) return;

    const waypoint = this.navPath[this.currentWaypointIdx];
    const toWaypoint = waypoint.subtract(this.position);
    toWaypoint.y = 0;

    const dist = toWaypoint.length();
    if (dist < 0.4) {
      this.currentWaypointIdx++;
      return;
    }

    const moveSpeed = this.stats.getStat(StatType.MoveSpeed);
    const moveDir = toWaypoint.normalizeToNew();
    const displacement = moveDir.scale(moveSpeed * deltaTime);

    (this.transformNode as Mesh).moveWithCollisions(displacement);
    this.facePosition(waypoint);

    // Stuck detection check
    const movedDist = Vector3.Distance(this.position, this.lastPosition);
    if (movedDist < 0.05) {
      this.stuckTimer += deltaTime;
      if (this.stuckTimer > 0.6) {
        this.stuckTimer = 0;
        this.currentWaypointIdx++; // Skip blocked waypoint
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPosition.copyFrom(this.position);
  }

  private facePosition(targetPos: Vector3): void {
    const dir = targetPos.subtract(this.position);
    dir.y = 0;
    if (dir.lengthSquared() > 0.01) {
      const yaw = Math.atan2(dir.x, dir.z);
      this.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
    }
  }

  private die(): void {
    this.setState(EnemyState.Dead);
    this.isAlive = false;
    (this.transformNode as Mesh).checkCollisions = false;
    this.mesh.isVisible = false;
  }

  public getMesh(): Mesh {
    return this.mesh;
  }
}
```

---

### Module 3: `src/combat/DamageSystem.ts`
```typescript
import { StatsComponent, StatType } from "../entities/components/StatsComponent";

export interface DamageRequest {
  attacker: StatsComponent;
  defender: StatsComponent;
  skillMultiplier?: number;
}

export interface DamageResult {
  rawDamage: number;
  mitigatedDamage: number;
  finalDamage: number;
  isCrit: boolean;
  armorReductionPct: number;
}

export class DamageSystem {
  public static calculateDamage(request: DamageRequest): DamageResult {
    const skillMultiplier = request.skillMultiplier ?? 1.0;
    const rawDamage = request.attacker.getStat(StatType.AttackPower) * skillMultiplier;

    const armor = request.defender.getStat(StatType.Armor);
    const armorReductionPct = armor / (armor + 100.0);
    const mitigatedDamage = rawDamage * (1.0 - armorReductionPct);

    const critChance = request.attacker.getStat(StatType.CritChance);
    const critDamage = request.attacker.getStat(StatType.CritDamage);
    const isCrit = Math.random() < critChance;

    const finalDamage = Math.max(1, Math.round(mitigatedDamage * (isCrit ? critDamage : 1.0)));

    return {
      rawDamage,
      mitigatedDamage,
      finalDamage,
      isCrit,
      armorReductionPct,
    };
  }

  public static applyDamage(
    attacker: { stats: StatsComponent },
    defender: { stats: StatsComponent },
    skillMultiplier: number = 1.0
  ): DamageResult {
    const result = this.calculateDamage({
      attacker: attacker.stats,
      defender: defender.stats,
      skillMultiplier,
    });

    defender.stats.modifyHealth(-result.finalDamage);
    return result;
  }
}
```

---

### Module 4: `src/ui/JuiceOverlay.ts`
```typescript
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

interface FloatingNumber {
  textBlock: TextBlock;
  worldPos: Vector3;
  velocity: Vector3;
  lifeTime: number;
  maxLifeTime: number;
  scale: number;
  targetScale: number;
}

export class JuiceOverlay {
  private scene: Scene;
  private uiTexture: AdvancedDynamicTexture;
  private floatingNumbers: FloatingNumber[] = [];
  private sharedWhiteMat: StandardMaterial;

  constructor(scene: Scene) {
    this.scene = scene;
    this.uiTexture = AdvancedDynamicTexture.CreateFullscreenUI("JuiceOverlayUI", true, scene);

    this.sharedWhiteMat = new StandardMaterial("hitFlashWhiteMat", scene);
    this.sharedWhiteMat.emissiveColor = new Color3(1, 1, 1);
    this.sharedWhiteMat.disableLighting = true;
  }

  public spawnFloatingText(position: Vector3, text: string, type: "damage" | "crit" | "heal"): void {
    const textBlock = new TextBlock();
    textBlock.text = text;
    textBlock.fontFamily = "Arial, sans-serif";
    textBlock.fontWeight = "bold";

    let color = "#ffcc00"; // Default yellow damage
    let fontSize = 24;
    let initialScale = 1.2;
    let maxLife = 0.85;

    if (type === "crit") {
      color = "#ff3300"; // Red/Orange crit
      fontSize = 34;
      initialScale = 1.8;
      maxLife = 1.1;
    } else if (type === "heal") {
      color = "#33ff55"; // Green heal
      fontSize = 24;
      initialScale = 1.2;
      maxLife = 0.95;
    }

    textBlock.color = color;
    textBlock.fontSize = fontSize;
    textBlock.outlineWidth = 3;
    textBlock.outlineColor = "#000000";

    this.uiTexture.addControl(textBlock);

    // Random scatter velocity
    const vx = (Math.random() - 0.5) * 1.5;
    const vy = type === "crit" ? 4.0 : 2.5;
    const vz = (Math.random() - 0.5) * 1.5;

    const spawnPos = position.add(new Vector3(0, 1.6, 0));

    this.floatingNumbers.push({
      textBlock,
      worldPos: spawnPos,
      velocity: new Vector3(vx, vy, vz),
      lifeTime: 0,
      maxLifeTime: maxLife,
      scale: initialScale,
      targetScale: 1.0,
    });
  }

  public flashWhite(mesh: Mesh, durationMs: number = 100): void {
    const originalMaterial = mesh.material;
    mesh.material = this.sharedWhiteMat;

    setTimeout(() => {
      if (mesh && !mesh.isDisposed()) {
        mesh.material = originalMaterial;
      }
    }, durationMs);
  }

  public triggerFreezeFrame(durationMs: number = 60): void {
    const startTime = performance.now();
    while (performance.now() - startTime < durationMs) {
      // Busy wait freeze frame hook for hit-stop punch
    }
  }

  public update(deltaTime: number): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const engine = this.scene.getEngine();
    const viewportWidth = engine.getRenderWidth();
    const viewportHeight = engine.getRenderHeight();

    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
      const item = this.floatingNumbers[i];
      item.lifeTime += deltaTime;

      if (item.lifeTime >= item.maxLifeTime) {
        this.uiTexture.removeControl(item.textBlock);
        item.textBlock.dispose();
        this.floatingNumbers.splice(i, 1);
        continue;
      }

      // Update position
      item.worldPos.addInPlace(item.velocity.scale(deltaTime));
      item.velocity.y -= 5.0 * deltaTime; // Gravity dampening

      // Scale pop lerp
      item.scale = item.scale + (item.targetScale - item.scale) * Math.min(1.0, deltaTime * 15.0);
      item.textBlock.scaleX = item.scale;
      item.textBlock.scaleY = item.scale;

      // Alpha fade out
      const alpha = 1.0 - item.lifeTime / item.maxLifeTime;
      item.textBlock.alpha = Math.max(0, alpha);

      // Project 3D -> 2D Screen
      const screenCoords = Vector3.Project(
        item.worldPos,
        MatrixIdentity,
        this.scene.getTransformMatrix(),
        camera.viewport.toGlobal(viewportWidth, viewportHeight)
      );

      item.textBlock.left = `${screenCoords.x - viewportWidth / 2}px`;
      item.textBlock.top = `${screenCoords.y - viewportHeight / 2}px`;
    }
  }

  public dispose(): void {
    this.uiTexture.dispose();
    this.sharedWhiteMat.dispose();
  }
}

const MatrixIdentity = Vector3.Zero().asArray(); // Placeholder matrix helper
```

---

### Module 5: `src/audio/AudioManager.ts`
```typescript
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;

  private isDucking: boolean = false;
  private duckTimeout: any = null;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;

    this.audioCtx = new AudioCtxClass();

    this.masterGain = this.audioCtx.createGain();
    this.musicGain = this.audioCtx.createGain();
    this.sfxGain = this.audioCtx.createGain();
    this.uiGain = this.audioCtx.createGain();

    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.uiGain.connect(this.masterGain);
    this.masterGain.connect(this.audioCtx.destination);
  }

  public ensureContextResumed(): void {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  public setMusicVolume(vol: number): void {
    if (this.musicGain) this.musicGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  public setSFXVolume(vol: number): void {
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  /** Sidechain ducking: lowers music bus volume temporarily on heavy combat impacts */
  public duckMusic(durationMs: number = 300, duckDb: number = -10): void {
    if (!this.audioCtx || !this.musicGain) return;
    this.ensureContextResumed();

    const now = this.audioCtx.currentTime;
    const targetGain = Math.pow(10, duckDb / 20); // dB to linear gain

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(targetGain, now + 0.05); // 50ms attack

    if (this.duckTimeout) clearTimeout(this.duckTimeout);

    this.duckTimeout = setTimeout(() => {
      if (this.audioCtx && this.musicGain) {
        const releaseTime = this.audioCtx.currentTime;
        this.musicGain.gain.cancelScheduledValues(releaseTime);
        this.musicGain.gain.linearRampToValueAtTime(1.0, releaseTime + 0.35); // 350ms release
      }
    }, durationMs);
  }

  /** Procedural Synthesized Combat SFX (Hit, Crit, Swing, Heal) */
  public playHitSFX(position?: Vector3, isCrit: boolean = false): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = isCrit ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(isCrit ? 280 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + (isCrit ? 0.2 : 0.1));

    gain.gain.setValueAtTime(isCrit ? 0.6 : 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + (isCrit ? 0.2 : 0.1));

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + (isCrit ? 0.2 : 0.1));

    if (isCrit) {
      this.duckMusic(300, -12);
    }
  }

  public playSwingSFX(): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public updateListener(cameraPos: Vector3): void {
    if (this.audioCtx && this.audioCtx.listener) {
      if (this.audioCtx.listener.positionX) {
        this.audioCtx.listener.positionX.value = cameraPos.x;
        this.audioCtx.listener.positionY.value = cameraPos.y;
        this.audioCtx.listener.positionZ.value = cameraPos.z;
      }
    }
  }
}
```

---

## 5. Implementation Step-by-Step Plan for Worker

1. **Step 1: Create `src/entities/components/StatsComponent.ts`**
   - Implement `StatType` enum, `StatModifier` interface, and `StatsComponent` class with decoupled modifier math (`base + flat + percent`).
   - Wire health/mana resource modification methods and observables.

2. **Step 2: Create `src/combat/DamageSystem.ts`**
   - Implement pure calculation `calculateDamage` with armor mitigation ($\frac{100}{100 + \text{Armor}}$) and crit math.
   - Implement `applyDamage` helper.

3. **Step 3: Create `src/ui/JuiceOverlay.ts`**
   - Setup `@babylonjs/gui` `AdvancedDynamicTexture` fullscreen UI.
   - Implement bouncing floating text projection (`spawnFloatingText`), white hit flash (`flashWhite`), and freeze frame (`triggerFreezeFrame`).

4. **Step 4: Create `src/audio/AudioManager.ts`**
   - Setup Web Audio API bus topology (`Master`, `Music`, `SFX`, `UI`), sidechain ducking (`duckMusic`), spatial listener updates, and synthesized procedural audio fallbacks (`playHitSFX`, `playSwingSFX`).

5. **Step 5: Create `src/entities/Enemy.ts` and update `Player.ts`**
   - In `Player.ts`: attach `public stats: StatsComponent` property. Add `performAttack(targetEnemy: Enemy)` method.
   - Implement `Enemy.ts`: FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`), throttled AI update loop (~300ms timer), LOS raycasting, stuck detection, capsule/cylinder visual fallback + ellipsoid collision.

6. **Step 6: Update `src/index.ts` Entrypoint Wiring**
   - Instantiate `AudioManager`, `JuiceOverlay`, and attach `StatsComponent` to `Player`.
   - Spawn 3-5 `Enemy` instances in room centers of generated dungeon.
   - Bind player attack controls (e.g. `Spacebar` / Click on Enemy) to execute combat swings -> `DamageSystem` -> `JuiceOverlay` floating text + white hit flash + freeze frame + `CameraRig.addTrauma` + `AudioManager`.
   - In render loop: tick `enemy.update(dt, player)`, `juiceOverlay.update(dt)`, `audioManager.updateListener(camera.position)`.

7. **Step 7: Verification**
   - Run `npx tsc --noEmit` and `npm run build` to verify clean compilation.

---

## 6. Verification Method

- **TypeScript Verification**:
  ```powershell
  npx tsc --noEmit
  ```
  Must pass with 0 syntax or type errors.

- **Vite Build Verification**:
  ```powershell
  npm run build
  ```
  Must successfully compile production bundle.

- **Runtime Inspection Criteria**:
  - `StatsComponent`: `getStat` returns exact computed values without stat drift upon adding and removing temporary modifiers.
  - `Enemy`: Enemies transition between `Idle` -> `Aggro` -> `Chase` -> `Attack` based on player proximity; pathfinding updates occur on ~300ms throttled intervals.
  - `DamageSystem`: Armor reduces damage correctly; crits double damage with red floating numbers.
  - `JuiceOverlay`: Floating damage numbers bounce, fade, and clear without desyncing or leaking memory.
  - `AudioManager`: Synthesized hits play with 3D listener orientation and duck music on crits.
