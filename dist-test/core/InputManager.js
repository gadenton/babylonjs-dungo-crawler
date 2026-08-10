import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
export class InputManager {
    constructor(scene, groundPredicate) {
        // Observables
        this.onMoveVectorChanged = new Observable();
        this.onPointerClickWorld = new Observable();
        this.onSkillTriggered = new Observable();
        this.onActiveDeviceChanged = new Observable();
        // State Tracking
        this.activeDevice = 'kbm';
        this.currentMoveVector = Vector3.Zero();
        this.keyState = new Map();
        this.bufferedInputs = [];
        this.prevGamepadButtons = new Map();
        // Observers & Handlers
        this.pointerObserver = null;
        this.keyDownHandler = null;
        this.keyUpHandler = null;
        // Config
        this.inputBufferMs = 120;
        this.gamepadDeadzone = 0.20;
        this.scene = scene;
        this.groundPredicate = groundPredicate ?? ((mesh) => {
            // Default ground predicate: checks for name or tag or checkCollisions
            const name = mesh.name.toLowerCase();
            return name.includes("ground") || name.includes("floor") || name.includes("tile");
        });
        this.setupKeyboardListeners();
        this.setupPointerListeners();
    }
    setupKeyboardListeners() {
        this.keyDownHandler = (e) => {
            // Prevent repeating key events from flooding
            if (e.repeat)
                return;
            const code = e.code;
            this.keyState.set(code, true);
            this.setActiveDevice('kbm');
            this.evaluateKeyboardMovement();
            // Check skill key triggers
            this.checkSkillKeyPress(code);
        };
        this.keyUpHandler = (e) => {
            const code = e.code;
            this.keyState.set(code, false);
            this.evaluateKeyboardMovement();
        };
        window.addEventListener("keydown", this.keyDownHandler);
        window.addEventListener("keyup", this.keyUpHandler);
    }
    checkSkillKeyPress(code) {
        let skillSlot = -1;
        if (code === "Digit1" || code === "Numpad1")
            skillSlot = 0;
        else if (code === "Digit2" || code === "Numpad2")
            skillSlot = 1;
        else if (code === "Digit3" || code === "Numpad3")
            skillSlot = 2;
        else if (code === "Digit4" || code === "Numpad4")
            skillSlot = 3;
        else if (code === "Space")
            skillSlot = 4; // Dodge
        if (skillSlot !== -1) {
            let targetPos = undefined;
            const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, this.groundPredicate);
            if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
                targetPos = pickInfo.pickedPoint.clone();
            }
            this.bufferSkillInput(skillSlot, targetPos);
        }
    }
    setupPointerListeners() {
        this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const evt = pointerInfo.event;
                // Primary button (left click)
                if (evt.button === 0) {
                    const pickInfo = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => mesh.isPickable && (mesh.checkCollisions || this.groundPredicate(mesh)));
                    if (pickInfo && pickInfo.hit && pickInfo.pickedPoint) {
                        this.setActiveDevice('kbm');
                        this.onPointerClickWorld.notifyObservers(pickInfo.pickedPoint.clone());
                    }
                }
            }
        });
    }
    evaluateKeyboardMovement() {
        let screenX = 0;
        let screenY = 0;
        if (this.keyState.get("KeyW") || this.keyState.get("ArrowUp"))
            screenY += 1;
        if (this.keyState.get("KeyS") || this.keyState.get("ArrowDown"))
            screenY -= 1;
        if (this.keyState.get("KeyA") || this.keyState.get("ArrowLeft"))
            screenX -= 1;
        if (this.keyState.get("KeyD") || this.keyState.get("ArrowRight"))
            screenX += 1;
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
    pollGamepadState() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (!gamepads)
            return;
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp || !gp.connected)
                continue;
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
            }
            else if (this.activeDevice === 'gamepad' && mag <= this.gamepadDeadzone) {
                if (!this.currentMoveVector.equals(Vector3.Zero())) {
                    this.currentMoveVector = Vector3.Zero();
                    this.onMoveVectorChanged.notifyObservers(Vector3.Zero());
                }
            }
            // Check gamepad buttons (Face buttons for skills) with rising-edge detection
            const prevButtons = this.prevGamepadButtons.get(gp.index) ?? [];
            const currentButtons = [];
            gp.buttons.forEach((btn, idx) => {
                const isPressed = btn.pressed;
                currentButtons[idx] = isPressed;
                const wasPressed = prevButtons[idx] ?? false;
                if (isPressed && !wasPressed && idx < 5) {
                    this.setActiveDevice('gamepad');
                    this.bufferSkillInput(idx);
                }
            });
            this.prevGamepadButtons.set(gp.index, currentButtons);
        }
    }
    update(deltaTime) {
        // 1. Poll Gamepad state
        this.pollGamepadState();
        // 2. Prune expired inputs from sliding window buffer
        const now = performance.now();
        this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);
    }
    setActiveDevice(device) {
        if (this.activeDevice !== device) {
            this.activeDevice = device;
            this.onActiveDeviceChanged.notifyObservers(this.activeDevice);
        }
    }
    getActiveDevice() {
        return this.activeDevice;
    }
    getMoveVector() {
        return this.currentMoveVector.clone();
    }
    /** Push an action into the 120ms input buffer */
    bufferSkillInput(skillSlot, targetPos) {
        const now = performance.now();
        const event = {
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
    /** Consume the oldest valid buffered skill input (if any exists) */
    consumeBufferedSkill() {
        const now = performance.now();
        // Filter unexpired
        this.bufferedInputs = this.bufferedInputs.filter((item) => item.expiresAt > now);
        if (this.bufferedInputs.length > 0) {
            const oldest = this.bufferedInputs.shift();
            return {
                skillSlot: oldest.skillSlot,
                targetPos: oldest.targetPos,
                timestamp: oldest.expiresAt - this.inputBufferMs,
            };
        }
        return null;
    }
    clearBuffer() {
        this.bufferedInputs = [];
    }
    dispose() {
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
//# sourceMappingURL=InputManager.js.map