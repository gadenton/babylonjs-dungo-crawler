# Technical Specification: NavMeshManager & Pathfinding Integration

## Executive Summary & Architecture Overview

This document provides the exact technical specification for runtime Navigation Mesh (NavMesh) generation and pathfinding in `babylonjs-dungo-crawler` using the `recast-navigation` npm package (v0.43.1).

`NavMeshManager.ts` serves as the bridge between Babylon.js static floor geometry (`TileMap.ts`'s `mergedFloors` mesh) and WebAssembly-compiled Recast/Detour pathfinding algorithms. It exposes an asynchronous initialization lifecycle, builds a solo NavMesh over procedural dungeon floors, queries straight path vectors, and integrates seamlessly with `InputManager.ts` mouse pointer raycasting and `Player.ts` hybrid click-to-move navigation.

---

## 1. `recast-navigation` Package Integration

### 1.1 Package Dependencies & Imports
The project uses `recast-navigation` v0.43.1, which wraps Recast and Detour WebAssembly bindings.

```typescript
import { init, NavMesh, NavMeshQuery, getNavMeshPositionsAndIndices } from "recast-navigation";
import { generateSoloNavMesh, SoloNavMeshGeneratorConfig } from "recast-navigation/generators";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
```

### 1.2 Lifecycle & Asynchronous WASM Initialization
Before any NavMesh generation or path query can execute, the underlying WebAssembly binary must be loaded and initialized.

- **Initialization Method**: `public async init(): Promise<void>`
- **Internal Guard**: Tracks `private isInitialized: boolean = false`. If already initialized, returns immediately.
- **WASM Call**: Awaits `init()` from `recast-navigation`.

### 1.3 Memory Management & Resource Disposal
Recast C++/WASM instances (`NavMesh` and `NavMeshQuery`) occupy heap memory outside garbage collection. When regenerating dungeons or unloading scenes, old instances MUST be destroyed explicitly.

```typescript
public dispose(): void {
  if (this.navMeshQuery) {
    this.navMeshQuery.destroy();
    this.navMeshQuery = null;
  }
  if (this.navMesh) {
    this.navMesh.destroy();
    this.navMesh = null;
  }
  if (this.debugMesh) {
    this.debugMesh.dispose();
    this.debugMesh = null;
  }
}
```

---

## 2. Mesh Extraction & Transformation Algorithm

### 2.1 Extracting Geometry from Babylon `mergedFloors`
Babylon's `BABYLON.Mesh` stores vertex coordinates and face indices in GPU buffers. `NavMeshManager` extracts raw position floats and index integers.

- **Positions**: `mesh.getVerticesData(VertexBuffer.PositionKind)` returns `Float32Array` or `number[]` formatted as flat `[x0, y0, z0, x1, y1, z1, ...]`.
- **Indices**: `mesh.getIndices()` returns `Int32Array`, `Uint32Array`, or `Uint16Array` formatted as triangle vertex index tuples `[i0, i1, i2, ...]`.

### 2.2 World Coordinate Transformation
Vertices extracted via `getVerticesData` are in local mesh coordinates. If `mergedFloors` has a non-identity world matrix (e.g. position, rotation, scaling), local vertices must be transformed into absolute world coordinates.

```typescript
private extractWorldGeometry(mesh: Mesh): { positions: Float32Array; indices: Uint32Array } {
  mesh.computeWorldMatrix(true);
  const worldMatrix = mesh.getWorldMatrix();

  const rawPositions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const rawIndices = mesh.getIndices();

  if (!rawPositions || !rawIndices) {
    throw new Error(`[NavMeshManager] Mesh ${mesh.name} lacks position or index buffer.`);
  }

  const vertexCount = rawPositions.length / 3;
  const positions = new Float32Array(rawPositions.length);
  const localVec = new Vector3();
  const worldVec = new Vector3();

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    localVec.set(rawPositions[idx], rawPositions[idx + 1], rawPositions[idx + 2]);
    Vector3.TransformCoordinatesToRef(localVec, worldMatrix, worldVec);

    positions[idx] = worldVec.x;
    positions[idx + 1] = worldVec.y;
    positions[idx + 2] = worldVec.z;
  }

  const indices = new Uint32Array(rawIndices.length);
  for (let i = 0; i < rawIndices.length; i++) {
    indices[i] = rawIndices[i];
  }

  return { positions, indices };
}
```

---

## 3. Recast Solo NavMesh Configuration Parameters

The dungeon uses 2m x 2m grid tiles. The player entity has a height of 1.8m and a radius of 0.45m (`ellipsoid = (0.45, 0.9, 0.45)`).

### 3.1 Parameter Tuning Matrix

| Parameter | Value | Voxel/Unit Conversion | Rationale |
|---|---|---|---|
| `cs` (Cell Size) | `0.2` | 0.2m per voxel horizontally | Fine resolution for 2m tiles without excessive build latency. |
| `ch` (Cell Height) | `0.2` | 0.2m per voxel vertically | Matches vertical step resolution. |
| `walkableHeight` | `9` | $\lceil 1.8 / 0.2 \rceil = 9$ voxel units | Player height allowance (1.8m). |
| `walkableRadius` | `3` | $\lceil 0.45 / 0.2 \rceil = 3$ voxel units | Player collision radius clearance (0.45m). |
| `walkableClimb` | `2` | $\lfloor 0.4 / 0.2 \rfloor = 2$ voxel units | Allows climbing 0.4m step-ups or tile seam variations. |
| `walkableSlopeAngle` | `45.0` | Degrees | Maximum walkable incline. |
| `minRegionArea` | `8` | Voxel count ($\approx 0.32\text{m}^2$) | Prunes small disconnected ground artifacts/isolated voxels. |
| `mergeRegionArea` | `20` | Voxel count | Merges small regions into larger navable polygons. |
| `maxEdgeLen` | `12` | Voxel count | Max edge length for polygonization. |
| `maxSimplificationError` | `1.3` | Multiplier | Simplification threshold for contour generation. |
| `buildBvTree` | `true` | Boolean | Builds spatial Bounding Volume tree for $O(\log N)$ polygon queries. |

---

## 4. Path Querying Interface (`findPath`)

### 4.1 Interface Contract
```typescript
public findPath(start: Vector3, end: Vector3): Vector3[]
```

### 4.2 Query Execution Algorithm
1. **Validation**: Check if `navMesh` and `navMeshQuery` exist. Return `[]` if uninitialized.
2. **Extents Snapping**: Recast uses half-extents `{ x: 2.0, y: 5.0, z: 2.0 }` to project start/end coordinates onto the nearest valid NavMesh polygon.
3. **`computePath` Invocation**: Calls `this.navMeshQuery.computePath(start, end, { halfExtents })`.
4. **Path Result Parsing**: `computePath` returns `{ success: boolean, path: {x,y,z}[], error?: any }`.
5. **Format Conversion**: Converts Recast `{x,y,z}` points into `BABYLON.Vector3[]` instances.

```typescript
public findPath(start: Vector3, end: Vector3): Vector3[] {
  if (!this.navMeshQuery) {
    console.warn("[NavMeshManager] NavMeshQuery not initialized. Returning direct endpoint.");
    return [end.clone()];
  }

  const queryResult = this.navMeshQuery.computePath(
    { x: start.x, y: start.y, z: start.z },
    { x: end.x, y: end.y, z: end.z },
    {
      halfExtents: { x: 2.0, y: 5.0, z: 2.0 },
    }
  );

  if (!queryResult.success || !queryResult.path || queryResult.path.length === 0) {
    return [];
  }

  return queryResult.path.map((pt) => new Vector3(pt.x, pt.y, pt.z));
}
```

---

## 5. Debug Visualizer Utility (`createDebugMesh`)

To visually inspect the generated runtime NavMesh during development, `NavMeshManager` provides a built-in wireframe/overlay debug mesh generator using Recast's `getNavMeshPositionsAndIndices`.

```typescript
public createDebugMesh(scene: Scene): Mesh | null {
  if (!this.navMesh) return null;

  if (this.debugMesh) {
    this.debugMesh.dispose();
    this.debugMesh = null;
  }

  const [positions, indices] = getNavMeshPositionsAndIndices(this.navMesh);
  if (positions.length === 0 || indices.length === 0) return null;

  const debugMesh = new Mesh("navMeshDebugMesh", scene);
  const vertexData = new VertexData();

  // Elevate slightly (+0.05m Y) to prevent z-fighting with dungeon floors
  const elevatedPositions = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    elevatedPositions[i] = positions[i];
    elevatedPositions[i + 1] = positions[i + 1] + 0.05;
    elevatedPositions[i + 2] = positions[i + 2];
  }

  vertexData.positions = elevatedPositions;
  vertexData.indices = indices;
  vertexData.applyToMesh(debugMesh);

  const mat = new StandardMaterial("navMeshDebugMaterial", scene);
  mat.diffuseColor = new Color3(0.1, 0.85, 0.25);
  mat.wireframe = true;
  mat.backFaceCulling = false;
  debugMesh.material = mat;

  this.debugMesh = debugMesh;
  return debugMesh;
}
```

---

## 6. Input & Player Wiring Architecture

### 6.1 `InputManager.ts` Integration
- `InputManager` performs raycasting on mouse left-click:
  ```typescript
  const pickInfo = this.scene.pick(
    this.scene.pointerX,
    this.scene.pointerY,
    (mesh) => mesh.isPickable && (mesh.checkCollisions || this.groundPredicate(mesh))
  );
  ```
- Emits `onPointerClickWorld` with picked world `Vector3`.
- `groundPredicate` is configured in `TileMap.ts` / scene setup to match merged floors mesh (`mergedFloors`).

### 6.2 `Player.ts` Integration
`Player.ts` maintains a reference to `NavMeshManager` via `setNavMeshManager(navMeshManager)`.

```typescript
// Inside Player.ts:
public setNavMeshManager(navMeshManager: NavMeshManager): void {
  this.navMeshManager = navMeshManager;
}

public setInputManager(inputManager: InputManager): void {
  // Direct vector input override
  this.moveVectorObserver = this.inputManager.onMoveVectorChanged.add((dirVector) => {
    if (dirVector.lengthSquared() > 0.01) {
      this.cancelNavPath();
      this.isDirectMoving = true;
    } else {
      this.isDirectMoving = false;
    }
  });

  // Click-to-move pathing observer
  this.pointerClickObserver = this.inputManager.onPointerClickWorld.add((targetPos) => {
    // Ignore click-to-move if WASD / stick is active
    if (this.inputManager && this.inputManager.getMoveVector().lengthSquared() > 0.01) {
      return;
    }

    if (this.navMeshManager) {
      const path = this.navMeshManager.findPath(this.transformNode.position, targetPos);
      if (path && path.length > 0) {
        this.setNavPath(path);
      } else {
        // Fallback straight-line path if NavMesh returns empty
        this.setNavPath([targetPos]);
      }
    } else {
      this.setNavPath([targetPos]);
    }
  });
}
```

### 6.3 Movement Loop & Direct Override Logic
In `Player.ts` `update(deltaTime)`:
1. If direct keyboard/stick `inputVec.lengthSquared() > 0.01`, call `cancelNavPath()` and move directly using WASD velocity.
2. Otherwise, if `navPath.length > 0`:
   - Calculate horizontal distance to current waypoint: `toWaypoint = waypoint.subtract(playerPos)`, `toWaypoint.y = 0`.
   - If distance $< \text{waypointThreshold}$ (`0.35m`), increment `currentWaypointIdx`.
   - Velocity vector is directed along `toWaypoint.normalizeToNew().scale(moveSpeed)`.
3. Apply movement via `(this.transformNode as Mesh).moveWithCollisions(displacement)` for ellipsoid wall sliding.

---

## 7. Complete Implementation Specification for `src/dungeon/NavMeshManager.ts`

```typescript
import { init, NavMesh, NavMeshQuery, getNavMeshPositionsAndIndices } from "recast-navigation";
import { generateSoloNavMesh, SoloNavMeshGeneratorConfig } from "recast-navigation/generators";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";

export interface NavMeshManagerOptions {
  cs?: number; // Cell size (default: 0.2)
  ch?: number; // Cell height (default: 0.2)
  walkableHeight?: number; // Height in voxel units (default: 9 => 1.8m)
  walkableRadius?: number; // Radius in voxel units (default: 3 => 0.6m)
  walkableClimb?: number; // Climb in voxel units (default: 2 => 0.4m)
  walkableSlopeAngle?: number; // Max slope angle in degrees (default: 45)
}

export class NavMeshManager {
  private isInitialized: boolean = false;
  private navMesh: NavMesh | null = null;
  private navMeshQuery: NavMeshQuery | null = null;
  private debugMesh: Mesh | null = null;
  private options: NavMeshManagerOptions;

  constructor(options?: NavMeshManagerOptions) {
    this.options = {
      cs: options?.cs ?? 0.2,
      ch: options?.ch ?? 0.2,
      walkableHeight: options?.walkableHeight ?? 9,
      walkableRadius: options?.walkableRadius ?? 3,
      walkableClimb: options?.walkableClimb ?? 2,
      walkableSlopeAngle: options?.walkableSlopeAngle ?? 45,
    };
  }

  /** Initialize WASM module */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    await init();
    this.isInitialized = true;
  }

  /** Build Solo NavMesh over static floor mesh */
  public async createNavMesh(groundMesh: Mesh): Promise<boolean> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Clean up previous instances
    this.disposeNavMesh();

    const { positions, indices } = this.extractWorldGeometry(groundMesh);

    const config: Partial<SoloNavMeshGeneratorConfig> = {
      cs: this.options.cs,
      ch: this.options.ch,
      walkableHeight: this.options.walkableHeight,
      walkableRadius: this.options.walkableRadius,
      walkableClimb: this.options.walkableClimb,
      walkableSlopeAngle: this.options.walkableSlopeAngle,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      buildBvTree: true,
    };

    const result = generateSoloNavMesh(positions, indices, config);

    if (!result.success || !result.navMesh) {
      console.error("[NavMeshManager] Failed to generate NavMesh:", result.error);
      return false;
    }

    this.navMesh = result.navMesh;
    this.navMeshQuery = new NavMeshQuery(this.navMesh);
    return true;
  }

  /** Query path between start and end world points */
  public findPath(start: Vector3, end: Vector3): Vector3[] {
    if (!this.navMeshQuery) {
      return [end.clone()];
    }

    const result = this.navMeshQuery.computePath(
      { x: start.x, y: start.y, z: start.z },
      { x: end.x, y: end.y, z: end.z },
      {
        halfExtents: { x: 2.0, y: 5.0, z: 2.0 },
      }
    );

    if (!result.success || !result.path || result.path.length === 0) {
      return [];
    }

    return result.path.map((pt) => new Vector3(pt.x, pt.y, pt.z));
  }

  /** Helper to extract world-space geometry from mesh */
  private extractWorldGeometry(mesh: Mesh): { positions: Float32Array; indices: Uint32Array } {
    mesh.computeWorldMatrix(true);
    const worldMatrix = mesh.getWorldMatrix();

    const rawPositions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const rawIndices = mesh.getIndices();

    if (!rawPositions || !rawIndices) {
      throw new Error(`[NavMeshManager] Mesh ${mesh.name} missing positions or indices.`);
    }

    const vertexCount = rawPositions.length / 3;
    const positions = new Float32Array(rawPositions.length);
    const localVec = new Vector3();
    const worldVec = new Vector3();

    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      localVec.set(rawPositions[idx], rawPositions[idx + 1], rawPositions[idx + 2]);
      Vector3.TransformCoordinatesToRef(localVec, worldMatrix, worldVec);

      positions[idx] = worldVec.x;
      positions[idx + 1] = worldVec.y;
      positions[idx + 2] = worldVec.z;
    }

    const indices = new Uint32Array(rawIndices.length);
    for (let i = 0; i < rawIndices.length; i++) {
      indices[i] = rawIndices[i];
    }

    return { positions, indices };
  }

  /** Create green translucent debug overlay mesh for visual verification */
  public createDebugMesh(scene: Scene): Mesh | null {
    if (!this.navMesh) return null;

    if (this.debugMesh) {
      this.debugMesh.dispose();
      this.debugMesh = null;
    }

    const [positions, indices] = getNavMeshPositionsAndIndices(this.navMesh);
    if (positions.length === 0 || indices.length === 0) return null;

    const debugMesh = new Mesh("navMeshDebugMesh", scene);
    const vertexData = new VertexData();

    const elevatedPositions = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      elevatedPositions[i] = positions[i];
      elevatedPositions[i + 1] = positions[i + 1] + 0.05;
      elevatedPositions[i + 2] = positions[i + 2];
    }

    vertexData.positions = elevatedPositions;
    vertexData.indices = indices;
    vertexData.applyToMesh(debugMesh);

    const mat = new StandardMaterial("navMeshDebugMaterial", scene);
    mat.diffuseColor = new Color3(0.1, 0.85, 0.25);
    mat.wireframe = true;
    mat.backFaceCulling = false;
    debugMesh.material = mat;

    this.debugMesh = debugMesh;
    return debugMesh;
  }

  private disposeNavMesh(): void {
    if (this.navMeshQuery) {
      this.navMeshQuery.destroy();
      this.navMeshQuery = null;
    }
    if (this.navMesh) {
      this.navMesh.destroy();
      this.navMesh = null;
    }
    if (this.debugMesh) {
      this.debugMesh.dispose();
      this.debugMesh = null;
    }
  }

  public dispose(): void {
    this.disposeNavMesh();
    this.isInitialized = false;
  }
}
```
