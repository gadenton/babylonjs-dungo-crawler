import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export abstract class Entity {
  public readonly id: string;
  public name: string;
  public scene: Scene;
  public transformNode: TransformNode;
  public isAlive: boolean = true;

  constructor(id: string, name: string, scene: Scene) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.transformNode = new TransformNode(`entity_${id}`, scene);
  }

  public abstract update(deltaTime: number): void;

  public get position(): Vector3 {
    return this.transformNode.position;
  }

  public set position(val: Vector3) {
    this.transformNode.position.copyFrom(val);
  }

  public get rotation(): Vector3 {
    return this.transformNode.rotation;
  }

  public set rotation(val: Vector3) {
    this.transformNode.rotation.copyFrom(val);
  }

  public getForwardVector(): Vector3 {
    return this.transformNode.forward;
  }

  public dispose(): void {
    this.isAlive = false;
    this.transformNode.dispose();
  }
}
