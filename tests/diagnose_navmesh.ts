import { init } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";

async function diagnose() {
  await init();
  const engine = new NullEngine();
  const scene = new Scene(engine);

  // Case 1: Simple CreateGround
  const ground1 = MeshBuilder.CreateGround("g1", { width: 10, height: 10 }, scene);
  ground1.computeWorldMatrix(true);
  const pos1 = ground1.getVerticesData(VertexBuffer.PositionKind)!;
  const idx1 = ground1.getIndices()!;

  console.log("Ground1 positions:", pos1);
  console.log("Ground1 indices:", idx1);

  const res1 = generateSoloNavMesh(new Float32Array(pos1), new Uint32Array(idx1), {
    cs: 0.2,
    ch: 0.2,
    walkableHeight: 9,
    walkableRadius: 3,
    walkableClimb: 2,
    walkableSlopeAngle: 45,
  });

  console.log("Res1 success:", res1.success, res1.error);

  // Case 2: CreateBox (3D floor slab with height)
  const box1 = MeshBuilder.CreateBox("b1", { width: 10, height: 0.2, depth: 10 }, scene);
  box1.computeWorldMatrix(true);
  const pos2 = box1.getVerticesData(VertexBuffer.PositionKind)!;
  const idx2 = box1.getIndices()!;

  const res2 = generateSoloNavMesh(new Float32Array(pos2), new Uint32Array(idx2), {
    cs: 0.2,
    ch: 0.2,
    walkableHeight: 9,
    walkableRadius: 3,
    walkableClimb: 2,
    walkableSlopeAngle: 45,
  });

  console.log("Res2 success:", res2.success, res2.error);

  // Case 3: Merged Ground Tiles
  const gTiles: Mesh[] = [];
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      const tile = MeshBuilder.CreateGround(`gt_${x}_${z}`, { width: 2, height: 2 }, scene);
      tile.position.set(x * 2 + 1, 0, z * 2 + 1);
      tile.computeWorldMatrix(true);
      tile.bakeCurrentTransformIntoVertices();
      gTiles.push(tile);
    }
  }
  const mergedG = Mesh.MergeMeshes(gTiles, true, true, undefined, false, false)!;
  mergedG.computeWorldMatrix(true);
  const pos3 = mergedG.getVerticesData(VertexBuffer.PositionKind)!;
  const idx3 = mergedG.getIndices()!;

  const res3 = generateSoloNavMesh(new Float32Array(pos3), new Uint32Array(idx3), {
    cs: 0.2,
    ch: 0.2,
    walkableHeight: 9,
    walkableRadius: 3,
    walkableClimb: 2,
    walkableSlopeAngle: 45,
  });

  console.log("Res3 success:", res3.success, res3.error);

  // Case 4: Merged Box Tiles
  const bTiles: Mesh[] = [];
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      const tile = MeshBuilder.CreateBox(`bt_${x}_${z}`, { width: 2, height: 0.2, depth: 2 }, scene);
      tile.position.set(x * 2 + 1, 0, z * 2 + 1);
      tile.computeWorldMatrix(true);
      tile.bakeCurrentTransformIntoVertices();
      bTiles.push(tile);
    }
  }
  const mergedB = Mesh.MergeMeshes(bTiles, true, true, undefined, false, false)!;
  mergedB.computeWorldMatrix(true);
  const pos4 = mergedB.getVerticesData(VertexBuffer.PositionKind)!;
  const idx4 = mergedB.getIndices()!;

  const res4 = generateSoloNavMesh(new Float32Array(pos4), new Uint32Array(idx4), {
    cs: 0.2,
    ch: 0.2,
    walkableHeight: 9,
    walkableRadius: 3,
    walkableClimb: 2,
    walkableSlopeAngle: 45,
  });

  console.log("Res4 success:", res4.success, res4.error);
}

diagnose().catch(console.error);
