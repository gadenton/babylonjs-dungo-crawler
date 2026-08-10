import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { TileType } from "./Generator";
export var DungeonTheme;
(function (DungeonTheme) {
    DungeonTheme["Dungeon"] = "dungeon";
    DungeonTheme["Cave"] = "cave";
})(DungeonTheme || (DungeonTheme = {}));
export class TileMap {
    constructor(scene, theme = DungeonTheme.Dungeon) {
        this.templateContainers = new Map();
        this.isLoaded = false;
        this.scene = scene;
        this.theme = theme;
    }
    /** Preload required GLB asset templates into memory */
    async preloadAssets() {
        if (this.isLoaded)
            return;
        const models = [
            "template-floor.glb",
            "template-floor-detail.glb",
            "template-wall.glb",
            "template-wall-corner.glb",
            "gate-door.glb",
            "stairs.glb",
        ];
        const basePath = `assets/${this.theme}/`;
        for (const model of models) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", basePath, model, this.scene);
                const root = result.meshes[0];
                root.setEnabled(false);
                root.name = `template_${model}`;
                this.templateContainers.set(model, root);
            }
            catch (err) {
                console.warn(`[TileMap] Failed to load model ${model} from ${basePath}:`, err);
            }
        }
        this.isLoaded = true;
    }
    /** Build 3D dungeon level from DungeonGrid metadata */
    async buildFromGrid(grid) {
        if (!this.isLoaded) {
            await this.preloadAssets();
        }
        const rootNode = new TransformNode("dungeonRoot", this.scene);
        const floorMeshes = [];
        const wallMeshes = [];
        const doors = [];
        const floorTemplate = this.templateContainers.get("template-floor.glb");
        const floorDetailTemplate = this.templateContainers.get("template-floor-detail.glb") || floorTemplate;
        const wallTemplate = this.templateContainers.get("template-wall.glb");
        const wallCornerTemplate = this.templateContainers.get("template-wall-corner.glb") || wallTemplate;
        const doorTemplate = this.templateContainers.get("gate-door.glb");
        const stairsTemplate = this.templateContainers.get("stairs.glb");
        const W = grid.width;
        const H = grid.height;
        for (let gy = 0; gy < H; gy++) {
            for (let gx = 0; gx < W; gx++) {
                const cell = grid.cells[gy][gx];
                const worldX = gx * 2.0 + 1.0;
                const worldZ = gy * 2.0 + 1.0;
                // 1. Walkable Tiles (Floor, Door, Stairs)
                if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
                    // Use detailed floor 15% of the time for visual variation
                    const useDetail = (gx * 31 + gy * 17 + grid.seed) % 100 < 15;
                    const template = useDetail ? floorDetailTemplate : floorTemplate;
                    if (template) {
                        this.instantiateSubmeshesInto(template, worldX, 0, worldZ, 0, floorMeshes);
                    }
                }
                // 2. Wall Tiles
                if (cell.type === TileType.Wall) {
                    const rotation = cell.wallRotation ?? 0;
                    const template = wallTemplate;
                    if (template) {
                        this.instantiateSubmeshesInto(template, worldX, 0, worldZ, rotation, wallMeshes);
                    }
                }
                // 3. Door Tiles
                if (cell.type === TileType.Door && doorTemplate) {
                    const doorInst = doorTemplate.clone(`door_${gx}_${gy}`, rootNode);
                    if (doorInst) {
                        doorInst.setEnabled(true);
                        doorInst.position.set(worldX, 0, worldZ);
                        doors.push(doorInst);
                    }
                }
                // 4. Stairs Tiles
                if (cell.type === TileType.Stairs && stairsTemplate) {
                    const stairsInst = stairsTemplate.clone(`stairs_${gx}_${gy}`, rootNode);
                    if (stairsInst) {
                        stairsInst.setEnabled(true);
                        stairsInst.position.set(worldX, 0, worldZ);
                    }
                }
            }
        }
        // 5. Material-Grouped Mesh Merging
        let mergedFloors = null;
        if (floorMeshes.length > 0) {
            mergedFloors = Mesh.MergeMeshes(floorMeshes, true, // disposeSource
            true, // allow32BitsIndices
            undefined, false, // subTransform
            false // useMultiMaterial
            );
            if (mergedFloors) {
                mergedFloors.name = "mergedFloors";
                mergedFloors.checkCollisions = true;
                mergedFloors.isPickable = true;
                mergedFloors.parent = rootNode;
                mergedFloors.freezeWorldMatrix();
            }
        }
        let mergedWalls = null;
        if (wallMeshes.length > 0) {
            mergedWalls = Mesh.MergeMeshes(wallMeshes, true, // disposeSource
            true, // allow32BitsIndices
            undefined, false, // subTransform
            false // useMultiMaterial
            );
            if (mergedWalls) {
                mergedWalls.name = "mergedWalls";
                mergedWalls.checkCollisions = true;
                mergedWalls.isPickable = false;
                mergedWalls.parent = rootNode;
                mergedWalls.freezeWorldMatrix();
            }
        }
        const spawnPoint = new Vector3(grid.spawnPosition.x * 2.0 + 1.0, 0.0, grid.spawnPosition.y * 2.0 + 1.0);
        const stairsPoint = new Vector3(grid.stairsPosition.x * 2.0 + 1.0, 0.0, grid.stairsPosition.y * 2.0 + 1.0);
        return {
            rootNode,
            mergedFloors,
            mergedWalls,
            doors,
            spawnPoint,
            stairsPoint,
        };
    }
    instantiateSubmeshesInto(template, x, y, z, rotationY, targetArray) {
        const childMeshes = template.getChildMeshes(false);
        for (const child of childMeshes) {
            if (child instanceof Mesh) {
                const cloned = child.clone(`tileMesh_${x}_${z}`, null);
                if (cloned) {
                    cloned.setEnabled(true);
                    cloned.position.set(x, y, z);
                    cloned.rotationQuaternion = null;
                    cloned.rotation.set(0, rotationY, 0);
                    cloned.computeWorldMatrix(true);
                    cloned.bakeCurrentTransformIntoVertices();
                    targetArray.push(cloned);
                }
            }
        }
    }
    dispose() {
        for (const container of this.templateContainers.values()) {
            container.dispose();
        }
        this.templateContainers.clear();
        this.isLoaded = false;
    }
}
//# sourceMappingURL=TileMap.js.map