import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";

function runTileRotationSuite() {
  console.log("=================================================");
  console.log("STARTING EMPIRICAL TILE ROTATION TEST SUITE");
  console.log("=================================================");

  const engine = new NullEngine();
  const scene = new Scene(engine);

  // 1. Create a test mesh with asymmetrical vertex at (1, 0, 0)
  const mesh = new Mesh("testMesh", scene);
  const vertexData = new VertexData();
  // 1 triangle: (0,0,0), (1,0,0), (0,1,0)
  vertexData.positions = [0, 0, 0,  1, 0, 0,  0, 1, 0];
  vertexData.indices = [0, 1, 2];
  vertexData.applyToMesh(mesh);

  console.log("\n[Test 1: Demonstrating rotationQuaternion override bug]");
  // Simulate GLTF loaded submesh which has rotationQuaternion set
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.rotation.set(0, Math.PI / 2, 0); // Attempt 90 degree Y rotation
  mesh.computeWorldMatrix(true);

  const posBeforeNull = mesh.getVerticesData("position")!;
  const matBeforeNull = mesh.getWorldMatrix();

  console.log("  rotationQuaternion:", mesh.rotationQuaternion ? "Non-null (Identity)" : "null");
  console.log("  rotation.y requested:", mesh.rotation.y);
  console.log("  World matrix [m[0], m[2], m[8], m[10]]:", [matBeforeNull.m[0], matBeforeNull.m[2], matBeforeNull.m[8], matBeforeNull.m[10]]);

  // With rotationQuaternion non-null, rotation.y is ignored by Babylon. World matrix m[8] should be 0, m[0] should be 1 (Identity)
  const isRotationIgnored = Math.abs(matBeforeNull.m[0] - 1) < 1e-4 && Math.abs(matBeforeNull.m[8]) < 1e-4;
  console.log("  Observed rotation ignored when rotationQuaternion !== null:", isRotationIgnored ? "YES (Bug reproduced)" : "NO");

  if (!isRotationIgnored) {
    console.error("ERROR: Expected rotation to be ignored when rotationQuaternion is non-null!");
    process.exit(1);
  }

  console.log("\n[Test 2: Verifying fix with rotationQuaternion = null]");
  mesh.rotationQuaternion = null; // Fix applied by worker
  mesh.rotation.set(0, Math.PI / 2, 0); // 90 degree Y rotation
  mesh.computeWorldMatrix(true);

  const matAfterNull = mesh.getWorldMatrix();
  console.log("  rotationQuaternion:", mesh.rotationQuaternion);
  console.log("  World matrix after fix [m[0], m[2], m[8], m[10]]:", [
    matAfterNull.m[0].toFixed(4),
    matAfterNull.m[2].toFixed(4),
    matAfterNull.m[8].toFixed(4),
    matAfterNull.m[10].toFixed(4),
  ]);

  // For +90 deg Y rotation: cos(90)=0, sin(90)=1.
  // Vector (1,0,0) rotated 90 deg around Y should become (0, 0, -1).
  // Matrix m[0] = cos = 0, m[2] = -sin = -1, m[8] = sin = 1, m[10] = cos = 0.
  const isMatrixRotated = Math.abs(matAfterNull.m[0]) < 1e-4 &&
                          Math.abs(matAfterNull.m[2] - (-1)) < 1e-4 &&
                          Math.abs(matAfterNull.m[8] - 1) < 1e-4 &&
                          Math.abs(matAfterNull.m[10]) < 1e-4;

  console.log("  World matrix correctly reflects 90-degree Y rotation:", isMatrixRotated ? "PASS" : "FAIL");

  if (!isMatrixRotated) {
    console.error("ERROR: World matrix did not reflect 90-degree Y rotation after setting rotationQuaternion = null!");
    process.exit(1);
  }

  console.log("\n[Test 3: Verifying Vertex Baking after fix]");
  // Bake current transform (90 deg Y rotation) into vertices
  mesh.bakeCurrentTransformIntoVertices();

  const bakedPositions = mesh.getVerticesData("position")!;
  console.log("  Original vertex (1,0,0) baked positions:", [
    bakedPositions[3].toFixed(4),
    bakedPositions[4].toFixed(4),
    bakedPositions[5].toFixed(4),
  ]);

  // Check vertex 1 (index 3,4,5): expected (0, 0, -1)
  const v1X = bakedPositions[3];
  const v1Y = bakedPositions[4];
  const v1Z = bakedPositions[5];

  const isVertexRotated = Math.abs(v1X) < 1e-4 && Math.abs(v1Y) < 1e-4 && Math.abs(v1Z - (-1)) < 1e-4;
  console.log("  Vertex (1,0,0) successfully baked to (0,0,-1):", isVertexRotated ? "PASS" : "FAIL");

  if (!isVertexRotated) {
    console.error(`ERROR: Baked vertex position was (${v1X}, ${v1Y}, ${v1Z}), expected (0, 0, -1)!`);
    process.exit(1);
  }

  console.log("\n[Test 4: Simulating TileMap.instantiateSubmeshesInto with translation + rotation]");
  // Create GLB child mesh mock
  const glbChild = new Mesh("glbChild", scene);
  const childVd = new VertexData();
  childVd.positions = [0, 0, 0,  1, 0, 0,  0, 0, 1];
  childVd.indices = [0, 1, 2];
  childVd.applyToMesh(glbChild);
  glbChild.rotationQuaternion = Quaternion.Identity(); // Loaded from GLB

  // Execute exact submesh cloning sequence from TileMap.ts
  const worldX = 10.0;
  const worldY = 0.0;
  const worldZ = 20.0;
  const rotationY = Math.PI; // 180 deg rotation

  const cloned = glbChild.clone("clonedSubmesh", null);
  if (!cloned) {
    console.error("ERROR: Failed to clone GLB child mesh!");
    process.exit(1);
  }

  cloned.setEnabled(true);
  cloned.position.set(worldX, worldY, worldZ);
  cloned.rotationQuaternion = null;
  cloned.rotation.set(0, rotationY, 0);
  cloned.computeWorldMatrix(true);
  cloned.bakeCurrentTransformIntoVertices();

  const clonedPositions = cloned.getVerticesData("position")!;

  // 180 deg Y rotation of (1, 0, 0) gives (-1, 0, 0).
  // Translation (10, 0, 20) gives (9, 0, 20).
  const cV1X = clonedPositions[3];
  const cV1Y = clonedPositions[4];
  const cV1Z = clonedPositions[5];

  console.log("  Cloned vertex 1 position after 180 deg rotation + (10,0,20) translation:", [
    cV1X.toFixed(4),
    cV1Y.toFixed(4),
    cV1Z.toFixed(4),
  ]);

  const isCloneBakedCorrectly = Math.abs(cV1X - 9.0) < 1e-4 &&
                                Math.abs(cV1Y - 0.0) < 1e-4 &&
                                Math.abs(cV1Z - 20.0) < 1e-4;

  console.log("  Cloned mesh vertex baked to expected world position (9, 0, 20):", isCloneBakedCorrectly ? "PASS" : "FAIL");

  if (!isCloneBakedCorrectly) {
    console.error(`ERROR: Cloned vertex position was (${cV1X}, ${cV1Y}, ${cV1Z}), expected (9, 0, 20)!`);
    process.exit(1);
  }

  console.log("\nSUCCESS! Tile matrix transform and vertex baking verified 100% correct.");

  engine.dispose();
}

runTileRotationSuite();
