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
import "@babylonjs/loaders/glTF";
export class GameEngine {
    constructor(options) {
        this.shadowGenerator = null;
        this.resizeObserver = null;
        this.isDisposed = false;
        this.renderLoopCallback = null;
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
        this.ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), this.scene);
        this.ambientLight.intensity = 0.45;
        this.ambientLight.diffuse = new Color3(0.9, 0.9, 1.0);
        this.ambientLight.groundColor = new Color3(0.15, 0.15, 0.2);
        // 4. Setup Directional Main Light (Sun/Key Light)
        this.directionalLight = new DirectionalLight("directionalLight", new Vector3(-1, -2, -1).normalize(), this.scene);
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
    startRenderLoop() {
        this.engine.runRenderLoop(() => {
            if (!this.isDisposed && this.scene) {
                if (this.renderLoopCallback) {
                    this.renderLoopCallback();
                }
                this.scene.render();
            }
        });
    }
    setRenderLoopCallback(callback) {
        this.renderLoopCallback = callback;
    }
    setupResizeObserver() {
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
    getEngine() {
        return this.engine;
    }
    getScene() {
        return this.scene;
    }
    getCanvas() {
        return this.canvas;
    }
    getAmbientLight() {
        return this.ambientLight;
    }
    getDirectionalLight() {
        return this.directionalLight;
    }
    getShadowGenerator() {
        return this.shadowGenerator;
    }
    // Disposal cleanup
    dispose() {
        if (this.isDisposed)
            return;
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
//# sourceMappingURL=Engine.js.map