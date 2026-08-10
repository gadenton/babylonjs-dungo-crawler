import { GameEngine } from "./core/Engine";
import { InputManager } from "./core/InputManager";
import { CameraRig } from "./camera/CameraRig";
import { Player } from "./entities/Player";
import { Generator } from "./dungeon/Generator";
import { TileMap } from "./dungeon/TileMap";
import { NavMeshManager } from "./dungeon/NavMeshManager";
async function bootstrap() {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) {
        console.error("Failed to find #renderCanvas element in DOM.");
        return;
    }
    // 1. Initialize Core Game Engine & Scene
    const gameEngine = new GameEngine({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        stencil: true,
    });
    const scene = gameEngine.getScene();
    // 2. Initialize Subsystems
    const inputManager = new InputManager(scene);
    const cameraRig = new CameraRig(scene, {
        pitchDegrees: 45,
        yawDegrees: 45,
        distance: 22.0,
        followRate: 10.0,
        lookAheadDist: 3.5,
    });
    const player = new Player("p1", scene);
    // 3. Generate Dungeon Level (40x40 Grid)
    const generator = new Generator({ width: 40, height: 40 });
    const dungeonGrid = generator.generate();
    // 4. Build Merged Dungeon TileMap Meshes
    const tileMap = new TileMap(scene);
    const builtDungeon = await tileMap.buildFromGrid(dungeonGrid);
    // 5. Build Recast NavMesh over merged floor geometry
    const navMeshManager = new NavMeshManager();
    await navMeshManager.init();
    if (builtDungeon.mergedFloors) {
        await navMeshManager.createNavMesh(builtDungeon.mergedFloors);
        navMeshManager.createDebugMesh(scene);
    }
    // 6. Position Player at Start Stairs Position
    player.transformNode.position = builtDungeon.spawnPoint.clone();
    // 7. Wire Navigation and Input
    player.setNavMeshManager(navMeshManager);
    player.setInputManager(inputManager);
    cameraRig.attachToTarget(player.transformNode);
    // Add shadow caster hook for player
    const shadowGen = gameEngine.getShadowGenerator();
    if (shadowGen) {
        shadowGen.addShadowCaster(player.getMesh());
    }
    // 8. Update Loop Setup
    gameEngine.setRenderLoopCallback(() => {
        const deltaTime = gameEngine.getEngine().getDeltaTime() / 1000.0;
        if (deltaTime <= 0)
            return;
        inputManager.update(deltaTime);
        player.update(deltaTime);
        cameraRig.update(deltaTime, player.getVelocity(), player.getFacingDirection());
    });
    // 9. Window Lifecycle Cleanup
    window.addEventListener("beforeunload", () => {
        navMeshManager.dispose();
        tileMap.dispose();
        inputManager.dispose();
        player.dispose();
        cameraRig.dispose();
        gameEngine.dispose();
    });
    console.log("Babylon.js Dungeon Crawler Phase 2 (Procedural Dungeon & NavMesh) initialized successfully.");
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        bootstrap().catch((err) => console.error("Bootstrap error:", err));
    });
}
else {
    bootstrap().catch((err) => console.error("Bootstrap error:", err));
}
//# sourceMappingURL=index.js.map