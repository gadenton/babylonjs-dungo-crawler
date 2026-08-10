import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Observable } from "@babylonjs/core/Misc/observable";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Observer } from "@babylonjs/core/Misc/observable";

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
  public readonly onInventoryToggleRequested: Observable<void> = new Observable<void>();

  // State Tracking
  private activeDevice: InputDeviceType = 'kbm';
  private currentMoveVector: Vector3 = Vector3.Zero();
  private keyState: Map<string, boolean> = new Map<string, boolean>();
  private bufferedInputs: BufferedInput[] = [];
  private prevGamepadButtons: Map<number, boolean[]> = new Map<number, boolean[]>();
  private openModals: Set<string> = new Set<string>();
  public modalOpenPredicate?: () => boolean;

  // Observers & Handlers
  private pointerObserver: Observer<PointerInfo> | null = null;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

  // Config
  private readonly inputBufferMs: number = 120;
  private readonly gamepadDeadzone: number = 0.20;
  private groundPredicate: (mesh: AbstractMesh) => boolean;

  public setModalOpen(modalId: string, isOpen: boolean): void {
    if (isOpen) {
      this.openModals.add(modalId);
    } else {
      this.openModals.delete(modalId);
    }
  }

  public get isUIModalOpen(): boolean {
    if (this.openModals.size > 0) return true;
    if (this.modalOpenPredicate && this.modalOpenPredicate()) return true;
    return false;
  }

  constructor(scene: Scene, groundPredicate?: (mesh: AbstractMesh) => boolean) {
    this.scene = scene;
    this.groundPredicate = groundPredicate ?? ((mesh: AbstractMesh) => {
      // Default ground predicate: checks for name or tag or checkCollisions
      const name = mesh.name.toLowerCase();
      return name.includes("ground") || name.includes("floor") || name.includes("tile");
    });

    this.setupKeyboardListeners();
    this.setupPointerListeners();
  }

  private setupKeyboardListeners(): void {
    this.keyDownHandler = (e: KeyboardEvent) => {
      // Prevent repeating key events from flooding
      if (e.repeat) return;

      const code = e.code;
      this.keyState.set(code, true);

      this.setActiveDevice('kbm');
      this.evaluateKeyboardMovement();

      // Check skill key triggers
      this.checkSkillKeyPress(code);
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      const code = e.code;
      this.keyState.set(code, false);
      this.evaluateKeyboardMovement();
    };

    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  private checkSkillKeyPress(code: string): void {
    let skillSlot = -1;
    if (code === "Digit1" || code === "Numpad1") skillSlot = 0;
    else if (code === "Digit2" || code === "Numpad2") skillSlot = 1;
    else if (code === "Digit3" || code === "Numpad3") skillSlot = 2;
    else if (code === "Digit4" || code === "Numpad4") skillSlot = 3;
    else if (code === "Space") skillSlot = 4; // Dodge

    if (skillSlot !== -1) {
      let targetPos: Vector3 | undefined = undefined;
      const pickInfo = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        this.groundPredicate
      );
      if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
        targetPos = pickInfo.pickedPoint.clone();
      }

      this.bufferSkillInput(skillSlot, targetPos);
    }
  }

  private setupPointerListeners(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        if (this.isUIModalOpen) {
          return;
        }

        const evt = pointerInfo.event as MouseEvent;
        // Primary button (left click)
        if (evt.button === 0) {
          const pickInfo = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            (mesh) => mesh.isPickable && (mesh.checkCollisions || this.groundPredicate(mesh))
          );

          if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
            this.setActiveDevice('kbm');
            this.onPointerClickWorld.notifyObservers(pickInfo.pickedPoint.clone());
          }
        }
      }
    });
  }

  private evaluateKeyboardMovement(): void {
    let screenX = 0;
    let screenY = 0;

    if (this.keyState.get("KeyW") || this.keyState.get("ArrowUp")) screenY += 1;
    if (this.keyState.get("KeyS") || this.keyState.get("ArrowDown")) screenY -= 1;
    if (this.keyState.get("KeyA") || this.keyState.get("ArrowLeft")) screenX -= 1;
    if (this.keyState.get("KeyD") || this.keyState.get("ArrowRight")) screenX += 1;

    let moveVec = Vector3.Zero();
    if (screenX !== 0 || screenY !== 0) {
      // Normalize 2D input vector
      const len = Math.sqrt(screenX * screenX + screenY * screenY);
      const nx = screenX / len;
      const ny = screenY / len;

      // Transform 2D screen direction to 3D isometric world direction (45 deg yaw rotation)
      const invSqrt2 = 1.0 / Math.SQRT2;
      const worldX = (nx - ny) * invSqrt2;
      const worldZ = (nx + ny) * invSqrt2;

      moveVec = new Vector3(worldX, 0, worldZ);
    }

    if (!moveVec.equals(this.currentMoveVector)) {
      this.currentMoveVector = moveVec;
      this.onMoveVectorChanged.notifyObservers(this.currentMoveVector.clone());
    }
  }

  private pollGamepadState(): void {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads) return;

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;

      // Axis 0 = Left Stick X (-1 left, +1 right)
      // Axis 1 = Left Stick Y (-1 up, +1 down -> invert for screen Y)
      const rawX = gp.axes[0] ?? 0;
      const rawY = -(gp.axes[1] ?? 0); // Invert so +1 is up on screen

      const mag = Math.sqrt(rawX * rawX + rawY * rawY);
      if (mag > this.gamepadDeadzone) {
        this.setActiveDevice('gamepad');

        // Apply radial deadzone scaling
        const scaledMag = (mag - this.gamepadDeadzone) / (1.0 - this.gamepadDeadzone);
        const normX = (rawX / mag) * scaledMag;
        const normY = (rawY / mag) * scaledMag;

        // Transform screen direction to 3D isometric world vector
        const invSqrt2 = 1.0 / Math.SQRT2;
        const worldX = (normX - normY) * invSqrt2;
        const worldZ = (normX + normY) * invSqrt2;

        const moveVec = new Vector3(worldX, 0, worldZ);
        if (!moveVec.equals(this.currentMoveVector)) {
          this.currentMoveVector = moveVec;
          this.onMoveVectorChanged.notifyObservers(this.currentMoveVector.clone());
        }
      } else if (this.activeDevice === 'gamepad' && mag <= this.gamepadDeadzone) {
        if (!this.currentMoveVector.equals(Vector3.Zero())) {
          this.currentMoveVector = Vector3.Zero();
          this.onMoveVectorChanged.notifyObservers(Vector3.Zero());
        }
      }

      // Check gamepad buttons (Face buttons for skills) with rising-edge detection
      const prevButtons = this.prevGamepadButtons.get(gp.index) ?? [];
      const currentButtons: boolean[] = [];

      gp.buttons.forEach((btn, idx) => {
        const isPressed = btn.pressed;
        currentButtons[idx] = isPressed;

        const wasPressed = prevButtons[idx] ?? false;
        if (isPressed && !wasPressed) {
          if (idx < 5) {
            this.setActiveDevice('gamepad');
            this.bufferSkillInput(idx);
          } else if (idx === 8 || idx === 9) {
            this.setActiveDevice('gamepad');
            this.onInventoryToggleRequested.notifyObservers();
          }
        }
      });

      this.prevGamepadButtons.set(gp.index, currentButtons);
    }
  }

  public update(deltaTime: number): void {
    // 1. Poll Gamepad state
    this.pollGamepadState();

    // 2. Prune expired inputs from sliding window buffer
    const now = performance.now();
    this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);
  }

  private setActiveDevice(device: InputDeviceType): void {
    if (this.activeDevice !== device) {
      this.activeDevice = device;
      this.onActiveDeviceChanged.notifyObservers(this.activeDevice);
    }
  }

  public getActiveDevice(): InputDeviceType {
    return this.activeDevice;
  }

  public getMoveVector(): Vector3 {
    return this.currentMoveVector.clone();
  }

  /** Push an action into the 120ms input buffer */
  public bufferSkillInput(skillSlot: number, targetPos?: Vector3): void {
    const now = performance.now();
    const event: SkillTriggerEvent = {
      skillSlot,
      targetPos,
      timestamp: now,
    };

    // Buffer item
    this.bufferedInputs.push({
      action: `skill_${skillSlot}`,
      skillSlot,
      targetPos,
      expiresAt: now + this.inputBufferMs,
    });

    // Notify observers
    this.onSkillTriggered.notifyObservers(event);
  }

  /** Peek the oldest valid unexpired buffered skill input without consuming it */
  public peekBufferedSkill(): SkillTriggerEvent | null {
    const now = performance.now();
    this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);

    if (this.bufferedInputs.length > 0) {
      const oldest = this.bufferedInputs[0];
      return {
        skillSlot: oldest.skillSlot,
        targetPos: oldest.targetPos,
        timestamp: oldest.expiresAt - this.inputBufferMs,
      };
    }
    return null;
  }

  /** Conditionally consume the first buffered input that satisfies predicate */
  public consumeBufferedSkillIf(predicate: (event: SkillTriggerEvent) => boolean): SkillTriggerEvent | null {
    const now = performance.now();
    this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);

    for (let i = 0; i < this.bufferedInputs.length; i++) {
      const item = this.bufferedInputs[i];
      const event: SkillTriggerEvent = {
        skillSlot: item.skillSlot,
        targetPos: item.targetPos,
        timestamp: item.expiresAt - this.inputBufferMs,
      };
      if (predicate(event)) {
        this.bufferedInputs.splice(i, 1);
        return event;
      }
    }
    return null;
  }

  /** Consume the oldest valid buffered skill input (if any exists) */
  public consumeBufferedSkill(): SkillTriggerEvent | null {
    const now = performance.now();
    // Filter unexpired
    this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);

    if (this.bufferedInputs.length > 0) {
      const oldest = this.bufferedInputs.shift()!;
      return {
        skillSlot: oldest.skillSlot,
        targetPos: oldest.targetPos,
        timestamp: oldest.expiresAt - this.inputBufferMs,
      };
    }
    return null;
  }

  public clearBuffer(): void {
    this.bufferedInputs = [];
  }

  public dispose(): void {
    if (this.keyDownHandler) {
      window.removeEventListener("keydown", this.keyDownHandler);
    }
    if (this.keyUpHandler) {
      window.removeEventListener("keyup", this.keyUpHandler);
    }
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
    }

    this.onMoveVectorChanged.clear();
    this.onPointerClickWorld.clear();
    this.onSkillTriggered.clear();
    this.onActiveDeviceChanged.clear();
  }
}
