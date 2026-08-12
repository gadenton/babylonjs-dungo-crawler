import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameEngine } from "./core/Engine";
import { InputManager } from "./core/InputManager";
import { CameraRig } from "./camera/CameraRig";
import { Player } from "./entities/Player";
import { Enemy } from "./entities/Enemy";
import { Generator } from "./dungeon/Generator";
import { TileMap } from "./dungeon/TileMap";
import { NavMeshManager } from "./dungeon/NavMeshManager";
import { DamageSystem, DamageAppliedEvent } from "./combat/DamageSystem";
import { JuiceOverlay } from "./ui/JuiceOverlay";
import { AudioManager } from "./audio/AudioManager";
import { TownHubAltar } from "./entities/TownHubAltar";
import { DungeonPortal } from "./entities/DungeonPortal";
import { TownHub, BuiltTownHub } from "./town/TownHub";
import { TalentUI } from "./ui/TalentUI";
import { ArchetypeUI } from "./ui/ArchetypeUI";
import { InventoryUI } from "./ui/InventoryUI";
import { SaveLoadUI } from "./ui/SaveLoadUI";
import { HUD } from "./ui/HUD";
import { MapOverlay } from "./ui/MapOverlay";
import { DungeonPortalUI } from "./ui/DungeonPortalUI";
import { MainMenuUI } from "./ui/MainMenuUI";
import { ClassSelectUI } from "./ui/ClassSelectUI";
import { SettingsUI } from "./ui/SettingsUI";
import { PauseMenuUI } from "./ui/PauseMenuUI";
import { GameStateManager } from "./core/GameStateManager";
import { LootDrop } from "./entities/LootDrop";
import { VisualPipelineManager, GraphicsPreset } from "./rendering/VisualPipelineManager";
import { SaveManager } from "./persistence/SaveManager";

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const statusEl = document.getElementById("loadingStatus");
  const errorEl = document.getElementById("loadingError");
  const overlayEl = document.getElementById("loadingOverlay");

  const setStatus = (msg: string) => {
    console.log(`[Bootstrap] ${msg}`);
    if (statusEl) statusEl.innerText = msg;
  };

  const showError = (msg: string) => {
    console.error(`[Bootstrap Error] ${msg}`);
    if (errorEl) {
      errorEl.innerText = msg;
      errorEl.style.display = "block";
    }
  };

  try {
    // 1. Initialize Engine & Scene
    setStatus("1/8 Initializing WebGL Engine & Scene...");
    const gameEngine = new GameEngine({
      canvas,
      antialias: true,
      stencil: true,
    });
    const scene = gameEngine.getScene();

    // 2. Initialize Subsystems
    setStatus("2/8 Initializing Audio, Input & Camera Systems...");
    const audioManager = new AudioManager();
    const juiceOverlay = new JuiceOverlay(scene);
    const inputManager = new InputManager(scene);
    const cameraRig = new CameraRig(scene, {
      pitchDegrees: 45,
      yawDegrees: 45,
      distance: 22.0,
      followRate: 10.0,
      lookAheadDist: 3.5,
    });
    const player = new Player("p1", scene);

    // 3. Initialize Visual Post-Processing Pipeline
    setStatus("3/8 Initializing Visual Pipeline...");
    const visualPipelineManager = new VisualPipelineManager(
      scene,
      cameraRig.getCamera(),
      "high"
    );

    // 4. State Tracking & Shadow Generator
    const shadowGen = gameEngine.getShadowGenerator();

    let inDungeon = false;
    let tileMap: TileMap | null = null;
    let navMeshManager: NavMeshManager | null = null;
    const enemies: Enemy[] = [];
    const activeLootDrops: LootDrop[] = [];

    let townHub: TownHub | null = null;
    let builtTown: BuiltTownHub | null = null;
    let townHubAltar: TownHubAltar | null = null;
    let dungeonPortal: DungeonPortal | null = null;

    const getCurrentZone = () => (inDungeon ? ("dungeon" as const) : ("town_hub" as const));
    const getDungeonFloor = () => 1;

    // Helper functions to build & dispose Town Hub
    const disposeTownHub = () => {
      if (dungeonPortal) {
        dungeonPortal.dispose();
        dungeonPortal = null;
      }
      if (townHubAltar) {
        townHubAltar.dispose();
        townHubAltar = null;
      }
      if (townHub) {
        townHub.dispose();
        townHub = null;
      }
      builtTown = null;
    };

    // 5. Build Static Town Hub Plaza
    setStatus("4/8 Building Static Town Hub Plaza...");
    const buildTownHub = async (): Promise<BuiltTownHub> => {
      if (townHub && builtTown) return builtTown;
      townHub = new TownHub(scene);
      console.time("[Index] TownHub build");
      const result = await townHub.build();
      console.timeEnd("[Index] TownHub build");
      builtTown = result;
      townHubAltar = result.altar;

      dungeonPortal = new DungeonPortal("dungeonPortal", scene, result.portalPosition);

      dungeonPortal.onInteract.add(() => {
        dungeonPortalUI.show();
      });

      if (townHubAltar) {
        townHubAltar.onInteract.add(() => {
          archetypeUI.toggle();
        });
      }

      if (shadowGen && townHubAltar) {
        shadowGen.addShadowCaster(townHubAltar.mesh);
      }

      return result;
    };

    // 6. Wire UI Overlays
    setStatus("5/8 Wiring UI Overlays & Menu Systems...");
    const gameStateManager = new GameStateManager("MAIN_MENU");

    const talentUI = new TalentUI(scene, player.talentTree, inputManager);
    const archetypeUI = new ArchetypeUI(scene, player, inputManager, audioManager);
    const inventoryUI = new InventoryUI(scene, player, inputManager);
    const saveLoadUI = new SaveLoadUI(scene, player, inputManager, getCurrentZone, getDungeonFloor);
    const hud = new HUD(scene, player, inputManager);
    const mapOverlay = new MapOverlay(scene, player);
    const dungeonPortalUI = new DungeonPortalUI(scene);

    const mainMenuUI = new MainMenuUI(scene, audioManager, inputManager);
    const classSelectUI = new ClassSelectUI(scene, audioManager, inputManager);
    const settingsUI = new SettingsUI(scene, audioManager, visualPipelineManager, inputManager);
    const pauseMenuUI = new PauseMenuUI(scene, audioManager, inputManager);

    // Initial State: Main Menu active, HUD hidden
    hud.setVisible(false);
    mainMenuUI.show();

    // Main Menu Observables
    mainMenuUI.onContinueRequested.add((slotId) => {
      SaveManager.load(slotId, player);
      mainMenuUI.hide();
      hud.setVisible(true);
      gameStateManager.setState("TOWN_HUB");
    });

    mainMenuUI.onNewGameRequested.add(() => {
      mainMenuUI.hide();
      classSelectUI.show();
    });

    mainMenuUI.onLoadSaveRequested.add(() => {
      saveLoadUI.show();
    });

    mainMenuUI.onSettingsRequested.add(() => {
      settingsUI.show();
    });

    classSelectUI.onArchetypeSelected.add((archetype) => {
      player.setArchetype(archetype);
      SaveManager.save("autosave", player);
      classSelectUI.hide();
      hud.setVisible(true);
      gameStateManager.setState("TOWN_HUB");
    });

    // Pause Menu Observables
    pauseMenuUI.onResumeRequested.add(() => {
      gameStateManager.setPaused(false);
    });

    pauseMenuUI.onSaveLoadRequested.add(() => {
      saveLoadUI.show();
    });

    pauseMenuUI.onSettingsRequested.add(() => {
      settingsUI.show();
    });

    pauseMenuUI.onMainMenuRequested.add(() => {
      returnToTownHub();
      hud.setVisible(false);
      mainMenuUI.show();
      gameStateManager.setState("MAIN_MENU");
    });

    dungeonPortalUI.onEnterDungeon.add((seed) => {
      if (!inDungeon) {
        transitionToDungeon(seed);
      }
    });

    const activeTown = await buildTownHub();

    // Position Player in Town Hub
    setStatus("6/8 Spawning Player in Town Hub...");
    player.transformNode.position = activeTown.spawnPoint.clone();

    // Wire UI Toggle Handlers
    hud.setOnMapButtonClick(() => mapOverlay.toggleOverlay());
    hud.setOnTalentButtonClick(() => talentUI.toggle());
    hud.setOnInventoryButtonClick(() => inventoryUI.toggle());
    hud.setOnSaveButtonClick(() => saveLoadUI.toggle());
    inputManager.onInventoryToggleRequested.add(() => inventoryUI.toggle());

    // Connect Save UI Toast Notifications
    saveLoadUI.onNotification.add((msg) => {
      hud.showPickupNotification(msg, "#87CEFA");
    });

    const returnToTownHub = async () => {
      enemies.forEach((e) => e.dispose());
      enemies.length = 0;

      activeLootDrops.forEach((d) => d.dispose());
      activeLootDrops.length = 0;

      if (navMeshManager) {
        navMeshManager.dispose();
        navMeshManager = null;
      }
      player.setNavMeshManager(null);

      if (tileMap) {
        tileMap.clearDungeon();
        tileMap.dispose();
        tileMap = null;
      }

      mapOverlay.setGrid(null as any);
      mapOverlay.setOverlayVisible(false);
      inDungeon = false;

      const restoredTown = await buildTownHub();
      player.transformNode.position = restoredTown.spawnPoint.clone();
      hud.showPickupNotification("Returned to Town Hub", "#10B981");
    };

    saveLoadUI.onLoadExecuted.add(() => {
      returnToTownHub();
    });

    // Wire Auto-Save Listeners
    const unbindAutoSave = SaveManager.registerAutoSaveEvents(player, getCurrentZone, getDungeonFloor);

    // Keyboard shortcut listeners for UI overlays & interactions
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (gameStateManager.getState() === "MAIN_MENU") return;

      if (e.code === "KeyM" || e.code === "Tab") {
        e.preventDefault();
        mapOverlay.toggleOverlay();
      } else if (e.code === "KeyT") {
        talentUI.toggle();
      } else if (e.code === "KeyI") {
        inventoryUI.toggle();
      } else if (e.code === "KeyP") {
        saveLoadUI.toggle();
      } else if (e.code === "F9") {
        const presets: GraphicsPreset[] = ["low", "medium", "high", "ultra"];
        const current = visualPipelineManager.getPreset();
        const nextIndex = (presets.indexOf(current) + 1) % presets.length;
        visualPipelineManager.setPreset(presets[nextIndex]);
        const msg = `Graphics quality preset: ${presets[nextIndex].toUpperCase()}`;
        console.log(`[VisualPipelineManager] ${msg}`);
        hud.showPickupNotification(msg, "#A78BFA");
      } else if (e.code === "KeyE" || e.code === "KeyF") {
        if (!inDungeon) {
          if (dungeonPortal && dungeonPortal.isPlayerInProximity(player.position)) {
            dungeonPortal.interact();
          } else if (townHubAltar && townHubAltar.isPlayerInProximity(player.position)) {
            townHubAltar.interact();
          }
        }
      } else if (e.code === "Escape") {
        if (talentUI.isCurrentlyVisible) talentUI.hide();
        else if (archetypeUI.isCurrentlyVisible) archetypeUI.hide();
        else if (inventoryUI.isCurrentlyVisible) inventoryUI.hide();
        else if (saveLoadUI.isVisible()) saveLoadUI.hide();
        else if (dungeonPortalUI.isVisible) dungeonPortalUI.hide();
        else if (settingsUI.isVisible()) settingsUI.hide();
        else if (classSelectUI.isVisible()) classSelectUI.hide();
        else {
          pauseMenuUI.toggle();
          gameStateManager.setPaused(pauseMenuUI.isVisible());
        }
        mapOverlay.setOverlayVisible(false);
      }
    });

    // Wire Input and Camera for Player in Town Hub
    player.setInputManager(inputManager);
    cameraRig.attachToTarget(player.transformNode);

    if (shadowGen) {
      shadowGen.addShadowCaster(player.getMesh());
      player.onModelLoaded.add((loadedMesh) => {
        shadowGen.addShadowCaster(loadedMesh);
        const children = loadedMesh.getChildMeshes();
        for (const child of children) {
          shadowGen.addShadowCaster(child);
        }
      });
    }

    // Dynamic Dungeon Entry Transition Handler
    const transitionToDungeon = async (customSeed?: number) => {
      if (inDungeon) return;
      inDungeon = true;

      const seedMsg = customSeed !== undefined ? `Seed: ${customSeed}` : "Random Seed";
      hud.showPickupNotification(`Entering Procedural Dungeon (${seedMsg})...`, "#3B82F6");

      // Completely unload and dispose Town Hub assets from scene
      disposeTownHub();

      const generator = new Generator({ seed: customSeed, minWidth: 55, maxWidth: 75, minHeight: 55, maxHeight: 75 });
      const dungeonGrid = generator.generate();

      mapOverlay.setGrid(dungeonGrid);

      tileMap = new TileMap(scene);
      const builtDungeon = await tileMap.buildFromGrid(dungeonGrid);

      navMeshManager = new NavMeshManager();
      await navMeshManager.init(3000);
      if (builtDungeon.mergedFloors) {
        await navMeshManager.createNavMesh(builtDungeon.mergedFloors);
      }

      player.transformNode.position = builtDungeon.spawnPoint.clone();
      player.setNavMeshManager(navMeshManager);

      for (let i = 1; i < dungeonGrid.rooms.length; i++) {
        const room = dungeonGrid.rooms[i];
        const spawnPos = new Vector3(room.centerX * 2.0 + 1.0, 0, room.centerY * 2.0 + 1.0);
        const enemy = new Enemy(`enemy_${i}`, `Orc_${i}`, scene, spawnPos, {
          modelUrl: "assets/characters/enemies/character-orc.glb",
          maxHp: 60,
          attackDamage: 12,
          armor: 5,
          moveSpeed: 4.5,
          aggroRadius: 9.0,
          attackRadius: 1.8,
          attackCooldown: 1.5,
        });

        enemy.setNavMeshManager(navMeshManager);
        enemy.setTarget(player);

        if (shadowGen) {
          shadowGen.addShadowCaster(enemy.getMesh());
          enemy.onModelLoaded.add((loadedMesh) => {
            shadowGen.addShadowCaster(loadedMesh);
            for (const child of loadedMesh.getChildMeshes()) {
              shadowGen.addShadowCaster(child);
            }
          });
        }

        enemy.onAttackPerformed.add(({ target, damage }) => {
          if (player.isAlive && player.health.isAlive) {
            DamageSystem.resolveDamage(enemy, player, damage);
          }
        });

        enemy.health.onDeath.add(() => player.gainXp(40));

        enemy.onLootDropped.add(({ enemy: deadEnemy, drops }) => {
          drops.forEach((item, idx) => {
            const offset = new Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
            const spawnPos = deadEnemy.position.add(offset);
            const drop = new LootDrop(`drop_${deadEnemy.id}_${idx}`, scene, item, spawnPos);
            activeLootDrops.push(drop);
            if (shadowGen) shadowGen.addShadowCaster(drop.visualMesh);
          });
        });

        enemies.push(enemy);
      }
    };

    // Wire Player Attack Action
    const handlePlayerAttack = (targetEnemy?: Enemy) => {
      let target = targetEnemy;
      if (!target) {
        let minDist = 2.5; // Melee attack range
        for (const enemy of enemies) {
          if (enemy.isAlive && enemy.health.isAlive) {
            const dist = Vector3.Distance(player.position, enemy.position);
            if (dist < minDist) {
              minDist = dist;
              target = enemy;
            }
          }
        }
      }

      if (target && target.isAlive && target.health.isAlive) {
        if (player.performAttack(target)) {
          audioManager.playSwingSFX();
          DamageSystem.resolveDamage(player, target);
        }
      } else {
        audioManager.playSwingSFX();
      }
    };

    // Pointer click on enemy direct attack check
    scene.onPointerDown = (evt, pickResult) => {
      if (evt.button === 0 && pickResult && pickResult.hit && pickResult.pickedMesh) {
        const pickedMesh = pickResult.pickedMesh;
        for (const enemy of enemies) {
          if (enemy.isAlive && (pickedMesh === enemy.mesh || pickedMesh.isDescendantOf(enemy.transformNode))) {
            handlePlayerAttack(enemy);
            break;
          }
        }
      }
    };

    // 7. Main Render Loop Setup
    let menuCameraAngle = 0;
    setStatus("7/8 Starting Main Game Engine Render Loop...");
    gameEngine.setRenderLoopCallback(() => {
      const rawDeltaTime = gameEngine.getEngine().getDeltaTime() / 1000.0;
      if (rawDeltaTime <= 0) return;

      juiceOverlay.update(rawDeltaTime);
      if (juiceOverlay.isHitStopped()) return;

      const deltaTime = rawDeltaTime;
      const state = gameStateManager.getState();

      if (state === "MAIN_MENU") {
        // Slow cinematic camera drift over Town Hub
        menuCameraAngle += deltaTime * 0.12;
        const radius = 22.0;
        const camX = 10.0 + Math.sin(menuCameraAngle) * radius;
        const camZ = 6.0 + Math.cos(menuCameraAngle) * radius;
        const camY = 12.0 + Math.sin(menuCameraAngle * 0.5) * 3.0;

        const camera = cameraRig.getCamera();
        camera.position = new Vector3(camX, camY, camZ);
        camera.setTarget(new Vector3(10.0, 1.0, 6.0));
        return;
      }

      if (state === "PAUSED") {
        return;
      }

      inputManager.update(deltaTime);
      player.update(deltaTime, enemies, juiceOverlay, audioManager);
      hud.update(deltaTime);
      mapOverlay.update(deltaTime, enemies);
      if (!inDungeon && dungeonPortal) dungeonPortal.update(deltaTime);

      // Active 3D Loot Drops
      for (let i = activeLootDrops.length - 1; i >= 0; i--) {
        const drop = activeLootDrops[i];
        if (drop.isPickedUp) {
          activeLootDrops.splice(i, 1);
        } else {
          drop.update(deltaTime, player, juiceOverlay, audioManager);
        }
      }

      // Proximity Checks for Town Entities
      if (!inDungeon && dungeonPortal && dungeonPortal.isPlayerInProximity(player.position)) {
        hud.showInteractionPrompt("Press [E] or (A) to Enter Dungeon Portal");
      } else if (!inDungeon && townHubAltar && townHubAltar.isPlayerInProximity(player.position)) {
        hud.showInteractionPrompt("Press [E] or (A) to Access Class Altar");
      } else {
        hud.hideInteractionPrompt();
      }

      // Update Enemy AI FSMs
      for (const enemy of enemies) {
        if (enemy.isAlive) {
          enemy.update(deltaTime, player);
        }
      }

      // Update Camera Rig
      cameraRig.update(deltaTime, player.getVelocity(), player.getFacingDirection());

      // Update 3D Spatial Audio Listener Position
      const activeCamera = scene.activeCamera;
      if (activeCamera) {
        const forward = activeCamera.getForwardRay().direction;
        audioManager.updateListener(activeCamera.position, forward);
      }
    });

    // 8. Lifecycle & Overlay Hide
    setStatus("8/8 Initialization Complete! Welcome to Town Hub!");
    if (overlayEl) {
      overlayEl.style.opacity = "0";
      overlayEl.style.pointerEvents = "none";
      setTimeout(() => {
        overlayEl.style.display = "none";
      }, 500);
    }

    // Window Lifecycle Cleanup
    window.addEventListener("beforeunload", () => {
      unbindAutoSave();
      activeLootDrops.forEach((d) => d.dispose());
      enemies.forEach((e) => e.dispose());
      disposeTownHub();
      visualPipelineManager.dispose();
      pauseMenuUI.dispose();
      settingsUI.dispose();
      classSelectUI.dispose();
      mainMenuUI.dispose();
      saveLoadUI.dispose();
      talentUI.dispose();
      archetypeUI.dispose();
      inventoryUI.dispose();
      dungeonPortalUI.dispose();
      mapOverlay.dispose();
      hud.dispose();
      juiceOverlay.dispose();
      audioManager.dispose();
      if (navMeshManager) navMeshManager.dispose();
      if (tileMap) tileMap.dispose();
      inputManager.dispose();
      player.dispose();
      cameraRig.dispose();
      gameEngine.dispose();
    });

    console.log("Babylon.js Dungeon Crawler ARPG initialized successfully.");
  } catch (err: any) {
    showError(`Startup Error: ${err?.stack || err?.message || err}`);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((err) => console.error("Bootstrap error:", err));
  });
} else {
  bootstrap().catch((err) => console.error("Bootstrap error:", err));
}
