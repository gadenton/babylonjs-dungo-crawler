# Phase 1 Changes Summary

## 1. Dependencies & Asset Setup
- Installed `@babylonjs/gui` (^9.19.0) and `recast-navigation` (^0.43.1) via `pnpm add`.
- Executed PowerShell asset copy script copying 190 Kenney GLB assets and textures into:
  - `public/assets/dungeon/` (includes `colormap.png` & `variation-a.png`)
  - `public/assets/cave/` (includes `colormap.png` & `variation-a.png`)
  - `public/assets/weapons/`
  - `public/assets/characters/player/`
  - `public/assets/characters/enemies/`
  - `public/assets/props/`

## 2. Core Implementation Files
- **`src/core/Engine.ts`**:
  - `GameEngine` lifecycle managing Babylon Engine & Scene instances.
  - Hardware antialiasing, depth/stencil buffers, adaptToDeviceRatio.
  - Dark dungeon background (`Color4(0.05, 0.05, 0.08, 1.0)`).
  - Hemispheric ambient light (`intensity = 0.45`).
  - Directional sun light (`intensity = 0.85`) with `ShadowGenerator` (1024x1024, exponential shadow map, medium filtering).
  - Continuous render loop and `ResizeObserver` setup.
  - Clean disposal cleanup (`dispose()`).

- **`src/camera/CameraRig.ts`**:
  - Locked 45° pitch / 45° yaw isometric perspective (`TargetCamera`).
  - Frame-rate independent exponential follow tracking (`1 - exp(-followRate * dt)`).
  - Target look-ahead vector offset derived from movement velocity or aim direction (`1 - exp(-lookAheadRate * dt)`).
  - Non-destructive trauma-decay screen shake hook (`trauma^2 * noise`). Translates both camera position and focal target, keeping player mesh & collision ellipsoid untouched.

- **`src/core/InputManager.ts`**:
  - Hybrid click-to-move (left-click ground raycast).
  - Direct WASD keys and Gamepad left stick input.
  - 45° isometric rotation matrix mapping screen directions to 3D world axes.
  - Gamepad 0.20 radial deadzone with rescaled magnitude.
  - Instant vector override: WASD/stick input immediately overrides click-to-move pathing.
  - 120ms sliding window input buffer (`bufferedInputs`, `bufferSkillInput()`, `consumeBufferedSkill()`).
  - Dynamic device tracking (`'kbm'` vs `'gamepad'`) notifying `onActiveDeviceChanged` observable.

- **`src/entities/Entity.ts` & `src/entities/Player.ts`**:
  - `Entity`: Abstract base entity class managing `id`, `name`, `scene`, `transformNode`, `position`, `rotation`, `getForwardVector()`, `update()`, `dispose()`.
  - `Player`: Concrete player entity with capsule fallback mesh / GLB model.
  - Ellipsoid collision geometry (`mesh.checkCollisions = true`, `ellipsoid = Vector3(0.45, 0.9, 0.45)`, `ellipsoidOffset = Vector3(0, 0.9, 0)`).
  - Native wall sliding execution via `mesh.moveWithCollisions(displacement)`.
  - Slerp facing rotation towards movement direction (`Quaternion.SlerpToRef`).
  - `getVelocity()` reporting velocity vector for camera look-ahead.

- **`src/index.ts`**:
  - Bootstrapper instantiating `GameEngine`, ground plane, `InputManager`, `CameraRig`, and `Player`.
  - Inter-module wiring (`player.setInputManager(inputManager)`, `cameraRig.attachToTarget(player.transformNode)`).
  - Render loop callback driving per-frame update loop.

## 3. Build & Typecheck Verification
- `pnpm exec tsc --noEmit`: Exited with code 0 (zero errors).
- `pnpm run build`: Exited with code 0 (emitted production bundle).
