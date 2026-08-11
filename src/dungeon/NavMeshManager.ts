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
  walkableRadius?: number; // Radius in voxel units (default: 1 => 0.2m)
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
      walkableRadius: options?.walkableRadius ?? 1,
      walkableClimb: options?.walkableClimb ?? 2,
      walkableSlopeAngle: options?.walkableSlopeAngle ?? 45,
    };
  }

  /** Async WASM initialization with timeout & fallback handling */
  public async init(timeoutMs: number = 3000): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      const initPromise = init();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`NavMesh WASM init timed out after ${timeoutMs}ms`)), timeoutMs)
      );
      await Promise.race([initPromise, timeoutPromise]);
      this.isInitialized = true;
      console.log("[NavMeshManager] Recast WASM initialized successfully.");
      return true;
    } catch (err) {
      console.warn("[NavMeshManager] Recast WASM init failed/timed out, using fallback pathfinding:", err);
      this.isInitialized = false;
      return false;
    }
  }

  /** Extract world vertices and indices from mergedFloors and build Recast solo NavMesh */
  public async createNavMesh(groundMesh: Mesh): Promise<boolean> {
    if (!this.isInitialized) {
      await this.init();
    }

    this.disposeNavMesh();

    const { positions, indices } = this.extractWorldGeometry(groundMesh);

    const config: Partial<SoloNavMeshGeneratorConfig> = {
      cs: this.options.cs,
      ch: this.options.ch,
      walkableHeight: this.options.walkableHeight,
      walkableRadius: this.options.walkableRadius,
      walkableClimb: this.options.walkableClimb,
      walkableSlopeAngle: this.options.walkableSlopeAngle,
      minRegionArea: 0,
      mergeRegionArea: 0,
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

  /** Compute straight path vectors from start to end */
  public findPath(start: Vector3, end: Vector3): Vector3[] {
    if (!this.navMeshQuery) {
      return [end.clone()];
    }

    const result = this.navMeshQuery.computePath(
      { x: start.x, y: start.y, z: start.z },
      { x: end.x, y: end.y, z: end.z },
      {
        halfExtents: { x: 4.0, y: 5.0, z: 4.0 },
      }
    );

    if (!result.success || !result.path || result.path.length === 0) {
      return [end.clone()];
    }

    return result.path.map((pt) => new Vector3(pt.x, pt.y, pt.z));
  }

  /** Extract world-space geometry from Babylon mesh */
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

  /** Render green translucent Debug Mesh overlay of generated NavMesh */
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

    // Elevate slightly (+0.05m Y) to prevent z-fighting with dungeon floor meshes
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
    mat.alpha = 0.5;
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
