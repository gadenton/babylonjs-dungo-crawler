import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Observable } from "@babylonjs/core/Misc/observable";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

import { Entity } from "./Entity";
import { StatsComponent, StatType } from "./components/StatsComponent";
import { HealthComponent } from "./components/HealthComponent";
import { Item } from "./components/InventoryComponent";
import { rollEnemyDrops } from "../combat/LootTable";
import { NavMeshManager } from "../dungeon/NavMeshManager";

export enum EnemyState {
  Idle = "Idle",
  Aggro = "Aggro",
  Chase = "Chase",
  Attack = "Attack",
  Dead = "Dead",
}

export type EnemyAIState = EnemyState;

export interface EnemyConfig {
  id?: string;
  name?: string;
  modelUrl?: string;
  aggroRadius?: number;
  attackRadius?: number;
  moveSpeed?: number;
  attackDamage?: number;
  attackCooldown?: number;
  maxHp?: number;
  armor?: number;
  enemyTier?: "standard" | "elite" | "boss";
}

export class Enemy extends Entity {
  public mesh: Mesh;
  public stats: StatsComponent;
  public health: HealthComponent;
  public state: EnemyState = EnemyState.Idle;
  public enemyTier: string = "standard";

  private navMeshManager: NavMeshManager | null = null;
  private targetEntity: Entity | null = null;
  private navPath: Vector3[] = [];
  private currentWaypointIdx: number = 0;

  // AI & Throttling
  private pathUpdateTimer: number = 0;
  private readonly pathUpdateInterval: number = 0.3; // Throttled ~300ms path query timer
  private attackTimer: number = 0;
  private attackCooldown: number = 1.5;
  private aggroTimer: number = 0;
  private readonly aggroDelay: number = 0.4; // 400ms aggro alert phase

  // Detection Parameters
  private aggroRadius: number = 9.0;
  private attackRadius: number = 1.8;

  // Stuck Detection (1.0s window check)
  private lastPosition: Vector3 = Vector3.Zero();
  private stuckCheckTimer: number = 0;
  private stuckDuration: number = 0;

  public readonly onStateChanged: Observable<EnemyState> = new Observable<EnemyState>();
  public readonly onAttackPerformed: Observable<{ target: Entity; damage: number }> = new Observable<{ target: Entity; damage: number }>();
  public readonly onLootDropped: Observable<{ enemy: Enemy; drops: Item[] }> = new Observable();

  constructor(
    id: string,
    name: string,
    scene: Scene,
    initialPosition?: Vector3,
    config?: EnemyConfig
  ) {
    super(id, name, scene);

    if (config) {
      if (config.aggroRadius) this.aggroRadius = config.aggroRadius;
      if (config.attackRadius) this.attackRadius = config.attackRadius;
      if (config.attackCooldown) this.attackCooldown = config.attackCooldown;
      if (config.enemyTier) this.enemyTier = config.enemyTier;
    }

    const rootMesh = new Mesh(`enemyRoot_${id}`, scene);
    this.transformNode.dispose();
    this.transformNode = rootMesh;
    if (initialPosition) {
      this.transformNode.position.copyFrom(initialPosition);
    }
    this.lastPosition.copyFrom(this.position);

    // Fallback capsule mesh
    this.mesh = CreateCapsule(`enemyFallback_${id}`, { height: 1.8, radius: 0.4 }, scene);
    this.mesh.position = new Vector3(0, 0.9, 0);
    this.mesh.parent = this.transformNode;

    const fallbackMat = new StandardMaterial(`enemyMat_${id}`, scene);
    fallbackMat.diffuseColor = new Color3(0.85, 0.15, 0.15);
    this.mesh.material = fallbackMat;

    this.setupEllipsoidCollision();

    // Stats and Health Components
    this.stats = new StatsComponent({
      [StatType.MaxHp]: config?.maxHp ?? 60,
      [StatType.AttackDamage]: config?.attackDamage ?? 12,
      [StatType.Armor]: config?.armor ?? 5,
      [StatType.MoveSpeed]: config?.moveSpeed ?? 4.5,
    });

    this.health = new HealthComponent(this.stats.maxHealth);

    this.stats.onStatChanged.add((evt) => {
      if (evt.stat === StatType.MaxHp) {
        this.health.setMaxHp(evt.newValue);
      }
    });

    this.stats.onDeath.add(() => {
      this.die();
    });

    this.health.onDeath.add(() => {
      this.die();
    });

    // Async GLB model loading
    let modelUrl = config?.modelUrl ?? "assets/characters/enemies/character-orc.glb";
    if (modelUrl.startsWith("public/")) {
      modelUrl = modelUrl.substring(7);
    }
    this.loadModelAsync(modelUrl);
  }

  private setupEllipsoidCollision(): void {
    const rootMesh = this.transformNode as Mesh;
    rootMesh.checkCollisions = true;
    rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45);
    rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
  }

  private async loadModelAsync(url: string): Promise<void> {
    const cleanUrl = url.startsWith("public/") ? url.substring(7) : url;
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", cleanUrl, this.scene);
      if (result.meshes.length > 0) {
        this.mesh.dispose();
        const loadedRoot = result.meshes[0] as Mesh;
        loadedRoot.parent = this.transformNode;
        loadedRoot.position = Vector3.Zero();
        loadedRoot.scaling = new Vector3(1, 1, 1);
        this.mesh = loadedRoot;
      }
    } catch (err) {
      // Keep capsule fallback if asset loading fails
      console.warn(`[Enemy] GLB model load fallback for ${cleanUrl}:`, err);
    }
  }

  public setNavMeshManager(navMeshManager: NavMeshManager): void {
    this.navMeshManager = navMeshManager;
  }

  public setTarget(target: Entity): void {
    this.targetEntity = target;
  }

  public getAIState(): EnemyState {
    return this.state;
  }

  public setState(newState: EnemyState): void {
    if (this.state === newState || this.state === EnemyState.Dead) return;
    this.state = newState;
    if (newState === EnemyState.Aggro) {
      this.aggroTimer = 0;
    } else if (newState === EnemyState.Chase) {
      this.pathUpdateTimer = this.pathUpdateInterval; // Immediate initial path query
    }
    this.onStateChanged.notifyObservers(newState);
  }

  public update(deltaTime: number, targetOverride?: Entity): void {
    if (!this.isAlive || this.state === EnemyState.Dead || deltaTime <= 0) return;

    if (targetOverride) {
      this.targetEntity = targetOverride;
    }

    this.stats.update(deltaTime);
    this.attackTimer += deltaTime;

    const target = this.targetEntity;
    if (!target || !target.isAlive) {
      this.setState(EnemyState.Idle);
      return;
    }

    const distToTarget = Vector3.Distance(this.position, target.position);
    const hasLOS = this.checkLineOfSight(target);

    // FSM Dispatcher
    switch (this.state) {
      case EnemyState.Idle:
        if (distToTarget <= this.aggroRadius && hasLOS) {
          this.setState(EnemyState.Aggro);
        }
        break;

      case EnemyState.Aggro:
        this.aggroTimer += deltaTime;
        this.facePosition(target.position, deltaTime);
        if (this.aggroTimer >= this.aggroDelay) {
          this.setState(EnemyState.Chase);
        }
        break;

      case EnemyState.Chase:
        this.updateChaseState(deltaTime, target, distToTarget, hasLOS);
        break;

      case EnemyState.Attack:
        this.updateAttackState(deltaTime, target, distToTarget, hasLOS);
        break;
    }
  }

  private updateChaseState(deltaTime: number, target: Entity, distToTarget: number, hasLOS: boolean): void {
    if (distToTarget <= this.attackRadius) {
      this.setState(EnemyState.Attack);
      this.navPath = [];
      return;
    }

    if (distToTarget > this.aggroRadius * 1.5) {
      this.setState(EnemyState.Idle);
      this.navPath = [];
      return;
    }

    // 300ms Throttled path query
    this.pathUpdateTimer += deltaTime;
    if (this.pathUpdateTimer >= this.pathUpdateInterval) {
      this.pathUpdateTimer = 0;
      this.recalculatePathToTarget(target.position);
    }

    this.moveAlongPath(deltaTime);
    this.checkStuckCondition(deltaTime, target.position);
  }

  private updateAttackState(deltaTime: number, target: Entity, distToTarget: number, hasLOS: boolean): void {
    this.facePosition(target.position, deltaTime);

    if (distToTarget > this.attackRadius + 0.5 || !hasLOS) {
      this.setState(EnemyState.Chase);
      return;
    }

    if (this.attackTimer >= this.attackCooldown) {
      this.attackTimer = 0;
      const damage = this.stats.getStat(StatType.AttackDamage);
      this.onAttackPerformed.notifyObservers({ target, damage });
    }
  }

  private checkLineOfSight(target: Entity): boolean {
    const origin = this.position.add(new Vector3(0, 0.9, 0));
    const targetPos = target.position.add(new Vector3(0, 0.9, 0));
    const dir = targetPos.subtract(origin);
    const dist = dir.length();

    if (dist < 0.01) return true;
    dir.normalize();

    const ray = new Ray(origin, dir, dist);
    const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.checkCollisions && mesh !== this.mesh && mesh !== this.transformNode && mesh !== target.transformNode;
    });

    if (pickInfo && pickInfo.hit && pickInfo.distance < dist - 0.2) {
      return false; // Obstacle blocks LOS
    }

    return true;
  }

  private recalculatePathToTarget(targetPos: Vector3): void {
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
    if (this.navPath.length === 0 || this.currentWaypointIdx >= this.navPath.length) return;

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
    this.facePosition(waypoint, deltaTime);
  }

  private checkStuckCondition(deltaTime: number, targetPos: Vector3): void {
    this.stuckCheckTimer += deltaTime;
    if (this.stuckCheckTimer >= 0.5) {
      const movedDist = Vector3.Distance(this.position, this.lastPosition);
      if (movedDist < 0.1) {
        this.stuckDuration += this.stuckCheckTimer;
        if (this.stuckDuration >= 1.0) {
          // Stuck over 1.0s window -> force path recalculation
          this.recalculatePathToTarget(targetPos);
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

    const rotFactor = 1.0 - Math.exp(-15.0 * deltaTime);
    Quaternion.SlerpToRef(this.mesh.rotationQuaternion, targetQuat, rotFactor, this.mesh.rotationQuaternion);
  }

  private die(): void {
    this.setState(EnemyState.Dead);
    this.isAlive = false;
    (this.transformNode as Mesh).checkCollisions = false;
    this.mesh.isVisible = false;

    const drops = rollEnemyDrops(this.enemyTier);
    if (drops.length > 0) {
      this.onLootDropped.notifyObservers({ enemy: this, drops });
    }
  }

  public getMesh(): Mesh {
    return this.mesh;
  }
}
