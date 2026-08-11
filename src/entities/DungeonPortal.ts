import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Observable } from "@babylonjs/core/Misc/observable";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

export class DungeonPortal {
  public id: string;
  public scene: Scene;
  public transformNode: TransformNode;
  public portalCore: Mesh;
  public pointLight: PointLight;
  public position: Vector3;

  public readonly onInteract: Observable<void> = new Observable<void>();
  private interactionRadius: number = 3.5;
  private animTime: number = 0;

  constructor(id: string, scene: Scene, position: Vector3) {
    this.id = id;
    this.scene = scene;
    this.position = position.clone();

    this.transformNode = new TransformNode(`portalRoot_${id}`, this.scene);
    this.transformNode.position = this.position;

    // Glowing Magic Swirling Portal Core Plane inside Archway
    this.portalCore = CreatePlane(`portalCore_${id}`, { width: 2.2, height: 4.0 }, this.scene);
    this.portalCore.position.set(0, 2.2, 0);
    this.portalCore.parent = this.transformNode;

    const coreMat = new StandardMaterial(`portalCoreMat_${id}`, this.scene);
    coreMat.diffuseColor = new Color3(0.1, 0.4, 1.0);
    coreMat.emissiveColor = new Color3(0.2, 0.6, 1.0); // Glowing Cyan/Blue
    coreMat.alpha = 0.85;
    coreMat.backFaceCulling = false;
    this.portalCore.material = coreMat;

    // Magical PointLight
    this.pointLight = new PointLight(`portalLight_${id}`, new Vector3(0, 2.2, 0), this.scene);
    this.pointLight.diffuse = new Color3(0.2, 0.7, 1.0);
    this.pointLight.intensity = 3.0;
    this.pointLight.range = 10.0;
    this.pointLight.parent = this.transformNode;

    // Load distinct Portal Tower Archway model from props
    this.loadPortalMesh();
  }

  private async loadPortalMesh(): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync("", "assets/props/", "dungeon-portal.glb", this.scene);
      if (result && result.meshes.length > 0) {
        const root = result.meshes[0];
        root.parent = this.transformNode;
        root.position.set(0, 0, 0);
        root.scaling.set(0.9, 0.9, 0.9);
      }
    } catch (err) {
      console.warn("[DungeonPortal] GLB portal model load failed:", err);
      // Fallback distinct archway pillars
      const p1 = CreateBox(`p1_${this.id}`, { width: 0.8, height: 4.2, depth: 0.8 }, this.scene);
      p1.position.set(-1.4, 2.1, 0);
      p1.parent = this.transformNode;

      const p2 = CreateBox(`p2_${this.id}`, { width: 0.8, height: 4.2, depth: 0.8 }, this.scene);
      p2.position.set(1.4, 2.1, 0);
      p2.parent = this.transformNode;

      const top = CreateBox(`top_${this.id}`, { width: 3.6, height: 0.8, depth: 0.8 }, this.scene);
      top.position.set(0, 4.3, 0);
      top.parent = this.transformNode;

      const stoneMat = new StandardMaterial(`stoneMat_${this.id}`, this.scene);
      stoneMat.diffuseColor = new Color3(0.15, 0.2, 0.3);
      p1.material = stoneMat;
      p2.material = stoneMat;
      top.material = stoneMat;
    }
  }

  public isPlayerInProximity(playerPos: Vector3): boolean {
    const dist = Vector3.Distance(this.transformNode.position, playerPos);
    return dist <= this.interactionRadius;
  }

  public interact(): void {
    console.log("[DungeonPortal] Player interacted with Dungeon Portal!");
    this.onInteract.notifyObservers();
  }

  public update(deltaTime: number): void {
    this.animTime += deltaTime;
    if (this.portalCore && this.portalCore.material) {
      const mat = this.portalCore.material as StandardMaterial;
      const pulse = 0.6 + Math.sin(this.animTime * 3.5) * 0.3;
      mat.emissiveColor = new Color3(0.1 * pulse, 0.5 * pulse, 1.0 * pulse);
      this.pointLight.intensity = 2.5 + Math.sin(this.animTime * 4.0) * 1.0;
    }
  }

  public dispose(): void {
    this.pointLight.dispose();
    this.transformNode.dispose();
  }
}
