import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import fs from "fs";
import { polyfillXHR } from "./xhr_polyfill";

export async function runPlayerModelTest(): Promise<boolean> {
  console.log("\n=== [TEST] Player Kenney Asset GLB Model & Animations ===");
  polyfillXHR();

  const engine = new NullEngine();
  const scene = new Scene(engine);

  const modelPath = "public/assets/characters/player/character-male-a.glb";
  if (!fs.existsSync(modelPath)) {
    console.error(`❌ FAIL: Player GLB asset file not found: ${modelPath}`);
    engine.dispose();
    return false;
  }

  try {
    const fileBuffer = fs.readFileSync(modelPath);
    const dataUri = "data:;base64," + fileBuffer.toString("base64");

    const result = await SceneLoader.ImportMeshAsync("", "", dataUri, scene, null, ".glb");

    console.log(`Loaded player GLB: ${result.meshes.length} root meshes, ${result.animationGroups.length} animation groups.`);

    const animNames = result.animationGroups.map(ag => ag.name);
    console.log("Available Animation Groups:", animNames.join(", "));

    // Verify critical animations exist
    const hasIdle = animNames.includes("idle");
    const hasWalk = animNames.includes("walk");
    const hasAttackRight = animNames.includes("attack-melee-right");

    console.log(`- idle animation present: ${hasIdle ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`- walk animation present: ${hasWalk ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`- attack-melee-right present: ${hasAttackRight ? "✅ PASS" : "❌ FAIL"}`);

    if (!hasIdle || !hasWalk || !hasAttackRight) {
      console.error("❌ FAIL: Critical animation groups missing from Kenney model!");
      engine.dispose();
      return false;
    }

    // Test playing walk animation
    const walkAnim = result.animationGroups.find(ag => ag.name === "walk");
    if (walkAnim) {
      walkAnim.start(true);
      console.log(`Walk animation playing: ${walkAnim.isPlaying}`);
      walkAnim.stop();
    }

    // Test playing attack animation
    const attackAnim = result.animationGroups.find(ag => ag.name === "attack-melee-right");
    if (attackAnim) {
      attackAnim.start(false);
      console.log(`Attack animation playing: ${attackAnim.isPlaying}`);
    }

    engine.dispose();
    console.log("=== Player Model Test PASSED ===");
    return true;
  } catch (err) {
    console.error("❌ FAIL: Exception during player model test:", err);
    engine.dispose();
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPlayerModelTest().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}
