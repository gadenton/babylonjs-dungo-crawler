import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Observer, Observable } from "@babylonjs/core/Misc/observable";

export class TownHubAltar {
  private scene: Scene;
  public mesh: Mesh;
  public ringMesh: Mesh;
  public position: Vector3;
  private light: PointLight;
  private altarMat: StandardMaterial;
  private ringMat: StandardMaterial;
  private renderObserver: Observer<Scene> | null = null;
  private interactionRadius: number = 3.0;

  /** Observable dispatched when the altar is interacted with via E/F keypress or mouse click */
  public readonly onInteract: Observable<void> = new Observable<void>();

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.position = position.clone();

    // Base Altar Mesh: stylized stone altar cylinder
    this.mesh = CreateCylinder("townHubAltar", { height: 1.6, diameterTop: 2.2, diameterBottom: 2.6, tessellation: 32 }, scene);
    this.mesh.position = this.position.clone();
    this.mesh.position.y = 0.8;
    this.mesh.checkCollisions = true;
    this.mesh.isPickable = true;

    this.altarMat = new StandardMaterial("altarMat", scene);
    this.altarMat.diffuseColor = new Color3(0.2, 0.25, 0.35);
    this.altarMat.emissiveColor = new Color3(0.05, 0.1, 0.2);
    this.altarMat.specularPower = 32;
    this.mesh.material = this.altarMat;

    // Outer Runed Glow Ring
    this.ringMesh = CreateTorus("altarGlowRing", { diameter: 3.2, thickness: 0.15, tessellation: 32 }, scene);
    this.ringMesh.position = this.position.clone();
    this.ringMesh.position.y = 0.05;
    this.ringMesh.isPickable = true;

    this.ringMat = new StandardMaterial("ringMat", scene);
    this.ringMat.emissiveColor = new Color3(0.2, 0.7, 1.0);
    this.ringMat.disableLighting = true;
    this.ringMesh.material = this.ringMat;

    // Center Altar Light
    this.light = new PointLight("altarGlowLight", this.position.add(new Vector3(0, 2.2, 0)), scene);
    this.light.diffuse = new Color3(0.2, 0.7, 1.0);
    this.light.specular = new Color3(0.5, 0.9, 1.0);
    this.light.intensity = 2.0;

    // Slow rotation animation for altar glow ring
    this.renderObserver = scene.onBeforeRenderObservable.add(() => {
      if (this.ringMesh && !this.ringMesh.isDisposed()) {
        this.ringMesh.rotation.y += 0.01;
      }
    });
  }

  public isPlayerInProximity(playerPosition: Vector3): boolean {
    const dist = Vector3.Distance(this.position, playerPosition);
    return dist <= this.interactionRadius;
  }

  /** Trigger interaction with the altar */
  public interact(): void {
    this.onInteract.notifyObservers();
  }

  public dispose(): void {
    this.onInteract.clear();
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    if (this.altarMat) {
      this.altarMat.dispose();
    }
    if (this.ringMat) {
      this.ringMat.dispose();
    }
    if (this.light) {
      this.light.dispose();
    }
    if (this.ringMesh) {
      this.ringMesh.dispose();
    }
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
