import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Observable, Observer } from "@babylonjs/core/Misc/observable";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import "@babylonjs/loaders/glTF";

import { Entity } from "./Entity";
import { InputManager } from "../core/InputManager";
import { NavMeshManager } from "../dungeon/NavMeshManager";
import { StatsComponent, StatType } from "./components/StatsComponent";
import { HealthComponent } from "./components/HealthComponent";
import { InventoryComponent } from "./components/InventoryComponent";
import { Enemy } from "./Enemy";
import { Skill } from "../combat/Skill";
import { ArchetypeType, ArchetypeManager, ArchetypeDefinition } from "../combat/Archetypes";
import { TalentTree } from "../combat/TalentTree";
import { JuiceOverlay } from "../ui/JuiceOverlay";
import { AudioManager } from "../audio/AudioManager";

export class Player extends Entity {
  public mesh: Mesh;
  public stats: StatsComponent;
  public health: HealthComponent;
  public inventory: InventoryComponent;

  // Progression & Archetype State
  public level: number = 1;
  public xp: number = 0;
  public activeArchetypeId: ArchetypeType = "tank";
  public equippedSkills: (Skill | null)[] = [null, null, null, null, null];
  public talentTree: TalentTree;

  // Observables
  public readonly onLevelUp: Observable<number> = new Observable<number>();
  public readonly onArchetypeSwapped: Observable<ArchetypeDefinition> = new Observable<ArchetypeDefinition>();
  public readonly onModelLoaded: Observable<Mesh> = new Observable<Mesh>();

  // Animation System State
  private animationGroups: Map<string, AnimationGroup> = new Map();
  private currentAnimName: string | null = null;
  private isAttacking: boolean = false;
  private attackTimer: number = 0;
  public modelUrl: string = "assets/characters/player/character-male-a.glb";

  // Movement Specs
  private moveSpeed: number = 7.0; // Speed in meters/sec
  private rotationSpeed: number = 18.0; // Angular velocity slerp speed
  private currentVelocity: Vector3 = Vector3.Zero();
  private facingDirection: Vector3 = new Vector3(0, 0, 1);

  // Hybrid Pathing State
  private isDirectMoving: boolean = false;
  private navPath: Vector3[] = [];
  private currentWaypointIdx: number = 0;
  private waypointThreshold: number = 0.35; // Distance threshold

  private inputManager: InputManager | null = null;
  private navMeshManager: NavMeshManager | null = null;
  private moveVectorObserver: Observer<Vector3> | null = null;
  private pointerClickObserver: Observer<Vector3> | null = null;

  constructor(id: string, scene: Scene, customMesh?: Mesh, modelUrl?: string) {
    super(id, "Player", scene);

    const rootMesh = new Mesh(`playerRoot_${id}`, scene);
    this.transformNode.dispose();
    this.transformNode = rootMesh;

    if (modelUrl) {
      this.modelUrl = modelUrl;
    }

    if (customMesh) {
      this.mesh = customMesh;
      this.mesh.parent = this.transformNode;
    } else {
      this.mesh = new Mesh(`playerMeshContainer_${id}`, scene);
      this.mesh.parent = this.transformNode;
      this.loadModelAsync(this.modelUrl);
    }

    this.stats = new StatsComponent({
      [StatType.MaxHp]: 180,
      [StatType.AttackDamage]: 18,
      [StatType.Armor]: 25,
      [StatType.CritChance]: 0.05,
      [StatType.CritDamage]: 1.5,
      [StatType.MoveSpeed]: 6.5,
    });

    this.health = new HealthComponent(this.stats.maxHealth);
    this.inventory = new InventoryComponent(30);

    this.stats.onStatChanged.add((evt) => {
      if (evt.stat === StatType.MaxHp) {
        this.health.setMaxHp(evt.newValue);
      }
    });

    this.stats.onDeath.add(() => {
      this.isAlive = false;
      this.playAnimation("die", false);
    });

    this.health.onDeath.add(() => {
      this.isAlive = false;
      this.playAnimation("die", false);
    });

    // Initialize TalentTree and active Archetype
    this.talentTree = new TalentTree(this.stats, this.activeArchetypeId);
    this.setArchetype("tank");

    this.setupEllipsoidCollision();
  }

  public async loadModelAsync(url: string): Promise<void> {
    const cleanUrl = url.startsWith("public/") ? url.substring(7) : url;
    const result = await SceneLoader.ImportMeshAsync("", "", cleanUrl, this.scene);
    if (!result.meshes || result.meshes.length === 0) {
      throw new Error(`[Player] Failed to load model from ${cleanUrl}: No meshes returned.`);
    }

    if (this.mesh) {
      this.mesh.dispose();
    }

    const loadedRoot = result.meshes[0] as Mesh;
    loadedRoot.parent = this.transformNode;
    loadedRoot.position = Vector3.Zero();
    loadedRoot.scaling = new Vector3(1, 1, 1);
    this.mesh = loadedRoot;

    // Register animation groups
    this.animationGroups.clear();
    for (const group of result.animationGroups) {
      group.stop();
      this.animationGroups.set(group.name.toLowerCase(), group);
    }

    // Play default idle animation
    this.playAnimation("idle", true);

    this.onModelLoaded.notifyObservers(this.mesh);
  }

  public playAnimation(name: string, loop: boolean = true, speedRatio: number = 1.0): boolean {
    const key = name.toLowerCase();
    const animGroup = this.animationGroups.get(key);
    if (!animGroup) return false;

    if (this.currentAnimName === key && animGroup.isPlaying) {
      return true;
    }

    if (this.currentAnimName && this.currentAnimName !== key) {
      const currentGroup = this.animationGroups.get(this.currentAnimName);
      if (currentGroup) {
        currentGroup.stop();
      }
    }

    this.currentAnimName = key;
    animGroup.start(loop, speedRatio, animGroup.from, animGroup.to, false);
    return true;
  }

  public triggerAttackAnimation(): void {
    if (!this.isAlive) return;
    const attackAnimName = Math.random() > 0.5 ? "attack-melee-right" : "attack-melee-left";
    const animGroup = this.animationGroups.get(attackAnimName) ?? this.animationGroups.get("attack-melee-right");

    if (animGroup) {
      if (this.currentAnimName && this.currentAnimName !== attackAnimName) {
        const currentGroup = this.animationGroups.get(this.currentAnimName);
        if (currentGroup) currentGroup.stop();
      }

      this.isAttacking = true;
      this.currentAnimName = attackAnimName;
      this.attackTimer = 0.45; // ~450ms animation duration

      animGroup.start(false, 1.3, animGroup.from, animGroup.to, false);
      animGroup.onAnimationEndObservable.addOnce(() => {
        this.isAttacking = false;
        this.currentAnimName = null;
      });
    }
  }

  public setupEllipsoidCollision(): void {
    const rootMesh = this.transformNode as Mesh;
    rootMesh.checkCollisions = true;
    rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45);
    rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
  }

  public setNavMeshManager(navMeshManager: NavMeshManager): void {
    this.navMeshManager = navMeshManager;
  }

  public setInputManager(inputManager: InputManager): void {
    this.detachInputManager();
    this.inputManager = inputManager;

    this.moveVectorObserver = this.inputManager.onMoveVectorChanged.add((dirVector) => {
      if (dirVector.lengthSquared() > 0.01) {
        this.cancelNavPath();
        this.isDirectMoving = true;
      } else {
        this.isDirectMoving = false;
      }
    });

    this.pointerClickObserver = this.inputManager.onPointerClickWorld.add((targetPos) => {
      if (this.inputManager && this.inputManager.getMoveVector().lengthSquared() > 0.01) {
        return;
      }

      if (this.navMeshManager) {
        const startPos = this.transformNode.position;
        const path = this.navMeshManager.findPath(startPos, targetPos);
        if (path && path.length > 0) {
          this.setNavPath(path);
        } else {
          this.setNavPath([targetPos]);
        }
      } else {
        this.setNavPath([targetPos]);
      }
    });
  }

  private detachInputManager(): void {
    if (this.inputManager) {
      if (this.moveVectorObserver) {
        this.inputManager.onMoveVectorChanged.remove(this.moveVectorObserver);
        this.moveVectorObserver = null;
      }
      if (this.pointerClickObserver) {
        this.inputManager.onPointerClickWorld.remove(this.pointerClickObserver);
        this.pointerClickObserver = null;
      }
      this.inputManager = null;
    }
  }

  public setNavPath(path: Vector3[]): void {
    if (!path || path.length === 0) return;
    this.navPath = path.map((p) => p.clone());
    this.currentWaypointIdx = 0;
    this.isDirectMoving = false;
  }

  public cancelNavPath(): void {
    this.navPath = [];
    this.currentWaypointIdx = 0;
  }

  // --- Progression XP & Leveling ---
  public getRequiredXpForNextLevel(): number {
    return Math.floor(100 * Math.pow(this.level, 1.5));
  }

  public gainXp(amount: number): void {
    if (amount <= 0) return;
    this.xp += amount;
    let req = this.getRequiredXpForNextLevel();
    while (this.xp >= req) {
      this.xp -= req;
      this.level++;
      this.talentTree.setPlayerLevel(this.level);
      this.onLevelUp.notifyObservers(this.level);
      req = this.getRequiredXpForNextLevel();
    }
  }

  // --- Archetype Swapping ---
  public setArchetype(archetypeId: ArchetypeType): boolean {
    const arch = ArchetypeManager.getArchetype(archetypeId);
    if (!arch) return false;
    if (!ArchetypeManager.isArchetypeUnlocked(archetypeId, this.level)) {
      return false;
    }

    // 1. Apply base stats and passive modifiers
    ArchetypeManager.applyArchetypeToPlayer(this, archetypeId);

    // 2. Set active archetype ID and equip signature skill in slot 0
    this.activeArchetypeId = archetypeId;
    this.equippedSkills[0] = arch.signatureSkill;

    // 3. Switch archetype in TalentTree
    this.talentTree.switchArchetype(archetypeId);

    // 4. Notify observers
    this.onArchetypeSwapped.notifyObservers(arch);

    return true;
  }

  public performAttack(targetEnemy?: Enemy): boolean {
    if (!this.isAlive) return false;
    this.triggerAttackAnimation();
    if (targetEnemy && targetEnemy.isAlive) {
      const dist = Vector3.Distance(this.position, targetEnemy.position);
      if (dist <= 2.5) {
        const dir = targetEnemy.position.subtract(this.position);
        dir.y = 0;
        if (dir.lengthSquared() > 0.01) {
          const yaw = Math.atan2(dir.x, dir.z);
          this.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
        }
        return true;
      }
    }
    return false;
  }

  public processInputBuffer(
    deltaTime: number,
    potentialTargets: Entity[] = [],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): void {
    // 1. Update equipped skills cooldown timers
    for (const skill of this.equippedSkills) {
      if (skill) skill.update(deltaTime);
    }

    // 2. Process active channeled skill ticks (e.g. Whirlwind)
    if (this.equippedSkills[0] && this.equippedSkills[0].isChanneling) {
      this.equippedSkills[0].updateChannelTick(this, potentialTargets, juice, audio);
    }

    // 3. Poll and conditionally consume 120ms sliding window input buffer
    if (this.inputManager) {
      this.inputManager.consumeBufferedSkillIf((bufferedInput) => {
        const slot = bufferedInput.skillSlot;
        const skillToCast = this.equippedSkills[slot];
        if (!skillToCast) {
          return true; // Discard input if no skill is equipped in slot
        }
        const check = skillToCast.canCast(this.stats);
        if (check.possible) {
          const targetPos = bufferedInput.targetPos ?? this.transformNode.position;
          this.triggerAttackAnimation();
          skillToCast.execute(this, targetPos, potentialTargets, juice, audio);
          return true; // Skill executed successfully, consume from buffer
        }
        // Do NOT consume if skill is currently on cooldown (or uncastable right now)
        return false;
      });
    }
  }

  public update(
    deltaTime: number,
    potentialTargets: Entity[] = [],
    juice?: JuiceOverlay,
    audio?: AudioManager
  ): void {
    if (deltaTime <= 0 || !this.isAlive) return;

    this.stats.update(deltaTime);
    this.moveSpeed = this.stats.getStat(StatType.MoveSpeed);

    // Update skills & 120ms input buffer
    this.processInputBuffer(deltaTime, potentialTargets, juice, audio);

    let targetVelocity = Vector3.Zero();

    const inputVec = this.inputManager ? this.inputManager.getMoveVector() : Vector3.Zero();

    if (inputVec.lengthSquared() > 0.01) {
      targetVelocity = inputVec.scale(this.moveSpeed);
      this.cancelNavPath();
    } else if (this.navPath.length > 0 && this.currentWaypointIdx < this.navPath.length) {
      const waypoint = this.navPath[this.currentWaypointIdx];
      const playerPos = this.transformNode.position;
      const toWaypoint = waypoint.subtract(playerPos);
      toWaypoint.y = 0;

      const dist = toWaypoint.length();
      if (dist < this.waypointThreshold) {
        this.currentWaypointIdx++;
        if (this.currentWaypointIdx >= this.navPath.length) {
          this.cancelNavPath();
        }
      } else {
        targetVelocity = toWaypoint.normalizeToNew().scale(this.moveSpeed);
      }
    }

    const lerpFactor = 1.0 - Math.exp(-20.0 * deltaTime);
    this.currentVelocity = Vector3.Lerp(this.currentVelocity, targetVelocity, lerpFactor);

    const displacement = this.currentVelocity.scale(deltaTime);
    if (displacement.lengthSquared() > 0.00001) {
      (this.transformNode as Mesh).moveWithCollisions(displacement);
    }

    if (this.currentVelocity.lengthSquared() > 0.1) {
      const moveDir = this.currentVelocity.normalizeToNew();
      this.facingDirection = moveDir.clone();

      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      const targetQuat = Quaternion.RotationYawPitchRoll(targetYaw, 0, 0);

      if (!this.mesh.rotationQuaternion) {
        this.mesh.rotationQuaternion = Quaternion.Identity();
      }

      const rotFactor = 1.0 - Math.exp(-this.rotationSpeed * deltaTime);
      Quaternion.SlerpToRef(this.mesh.rotationQuaternion, targetQuat, rotFactor, this.mesh.rotationQuaternion);
    }

    // Handle attack timer safety unlock
    if (this.isAttacking) {
      this.attackTimer -= deltaTime;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
      }
    }

    // Animation state machine: update walk / idle animation based on movement state
    if (this.isAlive && !this.isAttacking) {
      if (this.currentVelocity.lengthSquared() > 0.1) {
        this.playAnimation("walk", true, 1.2);
      } else {
        this.playAnimation("idle", true, 1.0);
      }
    }
  }

  public getVelocity(): Vector3 {
    return this.currentVelocity.clone();
  }

  public getFacingDirection(): Vector3 {
    return this.facingDirection.clone();
  }

  public getMesh(): Mesh {
    return this.mesh;
  }

  public override dispose(): void {
    this.detachInputManager();
    this.mesh.dispose();
    super.dispose();
  }
}

