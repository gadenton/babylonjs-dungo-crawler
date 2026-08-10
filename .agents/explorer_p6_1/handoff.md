# Phase 6 Handoff Report — Visual Pipeline Exploration (`DefaultRenderingPipeline`, SSAO2, Bloom, ACES ToneMapping)

## 1. Observation

### 1.1 Existing Architecture & File Inspection
* **`src/core/Engine.ts`** (Lines 24-79):
  ```typescript
  // Line 39-48
  this.engine = new BabylonEngine(this.canvas, options.antialias ?? true, {
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
    stencil: options.stencil ?? true,
    adaptToDeviceRatio: true,
  });
  this.scene = new Scene(this.engine);
  this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1.0);

  // Line 51-74
  this.ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), this.scene);
  this.directionalLight = new DirectionalLight("directionalLight", new Vector3(-1, -2, -1).normalize(), this.scene);
  this.shadowGenerator = new ShadowGenerator(1024, this.directionalLight);
  ```
* **`src/camera/CameraRig.ts`** (Lines 54-60):
  ```typescript
  this.camera = new TargetCamera("isometricCamera", Vector3.Zero(), this.scene);
  this.scene.activeCamera = this.camera;
  ```
  Exposes getter `public getCamera(): TargetCamera`.
* **`src/index.ts`** (Lines 28-48 & 284-301):
  - `GameEngine` is constructed at line 29 before `CameraRig` (line 41).
  - No existing post-processing or rendering pipeline references exist anywhere in `src/` (confirmed via codebase grep search for `Pipeline`).
  - TypeScript build check (`npx tsc --noEmit`) passes cleanly with 0 errors.

### 1.2 Babylon.js Pipeline APIs Inspected
From `@babylonjs/core` type definitions (`defaultRenderingPipeline.pure.d.ts`, `ssao2RenderingPipeline.pure.d.ts`, `imageProcessingConfiguration.pure.d.ts`):
* **`DefaultRenderingPipeline`**:
  - Module path: `@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline`
  - Constructor: `new DefaultRenderingPipeline(name: string, hdr: boolean, scene: Scene, cameras?: Camera[])`
  - Key properties: `bloomEnabled`, `bloomThreshold`, `bloomWeight`, `bloomKernel`, `bloomScale`, `fxaaEnabled`, `samples` (MSAA), `imageProcessingEnabled`, `imageProcessing.toneMappingEnabled`, `imageProcessing.toneMappingType`, `imageProcessing.exposure`, `imageProcessing.contrast`, `imageProcessing.vignetteEnabled`, `imageProcessing.vignetteWeight`.
* **`SSAO2RenderingPipeline`**:
  - Module path: `@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline`
  - Constructor: `new SSAO2RenderingPipeline(name: string, scene: Scene, ratio: any, cameras?: Camera[])`
  - Key properties: `radius`, `totalStrength`, `base`, `maxZ`, `samples`, `expensiveBlur`, `bilateralSamples`.
* **`ImageProcessingConfiguration`**:
  - Module path: `@babylonjs/core/Materials/imageProcessingConfiguration`
  - Key constant: `ImageProcessingConfiguration.TONEMAPPING_ACES = 1`.

---

## 2. Logic Chain

1. **Instantiation Strategy**:
   - `GameEngine` in `src/core/Engine.ts` handles canvas lifecycle, WebGL engine initialization, scene management, ambient lighting, and directional shadow maps. At `GameEngine` construction time in `src/index.ts`, `CameraRig` has not been instantiated yet.
   - Post-processing rendering pipelines in Babylon.js require an active camera to attach post-process shaders to.
   - Creating a dedicated rendering module **`src/rendering/VisualPipelineManager.ts`** adheres to the Single Responsibility Principle (SRP), separating engine low-level infrastructure from high-level visual post-processing configuration and graphics presets.

2. **Pipeline Configuration Rationale**:
   - **HDR Framebuffers (`hdr = true`)**: Essential for proper Bloom thresholds and ACES Tone Mapping color reconstruction.
   - **Bloom**: Emissive skills, glowing loot drops, and critical hit flashes pop visually when bloom is configured with threshold `0.65`, weight `0.45`, kernel `64`, scale `0.5`.
   - **ACES Tone Mapping**: Maps wide high-dynamic-range lighting calculations into rich, vibrant SDR output without oversaturating highlights or crushing dungeon shadows (`exposure: 1.05`, `contrast: 1.1`).
   - **Vignette**: Subtle edge darkening (`vignetteWeight: 1.5`) enhances isometric dungeon atmospheric depth.
   - **SSAO2**: Screen-Space Ambient Occlusion v2 adds contact shadows in tile corners, under character feet, and along wall bases (`radius: 2.0`, `totalStrength: 1.2`, `samples: 16`, `ssaoRatio: 0.5`).
   - **Anti-Aliasing**: Combining FXAA (`fxaaEnabled = true`) with 4x MSAA (`samples = 4`) yields smooth geometric edges on isometric dungeon tiles.

3. **Graphics Quality Presets & Runtime Flexibility**:
   - High-end post-processing (especially SSAO2 and Bloom) can impact frame rates on low-end integrated GPUs.
   - `VisualPipelineManager` will provide built-in presets (`low`, `medium`, `high`, `ultra`) and runtime toggle methods (`setPreset`, `setSSAOEnabled`, `setBloomEnabled`, `setToneMappingEnabled`), allowing seamless integration with graphics UI toggles or hotkeys.

---

## 3. Caveats

* **Hardware & WebGL Capability Fallback**: On hardware that does not support floating point render targets or WebGL2 depth extensions, `SSAO2RenderingPipeline.IsSupported` should be checked before enabling SSAO2 to prevent shader compilation warnings.
* **Camera Detachment/Reattachment**: If the scene camera is re-created at runtime, `VisualPipelineManager.attachCamera(camera)` must be called to re-bind pipeline post-processes to the new camera instance.

---

## 4. Conclusion & Technical Specifications for Worker

### Recommendation
Create **`src/rendering/VisualPipelineManager.ts`** and integrate it into **`src/index.ts`** following the exact technical specification below.

### 4.1 `src/rendering/VisualPipelineManager.ts` Implementation Specification

```typescript
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";

export type GraphicsPreset = "low" | "medium" | "high" | "ultra";

export interface VisualPipelineConfig {
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomWeight: number;
  bloomKernel: number;
  bloomScale: number;
  toneMappingEnabled: boolean;
  toneMappingType: number; // ImageProcessingConfiguration.TONEMAPPING_ACES
  exposure: number;
  contrast: number;
  vignetteEnabled: boolean;
  vignetteWeight: number;
  ssaoEnabled: boolean;
  ssaoRadius: number;
  ssaoStrength: number;
  ssaoSamples: number;
  fxaaEnabled: boolean;
  msaaSamples: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsPreset, VisualPipelineConfig> = {
  low: {
    bloomEnabled: false,
    bloomThreshold: 0.8,
    bloomWeight: 0.3,
    bloomKernel: 32,
    bloomScale: 0.5,
    toneMappingEnabled: true,
    toneMappingType: ImageProcessingConfiguration.TONEMAPPING_ACES,
    exposure: 1.0,
    contrast: 1.0,
    vignetteEnabled: false,
    vignetteWeight: 1.0,
    ssaoEnabled: false,
    ssaoRadius: 1.5,
    ssaoStrength: 1.0,
    ssaoSamples: 8,
    fxaaEnabled: false,
    msaaSamples: 1,
  },
  medium: {
    bloomEnabled: true,
    bloomThreshold: 0.7,
    bloomWeight: 0.35,
    bloomKernel: 48,
    bloomScale: 0.5,
    toneMappingEnabled: true,
    toneMappingType: ImageProcessingConfiguration.TONEMAPPING_ACES,
    exposure: 1.0,
    contrast: 1.05,
    vignetteEnabled: true,
    vignetteWeight: 1.2,
    ssaoEnabled: false,
    ssaoRadius: 1.8,
    ssaoStrength: 1.1,
    ssaoSamples: 12,
    fxaaEnabled: true,
    msaaSamples: 2,
  },
  high: {
    bloomEnabled: true,
    bloomThreshold: 0.65,
    bloomWeight: 0.45,
    bloomKernel: 64,
    bloomScale: 0.5,
    toneMappingEnabled: true,
    toneMappingType: ImageProcessingConfiguration.TONEMAPPING_ACES,
    exposure: 1.05,
    contrast: 1.1,
    vignetteEnabled: true,
    vignetteWeight: 1.5,
    ssaoEnabled: true,
    ssaoRadius: 2.0,
    ssaoStrength: 1.2,
    ssaoSamples: 16,
    fxaaEnabled: true,
    msaaSamples: 4,
  },
  ultra: {
    bloomEnabled: true,
    bloomThreshold: 0.6,
    bloomWeight: 0.55,
    bloomKernel: 64,
    bloomScale: 1.0,
    toneMappingEnabled: true,
    toneMappingType: ImageProcessingConfiguration.TONEMAPPING_ACES,
    exposure: 1.1,
    contrast: 1.15,
    vignetteEnabled: true,
    vignetteWeight: 1.8,
    ssaoEnabled: true,
    ssaoRadius: 2.5,
    ssaoStrength: 1.4,
    ssaoSamples: 32,
    fxaaEnabled: true,
    msaaSamples: 8,
  },
};

export class VisualPipelineManager {
  private scene: Scene;
  private camera: Camera;
  private defaultPipeline: DefaultRenderingPipeline | null = null;
  private ssao2Pipeline: SSAO2RenderingPipeline | null = null;
  private currentPreset: GraphicsPreset = "high";

  constructor(scene: Scene, camera: Camera, initialPreset: GraphicsPreset = "high") {
    this.scene = scene;
    this.camera = camera;
    this.applyPreset(initialPreset);
  }

  public applyPreset(preset: GraphicsPreset): void {
    this.currentPreset = preset;
    const config = GRAPHICS_PRESETS[preset];
    this.configurePipeline(config);
  }

  public configurePipeline(config: VisualPipelineConfig): void {
    // 1. Dispose existing pipelines to prevent memory / post-process leaks
    this.disposePipelines();

    // 2. Initialize DefaultRenderingPipeline (Bloom, Tone Mapping, Vignette, FXAA, MSAA)
    this.defaultPipeline = new DefaultRenderingPipeline(
      "defaultRenderingPipeline",
      true, // HDR enabled
      this.scene,
      [this.camera]
    );

    // Bloom Configuration
    this.defaultPipeline.bloomEnabled = config.bloomEnabled;
    if (config.bloomEnabled) {
      this.defaultPipeline.bloomThreshold = config.bloomThreshold;
      this.defaultPipeline.bloomWeight = config.bloomWeight;
      this.defaultPipeline.bloomKernel = config.bloomKernel;
      this.defaultPipeline.bloomScale = config.bloomScale;
    }

    // Image Processing & ACES Tone Mapping
    this.defaultPipeline.imageProcessingEnabled = config.toneMappingEnabled || config.vignetteEnabled;
    if (this.defaultPipeline.imageProcessing) {
      this.defaultPipeline.imageProcessing.toneMappingEnabled = config.toneMappingEnabled;
      if (config.toneMappingEnabled) {
        this.defaultPipeline.imageProcessing.toneMappingType = config.toneMappingType;
        this.defaultPipeline.imageProcessing.exposure = config.exposure;
        this.defaultPipeline.imageProcessing.contrast = config.contrast;
      }

      // Vignette
      this.defaultPipeline.imageProcessing.vignetteEnabled = config.vignetteEnabled;
      if (config.vignetteEnabled) {
        this.defaultPipeline.imageProcessing.vignetteWeight = config.vignetteWeight;
        this.defaultPipeline.imageProcessing.vignetteStretch = 0.5;
      }
    }

    // Anti-Aliasing
    this.defaultPipeline.fxaaEnabled = config.fxaaEnabled;
    this.defaultPipeline.samples = config.msaaSamples;

    // 3. Initialize SSAO2RenderingPipeline (Screen-Space Ambient Occlusion v2)
    if (config.ssaoEnabled && SSAO2RenderingPipeline.IsSupported) {
      this.ssao2Pipeline = new SSAO2RenderingPipeline(
        "ssao2RenderingPipeline",
        this.scene,
        { ssaoRatio: config.bloomScale, blurRatio: 1.0 },
        [this.camera]
      );

      this.ssao2Pipeline.radius = config.ssaoRadius;
      this.ssao2Pipeline.totalStrength = config.ssaoStrength;
      this.ssao2Pipeline.base = 0.15;
      this.ssao2Pipeline.maxZ = 100.0;
      this.ssao2Pipeline.samples = config.ssaoSamples;
      this.ssao2Pipeline.expensiveBlur = true;
      this.ssao2Pipeline.bilateralSamples = 16;
    }
  }

  // Preset & Individual Toggles
  public setPreset(preset: GraphicsPreset): void {
    this.applyPreset(preset);
  }

  public getPreset(): GraphicsPreset {
    return this.currentPreset;
  }

  public setBloomEnabled(enabled: boolean): void {
    if (this.defaultPipeline) {
      this.defaultPipeline.bloomEnabled = enabled;
    }
  }

  public setSSAOEnabled(enabled: boolean): void {
    if (enabled && !this.ssao2Pipeline && SSAO2RenderingPipeline.IsSupported) {
      const config = GRAPHICS_PRESETS[this.currentPreset];
      this.ssao2Pipeline = new SSAO2RenderingPipeline(
        "ssao2RenderingPipeline",
        this.scene,
        { ssaoRatio: 0.5, blurRatio: 1.0 },
        [this.camera]
      );
      this.ssao2Pipeline.radius = config.ssaoRadius;
      this.ssao2Pipeline.totalStrength = config.ssaoStrength;
      this.ssao2Pipeline.base = 0.15;
      this.ssao2Pipeline.samples = config.ssaoSamples;
    } else if (!enabled && this.ssao2Pipeline) {
      this.ssao2Pipeline.dispose();
      this.ssao2Pipeline = null;
    }
  }

  public getDefaultPipeline(): DefaultRenderingPipeline | null {
    return this.defaultPipeline;
  }

  public getSSAO2Pipeline(): SSAO2RenderingPipeline | null {
    return this.ssao2Pipeline;
  }

  private disposePipelines(): void {
    if (this.ssao2Pipeline) {
      this.ssao2Pipeline.dispose();
      this.ssao2Pipeline = null;
    }
    if (this.defaultPipeline) {
      this.defaultPipeline.dispose();
      this.defaultPipeline = null;
    }
  }

  public dispose(): void {
    this.disposePipelines();
  }
}
```

### 4.2 `src/index.ts` Integration Specification

1. **Import VisualPipelineManager**:
   ```typescript
   import { VisualPipelineManager } from "./rendering/VisualPipelineManager";
   ```

2. **Instantiation after Camera Setup**:
   ```typescript
   // 2. Initialize Subsystems
   ...
   const cameraRig = new CameraRig(scene, ...);
   ...
   const visualPipelineManager = new VisualPipelineManager(
     scene,
     cameraRig.getCamera(),
     "high"
   );
   ```

3. **Keybinding for Quick Quality Toggle (F9 / KeyP)**:
   ```typescript
   window.addEventListener("keydown", (e: KeyboardEvent) => {
     if (e.code === "F9") {
       const presets: GraphicsPreset[] = ["low", "medium", "high", "ultra"];
       const current = visualPipelineManager.getPreset();
       const nextIndex = (presets.indexOf(current) + 1) % presets.length;
       visualPipelineManager.setPreset(presets[nextIndex]);
       console.log(`Graphics quality preset changed to: ${presets[nextIndex]}`);
     }
     ...
   });
   ```

4. **Cleanup in `beforeunload` Listener**:
   ```typescript
   window.addEventListener("beforeunload", () => {
     ...
     visualPipelineManager.dispose();
     ...
   });
   ```

---

## 5. Verification Method

1. **Type Safety & Build Verification**:
   - Run `npx tsc --noEmit` from project root — verify 0 TypeScript compilation errors.
   - Run `npm run build` — verify Vite production bundle succeeds without warnings.

2. **Visual Inspection Verification**:
   - Launch `npm run dev` and open in browser.
   - Confirm ACES tone mapping produces vibrant contrast between dark dungeon tiles and lit areas.
   - Confirm Bloom creates soft glowing aura around player skills, health/mana globes, and critical hit text.
   - Confirm SSAO2 adds realistic contact shadows along wall bottoms and floor junctions.
   - Press `F9` to cycle presets (`low` -> `medium` -> `high` -> `ultra`) and confirm smooth transition without shader crashes or rendering artifacts.
