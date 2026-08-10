import { init, generateSoloNavMesh } from 'recast-navigation';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Generator, TileType } from '../../src/dungeon/Generator';

async function run() {
  await init();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const generator = new Generator({ width: 40, height: 40, seed: 12345 });
  const grid = generator.generate();

  const floorBoxes: Mesh[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.cells[y][x];
      if (cell.type === TileType.Floor || cell.type === TileType.Door || cell.type === TileType.Stairs) {
        const floorTile = MeshBuilder.CreateGround('tile_' + x + '_' + y, { width: 2, height: 2 }, scene);
        floorTile.position.set(x * 2.0 + 1.0, 0, y * 2.0 + 1.0);
        floorTile.computeWorldMatrix(true);
        floorTile.bakeCurrentTransformIntoVertices();
        floorBoxes.push(floorTile);
      }
    }
  }

  const merged = Mesh.MergeMeshes(floorBoxes, true, true, undefined, false, false)!;
  merged.computeWorldMatrix(true);
  const rawPositions = merged.getVerticesData(VertexBuffer.PositionKind)!;
  const rawIndices = merged.getIndices()!;

  const vertexCount = rawPositions.length / 3;
  const positions = new Float32Array(rawPositions.length);
  const localVec = new Vector3();
  const worldVec = new Vector3();
  const worldMatrix = merged.getWorldMatrix();

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    localVec.set(rawPositions[idx], rawPositions[idx + 1], rawPositions[idx + 2]);
    Vector3.TransformCoordinatesToRef(localVec, worldMatrix, worldVec);
    positions[idx] = worldVec.x;
    positions[idx + 1] = worldVec.y;
    positions[idx + 2] = worldVec.z;
  }

  const indices = new Uint32Array(rawIndices.length);
  for (let i = 0; i < rawIndices.length; i++) indices[i] = rawIndices[i];

  for (const radius of [0, 0.5, 1, 2, 3]) {
    const res = generateSoloNavMesh(positions, indices, {
      cs: 0.2,
      ch: 0.2,
      walkableHeight: 9,
      walkableRadius: radius,
      walkableClimb: 2,
      walkableSlopeAngle: 45,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      buildBvTree: true,
    });
    console.log(`Radius ${radius}: success=${res.success}, error=${res.error || 'none'}`);
  }
  process.exit(0);
}

run();
