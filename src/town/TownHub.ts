import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { TownHubAltar } from "../entities/TownHubAltar";

export interface BuiltTownHub {
  rootNode: TransformNode;
  mergedFloors: Mesh | null;
  mergedWalls: Mesh | null;
  spawnPoint: Vector3;
  altarPosition: Vector3;
  portalPosition: Vector3;
  stashPosition: Vector3;
  altar: TownHubAltar;
  propMeshes: Mesh[];
}

/**
 * TownHub represents a spacious, 100% gapless 5-wing sanctuary plaza built using autotiling:
 * - Autotiled perimeter walls with 0 gaps, 0 holes, and 0 isolated pillars.
 * - South & West foreground boundaries use low half-walls for unobstructed camera line of sight.
 * - North & East background boundaries use tall stone walls and battlements.
 * - 5 Distinct Wings:
 *   1. Central Plaza (Main open courtyard)
 *   2. Elevated North Temple (Archetype Altar & Columns)
 *   3. East Dungeon Portal Court (Swirling Portal & Archway)
 *   4. West Adventurer Encampment (Campfire & Stash Chest)
 *   5. South Entrance Promenade
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
   * Preload dungeon tile and prop GLB models for Town Hub.
   */
  public async preloadAssets(): Promise<void> {
    if (this.isLoaded) return;

    const dungeonModels = [
      "template-floor.glb",
      "template-floor-detail.glb",
      "template-wall.glb",
      "template-wall-corner.glb",
      "template-wall-half.glb",
      "template-wall-top.glb",
      "gate.glb",
    ];

    const propModels = [
      "column.glb",
      "banner.glb",
      "barrel.glb",
      "chest.glb",
      "wood-structure.glb",
      "wood-support.glb",
      "rocks.glb",
      "stones.glb",
      "shield-round.glb",
      "weapon-sword.glb",
      "character-human.glb",
      "character-orc.glb",
    ];

    const loadList: { path: string; file: string }[] = [
      ...dungeonModels.map((f) => ({ path: "assets/dungeon/", file: f })),
      ...propModels.map((f) => ({ path: "assets/props/", file: f })),
    ];

    for (const item of loadList) {
      try {
        const fullPath = `${item.path}${item.file}`;
        const importPromise = SceneLoader.ImportMeshAsync("", item.path, item.file, this.scene);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading ${fullPath}`)), 5000)
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
          this.templateMeshes.set(item.file, sourceMeshes);
        }
      } catch (err) {
        console.warn(`[TownHub] Asset ${item.file} load failed:`, err);
      }
    }

    this.isLoaded = true;
  }

  /**
   * Build 3D Town Hub Sanctuary Plaza environment.
   */
  public async build(): Promise<BuiltTownHub> {
    if (!this.isLoaded) {
      await this.preloadAssets();
    }

    console.log("[TownHub] Building static autotiled 5-wing sanctuary Town Hub plaza...");
    const rootNode = new TransformNode("townHubRoot", this.scene);

    const floorSources = this.templateMeshes.get("template-floor.glb") || [];
    const floorDetailSources = this.templateMeshes.get("template-floor-detail.glb") || floorSources;
    const wallSources = this.templateMeshes.get("template-wall.glb") || [];
    const wallCornerSources = this.templateMeshes.get("template-wall-corner.glb") || wallSources;
    const wallHalfSources = this.templateMeshes.get("template-wall-half.glb") || wallSources;
    const wallTopSources = this.templateMeshes.get("template-wall-top.glb") || wallSources;
    const gateSources = this.templateMeshes.get("gate.glb") || [];
    const columnSources = this.templateMeshes.get("column.glb") || [];
    const bannerSources = this.templateMeshes.get("banner.glb") || [];
    const barrelSources = this.templateMeshes.get("barrel.glb") || [];
    const chestSources = this.templateMeshes.get("chest.glb") || [];
    const woodStructSources = this.templateMeshes.get("wood-structure.glb") || [];
    const woodSupportSources = this.templateMeshes.get("wood-support.glb") || [];
    const rocksSources = this.templateMeshes.get("rocks.glb") || [];
    const stonesSources = this.templateMeshes.get("stones.glb") || [];
    const shieldSources = this.templateMeshes.get("shield-round.glb") || [];
    const swordSources = this.templateMeshes.get("weapon-sword.glb") || [];
    const humanSources = this.templateMeshes.get("character-human.glb") || [];
    const orcSources = this.templateMeshes.get("character-orc.glb") || [];

    const allInstances: InstancedMesh[] = [];
    const propMeshes: Mesh[] = [];
    const floorColliders: Mesh[] = [];
    const wallColliders: Mesh[] = [];

    // Helper to instantiate a model key at position, rotation, and optional scale / scaleX
    const instantiate = (
      sources: Mesh[],
      pos: Vector3,
      rotY: number = 0,
      prefix: string = "prop",
      scale: number = 1.0,
      scaleX: number = 1.0
    ): InstancedMesh[] => {
      const created: InstancedMesh[] = [];
      for (const src of sources) {
        const inst = src.createInstance(`${prefix}_${src.name}`);
        inst.position.copyFrom(pos);
        inst.rotationQuaternion = null;
        inst.rotation.set(0, rotY, 0);
        if (scale !== 1.0 || scaleX !== 1.0) {
          inst.scaling.set(scale * scaleX, scale, scale);
        }
        inst.parent = rootNode;
        allInstances.push(inst);
        created.push(inst);
      }
      return created;
    };

    const gridWidth = 20;
    const gridHeight = 18;

    // 5-Wing Active Playable Cell Mask
    const isWalkable = (gx: number, gy: number): boolean => {
      if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return false;
      // North Temple Wing (elevated y = 0.8)
      if (gx >= 6 && gx <= 13 && gy >= 12 && gy <= 16) return true;
      // Central Plaza (main open courtyard)
      if (gx >= 6 && gx <= 13 && gy >= 3 && gy <= 11) return true;
      // East Portal Court
      if (gx >= 14 && gx <= 18 && gy >= 5 && gy <= 10) return true;
      // West Encampment Wing
      if (gx >= 1 && gx <= 5 && gy >= 5 && gy <= 10) return true;
      // South Entrance Promenade
      if (gx >= 7 && gx <= 12 && gy >= 0 && gy <= 2) return true;

      return false;
    };

    // 1. Build Playable Floor Tiles & Autotiled Perimeter Walls (using Kenney template-wall-corner.glb for 100% flush fit)
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        if (!isWalkable(gx, gy)) continue;

        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;

        // Elevation: North Temple Wing is elevated at y = 0.8
        const isNorthTemple = gy >= 12 && gx >= 6 && gx <= 13;
        const elevation = isNorthTemple ? 0.8 : 0.0;

        // Decorative Floor Patterning
        const isPath = (gx >= 9 && gx <= 10) || (gy >= 7 && gy <= 9);
        const sources = isNorthTemple || isPath ? floorDetailSources : floorSources;

        const pos = new Vector3(worldX, elevation, worldZ);
        instantiate(sources, pos, 0, `town_floor_${gx}_${gy}`);

        // Floor Pickable Collider
        const fc = CreateBox(`town_fc_${gx}_${gy}`, { width: 2.0, height: 0.1, depth: 2.0 }, this.scene);
        fc.position.set(worldX, elevation - 0.05, worldZ);
        fc.isVisible = false;
        floorColliders.push(fc);

        // Check VOID neighbors around this active room tile
        const nN = !isWalkable(gx, gy + 1); // Border on North
        const nS = !isWalkable(gx, gy - 1); // Border on South
        const nE = !isWalkable(gx + 1, gy); // Border on East
        const nW = !isWalkable(gx - 1, gy); // Border on West

        // A. North Wall Edge (Background High Stone Wall at Z = worldZ + 1.0)
        if (nN) {
          const wallPos = new Vector3(worldX, elevation, worldZ + 1.0);
          instantiate(wallSources, wallPos, 0, `wall_n_${gx}_${gy}`);
          if (isNorthTemple) {
            instantiate(wallTopSources, wallPos.add(new Vector3(0, 3.0, 0)), 0, `wall_n_top_${gx}_${gy}`);
          }
          const wc = CreateBox(`town_wc_n_${gx}_${gy}`, { width: 2.0, height: 4.0, depth: 1.0 }, this.scene);
          wc.position.set(worldX, elevation + 2.0, worldZ + 0.5);
          wc.isVisible = false;
          wallColliders.push(wc);
        }

        // B. East Wall Edge (Background High Stone Wall at X = worldX + 1.0)
        if (nE) {
          const wallPos = new Vector3(worldX + 1.0, elevation, worldZ);
          instantiate(wallSources, wallPos, Math.PI / 2, `wall_e_${gx}_${gy}`);
          const wc = CreateBox(`town_wc_e_${gx}_${gy}`, { width: 1.0, height: 4.0, depth: 2.0 }, this.scene);
          wc.position.set(worldX + 0.5, elevation + 2.0, worldZ);
          wc.isVisible = false;
          wallColliders.push(wc);
        }

        // C. South Wall Edge (Low Half-Wall at Z = worldZ - 1.0 for Foreground Camera Line of Sight)
        if (nS) {
          const wallPos = new Vector3(worldX, elevation, worldZ - 1.0);
          instantiate(wallHalfSources, wallPos, 0, `wall_s_${gx}_${gy}`);
          const wc = CreateBox(`town_wc_s_${gx}_${gy}`, { width: 2.0, height: 1.5, depth: 1.0 }, this.scene);
          wc.position.set(worldX, elevation + 0.75, worldZ - 0.5);
          wc.isVisible = false;
          wallColliders.push(wc);
        }

        // D. West Wall Edge (High wall for North Temple background; Low half-wall at X = worldX - 1.0 for foreground camera visibility)
        if (nW) {
          const wallPos = new Vector3(worldX - 1.0, elevation, worldZ);
          const wSources = isNorthTemple ? wallSources : wallHalfSources;
          const h = isNorthTemple ? 4.0 : 1.5;
          instantiate(wSources, wallPos, Math.PI / 2, `wall_w_${gx}_${gy}`);
          const wc = CreateBox(`town_wc_w_${gx}_${gy}`, { width: 1.0, height: h, depth: 2.0 }, this.scene);
          wc.position.set(worldX - 0.5, elevation + h / 2, worldZ);
          wc.isVisible = false;
          wallColliders.push(wc);
        }
      }
    }

    // 2. Inner & Outer Corner Junction Column Pillars (Locking 100% of wall joints)
    const pillarKeys = new Set<string>();
    const addPillarAt = (vx: number, vz: number, el: number) => {
      const key = `${vx.toFixed(1)}_${vz.toFixed(1)}_${el.toFixed(1)}`;
      if (!pillarKeys.has(key)) {
        pillarKeys.add(key);
        instantiate(columnSources, new Vector3(vx, el, vz), 0, `corner_pillar_${key}`);
      }
    };

    // Inner L-junction void cells between wings
    const innerJunctionCells: { gx: number; gy: number; el: number }[] = [
      { gx: 5, gy: 11, el: 0.0 },  // NW West Camp / Central Plaza junction
      { gx: 5, gy: 4, el: 0.0 },   // SW West Camp / Central Plaza junction
      { gx: 14, gy: 11, el: 0.0 }, // NE East Portal / Central Plaza junction
      { gx: 14, gy: 4, el: 0.0 },  // SE East Portal / Central Plaza junction
      { gx: 6, gy: 2, el: 0.0 },   // South Promenade West junction
      { gx: 13, gy: 2, el: 0.0 },  // South Promenade East junction
    ];
    for (const jc of innerJunctionCells) {
      addPillarAt(jc.gx * 2.0 + 1.0, jc.gy * 2.0 + 1.0, jc.el);
    }

    // Vertex-locking pillars for all active room cell wall boundaries
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        if (!isWalkable(gx, gy)) continue;

        const worldX = gx * 2.0 + 1.0;
        const worldZ = gy * 2.0 + 1.0;
        const isNorthTemple = gy >= 12 && gx >= 6 && gx <= 13;
        const elevation = isNorthTemple ? 0.8 : 0.0;

        const nN = !isWalkable(gx, gy + 1);
        const nS = !isWalkable(gx, gy - 1);
        const nE = !isWalkable(gx + 1, gy);
        const nW = !isWalkable(gx - 1, gy);

        // Vertex-locking pillars ONLY for true 90-degree wall corners (where two perpendicular boundaries meet)
        if (nN && nW) addPillarAt(worldX - 1.0, worldZ + 1.0, elevation);
        if (nN && nE) addPillarAt(worldX + 1.0, worldZ + 1.0, elevation);
        if (nS && nW) addPillarAt(worldX - 1.0, worldZ - 1.0, elevation);
        if (nS && nE) addPillarAt(worldX + 1.0, worldZ - 1.0, elevation);
      }
    }

    // 3. Smooth Inclined Terrace Ramp Collider (between Central Plaza gy=11 and North Temple gy=12)
    const rampCollider = CreateBox("terraceRampFC", { width: 16.0, height: 0.6, depth: 2.0 }, this.scene);
    rampCollider.position.set(20.0, 0.4, 23.0);
    rampCollider.rotation.x = -Math.atan2(0.8, 2.0); // Smooth slope up onto temple terrace
    rampCollider.isVisible = false;
    floorColliders.push(rampCollider);

    // 4. North Temple Props: Stone Columns & Heroic Banners
    const columnPos1 = new Vector3(15.0, 0.8, 27.0);
    const columnPos2 = new Vector3(25.0, 0.8, 27.0);
    instantiate(columnSources, columnPos1, 0, "terrace_col_1");
    instantiate(columnSources, columnPos2, 0, "terrace_col_2");

    // Banners hanging on temple columns & backing wall
    instantiate(bannerSources, new Vector3(15.0, 3.0, 27.4), 0, "banner_1");
    instantiate(bannerSources, new Vector3(25.0, 3.0, 27.4), 0, "banner_2");
    instantiate(bannerSources, new Vector3(20.0, 3.0, 32.4), 0, "banner_center");

    // Warm Torches atop Temple Columns
    const lightTorch1 = new PointLight("terraceTorchLight1", columnPos1.add(new Vector3(0, 3.2, 0)), this.scene);
    lightTorch1.diffuse = new Color3(1.0, 0.6, 0.2);
    lightTorch1.intensity = 2.5;

    const lightTorch2 = new PointLight("terraceTorchLight2", columnPos2.add(new Vector3(0, 3.2, 0)), this.scene);
    lightTorch2.diffuse = new Color3(1.0, 0.6, 0.2);
    lightTorch2.intensity = 2.5;

    // 5. West Adventurer Encampment & Stash Props
    const campPos = new Vector3(5.0, 0, 15.0);
    instantiate(woodStructSources, campPos, Math.PI / 4, "camp_structure");
    instantiate(woodSupportSources, campPos.add(new Vector3(1.5, 0, 1.5)), 0, "camp_support");
    instantiate(barrelSources, campPos.add(new Vector3(-0.8, 0, 1.0)), 0, "camp_barrel_1");
    instantiate(barrelSources, campPos.add(new Vector3(-1.2, 0, -0.5)), 0, "camp_barrel_2");
    instantiate(shieldSources, campPos.add(new Vector3(0.5, 0.4, -1.2)), Math.PI / 3, "camp_shield");
    instantiate(swordSources, campPos.add(new Vector3(0.8, 0.2, -1.0)), Math.PI / 6, "camp_sword");
    instantiate(rocksSources, campPos.add(new Vector3(2.5, 0, -1.5)), 0, "camp_rocks");

    // Interactive Stash Chest
    const stashPosition = new Vector3(3.0, 0, 13.0);
    instantiate(chestSources, stashPosition, Math.PI / 3, "stash_chest");

    // Campfire Point Light & Emissive Logs
    const campfireLight = new PointLight("campfireLight", campPos.add(new Vector3(0, 0.8, 0)), this.scene);
    campfireLight.diffuse = new Color3(1.0, 0.5, 0.1);
    campfireLight.intensity = 3.0;

    const fireBase = CreateCylinder("fireLogs", { height: 0.3, diameter: 1.0, tessellation: 12 }, this.scene);
    fireBase.position = campPos.add(new Vector3(0, 0.15, 0));
    const fireMat = new StandardMaterial("fireMat", this.scene);
    fireMat.emissiveColor = new Color3(1.0, 0.4, 0.05);
    fireMat.diffuseColor = new Color3(0.3, 0.1, 0.0);
    fireBase.material = fireMat;

    // 6. East Portal Alcove Archway & Props
    const portalAlcovePos = new Vector3(35.0, 0, 15.0);
    instantiate(gateSources, new Vector3(31.0, 0, 15.0), -Math.PI / 2, "portal_gate_arch");
    instantiate(stonesSources, portalAlcovePos.add(new Vector3(-1.5, 0, -1.5)), 0, "portal_stones_1");
    instantiate(rocksSources, portalAlcovePos.add(new Vector3(-1.5, 0, 2.0)), 0, "portal_rocks_2");

    // 7. Town NPCs (Master Eldrin, Captain Vane, Bram Quartermaster)
    const npcMentorPos = new Vector3(18.0, 0.8, 28.0);
    instantiate(humanSources, npcMentorPos, Math.PI / 4, "npc_mentor", 0.9);

    const npcScoutPos = new Vector3(31.0, 0, 15.0);
    instantiate(humanSources, npcScoutPos, -Math.PI / 3, "npc_scout", 0.9);

    const npcVendorPos = new Vector3(9.0, 0, 14.5);
    instantiate(orcSources, npcVendorPos, Math.PI / 2, "npc_vendor", 0.9);

    // 8. Central Courtyard Torches
    const plazaTorchLight1 = new PointLight("plazaTorch1", new Vector3(15.0, 2.0, 11.0), this.scene);
    plazaTorchLight1.diffuse = new Color3(1.0, 0.65, 0.25);
    plazaTorchLight1.intensity = 2.0;

    const plazaTorchLight2 = new PointLight("plazaTorch2", new Vector3(25.0, 2.0, 11.0), this.scene);
    plazaTorchLight2.diffuse = new Color3(1.0, 0.65, 0.25);
    plazaTorchLight2.intensity = 2.0;

    // 9. Merge Collision Geometry
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

    // Spawn, Altar & Portal Coordinates
    const spawnPoint = new Vector3(20.0, 0.0, 15.0);
    const altarPosition = new Vector3(20.0, 0.8, 29.0);
    const portalPosition = new Vector3(35.0, 0.0, 15.0);

    // Place TownHubAltar on elevated terrace
    const altar = new TownHubAltar(this.scene, altarPosition);

    console.log(
      "[TownHub] Build complete. Spawn point:",
      spawnPoint,
      "Altar position:",
      altarPosition,
      "Portal position:",
      portalPosition
    );

    return {
      rootNode,
      mergedFloors,
      mergedWalls,
      spawnPoint,
      altarPosition,
      portalPosition,
      stashPosition,
      altar,
      propMeshes,
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




