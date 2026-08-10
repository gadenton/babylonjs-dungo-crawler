import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/index.js";
import fs from "fs";

async function inspectModels() {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const models = [
    "template-wall.glb",
    "template-wall-corner.glb",
    "template-corner.glb",
    "template-wall-half.glb",
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
    console.log(`\nModel: ${model}`);
    for (let i = 0; i < result.meshes.length; i++) {
      const m = result.meshes[i];
      if (m.getTotalVertices && m.getTotalVertices() > 0) {
        const bounds = m.getBoundingInfo().boundingBox;
        console.log(`  Mesh [${m.name}]: min=(${bounds.minimum.x.toFixed(2)}, ${bounds.minimum.y.toFixed(2)}, ${bounds.minimum.z.toFixed(2)}), max=(${bounds.maximum.x.toFixed(2)}, ${bounds.maximum.y.toFixed(2)}, ${bounds.maximum.z.toFixed(2)})`);
      }
    }
  }

  engine.dispose();
}

inspectModels().catch(err => console.error(err));
