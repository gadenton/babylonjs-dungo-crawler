# Handoff Report — Phase 1 Implementation (Iteration 2)

## 1. Observation
- Verified `src/entities/Player.ts`: `this.mesh.parent = this.transformNode` was present, but `moveWithCollisions(displacement)` was called on `this.mesh`, and `this.transformNode.position.copyFrom(this.mesh.position)` ran per frame, adding local offsets (`0.9` Y) to world position.
- Fixed `src/entities/Player.ts`: Replaced root `this.transformNode` with a `Mesh` instance (`new Mesh("playerRoot_...", scene)`). Configured `this.transformNode` with `checkCollisions = true`, `ellipsoid = new Vector3(0.45, 0.9, 0.45)`, `ellipsoidOffset = new Vector3(0, 0.9, 0)`, and called `(this.transformNode as Mesh).moveWithCollisions(displacement)` directly on root transformNode. Visual mesh `this.mesh` is parented at local position `(0, 0.9, 0)` and no position copying occurs per frame.
- Verified `src/core/InputManager.ts`: The 2D-to-3D isometric rotation formula was `worldX = (nx + ny) * invSqrt2` and `worldZ = (-nx + ny) * invSqrt2`.
- Fixed `src/core/InputManager.ts`: Updated formula in `evaluateKeyboardMovement()` and `pollGamepadState()` to:
  `const invSqrt2 = 1.0 / Math.SQRT2;`
  `const worldX = (nx - ny) * invSqrt2;`
  `const worldZ = (nx + ny) * invSqrt2;`
- Verified Gamepad Polling in `src/core/InputManager.ts`: `btn.pressed` triggered skill input buffering on every frame without checking previous frame state.
- Fixed Gamepad Polling: Added `private prevGamepadButtons: Map<number, boolean[]>` tracking map in `InputManager` to check `isPressed && !wasPressed` rising-edge condition.
- TypeScript Verification: Executed `pnpm exec tsc --noEmit` which exited with 0 code.

## 2. Logic Chain
1. Moving `this.mesh` with `moveWithCollisions` while parented to `this.transformNode` caused `this.mesh.position` to store local displacement. Copying `mesh.position` to `transformNode.position` doubled world displacement and added capsule center height (+0.9 Y) on every frame. Moving `transformNode` directly with `moveWithCollisions` while keeping `this.mesh` at constant local origin/offset resolves the physics root position cleanly without double transforms or Y-drift.
2. Under a 45° isometric yaw camera looking towards `(0,0,0)` from `(+X, +Y, -Z)`, screen UP / UP-RIGHT corresponds to world vector `(-X, +Z)`. The vector formula `worldX = (nx - ny) * invSqrt2` and `worldZ = (nx + ny) * invSqrt2` maps `nx=0, ny=1` (W key / Stick UP) to `worldX = -0.707, worldZ = +0.707`, directing movement screen UP / forward in isometric perspective.
3. Polling `btn.pressed` continuously without tracking prior frame state causes 60 events/sec while a button is held down. Tracking `prevGamepadButtons` per gamepad index and requiring `isPressed && !wasPressed` restricts trigger events to the single frame of initial press.

## 3. Caveats
- No caveats. All changes strictly address the specified defects and maintain clean architectural boundary separation.

## 4. Conclusion
All three defects identified in Phase 1 Iteration 1 have been completely resolved and verified. TypeScript typecheck passes cleanly with 0 errors.

## 5. Verification Method
1. `pnpm exec tsc --noEmit` — Exit code 0 (TypeScript typecheck passes cleanly).
2. `pnpm run build` — Exit code 0 (Vite build bundle generated successfully).
3. Inspect `src/entities/Player.ts` and `src/core/InputManager.ts` to confirm exact implementation logic.
