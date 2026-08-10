# Summary of Changes — Phase 1 Iteration 2

## 1. `src/entities/Player.ts`
- **Root Node Collision Setup**: Configured root node `this.transformNode` as a `Mesh` instance with `checkCollisions = true`, `ellipsoid = new Vector3(0.45, 0.9, 0.45)`, and `ellipsoidOffset = new Vector3(0, 0.9, 0)`.
- **Eliminated Position Doubling Bug**: Called `(this.transformNode as Mesh).moveWithCollisions(displacement)` directly on the root transform node instead of the child mesh.
- **Visual Mesh Local Origin**: Kept `this.mesh` at local origin `(0, 0, 0)` (or fixed vertical offset `(0, 0.9, 0)` for capsule height alignment) relative to `this.transformNode`. Removed frame-by-frame copying of `this.mesh.position` into `this.transformNode.position`, completely resolving position doubling and +0.9 Y accumulation per frame.

## 2. `src/core/InputManager.ts`
- **Isometric Vector Formula**: Corrected 2D-to-3D isometric vector transformation in both `evaluateKeyboardMovement()` and `pollGamepadState()` to:
  ```ts
  const invSqrt2 = 1.0 / Math.SQRT2;
  const worldX = (nx - ny) * invSqrt2;
  const worldZ = (nx + ny) * invSqrt2;
  ```
  Now pressing W (Screen UP) moves player forward in isometric camera space (-X, +Z).
- **Gamepad Rising-Edge Button Polling**: Added `private prevGamepadButtons: Map<number, boolean[]>` tracking map in `InputManager`. Polled buttons using rising-edge condition (`isPressed && !wasPressed`) to ensure skill triggers and input buffering fire exactly once per press frame instead of flooding every frame while held.
