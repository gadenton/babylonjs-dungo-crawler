import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";

async function testBox() {
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const box = MeshBuilder.CreateBox("box", { width: 0.2, height: 2, depth: 2 }, scene);
  box.position.set(10, 0, 10);
  box.rotationQuaternion = Quaternion.Identity();
  box.rotation.set(0, Math.PI / 2, 0);

  box.computeWorldMatrix(true);
  console.log("With rotationQuaternion != null:");
  console.log("World Matrix translation:", box.getWorldMatrix().getTranslation());
  console.log("Rotation Y from matrix:", box.getWorldMatrix().getRotationMatrix());

  box.rotationQuaternion = null;
  box.computeWorldMatrix(true);
  console.log("\nWith rotationQuaternion == null:");
  console.log("World Matrix translation:", box.getWorldMatrix().getTranslation());

  const tempBox = box.clone("temp", null);
  tempBox.rotationQuaternion = null;
  tempBox.rotation.set(0, Math.PI / 2, 0);
  tempBox.computeWorldMatrix(true);

  const wm = tempBox.getWorldMatrix();
  const v = new Vector3(0.1, 0, 1.0); // local point (corner of 0.2 x 2.0 box)
  const tv = Vector3.TransformCoordinates(v, wm);
  console.log("\nLocal (0.1, 0, 1.0) transformed by tempBox world matrix:");
  console.log("Transformed:", tv);

  engine.dispose();
}

testBox().catch(err => console.error(err));
