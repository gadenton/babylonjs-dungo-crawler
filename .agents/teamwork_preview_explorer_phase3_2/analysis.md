# Technical Specification: Phase 3 Juice & Audio Systems

**Author:** Phase 3 Technical Explorer 2  
**Date:** 2026-08-05  
**Target Milestone:** M3 (Phase 3: Direct-Stat System, Enemy AI & Combat Loop)  
**Target Files:**  
- `src/ui/JuiceOverlay.ts`  
- `src/audio/AudioManager.ts`  

---

## 1. Executive Summary & Architecture Overview

Phase 3 introduces moment-to-moment combat feedback ("juice") and immersive soundscapes to the Babylon.js Dungeon Crawler ARPG. To maximize responsiveness and maintain 60 FPS performance without coupling combat math to rendering details, the Juice and Audio systems operate as decoupled visual and audio services.

```
       +-------------------------------------------------------+
       |                   Combat / Event System               |
       +---------------------------+---------------------------+
                                   |
         Damage / Crit / Heal / Hit Events
                                   |
            +----------------------+----------------------+
            |                                             |
            v                                             v
+-----------------------+                     +-----------------------+
|  JuiceOverlay         |                     |  AudioManager         |
|  - Floating Text Pool |                     |  - Web Audio Context  |
|  - Emissive Flashes   |                     |  - Bus Hierarchy (dB) |
|  - Hit-Stop Pause     |                     |  - 3D Spatial Panners |
+-----------+-----------+                     |  - Sidechain Ducking  |
            |                                 +-----------+-----------+
            v                                             v
  Babylon GUI / Scene                           Browser Audio Destination
```

Key Design Highlights:
1. **`JuiceOverlay.ts`**: Uses `@babylonjs/gui` (`AdvancedDynamicTexture`) with an object-pooled array of `TextBlock` instances for floating damage numbers, high-performance material emissive pulsing for hit flashes, and micro-pause timing hooks for impact hit-stops.
2. **`AudioManager.ts`**: Built on pure Web Audio API (`AudioContext`) with 4 distinct gain buses (Master, Music, SFX, UI) calibrated in decibels, 3D `PannerNode` spatialization updated relative to camera position/orientation, automated sidechain ducking, and browser autoplay unlock listeners.

---

## 2. Juice Overlay System (`src/ui/JuiceOverlay.ts`) Specification

### 2.1 Class Architecture & API Contract

`JuiceOverlay` manages three core visual feedback mechanisms:
1. **Floating Combat Text (FCT)**
2. **Enemy Material Hit Flash**
3. **Hit-Stop Micro-Freeze Frames**

#### TypeScript Interface Definition:
```typescript
export type DamageNumberType = 'normal' | 'crit' | 'heal';

export interface FloatingTextConfig {
  color: string;
  fontSize: number;
  fontStyle?: string;
  outlineColor: string;
  outlineWidth: number;
  durationMs: number;
  scalePop: number;
  driftX: number;
  driftY: number;
}

export interface FlashEntry {
  mesh: AbstractMesh;
  originalEmissive: Color3;
  originalIntensity?: number;
  remainingMs: number;
}

export interface JuiceOverlayOptions {
  scene: Scene;
  engine: BabylonEngine;
  poolSize?: number; // Default 40
}
```

### 2.2 Floating Combat Text (FCT) Engine

#### Styling Parameters by Type:
| Type | Text Color | Outline Color | Outline Width | Font Size | Scale Pop | Duration | Trajectory / Motion |
|---|---|---|---|---|---|---|---|
| `normal` | `#FFFFFF` (White) | `#000000` | 2px | `20px` | 1.2x | 800ms | Upward drift (+40px Y), small horizontal jitter ($\pm 10$px) |
| `crit` | `#FFD700` (Gold) | `#8B0000` (Dark Red) | 3px | `30px` (Bold) | 1.6x -> 1.0x | 1100ms | High upward arc (+70px Y), horizontal pop ($\pm 25$px), initial scale burst |
| `heal` | `#32CD32` (Lime Green) | `#003300` | 2px | `22px` | 1.1x | 900ms | Gentle smooth float upward (+50px Y), centered |

#### GUI Projection & Parabolic Motion Math:
- **UI Canvas**: Single full-screen `AdvancedDynamicTexture.CreateFullscreenUI("JuiceOverlayUI", true, scene)`.
- **Position Tracking**: 
  - Each active floating text tracks a 3D world origin `Vector3`.
  - Every frame, compute current screen coordinate using `Vector3.Project`:
    $$\text{screenPos} = \text{Vector3.Project}(worldPos, \text{Matrix.Identity}(), \text{scene.getTransformMatrix}(), \text{camera.viewport.toGlobal}(engine))$$
  - Apply 2D screen offsets $(dx(t), dy(t))$ over normalized lifetime $\tau = \frac{t}{\text{duration}}$:
    $$dy(\tau) = -v_y \cdot \tau + 0.5 \cdot g \cdot \tau^2 \quad \text{(upward arc)}$$
    $$dx(\tau) = v_x \cdot \tau \quad \text{(horizontal drift)}$$
  - Scale transform:
    $$S(\tau) = \begin{cases} 1 + (S_{pop} - 1) \cdot \sin\left(\frac{\tau}{0.25} \cdot \frac{\pi}{2}\right), & \text{if } \tau < 0.25 \\ 1 + (S_{pop} - 1) \cdot \cos\left(\frac{\tau - 0.25}{0.75} \cdot \frac{\pi}{2}\right), & \text{if } \tau \ge 0.25 \end{cases}$$
  - Alpha Fade:
    $$\alpha(\tau) = \begin{cases} 1.0, & \text{if } \tau \le 0.70 \\ 1.0 - \frac{\tau - 0.70}{0.30}, & \text{if } \tau > 0.70 \end{cases}$$

#### Object Pooling Strategy:
- Allocate a fixed pool of 40 `TextBlock` instances during initialization.
- Recyclable state: `active: boolean`, `worldPosition: Vector3`, `elapsedMs: number`, `durationMs: number`, `config: FloatingTextConfig`.
- When all 40 slots are active, overwrite the text instance with the highest `elapsedMs` (oldest).

### 2.3 Enemy White Hit Flash (`emissiveColor` Pulse)

- **Target Detection**: Given an hit `AbstractMesh`, locate all child meshes and materials (`StandardMaterial` or `PBRMaterial`).
- **State Capture**:
  - `StandardMaterial`: Store `material.emissiveColor.clone()`. Override `emissiveColor = new Color3(1.0, 1.0, 1.0)`.
  - `PBRMaterial`: Store `material.emissiveColor.clone()` and `material.emissiveIntensity`. Override `emissiveColor = new Color3(1.0, 1.0, 1.0)` and `emissiveIntensity = 2.0`.
- **Duration**: `100ms` fixed flash.
- **Queue Update**: Maintained in `Map<Material, FlashEntry>`. On frame tick, decrement `remainingMs` by frame `deltaTimeMs`. When `remainingMs <= 0`, restore original values and delete entry.

### 2.4 Hit-Stop Freeze Frames (Micro-Pause)

- **Purpose**: Freeze rendering & game step for 50ms - 100ms on heavy/critical impacts.
- **Implementation Strategy**:
  - `triggerHitStop(durationMs: number)`
  - Active flag `isHitStopped: boolean`.
  - Call `this.engine.stopRenderLoop()`.
  - Clear any active hit-stop `setTimeout` handle.
  - Set a `setTimeout` for `durationMs` to call `this.engine.runRenderLoop(...)` and reset `isHitStopped = false`.
- **Safety**: Guard against multiple hits during a single hit-stop window by extending remaining duration without cascading multiple `runRenderLoop` registrations.

---

## 3. Audio Manager System (`src/audio/AudioManager.ts`) Specification

### 3.1 Web Audio API Node Graph Architecture

```
[ Sound Buffers / Oscillators ]
              |
              v
     [ Spatial PannerNode ]  (For 3D world sounds)
              |
              +-----------------------+-----------------------+
              |                       |                       |
              v                       v                       v
       [ SFX Bus Gain ]       [ Music Bus Gain ]      [ UI Bus Gain ]
              |                       |                       |
              |                       v                       |
              |            [ Sidechain Ducking Gain ]         |
              |                       |                       |
              +-----------------------+-----------------------+
                                      |
                                      v
                             [ Master Bus Gain ]
                                      |
                                      v
                         [ AudioContext.destination ]
```

### 3.2 Bus Hierarchy & Gain Management (Decibels)

#### Bus Types & Default Volumes:
```typescript
export type AudioBusType = 'master' | 'music' | 'sfx' | 'ui';
```

| Bus | Parent Bus | Default Gain (dB) | Linear Gain Factor | Purpose |
|---|---|---|---|---|
| `Master` | `destination` | `0 dB` | `1.0` | Global volume ceiling |
| `Music` | `Master` | `-6 dB` | `0.501` | Background dungeon music & atmosphere |
| `SFX` | `Master` | `0 dB` | `1.0` | Enemy hits, player skills, footstep sounds |
| `UI` | `Master` | `-3 dB` | `0.708` | Menu clicks, talent allocation, loot sounds |

#### Decibel Conversion Utilities:
$$\text{dbToLinear}(\text{dB}) = 10^{\left(\frac{\text{dB}}{20}\right)}$$
$$\text{linearToDb}(\text{gain}) = 20 \cdot \log_{10}(\max(\text{gain}, 0.0001))$$

### 3.3 3D Spatial Audio & Listener Tracking

- **Listener Positioning**:
  - Updated each frame tick from `CameraRig` position & target vector:
  - `updateListener(cameraPosition: Vector3, cameraTarget: Vector3)`
  - Use `AudioContext.listener.positionX.setValueAtTime(pos.x, currentTime)` (or fallback `listener.setPosition(x, y, z)` for older implementations).
  - Forward orientation vector: $\vec{F} = \text{normalize}(\text{cameraTarget} - \text{cameraPosition})$.
  - Up orientation vector: $\vec{U} = (0, 1, 0)$.
- **Spatial Sound Panner Settings**:
  - `panningModel`: `'HRTF'`
  - `distanceModel`: `'inverse'`
  - `refDistance`: `3.0` meters
  - `maxDistance`: `50.0` meters
  - `rolloffFactor`: `1.0`
- **SFX Variation**:
  - Pitch randomization: $\text{playbackRate} \in [0.94, 1.06]$ ($\pm 6\%$).
  - Prevents repetitive machine-gun audio artifacts on rapid attacks.

### 3.4 Sidechain Ducking Mechanism

- **Trigger**: Called on critical hit or heavy skill impact (`triggerDucking(duckDb: number = -10, durationMs: number = 350)`).
- **Execution**:
  - Smoothly ramp down `Music` bus gain to current volume minus `duckDb` over `15ms` (attack phase):
    `musicGainNode.gain.setTargetAtTime(duckedLinearGain, audioCtx.currentTime, 0.015);`
  - After `durationMs`, smoothly ramp back to base music volume over `300ms` (release phase):
    `musicGainNode.gain.setTargetAtTime(normalLinearGain, audioCtx.currentTime + durationMs / 1000, 0.300);`

### 3.5 User Interaction Autoplay Unlock Listener

- Browsers start `AudioContext` in `'suspended'` state until user interaction occurs.
- `AudioManager` attaches listeners to `window`:
  - `['pointerdown', 'keydown', 'touchstart']`
- On first event:
  - `audioContext.resume()`
  - Remove event listeners once `audioContext.state === 'running'`.

---

## 4. Full Technical Code Specifications

### 4.1 `src/ui/JuiceOverlay.ts` Specification Code Structure

```typescript
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

export type DamageType = "normal" | "crit" | "heal";

interface TextPoolItem {
  textBlock: TextBlock;
  active: boolean;
  worldPosition: Vector3;
  velocity: { x: number; y: number };
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

  // Text Pool
  private poolSize: number = 40;
  private textPool: TextPoolItem[] = [];

  // Emissive Flashes
  private activeFlashes: Map<string, FlashRecord> = new Map();

  // Hit-Stop State
  private hitStopTimer: number | null = null;
  private isHitStopped: boolean = false;

  constructor(scene: Scene, engine: BabylonEngine, poolSize: number = 40) {
    this.scene = scene;
    this.engine = engine;
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
        velocity: { x: 0, y: 0 },
        elapsedMs: 0,
        durationMs: 800,
        scalePop: 1.0,
        damageType: "normal",
      });
    }
  }

  /** Spawn floating text at 3D world position */
  public spawnFloatingText(position: Vector3, text: string, type: DamageType = "normal"): void {
    let item = this.textPool.find((t) => !t.active);
    if (!item) {
      // Overwrite oldest active
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
      tb.color = "#FFD700";
      tb.outlineColor = "#8B0000";
      tb.outlineWidth = 3;
      tb.fontSize = 32;
      item.durationMs = 1100;
      item.scalePop = 1.6;
      item.velocity = { x: (Math.random() - 0.5) * 40, y: -90 };
    } else if (type === "heal") {
      tb.color = "#32CD32";
      tb.outlineColor = "#003300";
      tb.outlineWidth = 2;
      tb.fontSize = 22;
      item.durationMs = 900;
      item.scalePop = 1.2;
      item.velocity = { x: (Math.random() - 0.5) * 15, y: -50 };
    } else {
      tb.color = "#FFFFFF";
      tb.outlineColor = "#000000";
      tb.outlineWidth = 2;
      tb.fontSize = 20;
      item.durationMs = 800;
      item.scalePop = 1.3;
      item.velocity = { x: (Math.random() - 0.5) * 25, y: -65 };
    }
  }

  /** Trigger 100ms white hit flash on mesh material */
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

  /** Trigger hit-stop freeze frames */
  public triggerHitStop(durationMs: number = 60): void {
    if (this.isHitStopped) {
      if (this.hitStopTimer !== null) clearTimeout(this.hitStopTimer);
    } else {
      this.isHitStopped = true;
      this.engine.stopRenderLoop();
    }

    this.hitStopTimer = window.setTimeout(() => {
      this.isHitStopped = false;
      this.hitStopTimer = null;
      // Restart render loop safely
      this.engine.runRenderLoop(() => {
        this.scene.render();
      });
    }, durationMs);
  }

  /** Frame update loop called from GameEngine tick */
  public update(deltaTimeMs: number): void {
    const dtSec = deltaTimeMs / 1000;
    const transformMatrix = this.scene.getTransformMatrix();
    const viewport = this.scene.activeCamera?.viewport.toGlobal(
      this.engine.getRenderWidth(),
      this.engine.getRenderHeight()
    );

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

      // Projection to screen space
      if (viewport) {
        const projected = Vector3.Project(
          item.worldPosition,
          Matrix.IdentityReadOnly,
          transformMatrix,
          viewport
        );

        if (projected.z >= 0 && projected.z <= 1) {
          const offsetX = item.velocity.x * tau;
          const offsetY = item.velocity.y * tau + 0.5 * 30 * tau * tau; // parabolic float

          item.textBlock.left = `${projected.x + offsetX - this.engine.getRenderWidth() / 2}px`;
          item.textBlock.top = `${projected.y + offsetY - this.engine.getRenderHeight() / 2}px`;

          // Scale pop calculation
          let scale = 1.0;
          if (tau < 0.2) {
            scale = 1.0 + (item.scalePop - 1.0) * (tau / 0.2);
          } else {
            scale = item.scalePop - (item.scalePop - 1.0) * ((tau - 0.2) / 0.8);
          }
          item.textBlock.scaleX = scale;
          item.textBlock.scaleY = scale;

          // Alpha fade out
          const alpha = tau > 0.7 ? 1.0 - (tau - 0.7) / 0.3 : 1.0;
          item.textBlock.alpha = alpha;
        } else {
          item.textBlock.isVisible = false;
        }
      }
    }

    // 2. Update Emissive Flashes
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
    if (this.hitStopTimer !== null) clearTimeout(this.hitStopTimer);
    this.guiTexture.dispose();
    this.textPool = [];
    this.activeFlashes.clear();
  }
}
```

---

### 4.2 `src/audio/AudioManager.ts` Specification Code Structure

```typescript
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type AudioBus = "master" | "music" | "sfx" | "ui";

export class AudioManager {
  private audioCtx: AudioContext;

  // Bus Gain Nodes
  private masterGain: GainNode;
  private musicGain: GainNode;
  private sfxGain: GainNode;
  private uiGain: GainNode;
  private musicDuckingGain: GainNode;

  // Volume States (in Decibels)
  private busVolumes: Record<AudioBus, number> = {
    master: 0,
    music: -6,
    sfx: 0,
    ui: -3,
  };

  // Sound Buffers
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isUnlocked: boolean = false;

  // Sidechain Ducking Timer
  private duckingReleaseTimer: number | null = null;

  constructor() {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtxClass();

    // Create Bus Nodes
    this.masterGain = this.audioCtx.createGain();
    this.musicGain = this.audioCtx.createGain();
    this.musicDuckingGain = this.audioCtx.createGain();
    this.sfxGain = this.audioCtx.createGain();
    this.uiGain = this.audioCtx.createGain();

    // Node Hierarchy Routing
    // Music -> Ducking -> Master
    this.musicGain.connect(this.musicDuckingGain);
    this.musicDuckingGain.connect(this.masterGain);

    // SFX -> Master
    this.sfxGain.connect(this.masterGain);

    // UI -> Master
    this.uiGain.connect(this.masterGain);

    // Master -> Destination
    this.masterGain.connect(this.audioCtx.destination);

    // Initialize Default Gains (dB -> Linear)
    this.applyBusVolumes();

    // User Interaction Autoplay Unlock Listener
    this.setupUnlockListener();
  }

  private setupUnlockListener(): void {
    const unlock = () => {
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume().then(() => {
          this.isUnlocked = true;
        });
      } else {
        this.isUnlocked = true;
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
  }

  // --- Decibel Math Utilities ---
  public dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }

  public linearToDb(gain: number): number {
    return 20 * Math.log10(Math.max(gain, 0.0001));
  }

  public setBusVolumeDb(bus: AudioBus, db: number): void {
    this.busVolumes[bus] = db;
    this.applyBusVolumes();
  }

  public getBusVolumeDb(bus: AudioBus): number {
    return this.busVolumes[bus];
  }

  private applyBusVolumes(): void {
    const now = this.audioCtx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.master), now, 0.01);
    this.musicGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.music), now, 0.01);
    this.sfxGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.sfx), now, 0.01);
    this.uiGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.ui), now, 0.01);
  }

  // --- 3D Spatial Audio & Listener ---
  public updateListener(position: Vector3, forward: Vector3, up: Vector3 = Vector3.Up()): void {
    const listener = this.audioCtx.listener;
    const now = this.audioCtx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, now);
      listener.positionY.setValueAtTime(position.y, now);
      listener.positionZ.setValueAtTime(position.z, now);
      listener.forwardX.setValueAtTime(forward.x, now);
      listener.forwardY.setValueAtTime(forward.y, now);
      listener.forwardZ.setValueAtTime(forward.z, now);
      listener.upX.setValueAtTime(up.x, now);
      listener.upY.setValueAtTime(up.y, now);
      listener.upZ.setValueAtTime(up.z, now);
    } else {
      // Legacy fallback
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Play 2D Non-Spatial Sound */
  public playSound(soundKey: string, bus: AudioBus = "sfx", pitchVariance: number = 0.05): void {
    const buffer = this.audioBuffers.get(soundKey);
    if (!buffer) {
      this.playSyntheticBeep(bus);
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    // Pitch variance (+/- pitchVariance)
    if (pitchVariance > 0) {
      source.playbackRate.value = 1.0 + (Math.random() - 0.5) * 2 * pitchVariance;
    }

    const busNode = this.getBusNode(bus);
    source.connect(busNode);
    source.start();
  }

  /** Play 3D Spatial Sound at World Position */
  public playSpatialSound(soundKey: string, position: Vector3, pitchVariance: number = 0.05): void {
    const buffer = this.audioBuffers.get(soundKey);
    if (!buffer) {
      this.playSyntheticSpatialBeep(position);
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    if (pitchVariance > 0) {
      source.playbackRate.value = 1.0 + (Math.random() - 0.5) * 2 * pitchVariance;
    }

    const panner = this.audioCtx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3.0;
    panner.maxDistance = 50.0;
    panner.rolloffFactor = 1.0;

    panner.positionX.setValueAtTime(position.x, this.audioCtx.currentTime);
    panner.positionY.setValueAtTime(position.y, this.audioCtx.currentTime);
    panner.positionZ.setValueAtTime(position.z, this.audioCtx.currentTime);

    source.connect(panner);
    panner.connect(this.sfxGain);
    source.start();
  }

  /** Sidechain Ducking (Ducks Music Gain on Heavy Hits) */
  public triggerSidechainDucking(duckDb: number = -10, durationMs: number = 350): void {
    const now = this.audioCtx.currentTime;
    const duckedLinear = this.dbToLinear(duckDb);

    // Fast Attack (15ms)
    this.musicDuckingGain.gain.setTargetAtTime(duckedLinear, now, 0.015);

    if (this.duckingReleaseTimer !== null) {
      clearTimeout(this.duckingReleaseTimer);
    }

    // Smooth Release (300ms) after durationMs
    this.duckingReleaseTimer = window.setTimeout(() => {
      const releaseTime = this.audioCtx.currentTime;
      this.musicDuckingGain.gain.setTargetAtTime(1.0, releaseTime, 0.3);
      this.duckingReleaseTimer = null;
    }, durationMs);
  }

  // --- Synthetic Procedural Fallbacks for Testing ---
  private playSyntheticBeep(bus: AudioBus): void {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const now = this.audioCtx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.getBusNode(bus));

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playSyntheticSpatialBeep(position: Vector3): void {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const panner = this.audioCtx.createPanner();
    const now = this.audioCtx.currentTime;

    panner.panningModel = "HRTF";
    panner.positionX.setValueAtTime(position.x, now);
    panner.positionY.setValueAtTime(position.y, now);
    panner.positionZ.setValueAtTime(position.z, now);

    osc.type = "triangle";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.15);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  private getBusNode(bus: AudioBus): GainNode {
    switch (bus) {
      case "master":
        return this.masterGain;
      case "music":
        return this.musicGain;
      case "sfx":
        return this.sfxGain;
      case "ui":
        return this.uiGain;
    }
  }

  public dispose(): void {
    if (this.duckingReleaseTimer !== null) clearTimeout(this.duckingReleaseTimer);
    this.audioCtx.close();
  }
}
```

---

## 5. Integration Plan & Interface Contracts

1. **`DamageSystem.ts` Integration**:
   - On damage calculation result (`DamageResult`):
     ```typescript
     // Spawn Floating Combat Text
     const textType = result.isCrit ? "crit" : (result.isHeal ? "heal" : "normal");
     juiceOverlay.spawnFloatingText(defender.position, Math.round(result.amount).toString(), textType);

     // Trigger Enemy White Flash
     juiceOverlay.triggerHitFlash(defender.mesh, 100);

     // Trigger Audio & Freeze Frame for Crits
     if (result.isCrit) {
       juiceOverlay.triggerHitStop(70); // 70ms micro freeze
       audioManager.triggerSidechainDucking(-12, 400); // Duck music
       audioManager.playSpatialSound("sfx_crit_impact", defender.position, 0.08);
     } else {
       audioManager.playSpatialSound("sfx_hit_normal", defender.position, 0.05);
     }
     ```

2. **Main Render Loop Tick (`src/core/Engine.ts` / Game Loop)**:
   - `juiceOverlay.update(deltaTimeMs)` must be called every frame tick before `scene.render()`.
   - `audioManager.updateListener(camera.position, camera.target)` must be updated every frame tick to align spatial sound with camera view.

---

## 6. Verification & Validation Strategy

1. **TypeScript Build Verification**:
   - `tsc --noEmit` clean compilation without syntax errors or unknown imports.
2. **Visual Juice Auditing**:
   - Damage numbers pop up cleanly above enemy models, drift up with parabolic curve, scale correctly based on `normal` vs `crit` vs `heal`, fade out, and recycle from pool without DOM/GUI element leakage.
   - Enemies pulse white for 100ms upon damage and reliably restore their original emissive properties.
   - Critical hits pause the engine render loop for 60-70ms without causing render loop duplication or stutter.
3. **Audio Bus & Ducking Auditing**:
   - AudioContext resumes seamlessly after user click/keypress.
   - Master/Music/SFX/UI buses correctly map logarithmic decibels (`-6 dB` -> `0.5` gain).
   - Sidechain ducking temporarily dips music bus level by `-10 dB` to `-12 dB` on heavy impacts and smoothly restores volume over `300ms`.
