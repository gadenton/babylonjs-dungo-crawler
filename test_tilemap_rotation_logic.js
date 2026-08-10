import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";

async function testRotationBaking() {
  console.log("=== Testing TileMap Submesh Rotation Baking Logic ===");
  const engine = new NullEngine();
  const scene = new Scene(engine);

  const templateNode = new TransformNode("template_wall", scene);

  const childMesh = MeshBuilder.CreateBox("wall_submesh", { width: 0.2, height: 2, depth: 2 }, scene);
  childMesh.parent = templateNode;
  childMesh.rotationQuaternion = Quaternion.Identity();

  // Test Case A: Without setting rotationQuaternion (THE BUG)
  const buggyCloned = childMesh.clone("buggy_clone", null);
  buggyCloned.position.set(10, 0, 10);
  // rotationQuaternion is STILL Quaternion.Identity()!
  buggyCloned.rotation.set(0, Math.PI / 2, 0);
  buggyCloned.computeWorldMatrix(true);
  buggyCloned.bakeCurrentTransformIntoVertices();

  const buggyPositions = buggyCloned.getVerticesData(VertexBuffer.PositionKind);

  // Test Case B: With resetting rotationQuaternion = null (THE FIX in TileMap.ts)
  const fixedCloned = childMesh.clone("fixed_clone", null);
  fixedCloned.position.set(10, 0, 10);
  fixedCloned.rotationQuaternion = null; // THE FIX
  fixedCloned.rotation.set(0, Math.PI / 2, 0);
  fixedCloned.computeWorldMatrix(true);
  fixedCloned.bakeCurrentTransformIntoVertices();

  const fixedPositions = fixedCloned.getVerticesData(VertexBuffer.PositionKind);

  console.log("Buggy clone rotationQuaternion:", buggyCloned.rotationQuaternion);
  console.log("Fixed clone rotationQuaternion:", fixedCloned.rotationQuaternion);

  console.log("\nBuggy Positions (first 4 vertices):");
  for (let i = 0; i < 12; i += 3) {
    console.log(`v${i/3}: (${buggyPositions[i].toFixed(2)}, ${buggyPositions[i+1].toFixed(2)}, ${buggyPositions[i+2].toFixed(2)})`);
  }

  console.log("\nFixed Positions (first 4 vertices):");
  for (let i = 0; i < 12; i += 3) {
    console.log(`v${i/3}: (${fixedPositions[i].toFixed(2)}, ${fixedPositions[i+1].toFixed(2)}, ${fixedPositions[i+2].toFixed(2)})`);
  }

  // Calculate extent along X axis relative to center X (10)
  let buggyMinX = Infinity, buggyMaxX = -Infinity;
  let fixedMinX = Infinity, fixedMaxX = -Infinity;

  for (let i = 0; i < buggyPositions.length; i += 3) {
    buggyMinX = Math.min(buggyMinX, buggyPositions[i]);
    buggyMaxX = Math.max(buggyMaxX, buggyPositions[i]);
  }

  for (let i = 0; i < fixedPositions.length; i += 3) {
    fixedMinX = Math.min(fixedMinX, fixedPositions[i]);
    fixedMaxX = Math.max(fixedMaxX, fixedPositions[i]);
  }

  console.log(`\nBuggy X range: [${buggyMinX.toFixed(2)}, ${buggyMaxX.toFixed(2)}] (Width: ${(buggyMaxX - buggyMinX).toFixed(2)})`);
  console.log(`Fixed X range: [${fixedMinX.toFixed(2)}, ${fixedMaxX.toFixed(2)}] (Width: ${(fixedMaxX - fixedMinX).toFixed(2)})`);

  engine.dispose();
}

testRotationBaking().catch(err => console.error(err));
