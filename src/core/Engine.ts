import { Engine as BabylonEngine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

// Side-effect imports for loaders, materials, and scene helpers
import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import "@babylonjs/core/Collisions/collisionCoordinator";
import "@babylonjs/loaders/glTF";

export interface GameEngineOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private engine: BabylonEngine;
  private scene: Scene;
  private ambientLight: HemisphericLight;
  private directionalLight: DirectionalLight;
  private shadowGenerator: ShadowGenerator | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isDisposed: boolean = false;
  private renderLoopCallback: (() => void) | null = null;

  constructor(options: GameEngineOptions) {
    this.canvas = options.canvas;

    // 1. Initialize Babylon Engine
    this.engine = new BabylonEngine(this.canvas, options.antialias ?? true, {
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
      stencil: options.stencil ?? true,
      adaptToDeviceRatio: true,
    });

    // 2. Initialize Babylon Scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1.0); // Dark dungeon atmosphere
    this.scene.collisionsEnabled = true;

    // 3. Setup Hemispheric Ambient Light
    this.ambientLight = new HemisphericLight(
      "ambientLight",
      new Vector3(0, 1, 0),
      this.scene
    );
    this.ambientLight.intensity = 0.45;
    this.ambientLight.diffuse = new Color3(0.9, 0.9, 1.0);
    this.ambientLight.groundColor = new Color3(0.15, 0.15, 0.2);

    // 4. Setup Directional Main Light (Sun/Key Light)
    this.directionalLight = new DirectionalLight(
      "directionalLight",
      new Vector3(-1, -2, -1).normalize(),
      this.scene
    );
    this.directionalLight.position = new Vector3(20, 40, 20);
    this.directionalLight.intensity = 0.85;
    this.directionalLight.diffuse = new Color3(1.0, 0.95, 0.85);

    // 5. Setup Shadow Generator Hook
    this.shadowGenerator = new ShadowGenerator(1024, this.directionalLight);
    this.shadowGenerator.useExponentialShadowMap = true;
    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;

    // 6. Start Render Loop
    this.startRenderLoop();

    // 7. Setup Resize Handlers
    this.setupResizeObserver();
  }

  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      if (!this.isDisposed && this.scene) {
        if (this.renderLoopCallback) {
          this.renderLoopCallback();
        }
        this.scene.render();
      }
    });
  }

  public setRenderLoopCallback(callback: () => void): void {
    this.renderLoopCallback = callback;
  }

  private setupResizeObserver(): void {
    const handleResize = () => {
      if (!this.isDisposed && this.engine) {
        this.engine.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver !== "undefined" && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  // Getters
  public getEngine(): BabylonEngine {
    return this.engine;
  }

  public getScene(): Scene {
    return this.scene;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getAmbientLight(): HemisphericLight {
    return this.ambientLight;
  }

  public getDirectionalLight(): DirectionalLight {
    return this.directionalLight;
  }

  public getShadowGenerator(): ShadowGenerator | null {
    return this.shadowGenerator;
  }

  // Disposal cleanup
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
