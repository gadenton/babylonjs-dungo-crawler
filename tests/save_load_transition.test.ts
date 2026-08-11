import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import { polyfillXHR } from "./xhr_polyfill";
import { Player } from "../src/entities/Player";
import { SaveManager } from "../src/persistence/SaveManager";
import { Generator } from "../src/dungeon/Generator";
import { TileMap } from "../src/dungeon/TileMap";

export async function runSaveLoadTransitionTest(): Promise<boolean> {
  console.log("\n=== [TEST] Save/Load Persistence & Dungeon Cleanup ===");
  polyfillXHR();

  const engine = new NullEngine();
  const scene = new Scene(engine);

  try {
    // 1. Test Player Save Capture & Load Position Reset
    console.log("1. Testing Player Save/Load Position Reset...");
    const player = new Player("p_test", scene);
    player.level = 5;
    player.xp = 250;
    player.inventory.gold = 500;
    player.health.setCurrentHp(150);

    // Simulate player deep inside dungeon coordinates (e.g. x: 45, y: 0.9, z: 32)
    player.transformNode.position = new Vector3(45.0, 0.9, 32.0);

    const slotId = "test_cleanup_slot";
    const saveSuccess = SaveManager.save(slotId, player, "dungeon", 2);
    console.log(`- Save operation success: ${saveSuccess ? "✅ PASS" : "❌ FAIL"}`);

    const metadata = SaveManager.getMetadata(slotId);
    const metaValid = metadata !== null && metadata.level === 5 && metadata.gold === 500;
    console.log(`- Save metadata recorded (Level: ${metadata?.level}, Gold: ${metadata?.gold}): ${metaValid ? "✅ PASS" : "❌ FAIL"}`);

    // Mutate player stats before load
    player.level = 1;
    player.inventory.gold = 0;
    player.transformNode.position = new Vector3(99, 99, 99);

    // Load save back into player
    const loadSuccess = SaveManager.load(slotId, player);
    console.log(`- Load operation success: ${loadSuccess ? "✅ PASS" : "❌ FAIL"}`);

    const statsRestored = player.level === 5 && player.inventory.gold === 500;
    console.log(`- Player stats restored: ${statsRestored ? "✅ PASS" : "❌ FAIL"}`);

    // Verify player position was reset to Town Hub spawn (10, 0, 6) instead of keeping dungeon coords
    const pos = player.transformNode.position;
    const isAtTownSpawn = Math.abs(pos.x - 10.0) < 0.01 && Math.abs(pos.y - 0.0) < 0.01 && Math.abs(pos.z - 6.0) < 0.01;
    console.log(`- Player position reset to Town Hub spawn (10, 0, 6): ${isAtTownSpawn ? "✅ PASS" : "❌ FAIL"}`);

    // Clean up test save key
    SaveManager.delete(slotId);

    // 2. Test Dungeon TileMap Creation and Disposal / Cleanup
    console.log("\n2. Testing TileMap Dungeon Node & Wall Collider Cleanup...");
    const generator = new Generator({ seed: 42, minWidth: 20, maxWidth: 30, minHeight: 20, maxHeight: 30 });
    const grid = generator.generate();

    const tileMap = new TileMap(scene);
    await tileMap.buildFromGrid(grid);

    const dungeonRootBefore = scene.getNodeByName("dungeonRoot");
    const mergedWallsBefore = scene.getMeshByName("mergedWalls");
    const hasDungeonNodes = dungeonRootBefore !== null && mergedWallsBefore !== null;
    console.log(`- Dungeon root node & merged wall colliders built in scene: ${hasDungeonNodes ? "✅ PASS" : "❌ FAIL"}`);

    // Execute dungeon cleanup
    tileMap.clearDungeon();

    const dungeonRootAfter = scene.getNodeByName("dungeonRoot");
    const mergedWallsAfter = scene.getMeshByName("mergedWalls");
    const isCleanedUp = dungeonRootAfter === null && mergedWallsAfter === null;
    console.log(`- Dungeon root node & merged wall colliders fully removed from scene: ${isCleanedUp ? "✅ PASS" : "❌ FAIL"}`);

    // Clean up resources
    tileMap.dispose();
    player.dispose();
    engine.dispose();

    const allPassed = saveSuccess && metaValid && loadSuccess && statsRestored && isAtTownSpawn && hasDungeonNodes && isCleanedUp;
    if (allPassed) {
      console.log("=== Save/Load & Dungeon Cleanup Test PASSED ===");
    } else {
      console.error("=== Save/Load & Dungeon Cleanup Test FAILED ===");
    }
    return allPassed;
  } catch (err) {
    console.error("❌ FAIL: Exception during Save/Load transition test:", err);
    engine.dispose();
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSaveLoadTransitionTest().then((passed) => {
    process.exit(passed ? 0 : 1);
  });
}
