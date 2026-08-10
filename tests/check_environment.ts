import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

console.log("Testing Babylon NullEngine in Node.js...");
const engine = new NullEngine();
const scene = new Scene(engine);
console.log("Scene created successfully! Frame:", scene.getFrameId());
engine.dispose();
