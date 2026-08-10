import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export class Entity {
    constructor(id, name, scene) {
        this.isAlive = true;
        this.id = id;
        this.name = name;
        this.scene = scene;
        this.transformNode = new TransformNode(`entity_${id}`, scene);
    }
    get position() {
        return this.transformNode.position;
    }
    set position(val) {
        this.transformNode.position.copyFrom(val);
    }
    get rotation() {
        return this.transformNode.rotation;
    }
    set rotation(val) {
        this.transformNode.rotation.copyFrom(val);
    }
    getForwardVector() {
        return this.transformNode.forward;
    }
    dispose() {
        this.isAlive = false;
        this.transformNode.dispose();
    }
}
//# sourceMappingURL=Entity.js.map