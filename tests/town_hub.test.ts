import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { TownHub } from "../src/town/TownHub";
import { polyfillXHR } from "./xhr_polyfill";

export async function runTownHubTest(): Promise<boolean> {
  console.log("\n=== [TEST] Town Hub Plaza Environment Build ===");
  polyfillXHR();

  const engine = new NullEngine();
  const scene = new Scene(engine);

  try {
    const townHub = new TownHub(scene);
    const builtTown = await townHub.build();

    console.log("TownHub built successfully!");
    console.log(`- Root node name: ${builtTown.rootNode.name}`);
    console.log(`- Spawn point: (${builtTown.spawnPoint.x}, ${builtTown.spawnPoint.y}, ${builtTown.spawnPoint.z})`);
    console.log(`- Altar position: (${builtTown.altarPosition.x}, ${builtTown.altarPosition.y}, ${builtTown.altarPosition.z})`);

    const hasFloors = builtTown.mergedFloors !== null;
    const hasWalls = builtTown.mergedWalls !== null;
    const hasAltar = builtTown.altar !== undefined && builtTown.altar !== null;

    console.log(`- Merged floors collider present: ${hasFloors ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`- Merged walls collider present: ${hasWalls ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`- Altar entity present: ${hasAltar ? "✅ PASS" : "❌ FAIL"}`);

    townHub.dispose();
    engine.dispose();

    const passed = hasFloors && hasWalls && hasAltar;
    if (passed) {
      console.log("=== Town Hub Test PASSED ===");
    } else {
      console.error("=== Town Hub Test FAILED ===");
    }
    return passed;
  } catch (err) {
    console.error("❌ FAIL: Exception during TownHub test:", err);
    engine.dispose();
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTownHubTest().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}
