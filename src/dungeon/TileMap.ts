import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { DungeonGrid, TileType } from "./Generator";
import { selectWallTile, selectFloorTile, selectDoorRotation } from "./Autotiler";

export enum DungeonTheme {
  Dungeon = "dungeon",
  Cave = "cave",
}

export interface BuiltDungeon {
  rootNode: TransformNode;
  mergedFloors: Mesh | null;
  mergedWalls: Mesh | null;
  doors: TransformNode[];
  spawnPoint: Vector3;
  stairsPoint: Vector3;
}

/**
 * Loads Kenney GLB tile templates and places them efficiently using
 * Babylon.js GPU instancing (createInstance). Each unique tile model
 * becomes a single source mesh with N lightweight InstancedMesh copies,
 * giving ~1 draw call per tile type regardless of grid size.
 */
export class TileMap {
  private scene: Scene;
  private theme: DungeonTheme;
  /** Map from model filename -> array of source Mesh nodes extracted from the GLB */
  private templateMeshes: Map<string, Mesh[]> = new Map();
  /** Root nodes from GLB imports (for disposal) */
  private templateRoots: TransformNode[] = [];
  private isLoaded: boolean = false;

  constructor(scene: Scene, theme: DungeonTheme = DungeonTheme.Dungeon) {
    this.scene = scene;
    this.theme = theme;
  }

  /**
   * Load GLB templates. For each GLB we extract every real Mesh child
   * (skipping the __root__ TransformNode) and hide the source mesh.
   * These source meshes become the basis for createInstance() calls.
   */
  public async preloadAssets(): Promise<void> {
    if (this.isLoaded) return;

    const models = [
      "template-floor.glb",
      "template-floor-detail.glb",
      "template-floor-detail-a.glb",
      "template-wall.glb",
      "template-wall-corner.glb",
      "template-corner.glb",
      "template-wall-half.glb",
      "template-wall-detail-a.glb",
      "gate.glb",
      "gate-door.glb",
      "stairs.glb",
    ];

    const basePath = `/assets/${this.theme}/`;

    for (const model of models) {
      try {
        console.log(`[TileMap] Loading GLB model: ${basePath}${model}`);

        const importPromise = SceneLoader.ImportMeshAsync("", basePath, model, this.scene);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading ${model}`)), 5000)
        );

        const result = (await Promise.race([importPromise, timeoutPromise])) as any;
        if (result && result.meshes && result.meshes.length > 0) {
          const root = result.meshes[0] as TransformNode;
          this.templateRoots.push(root);

          // Collect all real Mesh children (skip __root__ TransformNode at index 0)
          const sourceMeshes: Mesh[] = [];
          for (let i = 0; i < result.meshes.length; i++) {
            const m = result.meshes[i];
            if (m instanceof Mesh && m.getTotalVertices() > 0) {
              // Hide source mesh — instances will be visible, source won't
              m.isVisible = false;
              m.setEnabled(true);  // must stay enabled for instances to render
              sourceMeshes.push(m);
            }
          }

          this.templateMeshes.set(model, sourceMeshes);
          console.log(`[TileMap] Loaded ${model}: ${sourceMeshes.length} source mesh(es)`);
        }
      } catch (err) {
        console.warn(`[TileMap] Model ${model} load failed/timed out:`, err);
      }
    }

    this.isLoaded = true;
  }

  /**
   * Build 3D dungeon from grid using GPU-instanced Kenney GLB tiles.
   * 
   * Strategy:
   * 1. For each tile type (floor, wall, door, stairs), select exact modular GLB template
   *    and rotation based on 8-neighbor bitmask topology.
   * 2. For each grid cell, call sourceMesh.createInstance() — this creates
   *    a lightweight GPU instance that shares geometry/material with the
   *    source. Babylon renders all instances of the same source in 1 draw call.
   * 3. Create invisible merged box collision meshes for floor (pickable for
   *    click-to-move) and walls (for moveWithCollisions).
   */
  public async buildFromGrid(grid: DungeonGrid): Promise<BuiltDungeon> {
    if (!this.isLoaded) {
      await this.preloadAssets();
    }

    console.log("[TileMap] Starting buildFromGrid with Kenney GLB instances...");
    const rootNode = new TransformNode("dungeonRoot", this.scene);

    // Track all instances for parenting
    const allInstances: InstancedMesh[] = [];
    const doors: TransformNode[] = [];

    // Collision geometry arrays (simple boxes, merged into 2 meshes at the end)
    const floorColliders: Mesh[] = [];
    const wallColliders: Mesh[] = [];

    const W = grid.width;
    const H = grid.height;
    let floorCount = 0;
    let wallCount = 0;

    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const cell = grid.cells[gy][gx];
        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;

        // ── Floor / Door / Stairs base tile ──
        if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
          const floorSelection = selectFloorTile(grid, gx, gy);
          const sources = this.templateMeshes.get(floorSelection.modelName) || this.templateMeshes.get("template-floor.glb") || [];

          if (sources.length > 0) {
            for (const src of sources) {
              const inst = src.createInstance(`floor_${gx}_${gy}_${src.name}`);
              inst.position.set(worldX, 0, worldZ);
              inst.rotationQuaternion = null;
              inst.rotation.set(0, floorSelection.yRotation, 0);
              inst.parent = rootNode;
              allInstances.push(inst);
            }
          }
          floorCount++;

          // Invisible collision box for floor (pickable for click-to-move)
          const fc = CreateBox(`fc_${gx}_${gy}`, { width: 2.0, height: 0.2, depth: 2.0 }, this.scene);
          fc.position.set(worldX, -0.1, worldZ);
          fc.isVisible = false;
          floorColliders.push(fc);
        }

        // ── Wall tiles ──
        if (cell.type === TileType.Wall) {
          const wallSelection = selectWallTile(grid, gx, gy);
          const sources = this.templateMeshes.get(wallSelection.modelName) || this.templateMeshes.get("template-wall.glb") || [];

          if (sources.length > 0) {
            for (const src of sources) {
              const inst = src.createInstance(`wall_${gx}_${gy}_${src.name}`);
              inst.position.set(worldX, 0, worldZ);
              inst.rotationQuaternion = null;
              inst.rotation.set(0, wallSelection.yRotation, 0);
              inst.parent = rootNode;
              allInstances.push(inst);
            }
          }
          wallCount++;

          // Invisible collision box for wall
          const wc = CreateBox(`wc_${gx}_${gy}`, { width: 2.0, height: 3.0, depth: 2.0 }, this.scene);
          wc.position.set(worldX, 1.5, worldZ);
          wc.isVisible = false;
          wallColliders.push(wc);
        }

        // ── Door overlay (Use clean open gate.glb) ──
        if (cell.type === TileType.Door) {
          const doorSources = this.templateMeshes.get("gate.glb") || this.templateMeshes.get("gate-door.glb") || [];
          if (doorSources.length > 0) {
            const doorRotation = selectDoorRotation(grid, gx, gy);
            for (const src of doorSources) {
              const inst = src.createInstance(`door_${gx}_${gy}_${src.name}`);
              inst.position.set(worldX, 0, worldZ);
              inst.rotationQuaternion = null;
              inst.rotation.set(0, doorRotation, 0);
              inst.parent = rootNode;
              allInstances.push(inst);
              doors.push(inst);
            }
          }
        }

        // ── Stairs overlay ──
        if (cell.type === TileType.Stairs) {
          const stairsSources = this.templateMeshes.get("stairs.glb") || [];
          if (stairsSources.length > 0) {
            for (const src of stairsSources) {
              const inst = src.createInstance(`stairs_${gx}_${gy}_${src.name}`);
              inst.position.set(worldX, 0, worldZ);
              inst.rotationQuaternion = null;
              inst.rotation.set(0, 0, 0);
              inst.parent = rootNode;
              allInstances.push(inst);
            }
          }
        }
      }

      // Yield to browser every row to prevent long-task warnings
      if (gy % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        console.log(`[TileMap] Placed row ${gy}/${H}...`);
      }
    }

    console.log(`[TileMap] Instancing done. Floors: ${floorCount}, Walls: ${wallCount}, Total instances: ${allInstances.length}`);

    // ── Merge collision geometry ──
    console.log("[TileMap] Merging collision geometry...");
    let mergedFloors: Mesh | null = null;
    if (floorColliders.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      mergedFloors = Mesh.MergeMeshes(floorColliders, true, true, undefined, false, false);
      if (mergedFloors) {
        mergedFloors.name = "mergedFloors";
        mergedFloors.isVisible = false;
        mergedFloors.checkCollisions = true;
        mergedFloors.isPickable = true;
        mergedFloors.parent = rootNode;
        mergedFloors.freezeWorldMatrix();
      }
    }

    let mergedWalls: Mesh | null = null;
    if (wallColliders.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      mergedWalls = Mesh.MergeMeshes(wallColliders, true, true, undefined, false, false);
      if (mergedWalls) {
        mergedWalls.name = "mergedWalls";
        mergedWalls.isVisible = false;
        mergedWalls.checkCollisions = true;
        mergedWalls.isPickable = false;
        mergedWalls.parent = rootNode;
        mergedWalls.freezeWorldMatrix();
      }
    }
    console.log("[TileMap] Collision geometry merged.");

    const spawnPoint = new Vector3(grid.spawnPosition.x * 2.0 + 1.0, 0.0, grid.spawnPosition.y * 2.0 + 1.0);
    const stairsPoint = new Vector3(grid.stairsPosition.x * 2.0 + 1.0, 0.0, grid.stairsPosition.y * 2.0 + 1.0);

    console.log("[TileMap] buildFromGrid complete.");
    return {
      rootNode,
      mergedFloors,
      mergedWalls,
      doors,
      spawnPoint,
      stairsPoint,
    };
  }

  public dispose(): void {
    for (const root of this.templateRoots) {
      root.dispose(false, true);
    }
    this.templateRoots = [];
    this.templateMeshes.clear();
    this.isLoaded = false;
  }
}
