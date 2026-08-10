# Handoff Report — Explorer 1 (Milestone 2: Static Town Hub & Player Setup)

## 1. Observation

### Asset Directory & Available Files
All required Kenney GLB models are located in `public/assets/dungeon/` (served at `/assets/dungeon/`):
- `public/assets/dungeon/template-floor.glb` (Base 2x2 floor tile)
- `public/assets/dungeon/template-floor-detail.glb` & `template-floor-detail-a.glb` (Decorative floor tiles)
- `public/assets/dungeon/template-wall.glb` (Straight wall tile)
- `public/assets/dungeon/template-wall-corner.glb` (Wall corner tile)
- `public/assets/dungeon/gate.glb` (Base archway gate frame)
- `public/assets/dungeon/gate-door.glb` (Gated door asset)
- `public/assets/dungeon/stairs-wide.glb` & `stairs.glb` (Elevated stairs platform)

### Codebase Architecture & Asset Loading Patterns
1. **Asset Preloading & Instancing (`src/dungeon/TileMap.ts:52-101`)**:
   - `SceneLoader.ImportMeshAsync("", basePath, model, this.scene)` loads GLBs asynchronously with timeout protection.
   - Real source meshes (`m instanceof Mesh && m.getTotalVertices() > 0`) have `m.isVisible = false` and `m.setEnabled(true)` set so they serve as source templates for GPU instancing (`createInstance()`).
   - `srcMesh.createInstance(name)` creates lightweight GPU instances attached to a parent `TransformNode` (`rootNode`).

2. **Collision Geometry & Merging (`src/dungeon/TileMap.ts:166-195`, `228-256`)**:
   - Invisible collision boxes are generated per cell using `CreateBox` (`width: 2.0, height: 0.2, depth: 2.0` at `y = -0.1` for floors; `width: 2.0, height: 3.0, depth: 2.0` at `y = 1.5` for walls).
   - `Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false)` produces `mergedFloors` with `isVisible = false`, `checkCollisions = true`, `isPickable = true`, `freezeWorldMatrix()`.
   - `Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false)` produces `mergedWalls` with `isVisible = false`, `checkCollisions = true`, `isPickable = false`, `freezeWorldMatrix()`.

3. **Town Hub Altar Entity (`src/entities/TownHubAltar.ts:12-83`)**:
   - `TownHubAltar` instantiates a cylinder base (`diameterTop: 2.2, height: 1.6`), outer runed blue glow ring (`diameter: 3.2`), and central point light (`intensity: 2.0`, `diffuse: Color3(0.2, 0.7, 1.0)`).
   - Provides `isPlayerInProximity(playerPosition: Vector3): boolean` (radius `3.0` units).

4. **Player Movement & Physics Setup (`src/entities/Player.ts:55-115`, `315-320`)**:
   - Player transform node uses capsule mesh with `checkCollisions = true`, `ellipsoid = new Vector3(0.45, 0.9, 0.45)`, `ellipsoidOffset = new Vector3(0, 0.9, 0)`.
   - Player moves via `(this.transformNode as Mesh).moveWithCollisions(displacement)` and responds to both direct WASD/arrow vector input and click-to-move pointer input via Recast NavMesh or direct waypoint paths.

5. **Camera System (`src/camera/CameraRig.ts:40-67`)**:
   - Isometric follow camera (`TargetCamera` pitch `45°`, yaw `45°`, distance `22.0`). Attaches to target transform node via `attachToTarget(player.transformNode)`.

6. **Bootstrap & Main Loop (`src/index.ts:52-111`)**:
   - Currently spawns player and town altar directly inside a procedurally generated 40x40 BSP dungeon.

---

## 2. Logic Chain

1. **Asset Path Resolution**:
   - `public/assets/dungeon/` is served by Vite as `/assets/dungeon/`.
   - Loading `template-floor.glb`, `template-wall.glb`, `gate.glb`, `stairs-wide.glb`, `template-wall-corner.glb`, and `template-floor-detail.glb` from `/assets/dungeon/` ensures zero missing mesh errors.

2. **Town Hub Grid & Design (10x10 Courtyard Plaza)**:
   - A 10x10 grid using 2.0 unit cell spacing spans X: 0 to 20, Z: 0 to 20 with world cell centers at `worldX = gx * 2.0 + 1.0`, `worldZ = gy * 2.0 + 1.0`.
   - Center of the plaza is located at `(10.0, 0.0, 10.0)`.
   - **Perimeter Walls**: Outer border (`gx=0`, `gx=9`, `gy=0`, `gy=9`) populated with `template-wall.glb` (and `template-wall-corner.glb` at corners `(0,0)`, `(9,0)`, `(0,9)`, `(9,9)`).
   - **Entrance Portal / Altar Gate**: North wall center (`gx=4, gy=9` or `gx=5, gy=9`) has a break in the wall, framed with `gate.glb` and elevated `stairs-wide.glb`. The `TownHubAltar` is placed at `Vector3(10.0, 0.0, 16.0)`.
   - **Player Spawn Point**: South/center area at `Vector3(10.0, 0.0, 6.0)`, facing North toward the Altar.
   - **Floor Layout**: 10x10 grid of `template-floor.glb` with a central walkway pattern of `template-floor-detail.glb` leading from player spawn to the altar.

3. **Collision & Navigation Integration**:
   - By creating floor colliders across all 10x10 floor cells and merging them into `mergedFloors`, player click-to-move pointer pick hits `mergedFloors` cleanly.
   - By creating wall colliders along the perimeter (and around the altar base) and merging into `mergedWalls`, `moveWithCollisions` prevents the player from falling off or walking through boundaries.

4. **Class & Interface Contract (`src/town/TownHub.ts`)**:
   - `TownHub` class should maintain `preloadAssets()` and `build(scene: Scene): BuiltTownHub`.
   - Return structure `BuiltTownHub`:
     ```typescript
     export interface BuiltTownHub {
       rootNode: TransformNode;
       mergedFloors: Mesh | null;
       mergedWalls: Mesh | null;
       spawnPoint: Vector3;
       altarPosition: Vector3;
       altar: TownHubAltar;
     }
     ```

---

## 3. Caveats

- **NavMesh vs Direct Collisions**: In the Town Hub, `mergedFloors` can optionally be fed to `NavMeshManager.createNavMesh(mergedFloors)` or player click-to-move can fall back to direct waypoint paths (`setNavPath([targetPos])` when NavMesh is not generated). Both options work; generating a small 10x10 Recast NavMesh or allowing direct click pathing are both viable.
- **Lighting & Shadows**: The Town Hub uses the same `GameEngine` hemispheric ambient and directional light. `shadowGenerator.addShadowCaster()` should be called for `TownHubAltar.mesh` and decorative gate structures if desired.

---

## 4. Conclusion

Milestone 2 (`src/town/TownHub.ts`) can be constructed with full fidelity using existing project conventions:
- GLB models located at `/assets/dungeon/{template-floor, template-wall, template-wall-corner, gate, stairs-wide}.glb`.
- Instancing strategy matching `TileMap.ts` (`SceneLoader.ImportMeshAsync`, hidden source meshes, `srcMesh.createInstance()`).
- Static 10x10 hand-designed courtyard layout with perimeter wall enclosure, decorative central walkway, South player spawn (`10, 0, 6`), and North altar gate (`10, 0, 16`).
- Collision merging into `mergedFloors` and `mergedWalls` for seamless player click movement and bounding collisions.

---

## 5. Verification Method

### Automated Type & Build Check
Run the following commands from project root:
```bash
pnpm exec tsc --noEmit
pnpm run build
```

### File Inspection
Inspect `src/town/TownHub.ts` (once implemented) to verify:
1. All asset URLs reference `/assets/dungeon/`.
2. Mesh instancing parents to `rootNode`.
3. `mergedFloors` and `mergedWalls` are generated and returned in `BuiltTownHub`.
4. `spawnPoint` is `Vector3(10.0, 0.0, 6.0)` and `altarPosition` is `Vector3(10.0, 0.0, 16.0)`.
