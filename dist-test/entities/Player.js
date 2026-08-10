import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Entity } from "./Entity";
export class Player extends Entity {
    constructor(id, scene, customMesh) {
        super(id, "Player", scene);
        // Movement Specs
        this.moveSpeed = 7.0; // Speed in meters/sec
        this.rotationSpeed = 18.0; // Angular velocity slerp speed
        this.currentVelocity = Vector3.Zero();
        this.facingDirection = new Vector3(0, 0, 1);
        // Hybrid Pathing State
        this.isDirectMoving = false;
        this.navPath = [];
        this.currentWaypointIdx = 0;
        this.waypointThreshold = 0.35; // Distance threshold
        this.inputManager = null;
        this.navMeshManager = null;
        this.moveVectorObserver = null;
        this.pointerClickObserver = null;
        // Replace default TransformNode with a root Mesh for collision support
        const rootMesh = new Mesh(`playerRoot_${id}`, scene);
        this.transformNode.dispose();
        this.transformNode = rootMesh;
        if (customMesh) {
            this.mesh = customMesh;
            this.mesh.parent = this.transformNode;
        }
        else {
            // Create default player capsule fallback mesh
            this.mesh = CreateCapsule("playerMesh", { height: 1.8, radius: 0.4 }, scene);
            this.mesh.position = new Vector3(0, 0.9, 0); // Center capsule pivot at feet
            this.mesh.parent = this.transformNode;
        }
        this.setupEllipsoidCollision();
    }
    /** Configure Babylon Ellipsoid for smooth wall collision & sliding */
    setupEllipsoidCollision() {
        const rootMesh = this.transformNode;
        rootMesh.checkCollisions = true;
        // Bounding ellipsoid: width radius = 0.45m, height radius = 0.9m, depth radius = 0.45m
        rootMesh.ellipsoid = new Vector3(0.45, 0.9, 0.45);
        // Shift ellipsoid up by 0.9m so bottom touches feet (ground plane)
        rootMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
    }
    /** Set NavMeshManager reference for path queries */
    setNavMeshManager(navMeshManager) {
        this.navMeshManager = navMeshManager;
    }
    /** Attach InputManager observers */
    setInputManager(inputManager) {
        this.detachInputManager();
        this.inputManager = inputManager;
        // Listen to direct WASD / stick vector changes
        this.moveVectorObserver = this.inputManager.onMoveVectorChanged.add((dirVector) => {
            if (dirVector.lengthSquared() > 0.01) {
                // Direct movement overrides click-to-move pathing
                this.cancelNavPath();
                this.isDirectMoving = true;
            }
            else {
                this.isDirectMoving = false;
            }
        });
        // Listen to click-to-move destination clicks
        this.pointerClickObserver = this.inputManager.onPointerClickWorld.add((targetPos) => {
            // Direct WASD overrides click-to-move
            if (this.inputManager && this.inputManager.getMoveVector().lengthSquared() > 0.01) {
                return;
            }
            if (this.navMeshManager) {
                const startPos = this.transformNode.position;
                const path = this.navMeshManager.findPath(startPos, targetPos);
                if (path && path.length > 0) {
                    this.setNavPath(path);
                }
                else {
                    this.setNavPath([targetPos]);
                }
            }
            else {
                // Generate straight-line path fallback
                this.setNavPath([targetPos]);
            }
        });
    }
    detachInputManager() {
        if (this.inputManager) {
            if (this.moveVectorObserver) {
                this.inputManager.onMoveVectorChanged.remove(this.moveVectorObserver);
                this.moveVectorObserver = null;
            }
            if (this.pointerClickObserver) {
                this.inputManager.onPointerClickWorld.remove(this.pointerClickObserver);
                this.pointerClickObserver = null;
            }
            this.inputManager = null;
        }
    }
    /** Set path points received from Recast NavMesh Manager */
    setNavPath(path) {
        if (!path || path.length === 0)
            return;
        this.navPath = path.map((p) => p.clone());
        this.currentWaypointIdx = 0;
        this.isDirectMoving = false;
    }
    /** Cancel active NavMesh pathing */
    cancelNavPath() {
        this.navPath = [];
        this.currentWaypointIdx = 0;
    }
    /** Update loop called every frame */
    update(deltaTime) {
        if (deltaTime <= 0)
            return;
        let targetVelocity = Vector3.Zero();
        // 1. Resolve Direct Movement vs Click-to-Move
        const inputVec = this.inputManager ? this.inputManager.getMoveVector() : Vector3.Zero();
        if (inputVec.lengthSquared() > 0.01) {
            // Direct vector override
            targetVelocity = inputVec.scale(this.moveSpeed);
            this.cancelNavPath();
        }
        else if (this.navPath.length > 0 && this.currentWaypointIdx < this.navPath.length) {
            // Click-to-move pathing
            const waypoint = this.navPath[this.currentWaypointIdx];
            const playerPos = this.transformNode.position;
            const toWaypoint = waypoint.subtract(playerPos);
            toWaypoint.y = 0; // Flat 2D ground plane distance
            const dist = toWaypoint.length();
            if (dist < this.waypointThreshold) {
                this.currentWaypointIdx++;
                if (this.currentWaypointIdx >= this.navPath.length) {
                    this.cancelNavPath();
                }
            }
            else {
                targetVelocity = toWaypoint.normalizeToNew().scale(this.moveSpeed);
            }
        }
        // 2. Velocity interpolation
        const lerpFactor = 1.0 - Math.exp(-20.0 * deltaTime);
        this.currentVelocity = Vector3.Lerp(this.currentVelocity, targetVelocity, lerpFactor);
        // 3. Apply displacement with native wall sliding via moveWithCollisions on root transform node
        const displacement = this.currentVelocity.scale(deltaTime);
        if (displacement.lengthSquared() > 0.00001) {
            this.transformNode.moveWithCollisions(displacement);
        }
        // 4. Smooth Rotation (Slerp) towards movement direction
        if (this.currentVelocity.lengthSquared() > 0.1) {
            const moveDir = this.currentVelocity.normalizeToNew();
            this.facingDirection = moveDir.clone();
            const targetYaw = Math.atan2(moveDir.x, moveDir.z);
            const targetQuat = Quaternion.RotationYawPitchRoll(targetYaw, 0, 0);
            if (!this.mesh.rotationQuaternion) {
                this.mesh.rotationQuaternion = Quaternion.Identity();
            }
            const rotFactor = 1.0 - Math.exp(-this.rotationSpeed * deltaTime);
            Quaternion.SlerpToRef(this.mesh.rotationQuaternion, targetQuat, rotFactor, this.mesh.rotationQuaternion);
        }
    }
    /** Query current velocity for camera look-ahead calculation */
    getVelocity() {
        return this.currentVelocity.clone();
    }
    /** Query facing direction vector */
    getFacingDirection() {
        return this.facingDirection.clone();
    }
    /** Access root mesh */
    getMesh() {
        return this.mesh;
    }
    dispose() {
        this.detachInputManager();
        this.mesh.dispose();
        super.dispose();
    }
}
//# sourceMappingURL=Player.js.map