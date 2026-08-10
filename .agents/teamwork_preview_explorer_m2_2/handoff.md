# Handoff Report — Explorer 2 (Milestone 2: Static Town Hub & Player Setup)

## Summary
Investigated collision mesh merging (`Mesh.MergeMeshes`), player spawning & movement control, isometric camera rig attachment, and safe-zone enemy suppression for Milestone 2. Detailed observations, logic chain, caveats, conclusion, and verification steps are provided below.

---

## 1. Observation

### 1.1 Collision Geometry & Mesh Merging in `TileMap.ts`
- **File Path**: `src/dungeon/TileMap.ts` (lines 135-255)
- **Floor Colliders**:
  - Individual invisible box colliders are created per floor cell:
    `const fc = CreateBox("fc_" + gx + "_" + gy, { width: 2.0, height: 0.2, depth: 2.0 }, this.scene);` (lines 166-168)
    `fc.position.set(worldX, -0.1, worldZ);`
    `fc.isVisible = false;`
  - Merged using `Mesh.MergeMeshes`:
    ```ts
    mergedFloors = Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false);
    if (mergedFloors) {
      mergedFloors.name = "mergedFloors";
      mergedFloors.isVisible = false;
      mergedFloors.checkCollisions = true;
      mergedFloors.isPickable = true;
      mergedFloors.parent = rootNode;
      mergedFloors.freezeWorldMatrix();
    }
    ``` (lines 230-239)
- **Wall Colliders**:
  - Individual invisible wall box colliders created per wall cell:
    `const wc = CreateBox("wc_" + gx + "_" + gy, { width: 2.0, height: 3.0, depth: 2.0 }, this.scene);` (lines 191-193)
    `wc.position.set(worldX, 1.5, worldZ);`
    `wc.isVisible = false;`
  - Merged using `Mesh.MergeMeshes`:
    ```ts
    mergedWalls = Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false);
    if (mergedWalls) {
      mergedWalls.name = "mergedWalls";
      mergedWalls.isVisible = false;
      mergedWalls.checkCollisions = true;
      mergedWalls.isPickable = false;
      mergedWalls.parent = rootNode;
      mergedWalls.freezeWorldMatrix();
    }
    ``` (lines 244-253)
- **Babylon.js `Mesh.MergeMeshes` Signature & Behavior**:
  - Parameter 1 `meshes`: `Mesh[]` array of source box colliders.
  - Parameter 2 `disposeSource`: `true` (disposes individual box meshes after merging, avoiding node clutter).
  - Parameter 3 `allowSameMaterial`: `true` (merges submeshes sharing the default material).
  - Parameter 4 `resultMesh`: `undefined` (instantiates a new merged `Mesh`).
  - Parameter 5 `keepSubMeshes`: `false` (combines geometry into a single buffer).
  - Parameter 6 `subMeshesOnlyIfDynamic`: `false`.

### 1.2 Player Entity & Input Setup
- **File Path**: `src/entities/Player.ts` (lines 55-152, 274-334)
- **Root Mesh & Ellipsoid Collisions**:
  - `Player` creates a capsule mesh parented to `this.transformNode` (`Mesh`).
  - `setupEllipsoidCollision()` sets `rootMesh.checkCollisions = true`, `rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45)`, `rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0)`.
- **Movement & Input**:
  - `setInputManager(inputManager)` sets up observers on `onMoveVectorChanged` (WASD / Arrow / Gamepad) and `onPointerClickWorld` (mouse click-to-move).
  - Pointer click fallback (line 144-149): When `navMeshManager` is `null` (e.g. Town Hub without NavMesh), `Player` calls `this.setNavPath([targetPos])`.
  - In `update(deltaTime)`: Player calculates `targetVelocity` from `inputVec` or `navPath`, lerps `currentVelocity`, and calls `(this.transformNode as Mesh).moveWithCollisions(displacement)`.
- **File Path**: `src/core/InputManager.ts` (lines 135-147)
  - Pointer picking checks `mesh.isPickable && (mesh.checkCollisions || groundPredicate(mesh))`. Since `mergedFloors` has `name = "mergedFloors"` (`groundPredicate` matches `"floor"`) and `isPickable = true`, clicking anywhere on `mergedFloors` triggers world click movement.

### 1.3 Isometric Camera Rig Setup
- **File Path**: `src/camera/CameraRig.ts` (lines 40-121)
- **Initialization**:
  - Created with pitch 45°, yaw 45°, distance 22.0, followRate 10.0, lookAheadDist 3.5.
- **Target Attachment**:
  - `attachToTarget(target: TransformNode)` sets `targetNode` to `player.transformNode`.
- **Update Loop**:
  - In render loop, `cameraRig.update(deltaTime, player.getVelocity(), player.getFacingDirection())` calculates isometric offset, applies exponential smoothing and velocity look-ahead, and updates `camera.position` and `camera.setTarget(focus)`.

### 1.4 Enemy Spawning & Safe-Zone Suppression
- **File Path**: `src/index.ts` (lines 203-255)
- **Current Enemy Spawning**:
  - Enemies are spawned in room centers of the procedural dungeon: `for (let i = 1; i < dungeonGrid.rooms.length; i++) { const enemy = new Enemy(...); enemies.push(enemy); }`.
  - Render loop updates `for (const enemy of enemies) { if (enemy.isAlive) enemy.update(deltaTime, player); }`.
- **Safe-Zone Suppression**:
  - While in Town Hub (`TOWN_HUB` state), `enemies` array is empty `[]`.
  - Zero enemy instantiation in Town Hub environment setup.
  - Render loop handles `enemies = []` cleanly with 0 iterations.

---

## 2. Logic Chain

1. **Collision Merging**:
   - `TileMap.ts` demonstrates that creating individual `CreateBox` meshes for floors (`2.0 x 0.2 x 2.0` at `y = -0.1`) and walls (`2.0 x 3.0 x 2.0` at `y = 1.5`), then merging via `Mesh.MergeMeshes(colliders, true, true, undefined, false, false)`, produces performant single-mesh colliders.
   - `TownHub.ts` (for Milestone 2) can use this exact strategy for a 10x10 plaza:
     - Floor grid colliders covering 10x10 cells from `(0,0)` to `(9,9)` (world coords `x = gx*2 + 1, z = gy*2 + 1`) merged into `mergedFloors`.
     - Perimeter wall colliders enclosing the plaza merged into `mergedWalls`.
     - Setting `mergedFloors.isPickable = true` and `checkCollisions = true` ensures mouse click-to-move input picking works over the entire plaza.
     - Setting `mergedWalls.checkCollisions = true` and `isPickable = false` ensures player ellipsoid collisions prevent player from walking off the town boundaries.

2. **Player Setup & Controllability**:
   - `Player` entity initializes capsule visual mesh and root `TransformNode` with `checkCollisions = true` and `ellipsoid = (0.45, 0.9, 0.45)`.
   - Calling `player.setInputManager(inputManager)` and positioning `player.transformNode.position = spawnPoint` in Town Hub enables full keyboard/gamepad/mouse movement without code changes to `Player.ts`.
   - When NavMesh is absent or unused in Town Hub, `Player.ts` gracefully falls back to direct point navigation (`this.setNavPath([targetPos])`), moving via `moveWithCollisions(displacement)`.

3. **Camera Rig Attachment**:
   - `CameraRig` attaches to `player.transformNode` via `cameraRig.attachToTarget(player.transformNode)`.
   - Calling `cameraRig.update(deltaTime, player.getVelocity(), player.getFacingDirection())` every frame keeps the camera smoothly focused on the player with isometric projection (45° pitch, 45° yaw, 22.0 distance).

4. **Safe Zone Enforcement**:
   - Enemies are created dynamically during dungeon level setup.
   - In Town Hub mode, keeping `enemies` array empty (`[]`) guarantees ZERO enemy spawning, ZERO enemy AI updates, and ZERO combat interactions, achieving a completely safe town hub.

---

## 3. Caveats

- **NavMesh in Town Hub**: Generating a Recast NavMesh for Town Hub is optional because `Player.ts` click-to-move fallback (`setNavPath([targetPos])`) works well over a flat 10x10 courtyard plaza. However, if complex obstacles are added to Town Hub, a small static NavMesh can also be built.
- **Tree-Shaking Side Effects**: Ensure `@babylonjs/core/Meshes/mesh` is imported so `Mesh.MergeMeshes` remains bundled in production builds (already imported in `TileMap.ts` and `Engine.ts`).

---

## 4. Conclusion

The existing codebase components (`Player.ts`, `CameraRig.ts`, `InputManager.ts`, and `Mesh.MergeMeshes` pattern in `TileMap.ts`) provide all necessary primitives for Milestone 2:

1. **Collision Merging**: `TownHub.ts` should generate floor box colliders (10x10) and perimeter wall colliders, merging them into `mergedFloors` and `mergedWalls` via `Mesh.MergeMeshes(boxes, true, true, undefined, false, false)`.
2. **Player Spawning & Controls**: `player.transformNode.position` placed at town spawn point (`Vector3(10.0, 0.0, 10.0)` or center), wired to `inputManager` via `player.setInputManager(inputManager)`.
3. **Camera Rig**: `cameraRig.attachToTarget(player.transformNode)` with `cameraRig.update(...)` in the render loop.
4. **Enemy Suppression**: Keep `enemies = []` during `TOWN_HUB` state.

---

## 5. Verification Method

### 5.1 Automated Verification
1. Run TypeScript check:
   `pnpm exec tsc --noEmit`
   *Expected result*: 0 errors.
2. Run Vite build:
   `pnpm run build`
   *Expected result*: Build completes successfully.

### 5.2 Manual Runtime Verification
1. Launch dev server (`pnpm run dev`).
2. Open `http://localhost:5173/` in browser.
3. Verify player spawns in Town Hub plaza.
4. Test player movement using WASD, Arrow keys, and mouse left-clicks on `mergedFloors`.
5. Verify player cannot walk through perimeter `mergedWalls`.
6. Verify camera smoothly follows player in isometric view.
7. Verify 0 enemies are present in Town Hub.
