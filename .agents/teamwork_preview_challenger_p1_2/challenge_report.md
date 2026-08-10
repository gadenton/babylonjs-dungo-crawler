# Phase 1 Challenge Report — Input Vector & Player Collision Setup

**Verdict**: **REJECT**

## Executive Summary
While TypeScript compilation (`tsc --noEmit`) and Vite production build (`pnpm run build`) complete successfully with 0 errors, empirical mathematical stress testing revealed **two critical logic bugs**:
1. **90° Rotational Vector Misalignment in `InputManager.ts`**: The transformation matrix converting 2D screen inputs to 3D isometric world vectors is incorrectly rotated by 90° counter-clockwise. Pressing W (Up) moves the character Screen RIGHT, D (Right) moves Screen DOWN, S (Down) moves Screen LEFT, and A (Left) moves Screen UP.
2. **Transform Hierarchy & Position Corruption in `Player.ts`**: `this.mesh` is parented to `this.transformNode` with a local offset `(0, 0.9, 0)`. When `moveWithCollisions(displacement)` is called on `this.mesh`, `this.mesh.position` updates in local coordinates. Executing `this.transformNode.position.copyFrom(this.mesh.position)` doubles horizontal movement and rapidly lifts the character vertically into the sky (`y = 0.9 -> 1.8 -> 2.7 ...`).

---

## Detailed Findings & Empirical Proofs

### Finding 1: 90° Rotational Input Vector Misalignment
- **Severity**: CRITICAL
- **Location**: `src/core/InputManager.ts` (lines 146–148 for KBM, lines 182–184 for Gamepad)
- **Observed Implementation**:
  ```typescript
  const worldX = (nx + ny) * invSqrt2;
  const worldZ = (-nx + ny) * invSqrt2;
  ```
- **Empirical Test Results**:
  Camera is initialized in `CameraRig.ts` at `yawDegrees = 45°` (`pitchDegrees = 45°`). Relative to focus point `(0,0,0)`, camera position on XZ plane is `(+11, -11)`.
  - Camera Forward Vector on XZ plane (Screen UP): `(-0.707, 0.707)`
  - Camera Right Vector on XZ plane (Screen RIGHT): `(0.707, 0.707)`

  Evaluating `InputManager.ts` output against screen axes:
  - **Press W (Screen UP, nx=0, ny=1)**:
    - Generated World Vector: `(0.707, 0.707)`
    - Dot product with Screen Right: **1.000** (Moves 100% RIGHT)
    - Dot product with Screen Up: **0.000** (Moves 0% UP)
    - ❌ **FAILED**: W key moves player Screen RIGHT instead of Screen UP.
  - **Press D (Screen RIGHT, nx=1, ny=0)**:
    - Generated World Vector: `(0.707, -0.707)`
    - Dot product with Screen Right: **0.000**
    - Dot product with Screen Up: **-1.000** (Moves 100% DOWN)
    - ❌ **FAILED**: D key moves player Screen DOWN instead of Screen RIGHT.
  - **Press S (Screen DOWN, nx=0, ny=-1)**:
    - Generated World Vector: `(-0.707, -0.707)`
    - Dot product with Screen Right: **-1.000** (Moves 100% LEFT)
    - Dot product with Screen Up: **0.000**
    - ❌ **FAILED**: S key moves player Screen LEFT instead of Screen DOWN.
  - **Press A (Screen LEFT, nx=-1, ny=0)**:
    - Generated World Vector: `(-0.707, 0.707)`
    - Dot product with Screen Right: **0.000**
    - Dot product with Screen Up: **1.000** (Moves 100% UP)
    - ❌ **FAILED**: A key moves player Screen UP instead of Screen LEFT.

- **Required Correction**:
  To align screen directions `(nx, ny)` with camera yaw = 45° (`F = (-invSqrt2, invSqrt2)`, `R = (invSqrt2, invSqrt2)`):
  ```typescript
  const worldX = (nx - ny) * invSqrt2;
  const worldZ = (nx + ny) * invSqrt2;
  ```

---

### Finding 2: Parent Hierarchy & `moveWithCollisions` Transform Corruption
- **Severity**: CRITICAL
- **Location**: `src/entities/Player.ts` (lines 38, 48–50, 147–150)
- **Observed Implementation**:
  In constructor:
  ```typescript
  this.mesh = CreateCapsule("playerMesh", { height: 1.8, radius: 0.4 }, scene);
  this.mesh.position.y = 0.9; // Pivot offset
  this.mesh.parent = this.transformNode;
  ```
  In `update()`:
  ```typescript
  this.mesh.moveWithCollisions(displacement);
  this.transformNode.position.copyFrom(this.mesh.position);
  ```
- **Empirical Test Results**:
  Initial state: `transformNode.position = (0, 0, 0)`, `mesh.position = (0, 0.9, 0)` (local). Absolute world position of mesh = `(0, 0.9, 0)`.
  When moving `displacement = (1, 0, 0)`:
  1. `mesh.moveWithCollisions( (1, 0, 0) )` updates local `mesh.position` to `(1, 0.9, 0)`.
  2. `transformNode.position.copyFrom(mesh.position)` updates `transformNode.position` to `(1, 0.9, 0)`.
  3. Absolute world position of `mesh` becomes `transformNode.position + mesh.position = (1, 0.9, 0) + (1, 0.9, 0) = (2.0, 1.8, 0.0)`!
  4. ❌ **FAILED**: Horizontal movement is doubled every frame and Y position ascends by +0.9 every frame, launching player into the sky.

- **Required Correction**:
  Either:
  - Do NOT parent `mesh` to `transformNode` if `mesh` is the top-level collidable mesh moving in world space, OR
  - Move `this.transformNode` directly or calculate world vs local position deltas correctly without copying local position to parent.

---

## Verification Matrix

| Verification Criterion | Test Method | Status | Result |
|---|---|---|---|
| `tsc --noEmit` Typecheck | `pnpm exec tsc --noEmit` | PASS | Exit code 0 |
| `pnpm run build` Vite Build | `pnpm run build` | PASS | Exit code 0 |
| WASD / Gamepad 45° Vector Rotation | `node .agents/teamwork_preview_challenger_p1_2/test_input_math.js` | **FAIL** | Vector rotated by 90° off-axis |
| Player Ellipsoid Setup | Inspection of `Player.ts:setupEllipsoidCollision` | PASS | `checkCollisions=true`, ellipsoid `Vector3(0.45, 0.9, 0.45)` |
| Player Collision Movement | `node .agents/teamwork_preview_challenger_p1_2/test_player_transform.js` | **FAIL** | Transform parent double-displacement & vertical sky launching |

---

## Final Recommendation
**REJECT Phase 1 Input vector & Player collision setup implementation.**
The implementation worker must fix:
1. `InputManager.ts`: Update formula to `worldX = (nx - ny) * invSqrt2` and `worldZ = (nx + ny) * invSqrt2` for both KBM and Gamepad.
2. `Player.ts`: Fix parent transform hierarchy / position synchronization so `moveWithCollisions` correctly translates the player without position doubling or Y-axis drift.
