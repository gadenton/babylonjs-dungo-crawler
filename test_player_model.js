import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import fs from "fs";

async function testPlayerModelAnimation() {
  console.log("=== Testing Player Kenney Asset GLB Model & Animations ===");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  const modelPath = "public/assets/characters/player/character-male-a.glb";
  if (!fs.existsSync(modelPath)) {
    throw new Error(`File not found: ${modelPath}`);
  }

  const buf = fs.readFileSync(modelPath);
  const dataUri = "data:;base64," + buf.toString("base64");

  const result = await SceneLoader.ImportMeshAsync("", "", dataUri, scene, null, ".glb");

  console.log(`Loaded player GLB: ${result.meshes.length} root meshes, ${result.animationGroups.length} animation groups.`);

  const animNames = result.animationGroups.map(ag => ag.name);
  console.log("Available Animation Groups:", animNames.join(", "));

  // Verify critical animations exist
  const hasIdle = animNames.includes("idle");
  const hasWalk = animNames.includes("walk");
  const hasAttackRight = animNames.includes("attack-melee-right");
  const hasAttackLeft = animNames.includes("attack-melee-left");

  console.log(`- idle animation present: ${hasIdle ? "PASS" : "FAIL"}`);
  console.log(`- walk animation present: ${hasWalk ? "PASS" : "FAIL"}`);
  console.log(`- attack-melee-right present: ${hasAttackRight ? "PASS" : "FAIL"}`);
  console.log(`- attack-melee-left present: ${hasAttackLeft ? "PASS" : "FAIL"}`);

  if (!hasIdle || !hasWalk || !hasAttackRight) {
    throw new Error("Critical animation groups missing from Kenney model!");
  }

  // Test playing walk animation
  const walkAnim = result.animationGroups.find(ag => ag.name === "walk");
  walkAnim.start(true);
  console.log(`Walk animation playing: ${walkAnim.isPlaying}`);

  // Test playing attack animation
  walkAnim.stop();
  const attackAnim = result.animationGroups.find(ag => ag.name === "attack-melee-right");
  attackAnim.start(false);
  console.log(`Attack animation playing: ${attackAnim.isPlaying}`);

  engine.dispose();
  console.log("\n=== Player Model Animation Empirical Test SUCCESS ===");
}

testPlayerModelAnimation().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
