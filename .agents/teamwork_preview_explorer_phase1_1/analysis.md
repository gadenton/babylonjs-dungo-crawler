# Phase 1 Technical Analysis: Engine Infrastructure & Asset Pipeline

## 1. Executive Summary
This document provides the exact technical specification for Phase 1 Engine Infrastructure and Package/Asset Setup for the Babylon.js Dungeon Crawler ARPG project. It details dependency management via `pnpm`, asset pipeline copy scripts for Kenney 3D GLB models, the complete architecture and implementation spec for `src/core/Engine.ts`, and the entry point bootstrapper `src/index.ts`.

---

## 2. Dependency Infrastructure & Package Setup

### 2.1 Current State Analysis
Existing `package.json` contains:
```json
{
  "name": "babylonjs-dungo-crawler",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@babylonjs/core": "^9.0.0",
    "@babylonjs/loaders": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^6.0.0"
  }
}
```

### 2.2 Required Package Additions
To support Phase 1 and subsequent phases, the following packages must be added via `pnpm`:
1. `@babylonjs/gui@^9.0.0`: Event-driven UI system for HUD, talent trees, inventory UI, health/mana globes, and input prompt swapping.
2. `recast-navigation-js`: WebAssembly/JavaScript port of Recast & Detour navigation mesh library for click-to-move pathfinding.

### 2.3 Command Execution Spec
Run the following terminal command from the project root (`c:\Users\greg_\source\babylonjs-dungo-crawler`):

```bash
pnpm add @babylonjs/gui@^9.0.0 recast-navigation-js
```

### 2.4 Expected `package.json` Output
```json
  "dependencies": {
    "@babylonjs/core": "^9.0.0",
    "@babylonjs/gui": "^9.0.0",
    "@babylonjs/loaders": "^9.0.0",
    "recast-navigation-js": "^0.36.1"
  }
```

---

## 3. Asset Pipeline & PowerShell Copy Script

### 3.1 Source Asset Mapping
Source directory on host machine: `C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0\3D assets`

Mapping to project public assets directory (`public/assets/`):

| Target Folder | Kenney Source Directory | Contents |
|---|---|---|
| `public/assets/dungeon/` | `Modular Dungeon Kit\Models\GLB format\` | GLB tiles (rooms, corridors, walls, floors) + `Textures/colormap.png` |
| `public/assets/cave/` | `Modular Cave Kit\Models\GLB format\` | GLB cave tiles (walls, floors, entrances) + `Textures/colormap.png` |
| `public/assets/weapons/` | `Weapon Pack\Models\GLTF format\` | GLB weapon models (swords, pistols, shotguns, etc.) |
| `public/assets/characters/` | `Mini Characters\Models\GLB format\` & `Mini Dungeon\Models\GLB format\character-*.glb` | Character GLBs + character textures |
| `public/assets/props/` | `Mini Dungeon\Models\GLB format\` | Props (chest, barrel, coin, banner, trap, column, rocks) + `Textures/` |

### 3.2 Automated PowerShell Asset Copy Script
Execute the following PowerShell script from `c:\Users\greg_\source\babylonjs-dungo-crawler`:

```powershell
# Define base paths
$assetBase = "C:\Users\greg_\source\Kenney Game Assets All-in-1 3.6.0\3D assets"
$destBase = "public\assets"

# 1. Create target directories if they do not exist
New-Item -ItemType Directory -Force -Path "$destBase\dungeon"
New-Item -ItemType Directory -Force -Path "$destBase\cave"
New-Item -ItemType Directory -Force -Path "$destBase\weapons"
New-Item -ItemType Directory -Force -Path "$destBase\characters"
New-Item -ItemType Directory -Force -Path "$destBase\props"

# 2. Copy Modular Dungeon Kit GLB models & textures
Copy-Item -Path "$assetBase\Modular Dungeon Kit\Models\GLB format\*" -Destination "$destBase\dungeon\" -Recurse -Force

# 3. Copy Modular Cave Kit GLB models & textures
Copy-Item -Path "$assetBase\Modular Cave Kit\Models\GLB format\*" -Destination "$destBase\cave\" -Recurse -Force

# 4. Copy Weapon Pack GLB models
Copy-Item -Path "$assetBase\Weapon Pack\Models\GLTF format\*.glb" -Destination "$destBase\weapons\" -Force

# 5. Copy Characters (Mini Characters GLBs & Mini Dungeon character GLBs)
Copy-Item -Path "$assetBase\Mini Characters\Models\GLB format\*.glb" -Destination "$destBase\characters\" -Force
Copy-Item -Path "$assetBase\Mini Characters\Models\GLB format\Textures" -Destination "$destBase\characters\Textures" -Recurse -Force
Copy-Item -Path "$assetBase\Mini Dungeon\Models\GLB format\character-*.glb" -Destination "$destBase\characters\" -Force

# 6. Copy Props (Mini Dungeon prop GLBs & textures)
Copy-Item -Path "$assetBase\Mini Dungeon\Models\GLB format\*.glb" -Destination "$destBase\props\" -Force
Copy-Item -Path "$assetBase\Mini Dungeon\Models\GLB format\Textures" -Destination "$destBase\props\Textures" -Recurse -Force
```

---

## 4. `src/core/Engine.ts` Technical Specification

### 4.1 Class Responsibilities
`src/core/Engine.ts` encapsulates the lifecycle of Babylon's `Engine` and `Scene` instances:
- Canvas element binding (`#renderCanvas`).
- Engine options (hardware acceleration, antialiasing, stencil buffer, drawing buffer preservation).
- Scene setup with depth buffer, collision flag activation (`collisionsEnabled = true`), and ambient scene styling.
- Hemispheric ambient light setup (`ambientLight`).
- Directional light setup (`directionalLight`) with shadow generation hook.
- Continuous render loop (`engine.runRenderLoop`).
- Responsive resize handling via `ResizeObserver` and window event listener.
- Full disposal cleanup (`dispose()`) preventing webgl context leaks.

### 4.2 Code Implementation Spec (`src/core/Engine.ts`)

```typescript
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
        this.scene.render();
      }
    });
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
```

---

## 5. `src/index.ts` Technical Specification

### 5.1 Bootstrapper Responsibilities
- Query `#renderCanvas` element from `index.html`.
- Instantiate `GameEngine` class.
- Attach window lifecycle handlers (`beforeunload` -> `dispose`).
- Log engine startup status.

### 5.2 Code Implementation Spec (`src/index.ts`)

```typescript
import { GameEngine } from "./core/Engine";

function bootstrap(): void {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

  if (!canvas) {
    console.error("Failed to find #renderCanvas element in DOM.");
    return;
  }

  const gameEngine = new GameEngine({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    stencil: true,
  });

  // Handle window unload cleanup
  window.addEventListener("beforeunload", () => {
    gameEngine.dispose();
  });

  console.log("GameEngine initialized successfully.");
}

// Start application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
```

---

## 6. Verification and Acceptance Matrix

| Item | Verification Step | Command / Inspection | Expected Result |
|---|---|---|---|
| Package Setup | Run `pnpm add @babylonjs/gui@^9.0.0 recast-navigation-js` | `pnpm list` | `@babylonjs/gui` and `recast-navigation-js` present in `node_modules` |
| Asset Pipeline | Run PowerShell asset copy script | `Test-Path public/assets/dungeon/corridor.glb` | Returns `True` for GLBs in all 5 folders |
| Engine Build | Run TypeScript check | `npx tsc --noEmit` | Zero syntax or type errors |
| Vite Build | Run production bundle | `pnpm run build` | Dist assets emitted successfully in `dist/` |
