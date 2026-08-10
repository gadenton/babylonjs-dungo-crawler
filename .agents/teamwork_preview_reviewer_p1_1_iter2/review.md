# Review Report — Phase 1 Implementation (Iteration 2)

**Verdict**: `APPROVE`

## Summary
All three defects identified during Phase 1 Iteration 1 have been completely resolved and verified in Iteration 2:
1. `Player.ts` transform root node & collision handling now uses a `Mesh` instance as `this.transformNode`, calling `moveWithCollisions` directly on the root without position copying or Y-drift.
2. `InputManager.ts` isometric movement vector formula is correctly set to `worldX = (nx - ny) * invSqrt2` and `worldZ = (nx + ny) * invSqrt2`, matching the 45° yaw camera rig.
3. `InputManager.ts` gamepad polling implements rising-edge detection via `prevGamepadButtons` Map, preventing event spam while buttons are held down.

---

## Detailed Findings & Verification

### 1. Player Root Mesh & Collision Setup (`src/entities/Player.ts`)
- **Status**: PASSED / VERIFIED
- **Analysis**:
  - In `Player.ts` constructor (lines 31–34), `this.transformNode` (originally a `TransformNode`) is replaced with a `Mesh` instance: `new Mesh('playerRoot_${id}', scene)`.
  - Ellipsoid collision parameters (`checkCollisions = true`, `ellipsoid = (0.45, 0.9, 0.45)`, `ellipsoidOffset = (0, 0.9, 0)`) are applied directly to `this.transformNode` in `setupEllipsoidCollision()`.
  - In `update()` (lines 152–154), `(this.transformNode as Mesh).moveWithCollisions(displacement)` is called on the root mesh directly.
  - Visual mesh `this.mesh` remains parented to `this.transformNode` at offset `(0, 0.9, 0)`. The per-frame `copyFrom()` workaround has been removed entirely.

### 2. 45° Isometric Movement Formula (`src/core/InputManager.ts`)
- **Status**: PASSED / VERIFIED
- **Analysis**:
  - Vector transformation in both `evaluateKeyboardMovement()` (lines 147–149) and `pollGamepadState()` (lines 183–185) has been updated to:
    ```ts
    const invSqrt2 = 1.0 / Math.SQRT2;
    const worldX = (nx - ny) * invSqrt2;
    const worldZ = (nx + ny) * invSqrt2;
    ```
  - Verification against CameraRig: Camera is positioned at `(+X, +Y, -Z)` looking toward target (45° yaw, 45° pitch).
    - `nx = 0, ny = 1` (W key / stick UP) yields `worldX = -0.707, worldZ = +0.707`, directing player screen UP / forward.
    - `nx = 1, ny = 0` (D key / stick RIGHT) yields `worldX = +0.707, worldZ = +0.707`, directing player screen RIGHT.

### 3. Gamepad Rising-Edge Button Detection (`src/core/InputManager.ts`)
- **Status**: PASSED / VERIFIED
- **Analysis**:
  - `InputManager` introduces `private prevGamepadButtons: Map<number, boolean[]>` tracking state.
  - In `pollGamepadState()` (lines 200–214), previous button states are retrieved per gamepad index (`gp.index`).
  - Condition `if (isPressed && !wasPressed && idx < 5)` ensures skill buffering is triggered exclusively on the rising edge of a button press frame.
  - `this.prevGamepadButtons.set(gp.index, currentButtons)` stores current states for subsequent frame evaluation.

---

## Verified Claims & Commands

- **TypeScript Typecheck**: `pnpm exec tsc --noEmit` -> Exit Code 0 (0 errors).
- **Vite Production Build**: `pnpm run build` -> Exit Code 0 (`dist/assets/index-*.js` built in 33.44s).

---

## Integrity & Adversarial Audit
- **Hardcoded Test Results**: None found.
- **Facade / Dummy Implementations**: None found.
- **Shortcuts / Bypasses**: None found.
- **Verdict**: `APPROVE`
