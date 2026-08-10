# Technical Analysis & Architecture Specification: Phase 1 Camera, Input & Player Systems

## Executive Summary
This document provides the exact technical specification for Phase 1 Camera, Input & Player Systems of the Babylon.js ARPG (Dungeon Crawler). The design strictly adheres to the requirements defined in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the domain skills (`camera-systems`, `input-systems`, `game-feel`).

The system components designed herein are:
1. `src/camera/CameraRig.ts`: Fixed isometric camera with exponential follow smoothing, look-ahead offset, and trauma-decay screen shake.
2. `src/core/InputManager.ts`: Hybrid input system (Mouse Click-to-Move, WASD, Gamepad Left Stick), 120ms input buffer, dynamic device prompt swapping observable.
3. `src/entities/Entity.ts` & `src/entities/Player.ts`: Base entity abstraction and player controller with Babylon.js Ellipsoid collision geometry and native wall sliding via `moveWithCollisions`.

---

## 1. Subsystem Specifications

### 1.1 `src/camera/CameraRig.ts` — Isometric Camera Rig

#### Responsibilities
- Maintain a locked isometric perspective angle (45° pitch, 45° yaw).
- Provide frame-rate independent exponential target tracking smoothing (`1 - exp(-rate * dt)`).
- Calculate and apply target look-ahead offset scaled by target velocity or mouse aim.
- Provide a non-destructive screen shake hook based on quadratic trauma decay (`shake = trauma^2 * noise`). Shake is applied strictly as an additive offset to the camera rig and target point, never mutating the player's physical transform.

#### Class Contract & Interface
```typescript
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export interface CameraRigOptions {
  pitchDegrees?: number;     // Default: 45 degrees (PI / 4)
  yawDegrees?: number;       // Default: 45 degrees (PI / 4)
  distance?: number;         // Default: 22.0 units
  fov?: number;              // Default: 0.8 rad (~45 degrees)
  followRate?: number;       // Default: 10.0 (smooth tracking factor)
  lookAheadDist?: number;    // Default: 3.5 units max offset
  lookAheadRate?: number;    // Default: 5.0 (smooth look-ahead factor)
  traumaDecayRate?: number;  // Default: 1.4 per second
}

export class CameraRig {
  private scene: Scene;
  private camera: TargetCamera;
  private targetNode: TransformNode | null = null;

  // Isometric Config
  private pitchAngle: number;
  private yawAngle: number;
  private distance: number;
  private followRate: number;
  private lookAheadDist: number;
  private lookAheadRate: number;

  // Operational State
  private currentFocus: Vector3 = Vector3.Zero();
  private currentLookAhead: Vector3 = Vector3.Zero();

  // Trauma & Screen Shake
  private trauma: number = 0.0;
  private traumaDecayRate: number;
  private shakeTime: number = 0.0;
  private maxShakeOffset: Vector3 = new Vector3(0.6, 0.4, 0.6);

  constructor(scene: Scene, options?: CameraRigOptions);

  /** Attach camera rig to follow a target transform node (e.g. Player) */
  public attachToTarget(target: TransformNode): void;

  /** Update camera position, smoothing, look-ahead, and screen shake (called in scene loop / LateUpdate) */
  public update(deltaTime: number, velocity?: Vector3, lookDirection?: Vector3): void;

  /** Add trauma for screen shake [0.0 - 1.0] (e.g. 0.3 for light hit, 0.8 for heavy impact) */
  public addTrauma(amount: number): void;

  /** Dynamic tuning parameters */
  public setLookAheadDistance(dist: number): void;
  public setFollowRate(rate: number): void;

  /** Access underlying Babylon camera */
  public getCamera(): TargetCamera;

  /** Cleanup resources */
  public dispose(): void;
}
```

#### Detailed Mathematical Derivations & Logic

1. **Isometric Projection Offset:**
   The camera position vector $\vec{P}_{\text{cam\_base}}$ relative to focus point $\vec{P}_{\text{focus}}$ is given by:
   $$\Delta \vec{P}_{\text{iso}} = \begin{pmatrix} d \cdot \sin(\text{yaw}) \cdot \cos(\text{pitch}) \\ d \cdot \sin(\text{pitch}) \\ -d \cdot \cos(\text{yaw}) \cdot \cos(\text{pitch}) \end{pmatrix}$$
   For $\text{pitch} = 45^\circ$ ($\frac{\pi}{4}$) and $\text{yaw} = 45^\circ$ ($\frac{\pi}{4}$), with $d = 22.0$:
   $$\Delta \vec{P}_{\text{iso}} = \begin{pmatrix} 22.0 \cdot \frac{1}{\sqrt{2}} \cdot \frac{1}{\sqrt{2}} \\ 22.0 \cdot \frac{1}{\sqrt{2}} \\ -22.0 \cdot \frac{1}{\sqrt{2}} \cdot \frac{1}{\sqrt{2}} \end{pmatrix} = \begin{pmatrix} 11.0 \\ 15.5563 \\ -11.0 \end{pmatrix}$$

2. **Exponential Smoothing (Frame-Rate Independent):**
   Standard linear interpolation `lerp(a, b, k)` per frame is frame-rate dependent. We use exact exponential decay:
   $$t_{\text{follow}} = 1 - \exp(-\text{followRate} \cdot dt)$$
   $$t_{\text{lookAhead}} = 1 - \exp(-\text{lookAheadRate} \cdot dt)$$

3. **Target Look-Ahead Calculation:**
   If target velocity vector $\vec{v}$ has magnitude $> 0.1 \text{ m/s}$:
   $$\vec{L}_{\text{desired}} = \frac{\vec{v}}{\|\vec{v}\|} \cdot \text{lookAheadDist}$$
   Otherwise, if aim vector $\vec{d}_{\text{aim}}$ is provided:
   $$\vec{L}_{\text{desired}} = \vec{d}_{\text{aim}} \cdot \text{lookAheadDist}$$
   Else:
   $$\vec{L}_{\text{desired}} = (0, 0, 0)$$

   Interpolate current look-ahead vector:
   $$\vec{L}_{\text{current}} = \text{Vector3.Lerp}(\vec{L}_{\text{current}}, \vec{L}_{\text{desired}}, t_{\text{lookAhead}})$$

   Target focus point:
   $$\vec{P}_{\text{desiredFocus}} = \vec{P}_{\text{target}} + \vec{L}_{\text{current}}$$
   $$\vec{P}_{\text{focus}} = \text{Vector3.Lerp}(\vec{P}_{\text{focus}}, \vec{P}_{\text{desiredFocus}}, t_{\text{follow}})$$

4. **Quadratic Trauma Decay & Shake Offset Hook:**
   Trauma is clamped to $[0, 1]$ and decays over time:
   $$\text{trauma} = \max(0, \text{trauma} - \text{traumaDecayRate} \cdot dt)$$
   $$\text{intensity} = \text{trauma}^2$$

   High-frequency multi-sine noise offset calculation:
   $$\text{shakeTime} = \text{shakeTime} + dt \cdot 30.0$$
   $$\text{shake}_x = \text{maxShakeOffset.x} \cdot \text{intensity} \cdot \sin(\text{shakeTime} \cdot 1.7)$$
   $$\text{shake}_y = \text{maxShakeOffset.y} \cdot \text{intensity} \cdot \cos(\text{shakeTime} \cdot 2.3)$$
   $$\text{shake}_z = \text{maxShakeOffset.z} \cdot \text{intensity} \cdot \sin(\text{shakeTime} \cdot 1.3)$$
   $$\vec{S} = (\text{shake}_x, \text{shake}_y, \text{shake}_z)$$

   Final frame positioning applied to camera:
   $$\text{camera.position} = \vec{P}_{\text{focus}} + \Delta \vec{P}_{\text{iso}} + \vec{S}$$
   $$\text{camera.setTarget}(\vec{P}_{\text{focus}} + \vec{S})$$

   *Notice*: Translating both camera position and camera focus target by $\vec{S}$ produces a screen vibration without modifying the player's position or bounding box.

---

### 1.2 `src/core/InputManager.ts` — Unified Input Manager

#### Responsibilities
- Aggregate Keyboard (WASD), Gamepad (Left Stick), and Mouse Click-to-Move input events into unified observables.
- Map 2D screen directions to 3D isometric world directions.
- Implement radial deadzone processing for gamepad analog sticks.
- Provide direct WASD / Left stick vector override that instantly cancels click-to-move pathing.
- Maintain a 120ms sliding window input buffer for skill/dodge triggers to prevent dropped inputs during animations.
- Dynamic input device tracking (`'kbm'` vs `'gamepad'`) with observable notifications for UI prompt swapping.

#### Class Contract & Interface
```typescript
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Vector2 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Observable } from "@babylonjs/core/Misc/observable";

export type InputDeviceType = 'kbm' | 'gamepad';

export interface SkillTriggerEvent {
  skillSlot: number; // 0: Skill 1, 1: Skill 2, 2: Skill 3, 3: Skill 4, 4: Dodge
  targetPos?: Vector3;
  timestamp: number;
}

export interface BufferedInput {
  action: string;
  skillSlot: number;
  targetPos?: Vector3;
  expiresAt: number; // Timestamp (performance.now()) when buffer expires
}

export class InputManager {
  private scene: Scene;

  // Observables
  public readonly onMoveVectorChanged: Observable<Vector3> = new Observable<Vector3>();
  public readonly onPointerClickWorld: Observable<Vector3> = new Observable<Vector3>();
  public readonly onSkillTriggered: Observable<SkillTriggerEvent> = new Observable<SkillTriggerEvent>();
  public readonly onActiveDeviceChanged: Observable<InputDeviceType> = new Observable<InputDeviceType>();

  // State Tracking
  private activeDevice: InputDeviceType = 'kbm';
  private currentMoveVector: Vector3 = Vector3.Zero();
  private keyState: Map<string, boolean> = new Map<string, boolean>();
  private bufferedInputs: BufferedInput[] = [];

  // Config
  private readonly inputBufferMs: number = 120;
  private readonly gamepadDeadzone: number = 0.20;
  private groundPredicate: (mesh: AbstractMesh) => boolean;

  constructor(scene: Scene, groundPredicate?: (mesh: AbstractMesh) => boolean);

  /** Per-frame update step to poll gamepad state, clean expired buffer items, and evaluate direction vectors */
  public update(deltaTime: number): void;

  /** Access current active input device mode */
  public getActiveDevice(): InputDeviceType;

  /** Read current normalized 3D isometric movement vector */
  public getMoveVector(): Vector3;

  /** Push an action into the 120ms input buffer */
  public bufferSkillInput(skillSlot: number, targetPos?: Vector3): void;

  /** Consume the oldest valid buffered skill input (if any exists) */
  public consumeBufferedSkill(): SkillTriggerEvent | null;

  /** Clear input buffer */
  public clearBuffer(): void;

  /** Cleanup event listeners and observers */
  public dispose(): void;
}
```

#### Detailed Logic & Edge Case Handling

1. **Isometric Keyboard Movement Direction Matrix:**
   In isometric camera view (45° Yaw looking along diagonal), screen directions map to 3D world axes as follows:
   - W (Up on screen): World direction $(+1, 0, +1) / \sqrt{2}$
   - S (Down on screen): World direction $(-1, 0, -1) / \sqrt{2}$
   - A (Left on screen): World direction $(-1, 0, +1) / \sqrt{2}$
   - D (Right on screen): World direction $(+1, 0, -1) / \sqrt{2}$

   Given normalized screen input vector $\vec{i}_{\text{screen}} = (x_{\text{screen}}, y_{\text{screen}})$:
   $$\begin{pmatrix} v_x \\ v_z \end{pmatrix} = \begin{pmatrix} \cos(45^\circ) & \sin(45^\circ) \\ -\sin(45^\circ) & \cos(45^\circ) \end{pmatrix} \begin{pmatrix} x_{\text{screen}} \\ y_{\text{screen}} \end{pmatrix}$$
   $$\vec{v}_{\text{world}} = \left( \frac{x_{\text{screen}} + y_{\text{screen}}}{\sqrt{2}}, \; 0, \; \frac{-x_{\text{screen}} + y_{\text{screen}}}{\sqrt{2}} \right)$$

2. **Gamepad Radial Deadzone Math:**
   Raw stick input $(x_{\text{stick}}, y_{\text{stick}})$ from standard gamepad API:
   $$m = \sqrt{x_{\text{stick}}^2 + y_{\text{stick}}^2}$$
   If $m < \text{deadzone}$ (0.20): return $\vec{0}$.
   Otherwise, rescale magnitude linearly from deadzone boundary to 1.0:
   $$m_{\text{scaled}} = \frac{m - \text{deadzone}}{1.0 - \text{deadzone}}$$
   $$\vec{i}_{\text{rescaled}} = \left( \frac{x_{\text{stick}}}{m} \cdot m_{\text{scaled}}, \; \frac{y_{\text{stick}}}{m} \cdot m_{\text{scaled}} \right)$$
   Transform $\vec{i}_{\text{rescaled}}$ into world vector $\vec{v}_{\text{world}}$ using the isometric matrix above.

3. **Click-to-Move Raycasting:**
   Subscribes to `scene.onPointerObservable` filtering for `PointerEventTypes.POINTERDOWN` with primary button (left-click).
   - Verify event is not consumed by `@babylonjs/gui` UI elements.
   - Perform raycast picking: `const pickInfo = scene.pick(scene.pointerX, scene.pointerY, this.groundPredicate)`.
   - If `pickInfo.hit` and `pickInfo.pickedPoint`:
     - Swap active device to `'kbm'`.
     - Notify `onPointerClickWorld.notifyObservers(pickInfo.pickedPoint)`.

4. **120ms Sliding Window Input Buffer:**
   When a skill or dodge key/button is pressed (edge trigger):
   ```typescript
   const now = performance.now();
   this.bufferedInputs.push({
     action: `skill_${skillSlot}`,
     skillSlot,
     targetPos,
     expiresAt: now + this.inputBufferMs // 120ms window
   });
   ```
   In `update(deltaTime)`:
   ```typescript
   const now = performance.now();
   this.bufferedInputs = this.bufferedInputs.filter(item => item.expiresAt > now);
   ```
   When the combat system/character state machine transitions to `Idle` or recovery state, it calls `consumeBufferedSkill()`, which pops and returns the earliest unexpired entry.

5. **Dynamic Prompt Swapping Observable:**
   - Any keyboard event or mouse move/click $\rightarrow$ check if active device is `'kbm'`. If not, update to `'kbm'` and trigger `onActiveDeviceChanged.notifyObservers('kbm')`.
   - Any gamepad button press or axis magnitude $> 0.20$ $\rightarrow$ check if active device is `'gamepad'`. If not, update to `'gamepad'` and trigger `onActiveDeviceChanged.notifyObservers('gamepad')`.

---

### 1.3 `src/entities/Entity.ts` & `src/entities/Player.ts` — Entity Base & Player Controller

#### Responsibilities
- `Entity`: Abstract base class providing common transform, lifecycle (`update`, `dispose`), position getters/setters, and identification.
- `Player`: Concrete player entity managing mesh creation/loading, ellipsoid collision configuration (`mesh.checkCollisions = true`), direct vector movement with native wall sliding, click-to-move path execution, facing direction slerp, and velocity reporting for camera look-ahead.

#### Class Contracts & Interfaces

```typescript
// src/entities/Entity.ts
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export abstract class Entity {
  public readonly id: string;
  public name: string;
  public scene: Scene;
  public transformNode: TransformNode;
  public isAlive: boolean = true;

  constructor(id: string, name: string, scene: Scene) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.transformNode = new TransformNode(`entity_${id}`, scene);
  }

  public abstract update(deltaTime: number): void;

  public get position(): Vector3 { return this.transformNode.position; }
  public set position(val: Vector3) { this.transformNode.position.copyFrom(val); }

  public get rotation(): Vector3 { return this.transformNode.rotation; }
  public set rotation(val: Vector3) { this.transformNode.rotation.copyFrom(val); }

  public getForwardVector(): Vector3 {
    return this.transformNode.forward;
  }

  public dispose(): void {
    this.isAlive = false;
    this.transformNode.dispose();
  }
}
```

```typescript
// src/entities/Player.ts
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Entity } from "./Entity";
import { InputManager } from "../core/InputManager";

export class Player extends Entity {
  private mesh: Mesh;

  // Movement Specs
  private moveSpeed: number = 7.0;       // Speed in meters/sec
  private rotationSpeed: number = 18.0;  // Angular velocity slerp speed
  private currentVelocity: Vector3 = Vector3.Zero();
  private facingDirection: Vector3 = new Vector3(0, 0, 1);

  // Hybrid Pathing State
  private isDirectMoving: boolean = false;
  private navPath: Vector3[] = [];
  private currentWaypointIdx: number = 0;
  private waypointThreshold: number = 0.35; // Distance threshold to consider waypoint reached

  private inputManager: InputManager | null = null;

  constructor(id: string, scene: Scene, customMesh?: Mesh) {
    super(id, "Player", scene);

    if (customMesh) {
      this.mesh = customMesh;
      this.mesh.parent = this.transformNode;
    } else {
      // Create default player capsule fallback mesh
      this.mesh = CreateCapsule("playerMesh", { height: 1.8, radius: 0.4 }, scene);
      this.mesh.position.y = 0.9; // Center capsule pivot at feet (Y=0 relative to transformNode)
      this.mesh.parent = this.transformNode;
    }

    this.setupEllipsoidCollision();
  }

  /** Configure Babylon Ellipsoid for smooth wall collision & sliding */
  public setupEllipsoidCollision(): void {
    this.mesh.checkCollisions = true;
    // Bounding ellipsoid: width radius = 0.45m, height radius = 0.9m, depth radius = 0.45m
    this.mesh.ellipsoid = new Vector3(0.45, 0.9, 0.45);
    // Shift ellipsoid up by 0.9m so bottom touches feet (ground plane)
    this.mesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
  }

  /** Attach InputManager observers */
  public setInputManager(inputManager: InputManager): void;

  /** Set path points received from Recast NavMesh Manager */
  public setNavPath(path: Vector3[]): void;

  /** Cancel active NavMesh pathing */
  public cancelNavPath(): void;

  /** Update loop called every frame */
  public update(deltaTime: number): void;

  /** Query current velocity for camera look-ahead calculation */
  public getVelocity(): Vector3 { return this.currentVelocity.clone(); }

  /** Query facing direction vector */
  public getFacingDirection(): Vector3 { return this.facingDirection.clone(); }

  /** Access root mesh */
  public getMesh(): Mesh { return this.mesh; }
}
```

#### Detailed Execution Architecture & Native Wall Sliding

1. **Ellipsoid Collisions & Wall Sliding:**
   When using Babylon's built-in collision system:
   ```typescript
   const displacement = this.currentVelocity.scale(deltaTime);
   this.mesh.moveWithCollisions(displacement);
   // Synchronize parent transformNode position with moved mesh
   this.transformNode.position.copyFrom(this.mesh.position);
   ```
   - Any wall or obstacle mesh with `mesh.checkCollisions = true` automatically reflects displacement vectors along the surface normal when a collision occurs.
   - This provides **native, hardware-accelerated wall sliding** without complex custom collision sweeps!

2. **Hybrid Movement Resolution:**
   - **Direct Vector Input (WASD / Stick):**
     - When `InputManager.onMoveVectorChanged` fires with magnitude $> 0.01$:
       - Immediately set `navPath = []` and `isDirectMoving = true`.
       - Compute target velocity: $\vec{v}_{\text{target}} = \vec{v}_{\text{input}} \cdot \text{moveSpeed}$.
       - Accelerate `currentVelocity` towards $\vec{v}_{\text{target}}$ using smooth rate factor.
   - **Click-to-Move Pathing:**
     - When `InputManager.onPointerClickWorld` fires:
       - If WASD/stick magnitude is $0$:
         - `navPath` is updated with path waypoints.
         - `currentWaypointIdx = 0`.
         - `isDirectMoving = false`.
     - During `update(dt)` when `navPath` is active:
       - Target waypoint: $\vec{W} = \text{navPath}[\text{currentWaypointIdx}]$.
       - Calculate vector to waypoint: $\vec{D} = \vec{W} - \vec{P}_{\text{player}}$ (projected on XZ plane).
       - If $\|\vec{D}\| < \text{waypointThreshold}$:
         - Advance `currentWaypointIdx++`.
         - If `currentWaypointIdx >= navPath.length`: clear `navPath`, set velocity to $\vec{0}$.
       - Else:
         - $\vec{v}_{\text{target}} = \frac{\vec{D}}{\|\vec{D}\|} \cdot \text{moveSpeed}$.
         - Move via `mesh.moveWithCollisions()`.

3. **Facing Direction Smooth Rotation (Slerp):**
   When horizontal velocity magnitude $> 0.1 \text{ m/s}$:
   - Target rotation angle: $\theta_{\text{target}} = \text{Math.atan2}(v_x, v_z)$.
   - Create target quaternion: $Q_{\text{target}} = \text{Quaternion.RotationYawPitchRoll}(\theta_{\text{target}}, 0, 0)$.
   - Interpolate mesh rotation quaternion:
     $$Q_{\text{mesh}} = \text{Quaternion.Slerp}(Q_{\text{mesh}}, Q_{\text{target}}, 1 - \exp(-\text{rotationSpeed} \cdot dt))$$

---

## 2. Interface Verification & Cross-Module Dependencies

| Component | Target File | Imports / Dependencies | Exported Interface |
|---|---|---|---|
| CameraRig | `src/camera/CameraRig.ts` | `@babylonjs/core` (`TargetCamera`, `Vector3`, `Scene`, `TransformNode`) | `CameraRig`, `CameraRigOptions` |
| InputManager | `src/core/InputManager.ts` | `@babylonjs/core` (`Scene`, `Vector3`, `Vector2`, `Observable`, `PointerEventTypes`) | `InputManager`, `InputDeviceType`, `SkillTriggerEvent`, `BufferedInput` |
| Entity | `src/entities/Entity.ts` | `@babylonjs/core` (`Scene`, `TransformNode`, `Vector3`) | `Entity` (abstract) |
| Player | `src/entities/Player.ts` | `@babylonjs/core` (`Scene`, `Mesh`, `Vector3`, `Quaternion`, `CreateCapsule`), `./Entity`, `../core/InputManager` | `Player` |

---

## 3. Summary of Key Design Decisions
1. **Camera Shake Offset:** Shake is calculated frame-by-frame via quadratic trauma and applied as an additive translation to both camera position and focal target. The player's mesh and collision ellipsoid remain completely untouched.
2. **Isometric Vector Alignment:** WASD and Gamepad stick vectors are transformed through a 45° rotation matrix before being applied to character velocity, ensuring screen-relative intuition matches world direction.
3. **Ellipsoid Collisions:** Babylon's `moveWithCollisions()` native method is used on the Player mesh, guaranteeing smooth wall sliding along static dungeon walls (`checkCollisions = true`) without sticking or clipping.
4. **Input Buffering:** 120ms sliding window buffer prevents missed skill inputs during animation recovery, meeting exact ARPG feel requirements.
