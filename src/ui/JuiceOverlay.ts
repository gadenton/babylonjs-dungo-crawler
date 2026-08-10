import { Scene } from "@babylonjs/core/scene";
import { Engine as BabylonEngine } from "@babylonjs/core/Engines/engine";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

export type DamageType = "normal" | "crit" | "heal" | "damage";

interface TextPoolItem {
  textBlock: TextBlock;
  active: boolean;
  worldPosition: Vector3;
  velocity: { x: number; y: number; z: number };
  elapsedMs: number;
  durationMs: number;
  scalePop: number;
  damageType: DamageType;
}

interface FlashRecord {
  material: Material;
  originalEmissive: Color3;
  originalIntensity?: number;
  remainingMs: number;
}

export class JuiceOverlay {
  private scene: Scene;
  private engine: BabylonEngine;
  private guiTexture: AdvancedDynamicTexture;

  // Pre-allocated Pool (40 TextBlocks)
  private poolSize: number = 40;
  private textPool: TextPoolItem[] = [];

  // Emissive Flashes Queue
  private activeFlashes: Map<string, FlashRecord> = new Map();

  // Hit-Stop Freeze Frame State
  private hitStopRemainingMs: number = 0;

  constructor(scene: Scene, poolSize: number = 40) {
    this.scene = scene;
    this.engine = scene.getEngine() as BabylonEngine;
    this.poolSize = poolSize;
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("JuiceOverlayUI", true, this.scene);
    this.initPool();
  }

  private initPool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const tb = new TextBlock(`fct_${i}`, "");
      tb.isVisible = false;
      tb.fontFamily = "monospace, sans-serif";
      tb.fontWeight = "bold";
      this.guiTexture.addControl(tb);

      this.textPool.push({
        textBlock: tb,
        active: false,
        worldPosition: Vector3.Zero(),
        velocity: { x: 0, y: 0, z: 0 },
        elapsedMs: 0,
        durationMs: 800,
        scalePop: 1.0,
        damageType: "normal",
      });
    }
  }

  /** Spawn floating text at 3D world position using pre-allocated pool */
  public spawnFloatingText(position: Vector3, text: string, type: DamageType = "normal"): void {
    let item = this.textPool.find((t) => !t.active);
    if (!item) {
      // Overwrite oldest active element
      item = this.textPool.reduce((oldest, current) => (current.elapsedMs > oldest.elapsedMs ? current : oldest));
    }

    item.active = true;
    item.worldPosition = position.clone().add(new Vector3(0, 1.2, 0));
    item.elapsedMs = 0;
    item.damageType = type;

    const tb = item.textBlock;
    tb.text = text;
    tb.isVisible = true;

    if (type === "crit") {
      tb.color = "#FFD700"; // Gold
      tb.outlineColor = "#8B0000"; // Dark Red
      tb.outlineWidth = 3;
      tb.fontSize = 32;
      item.durationMs = 1100;
      item.scalePop = 1.6;
      item.velocity = { x: (Math.random() - 0.5) * 40, y: -90, z: 0 };
    } else if (type === "heal") {
      tb.color = "#32CD32"; // Green
      tb.outlineColor = "#003300";
      tb.outlineWidth = 2;
      tb.fontSize = 22;
      item.durationMs = 900;
      item.scalePop = 1.2;
      item.velocity = { x: (Math.random() - 0.5) * 15, y: -50, z: 0 };
    } else {
      // "normal" or "damage"
      tb.color = "#FFFFFF"; // White
      tb.outlineColor = "#000000";
      tb.outlineWidth = 2;
      tb.fontSize = 20;
      item.durationMs = 800;
      item.scalePop = 1.3;
      item.velocity = { x: (Math.random() - 0.5) * 25, y: -65, z: 0 };
    }
  }

  /** Trigger 100ms white hit flash queue on target mesh material */
  public triggerHitFlash(mesh: AbstractMesh, durationMs: number = 100): void {
    const meshes = mesh.getChildMeshes(false).concat([mesh]);
    for (const m of meshes) {
      if (!m.material) continue;
      const mat = m.material;
      const key = mat.uniqueId.toString();

      if (!this.activeFlashes.has(key)) {
        if (mat instanceof StandardMaterial) {
          this.activeFlashes.set(key, {
            material: mat,
            originalEmissive: mat.emissiveColor.clone(),
            remainingMs: durationMs,
          });
          mat.emissiveColor = new Color3(1.0, 1.0, 1.0);
        } else if (mat instanceof PBRMaterial) {
          this.activeFlashes.set(key, {
            material: mat,
            originalEmissive: mat.emissiveColor.clone(),
            originalIntensity: mat.emissiveIntensity,
            remainingMs: durationMs,
          });
          mat.emissiveColor = new Color3(1.0, 1.0, 1.0);
          mat.emissiveIntensity = 2.0;
        }
      } else {
        const record = this.activeFlashes.get(key)!;
        record.remainingMs = durationMs;
      }
    }
  }

  // Alias for backward compatibility
  public flashWhite(mesh: AbstractMesh, durationMs: number = 100): void {
    this.triggerHitFlash(mesh, durationMs);
  }

  /** Non-blocking micro-pause hit-stop freeze frame timer */
  public triggerHitStop(durationMs: number = 60): void {
    this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, durationMs);
  }

  // Alias for backward compatibility
  public triggerFreezeFrame(durationMs: number = 60): void {
    this.triggerHitStop(durationMs);
  }

  public isHitStopped(): boolean {
    return this.hitStopRemainingMs > 0;
  }

  /** Frame update loop */
  public update(deltaTime: number): void {
    const deltaTimeMs = deltaTime * 1000;

    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs -= deltaTimeMs;
    }
    const transformMatrix = this.scene.getTransformMatrix();
    const camera = this.scene.activeCamera;
    const viewport = camera
      ? camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
      : null;

    // 1. Update Floating Texts
    for (const item of this.textPool) {
      if (!item.active) continue;

      item.elapsedMs += deltaTimeMs;
      const tau = Math.min(1.0, item.elapsedMs / item.durationMs);

      if (tau >= 1.0) {
        item.active = false;
        item.textBlock.isVisible = false;
        continue;
      }

      if (viewport) {
        const projected = Vector3.Project(
          item.worldPosition,
          Matrix.IdentityReadOnly,
          transformMatrix,
          viewport
        );

        if (projected.z >= 0 && projected.z <= 1) {
          const offsetX = item.velocity.x * tau;
          const offsetY = item.velocity.y * tau + 0.5 * 30 * tau * tau; // Parabolic float arc

          item.textBlock.left = `${projected.x + offsetX - this.engine.getRenderWidth() / 2}px`;
          item.textBlock.top = `${projected.y + offsetY - this.engine.getRenderHeight() / 2}px`;

          let scale = 1.0;
          if (tau < 0.2) {
            scale = 1.0 + (item.scalePop - 1.0) * (tau / 0.2);
          } else {
            scale = item.scalePop - (item.scalePop - 1.0) * ((tau - 0.2) / 0.8);
          }
          item.textBlock.scaleX = scale;
          item.textBlock.scaleY = scale;

          const alpha = tau > 0.7 ? 1.0 - (tau - 0.7) / 0.3 : 1.0;
          item.textBlock.alpha = Math.max(0, alpha);
        } else {
          item.textBlock.isVisible = false;
        }
      }
    }

    // 2. Update Emissive Flashes Queue
    for (const [key, record] of this.activeFlashes.entries()) {
      record.remainingMs -= deltaTimeMs;
      if (record.remainingMs <= 0) {
        if (record.material instanceof StandardMaterial) {
          record.material.emissiveColor = record.originalEmissive;
        } else if (record.material instanceof PBRMaterial) {
          record.material.emissiveColor = record.originalEmissive;
          if (record.originalIntensity !== undefined) {
            record.material.emissiveIntensity = record.originalIntensity;
          }
        }
        this.activeFlashes.delete(key);
      }
    }
  }

  public dispose(): void {
    this.guiTexture.dispose();
    this.textPool = [];
    this.activeFlashes.clear();
  }
}
