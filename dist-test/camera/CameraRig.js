import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
export class CameraRig {
    constructor(scene, options) {
        this.targetNode = null;
        // Operational State
        this.currentFocus = Vector3.Zero();
        this.currentLookAhead = Vector3.Zero();
        // Trauma & Screen Shake
        this.trauma = 0.0;
        this.shakeTime = 0.0;
        this.maxShakeOffset = new Vector3(0.6, 0.4, 0.6);
        this.scene = scene;
        const pitchDeg = options?.pitchDegrees ?? 45;
        const yawDeg = options?.yawDegrees ?? 45;
        this.pitchAngle = (pitchDeg * Math.PI) / 180;
        this.yawAngle = (yawDeg * Math.PI) / 180;
        this.distance = options?.distance ?? 22.0;
        this.followRate = options?.followRate ?? 10.0;
        this.lookAheadDist = options?.lookAheadDist ?? 3.5;
        this.lookAheadRate = options?.lookAheadRate ?? 5.0;
        this.traumaDecayRate = options?.traumaDecayRate ?? 1.4;
        this.camera = new TargetCamera("isometricCamera", Vector3.Zero(), this.scene);
        this.camera.fov = options?.fov ?? 0.8;
        this.camera.minZ = 0.5;
        this.camera.maxZ = 200.0;
        this.scene.activeCamera = this.camera;
    }
    /** Attach camera rig to follow a target transform node (e.g. Player) */
    attachToTarget(target) {
        this.targetNode = target;
        this.currentFocus = target.position.clone();
        this.updateCameraTransform(0);
    }
    /** Update camera position, smoothing, look-ahead, and screen shake */
    update(deltaTime, velocity, lookDirection) {
        if (!this.targetNode)
            return;
        if (deltaTime <= 0)
            return;
        // 1. Exponential Smoothing Factors
        const tFollow = 1.0 - Math.exp(-this.followRate * deltaTime);
        const tLookAhead = 1.0 - Math.exp(-this.lookAheadRate * deltaTime);
        // 2. Look-Ahead Offset Calculation
        let desiredLookAhead = Vector3.Zero();
        if (velocity && velocity.lengthSquared() > 0.01) {
            desiredLookAhead = velocity.normalizeToNew().scale(this.lookAheadDist);
        }
        else if (lookDirection && lookDirection.lengthSquared() > 0.01) {
            desiredLookAhead = lookDirection.normalizeToNew().scale(this.lookAheadDist);
        }
        this.currentLookAhead = Vector3.Lerp(this.currentLookAhead, desiredLookAhead, tLookAhead);
        // 3. Target Focus Point
        const targetPos = this.targetNode.position;
        const desiredFocus = targetPos.add(this.currentLookAhead);
        this.currentFocus = Vector3.Lerp(this.currentFocus, desiredFocus, tFollow);
        // 4. Update Trauma & Screen Shake Hook
        this.trauma = Math.max(0, this.trauma - this.traumaDecayRate * deltaTime);
        const intensity = this.trauma * this.trauma; // Quadratic decay
        this.shakeTime += deltaTime * 30.0;
        const shakeX = this.maxShakeOffset.x * intensity * Math.sin(this.shakeTime * 1.7);
        const shakeY = this.maxShakeOffset.y * intensity * Math.cos(this.shakeTime * 2.3);
        const shakeZ = this.maxShakeOffset.z * intensity * Math.sin(this.shakeTime * 1.3);
        const shakeOffset = new Vector3(shakeX, shakeY, shakeZ);
        // 5. Isometric Offset Vector calculation
        this.updateCameraTransform(shakeOffset);
    }
    updateCameraTransform(shakeOffsetVal) {
        const shakeOffset = typeof shakeOffsetVal === "number" ? Vector3.Zero() : shakeOffsetVal;
        const isoOffset = new Vector3(this.distance * Math.sin(this.yawAngle) * Math.cos(this.pitchAngle), this.distance * Math.sin(this.pitchAngle), -this.distance * Math.cos(this.yawAngle) * Math.cos(this.pitchAngle));
        const finalCamPos = this.currentFocus.add(isoOffset).add(shakeOffset);
        const finalFocus = this.currentFocus.add(shakeOffset);
        this.camera.position.copyFrom(finalCamPos);
        this.camera.setTarget(finalFocus);
    }
    /** Add trauma for screen shake [0.0 - 1.0] */
    addTrauma(amount) {
        this.trauma = Math.min(1.0, this.trauma + amount);
    }
    setLookAheadDistance(dist) {
        this.lookAheadDist = dist;
    }
    setFollowRate(rate) {
        this.followRate = rate;
    }
    getCamera() {
        return this.camera;
    }
    dispose() {
        this.camera.dispose();
    }
}
//# sourceMappingURL=CameraRig.js.map