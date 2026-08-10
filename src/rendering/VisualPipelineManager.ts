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
  toneMappingType: number;
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
    this.disposePipelines();

    try {
      this.defaultPipeline = new DefaultRenderingPipeline(
        "defaultRenderingPipeline",
        true, // HDR enabled
        this.scene,
        [this.camera]
      );

      // Bloom
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
    } catch (err) {
      console.warn("[VisualPipelineManager] DefaultRenderingPipeline init warning (headless or unsupported):", err);
    }

    // SSAO2
    if (config.ssaoEnabled) {
      this.createSSAO2Pipeline(config);
    }
  }

  private createSSAO2Pipeline(config: VisualPipelineConfig): void {
    try {
      if (SSAO2RenderingPipeline.IsSupported) {
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
    } catch (err) {
      console.warn("[VisualPipelineManager] SSAO2RenderingPipeline init warning:", err);
    }
  }

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
    if (enabled) {
      if (!this.ssao2Pipeline) {
        const config = GRAPHICS_PRESETS[this.currentPreset];
        this.createSSAO2Pipeline(config);
      }
    } else {
      if (this.ssao2Pipeline) {
        this.ssao2Pipeline.dispose();
        this.ssao2Pipeline = null;
      }
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
      try {
        this.ssao2Pipeline.dispose();
      } catch {}
      this.ssao2Pipeline = null;
    }
    if (this.defaultPipeline) {
      try {
        this.defaultPipeline.dispose();
      } catch {}
      this.defaultPipeline = null;
    }
  }

  public dispose(): void {
    this.disposePipelines();
  }
}
