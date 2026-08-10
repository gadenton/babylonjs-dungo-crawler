import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import fs from "fs";

async function testGlbLoad() {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const models = [
    "template-floor.glb",
    "template-floor-detail.glb",
    "template-wall.glb",
    "template-wall-corner.glb",
    "gate-door.glb",
    "stairs.glb",
  ];

  for (const model of models) {
    const filePath = `public/assets/dungeon/${model}`;
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const dataUri = "data:;base64," + buf.toString("base64");
    const result = await SceneLoader.ImportMeshAsync("", "", dataUri, scene, null, ".glb");
    console.log(`Successfully loaded ${model}, root mesh count: ${result.meshes.length}`);
    const root = result.meshes[0];
    const children = root.getChildMeshes(false);
    console.log(`  - Child meshes count: ${children.length}`);
  }

  engine.dispose();
}

testGlbLoad().catch(err => console.error(err));
