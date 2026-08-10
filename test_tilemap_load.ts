import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import fs from "fs";
import path from "path";

async function run() {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const fileBuffer = fs.readFileSync("public/assets/dungeon/template-floor.glb");
  const base64 = "data:base64," + fileBuffer.toString("base64");

  console.log("Loading GLB from base64 buffer...");
  const result = await SceneLoader.ImportMeshAsync("", "", base64, scene, null, ".glb");
  console.log("Loaded meshes count:", result.meshes.length);
  for (const m of result.meshes) {
    console.log("Mesh:", m.name, "rotationQuaternion:", m.rotationQuaternion, "rotation:", m.rotation);
  }
}

run().catch(err => console.error("Error:", err));
