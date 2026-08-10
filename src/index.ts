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
import { TownHub } from "./town/TownHub";
import { TalentUI } from "./ui/TalentUI";
import { ArchetypeUI } from "./ui/ArchetypeUI";
import { InventoryUI } from "./ui/InventoryUI";
import { SaveLoadUI } from "./ui/SaveLoadUI";
import { HUD } from "./ui/HUD";
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
    if (statusEl) {
      statusEl.innerText = "Initialization failed!";
      statusEl.style.color = "#ef4444";
    }
  };

  if (!canvas) {
    showError("Failed to find #renderCanvas element in DOM.");
    return;
  }

  try {
    // 1. Initialize Core Game Engine & Scene
    setStatus("1/8 Initializing Game Engine & Scene...");
    const gameEngine = new GameEngine({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
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
    setStatus("3/8 Initializing Visual Pipeline (SSAO2, Bloom, ACES Tone Mapping)...");
    const visualPipelineManager = new VisualPipelineManager(
      scene,
      cameraRig.getCamera(),
      "high"
    );

    // 4. Build Static Town Hub Plaza (10x10 Area)
    setStatus("4/8 Building Static Town Hub Plaza...");
    const townHub = new TownHub(scene);
    console.time("[Index] TownHub build");
    const builtTown = await townHub.build();
    console.timeEnd("[Index] TownHub build");
    const townHubAltar = builtTown.altar;

    // 5. Position Player & Attach Camera in Town Hub
    setStatus("5/8 Spawning Player in Town Hub...");
    player.transformNode.position = builtTown.spawnPoint.clone();

    // Zero enemies in Town Hub
    const enemies: Enemy[] = [];

    // 6. Wire UI Overlays
    setStatus("6/8 Wiring UI & Launching Render Loop...");
    const talentUI = new TalentUI(scene, player.talentTree, inputManager);
    const archetypeUI = new ArchetypeUI(scene, player, inputManager, audioManager);
    const inventoryUI = new InventoryUI(scene, player, inputManager);
    const saveLoadUI = new SaveLoadUI(scene, player, inputManager);
    const hud = new HUD(scene, player, inputManager);

    const activeLootDrops: LootDrop[] = [];

    // Wire UI Toggle Handlers
    hud.setOnTalentButtonClick(() => talentUI.toggle());
    hud.setOnInventoryButtonClick(() => inventoryUI.toggle());
    hud.setOnSaveButtonClick(() => saveLoadUI.toggle());
    inputManager.onInventoryToggleRequested.add(() => inventoryUI.toggle());

    // Connect Save UI Toast Notifications to HUD Notification Banner
    saveLoadUI.onNotification.add((msg) => {
      hud.showPickupNotification(msg, "#87CEFA");
    });

    // Wire Auto-Save Listeners
    const unbindAutoSave = SaveManager.registerAutoSaveEvents(player);

    // Keyboard shortcut listeners for UI overlays & visual presets
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "KeyT") {
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
        if (townHubAltar.isPlayerInProximity(player.position)) {
          townHubAltar.interact();
        }
      } else if (e.code === "Escape") {
        if (talentUI.isCurrentlyVisible) talentUI.hide();
        if (archetypeUI.isCurrentlyVisible) archetypeUI.hide();
        if (inventoryUI.isCurrentlyVisible) inventoryUI.hide();
        if (saveLoadUI.isVisible()) saveLoadUI.hide();
      }
    });

    // Wire Input and Camera for Player in Town Hub
    player.setInputManager(inputManager);
    cameraRig.attachToTarget(player.transformNode);

    const shadowGen = gameEngine.getShadowGenerator();
    if (shadowGen) {
      shadowGen.addShadowCaster(player.getMesh());
      shadowGen.addShadowCaster(townHubAltar.mesh);
    }

    // Dynamic Dungeon Entry Transition Handler
    let inDungeon = false;
    let tileMap: TileMap | null = null;
    let navMeshManager: NavMeshManager | null = null;

    const transitionToDungeon = async () => {
      if (inDungeon) return;
      inDungeon = true;
      hud.showPickupNotification("Entering Procedural Dungeon...", "#3B82F6");

      const generator = new Generator({ width: 40, height: 40 });
      const dungeonGrid = generator.generate();

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
        const spawnPos = new Vector3(room.centerX * 2.0, 0, room.centerY * 2.0);
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

        if (shadowGen) shadowGen.addShadowCaster(enemy.getMesh());

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

    townHubAltar.onInteract.add(() => {
      archetypeUI.toggle();
      if (!inDungeon) {
        transitionToDungeon();
      }
    });

  // 12. Wire Player Attack Action
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

  // 13. Main Render Loop Setup
  gameEngine.setRenderLoopCallback(() => {
    const rawDeltaTime = gameEngine.getEngine().getDeltaTime() / 1000.0;
    if (rawDeltaTime <= 0) return;

    // Update Juice Overlay Floating Numbers and Flashes
    juiceOverlay.update(rawDeltaTime);

    // Micro-pause gameplay logic updates during hit-stop freeze frame
    if (juiceOverlay.isHitStopped()) return;

    const deltaTime = rawDeltaTime;
    inputManager.update(deltaTime);
    player.update(deltaTime, enemies, juiceOverlay, audioManager);
    hud.update(deltaTime);

    // Update active 3D Loot Drops (Rotation, Bobbing, 3.0m Proximity Vacuum Magnet)
    for (let i = activeLootDrops.length - 1; i >= 0; i--) {
      const drop = activeLootDrops[i];
      if (drop.isPickedUp) {
        activeLootDrops.splice(i, 1);
      } else {
        drop.update(deltaTime, player, juiceOverlay, audioManager);
      }
    }

    // Altar Proximity Check
    if (townHubAltar.isPlayerInProximity(player.position)) {
      hud.showInteractionPrompt("Press [E] or (A) to Access Archetype Altar");
    } else {
      hud.hideInteractionPrompt();
    }

    // Update Enemy AI FSMs
    for (const enemy of enemies) {
      if (enemy.isAlive) {
        enemy.update(deltaTime, player);
      }
    }

    // Update Camera Rig with exponential smoothing & look-ahead
    cameraRig.update(deltaTime, player.getVelocity(), player.getFacingDirection());

    // Update 3D Spatial Audio Listener Position
    const activeCamera = scene.activeCamera;
    if (activeCamera) {
      const forward = activeCamera.getForwardRay().direction;
      audioManager.updateListener(activeCamera.position, forward);
    }
  });

  // 14. Window Lifecycle Cleanup
  window.addEventListener("beforeunload", () => {
    unbindAutoSave();
    activeLootDrops.forEach((d) => d.dispose());
    enemies.forEach((e) => e.dispose());
    townHubAltar.dispose();
    visualPipelineManager.dispose();
    saveLoadUI.dispose();
    talentUI.dispose();
    archetypeUI.dispose();
    inventoryUI.dispose();
    hud.dispose();
    juiceOverlay.dispose();
    audioManager.dispose();
    if (navMeshManager) navMeshManager.dispose();
    if (tileMap) tileMap.dispose();
    townHub.dispose();
    inputManager.dispose();
    player.dispose();
    cameraRig.dispose();
    gameEngine.dispose();
  });

  // Hide loading overlay on successful initialization
  if (overlayEl) {
    overlayEl.style.opacity = "0";
    setTimeout(() => {
      overlayEl.style.display = "none";
    }, 450);
  }

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
