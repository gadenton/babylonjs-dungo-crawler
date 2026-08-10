import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { TownHubAltar } from "../entities/TownHubAltar";

export interface BuiltTownHub {
  rootNode: TransformNode;
  mergedFloors: Mesh | null;
  mergedWalls: Mesh | null;
  spawnPoint: Vector3;
  altarPosition: Vector3;
  altar: TownHubAltar;
}

/**
 * TownHub represents a safe, hand-designed 10x10 plaza starting area.
 * It builds a non-procedural static environment using Kenney GLB assets,
 * creates merged floor and wall colliders for input picking and movement,
 * places the interactive TownHubAltar transition portal, and ensures 0 enemies.
 */
export class TownHub {
  private scene: Scene;
  private templateMeshes: Map<string, Mesh[]> = new Map();
  private templateRoots: TransformNode[] = [];
  private isLoaded: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Preload Kenney GLB models for Town Hub.
   */
  public async preloadAssets(): Promise<void> {
    if (this.isLoaded) return;

    const models = [
      "template-floor.glb",
      "template-floor-detail.glb",
      "template-wall.glb",
      "template-wall-corner.glb",
      "gate.glb",
      "stairs-wide.glb",
    ];

    const basePath = "/assets/dungeon/";

    for (const model of models) {
      try {
        console.log(`[TownHub] Preloading asset: ${basePath}${model}`);

        const importPromise = SceneLoader.ImportMeshAsync("", basePath, model, this.scene);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading ${model}`)), 5000)
        );

        const result = (await Promise.race([importPromise, timeoutPromise])) as any;
        if (result && result.meshes && result.meshes.length > 0) {
          const root = result.meshes[0] as TransformNode;
          this.templateRoots.push(root);

          const sourceMeshes: Mesh[] = [];
          for (let i = 0; i < result.meshes.length; i++) {
            const m = result.meshes[i];
            if (m instanceof Mesh && m.getTotalVertices() > 0) {
              m.isVisible = false;
              m.setEnabled(true);
              sourceMeshes.push(m);
            }
          }
          this.templateMeshes.set(model, sourceMeshes);
          console.log(`[TownHub] Loaded ${model}: ${sourceMeshes.length} source mesh(es)`);
        }
      } catch (err) {
        console.warn(`[TownHub] Asset ${model} load failed/timed out:`, err);
      }
    }

    this.isLoaded = true;
  }

  /**
   * Build 3D Town Hub 10x10 plaza environment.
   */
  public async build(): Promise<BuiltTownHub> {
    if (!this.isLoaded) {
      await this.preloadAssets();
    }

    console.log("[TownHub] Building static 10x10 Town Hub plaza...");
    const rootNode = new TransformNode("townHubRoot", this.scene);

    const floorSources = this.templateMeshes.get("template-floor.glb") || [];
    const floorDetailSources = this.templateMeshes.get("template-floor-detail.glb") || floorSources;
    const wallSources = this.templateMeshes.get("template-wall.glb") || [];
    const wallCornerSources = this.templateMeshes.get("template-wall-corner.glb") || wallSources;
    const gateSources = this.templateMeshes.get("gate.glb") || [];
    const stairsWideSources = this.templateMeshes.get("stairs-wide.glb") || [];

    const allInstances: InstancedMesh[] = [];
    const floorColliders: Mesh[] = [];
    const wallColliders: Mesh[] = [];

    const gridWidth = 10;
    const gridHeight = 10;

    // Helper to instantiate a model key at position and rotation
    const instantiate = (sources: Mesh[], pos: Vector3, rotY: number, prefix: string) => {
      for (const src of sources) {
        const inst = src.createInstance(`${prefix}_${src.name}`);
        inst.position.copyFrom(pos);
        inst.rotationQuaternion = null;
        inst.rotation.set(0, rotY, 0);
        inst.parent = rootNode;
        allInstances.push(inst);
      }
    };

    // 1. Build 10x10 Floor Plaza
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;
        const pos = new Vector3(worldX, 0, worldZ);

        // Decorate central path (gx === 4 or 5) with template-floor-detail.glb
        const isCentralPath = (gx === 4 || gx === 5);
        const sources = isCentralPath ? floorDetailSources : floorSources;
        instantiate(sources, pos, 0, `town_floor_${gx}_${gy}`);

        // Floor collision box (pickable for click-to-move input)
        const fc = CreateBox(`town_fc_${gx}_${gy}`, { width: 2.0, height: 0.2, depth: 2.0 }, this.scene);
        fc.position.set(worldX, -0.1, worldZ);
        fc.isVisible = false;
        floorColliders.push(fc);
      }
    }

    // 2. Build Perimeter Walls (10x10 Boundary with North Portal Archway)
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const isPerimeter = (gx === 0 || gx === gridWidth - 1 || gy === 0 || gy === gridHeight - 1);
        if (!isPerimeter) continue;

        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;
        const pos = new Vector3(worldX, 0, worldZ);

        // Corners
        if (gx === 0 && gy === 0) {
          instantiate(wallCornerSources, pos, Math.PI / 2, `town_wall_c_${gx}_${gy}`);
        } else if (gx === gridWidth - 1 && gy === 0) {
          instantiate(wallCornerSources, pos, Math.PI, `town_wall_c_${gx}_${gy}`);
        } else if (gx === 0 && gy === gridHeight - 1) {
          instantiate(wallCornerSources, pos, 0, `town_wall_c_${gx}_${gy}`);
        } else if (gx === gridWidth - 1 && gy === gridHeight - 1) {
          instantiate(wallCornerSources, pos, -Math.PI / 2, `town_wall_c_${gx}_${gy}`);
        }
        // South Wall
        else if (gy === 0) {
          instantiate(wallSources, pos, Math.PI, `town_wall_s_${gx}_${gy}`);
        }
        // West Wall
        else if (gx === 0) {
          instantiate(wallSources, pos, Math.PI / 2, `town_wall_w_${gx}_${gy}`);
        }
        // East Wall
        else if (gx === gridWidth - 1) {
          instantiate(wallSources, pos, -Math.PI / 2, `town_wall_e_${gx}_${gy}`);
        }
        // North Wall (gate entrance framing at gx=4,5)
        else if (gy === gridHeight - 1) {
          if (gx === 4) {
            instantiate(gateSources, pos, 0, `town_gate_${gx}_${gy}`);
          } else if (gx === 5) {
            instantiate(stairsWideSources, pos, 0, `town_stairs_${gx}_${gy}`);
          } else {
            instantiate(wallSources, pos, 0, `town_wall_n_${gx}_${gy}`);
          }
        }

        // Wall collision box for perimeter (excluding gate opening at gx=4,5 for stairs access, but wall collision covers borders)
        if (gy !== gridHeight - 1 || (gx !== 4 && gx !== 5)) {
          const wc = CreateBox(`town_wc_${gx}_${gy}`, { width: 2.0, height: 3.0, depth: 2.0 }, this.scene);
          wc.position.set(worldX, 1.5, worldZ);
          wc.isVisible = false;
          wallColliders.push(wc);
        }
      }
    }

    // Outer boundary collision box behind the North exit so player cannot fall off the map
    for (let gx = 3; gx <= 6; gx++) {
      const worldX = gx * 2.0 + 1.0;
      const wcOuter = CreateBox(`town_wc_outer_${gx}`, { width: 2.0, height: 3.0, depth: 2.0 }, this.scene);
      wcOuter.position.set(worldX, 1.5, 21.0);
      wcOuter.isVisible = false;
      wallColliders.push(wcOuter);
    }

    // 3. Merge Collision Geometry
    console.log("[TownHub] Merging collision geometry...");
    let mergedFloors: Mesh | null = null;
    if (floorColliders.length > 0) {
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

    // Spawn & Altar Coordinates
    const spawnPoint = new Vector3(10.0, 0.0, 6.0);
    const altarPosition = new Vector3(10.0, 0.0, 16.0);

    // Place TownHubAltar
    const altar = new TownHubAltar(this.scene, altarPosition);

    console.log("[TownHub] Build complete. Spawn point:", spawnPoint, "Altar position:", altarPosition);
    return {
      rootNode,
      mergedFloors,
      mergedWalls,
      spawnPoint,
      altarPosition,
      altar,
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
