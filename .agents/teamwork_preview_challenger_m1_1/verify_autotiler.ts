import { 
  isWalkable, 
  getNeighborBitmask, 
  selectWallTile, 
  selectFloorTile, 
  selectDoorRotation 
} from "../../src/dungeon/Autotiler";
import { Generator, DungeonGrid, TileType } from "../../src/dungeon/Generator";

const VALID_WALL_MODELS = new Set([
  "template-wall.glb",
  "template-wall-detail-a.glb",
  "template-wall-corner.glb",
  "template-wall-half.glb"
]);

const VALID_FLOOR_MODELS = new Set([
  "template-floor.glb",
  "template-floor-detail.glb",
  "template-floor-detail-a.glb"
]);

interface TestResult {
  mask: number;
  cardinalMask: number;
  fullMask: number;
  wallModel: string;
  wallRotation: number;
  floorModel: string;
  floorRotation: number;
  doorRotation: number;
  passed: boolean;
  errors: string[];
}

function createGridWithBitmask(mask: number, seed: number = 42, walkableType: TileType = TileType.Floor): DungeonGrid {
  // 3x3 grid centered at (1,1)
  const cells = [
    [
      { type: (mask & 64) ? walkableType : TileType.Wall, roomId: null, isCorridor: false },  // SW (0,0) bit 6
      { type: (mask & 4) ? walkableType : TileType.Wall, roomId: null, isCorridor: false },   // S  (1,0) bit 2
      { type: (mask & 32) ? walkableType : TileType.Wall, roomId: null, isCorridor: false }   // SE (2,0) bit 5
    ],
    [
      { type: (mask & 8) ? walkableType : TileType.Wall, roomId: null, isCorridor: false },   // W  (0,1) bit 3
      { type: TileType.Wall, roomId: null, isCorridor: false },                                // Center (1,1)
      { type: (mask & 2) ? walkableType : TileType.Wall, roomId: null, isCorridor: false }    // E  (2,1) bit 1
    ],
    [
      { type: (mask & 128) ? walkableType : TileType.Wall, roomId: null, isCorridor: false }, // NW (0,2) bit 7
      { type: (mask & 1) ? walkableType : TileType.Wall, roomId: null, isCorridor: false },   // N  (1,2) bit 0
      { type: (mask & 16) ? walkableType : TileType.Wall, roomId: null, isCorridor: false }   // NE (2,2) bit 4
    ]
  ];

  return {
    width: 3,
    height: 3,
    cells,
    rooms: [],
    spawnPosition: { x: 1, y: 1 },
    stairsPosition: { x: 1, y: 1 },
    seed
  };
}

function testAll256Bitmasks(): { results: TestResult[]; totalErrors: number } {
  const results: TestResult[] = [];
  let totalErrors = 0;

  for (let mask = 0; mask < 256; mask++) {
    const errors: string[] = [];
    const grid = createGridWithBitmask(mask);

    let cardinalMask = -1;
    let fullMask = -1;
    try {
      const bitmaskRes = getNeighborBitmask(grid, 1, 1);
      cardinalMask = bitmaskRes.cardinalMask;
      fullMask = bitmaskRes.fullMask;

      if (fullMask !== mask) {
        errors.push(`fullMask mismatch: expected ${mask}, got ${fullMask}`);
      }
      if (cardinalMask !== (mask & 0x0f)) {
        errors.push(`cardinalMask mismatch: expected ${mask & 0x0f}, got ${cardinalMask}`);
      }
    } catch (e: any) {
      errors.push(`getNeighborBitmask threw exception: ${e?.message || e}`);
    }

    let wallResult = { modelName: "", yRotation: NaN };
    try {
      wallResult = selectWallTile(grid, 1, 1);
      if (!wallResult || wallResult.modelName === undefined || wallResult.modelName === null) {
        errors.push(`selectWallTile returned invalid object/modelName: ${JSON.stringify(wallResult)}`);
      } else if (!VALID_WALL_MODELS.has(wallResult.modelName)) {
        errors.push(`selectWallTile returned unknown modelName: ${wallResult.modelName}`);
      }

      if (typeof wallResult.yRotation !== "number" || isNaN(wallResult.yRotation)) {
        errors.push(`selectWallTile returned non-number yRotation: ${wallResult.yRotation}`);
      } else if (wallResult.yRotation < 0 || wallResult.yRotation > 2 * Math.PI + 0.001) {
        errors.push(`selectWallTile yRotation out of bounds [0, 2pi]: ${wallResult.yRotation}`);
      }
    } catch (e: any) {
      errors.push(`selectWallTile threw exception: ${e?.message || e}`);
    }

    let floorResult = { modelName: "", yRotation: NaN };
    try {
      floorResult = selectFloorTile(grid, 1, 1);
      if (!floorResult || floorResult.modelName === undefined || floorResult.modelName === null) {
        errors.push(`selectFloorTile returned invalid object/modelName: ${JSON.stringify(floorResult)}`);
      } else if (!VALID_FLOOR_MODELS.has(floorResult.modelName)) {
        errors.push(`selectFloorTile returned unknown modelName: ${floorResult.modelName}`);
      }

      if (typeof floorResult.yRotation !== "number" || isNaN(floorResult.yRotation)) {
        errors.push(`selectFloorTile returned non-number yRotation: ${floorResult.yRotation}`);
      } else if (floorResult.yRotation < 0 || floorResult.yRotation > 2 * Math.PI + 0.001) {
        errors.push(`selectFloorTile yRotation out of bounds [0, 2pi]: ${floorResult.yRotation}`);
      }
    } catch (e: any) {
      errors.push(`selectFloorTile threw exception: ${e?.message || e}`);
    }

    let doorRot = NaN;
    try {
      doorRot = selectDoorRotation(grid, 1, 1);
      if (typeof doorRot !== "number" || isNaN(doorRot)) {
        errors.push(`selectDoorRotation returned non-number: ${doorRot}`);
      } else if (doorRot < 0 || doorRot > 2 * Math.PI + 0.001) {
        errors.push(`selectDoorRotation out of bounds [0, 2pi]: ${doorRot}`);
      }
    } catch (e: any) {
      errors.push(`selectDoorRotation threw exception: ${e?.message || e}`);
    }

    const passed = errors.length === 0;
    if (!passed) {
      totalErrors += errors.length;
    }

    results.push({
      mask,
      cardinalMask,
      fullMask,
      wallModel: wallResult.modelName,
      wallRotation: wallResult.yRotation,
      floorModel: floorResult.modelName,
      floorRotation: floorResult.yRotation,
      doorRotation: doorRot,
      passed,
      errors
    });
  }

  return { results, totalErrors };
}

function testGeneratedDungeons(numDungeons: number = 10): { totalCellsTested: number; errors: string[]; modelCounts: Record<string, number> } {
  const errors: string[] = [];
  const modelCounts: Record<string, number> = {};
  let totalCellsTested = 0;

  for (let d = 0; d < numDungeons; d++) {
    const seed = 1000 + d * 137;
    const generator = new Generator({ seed, width: 40, height: 40 });
    const grid = generator.generate();

    for (let gy = 0; gy < grid.height; gy++) {
      for (let gx = 0; gx < grid.width; gx++) {
        totalCellsTested++;
        try {
          const bitmaskRes = getNeighborBitmask(grid, gx, gy);
          if (bitmaskRes.cardinalMask < 0 || bitmaskRes.cardinalMask > 15) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) invalid cardinalMask: ${bitmaskRes.cardinalMask}`);
          }
          if (bitmaskRes.fullMask < 0 || bitmaskRes.fullMask > 255) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) invalid fullMask: ${bitmaskRes.fullMask}`);
          }

          const wall = selectWallTile(grid, gx, gy);
          if (!VALID_WALL_MODELS.has(wall.modelName)) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) unknown wall model: ${wall.modelName}`);
          }
          if (typeof wall.yRotation !== "number" || isNaN(wall.yRotation) || wall.yRotation < 0 || wall.yRotation > 2 * Math.PI + 0.001) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) invalid wall rotation: ${wall.yRotation}`);
          }
          modelCounts[wall.modelName] = (modelCounts[wall.modelName] || 0) + 1;

          const floor = selectFloorTile(grid, gx, gy);
          if (!VALID_FLOOR_MODELS.has(floor.modelName)) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) unknown floor model: ${floor.modelName}`);
          }
          if (typeof floor.yRotation !== "number" || isNaN(floor.yRotation) || floor.yRotation < 0 || floor.yRotation > 2 * Math.PI + 0.001) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) invalid floor rotation: ${floor.yRotation}`);
          }
          modelCounts[floor.modelName] = (modelCounts[floor.modelName] || 0) + 1;

          const doorRot = selectDoorRotation(grid, gx, gy);
          if (typeof doorRot !== "number" || isNaN(doorRot) || doorRot < 0 || doorRot > 2 * Math.PI + 0.001) {
            errors.push(`Dungeon ${seed} cell (${gx},${gy}) invalid door rotation: ${doorRot}`);
          }
        } catch (e: any) {
          errors.push(`Dungeon ${seed} cell (${gx},${gy}) exception: ${e?.message || e}`);
        }
      }
    }
  }

  return { totalCellsTested, errors, modelCounts };
}

function testEdgeCases(): string[] {
  const edgeErrors: string[] = [];

  // Test 1: Grid boundary checks (0,0) on 1x1 grid
  const tinyGrid: DungeonGrid = {
    width: 1,
    height: 1,
    cells: [[{ type: TileType.Floor, roomId: null, isCorridor: false }]],
    rooms: [],
    spawnPosition: { x: 0, y: 0 },
    stairsPosition: { x: 0, y: 0 },
    seed: 123
  };

  try {
    const maskRes = getNeighborBitmask(tinyGrid, 0, 0);
    if (maskRes.fullMask !== 0 || maskRes.cardinalMask !== 0) {
      edgeErrors.push(`Edge check failed for out-of-bounds neighbors: expected 0, got full=${maskRes.fullMask}, card=${maskRes.cardinalMask}`);
    }
    const wall = selectWallTile(tinyGrid, 0, 0);
    if (!VALID_WALL_MODELS.has(wall.modelName)) edgeErrors.push(`Tiny grid wall model invalid: ${wall.modelName}`);
  } catch (e: any) {
    edgeErrors.push(`Tiny grid test threw exception: ${e?.message || e}`);
  }

  // Test 2: Walkable tile types (Floor, Door, Stairs)
  const walkableTypes = [TileType.Floor, TileType.Door, TileType.Stairs];
  for (const wType of walkableTypes) {
    const grid = createGridWithBitmask(0b11111111, 42, wType);
    const maskRes = getNeighborBitmask(grid, 1, 1);
    if (maskRes.fullMask !== 255) {
      edgeErrors.push(`Walkable type ${TileType[wType]} bitmask expected 255, got ${maskRes.fullMask}`);
    }
  }

  // Test 3: Unwalkable tile types (Wall, Empty)
  const unwalkableTypes = [TileType.Wall, TileType.Empty];
  for (const uType of unwalkableTypes) {
    const grid: DungeonGrid = {
      width: 3,
      height: 3,
      cells: [
        [{ type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }],
        [{ type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }],
        [{ type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }, { type: uType, roomId: null, isCorridor: false }]
      ],
      rooms: [],
      spawnPosition: { x: 1, y: 1 },
      stairsPosition: { x: 1, y: 1 },
      seed: 999
    };
    const maskRes = getNeighborBitmask(grid, 1, 1);
    if (maskRes.fullMask !== 0) {
      edgeErrors.push(`Unwalkable type ${TileType[uType]} bitmask expected 0, got ${maskRes.fullMask}`);
    }
  }

  // Test 4: Multiple seeds
  const testSeeds = [0, -1, 42, 999999, 0x7fffffff];
  for (const s of testSeeds) {
    const grid = createGridWithBitmask(1, s);
    const wall = selectWallTile(grid, 1, 1);
    const floor = selectFloorTile(grid, 1, 1);
    if (!VALID_WALL_MODELS.has(wall.modelName) || !VALID_FLOOR_MODELS.has(floor.modelName)) {
      edgeErrors.push(`Seed ${s} produced invalid model name: wall=${wall.modelName}, floor=${floor.modelName}`);
    }
  }

  return edgeErrors;
}

// Run Main Test Suite
console.log("=== EMPIRICAL TEST SUITE: Autotiler 256 Bitmask Verification ===");

const { results, totalErrors } = testAll256Bitmasks();
const edgeErrors = testEdgeCases();
const dungeonSweep = testGeneratedDungeons(10);

console.log(`\n1. Synthetic Bitmask Verification (0..255):`);
console.log(`   - Total Bitmasks Tested: 256`);
console.log(`   - Bitmask Test Failures: ${totalErrors}`);

console.log(`\n2. Corner & Boundary Edge Cases:`);
console.log(`   - Edge Case Failures: ${edgeErrors.length}`);
if (edgeErrors.length > 0) {
  edgeErrors.forEach(err => console.log(`     - ${err}`));
}

console.log(`\n3. Full Dungeon Sweep (10 Seeded Dungeons):`);
console.log(`   - Total Cells Evaluated: ${dungeonSweep.totalCellsTested}`);
console.log(`   - Dungeon Sweep Failures: ${dungeonSweep.errors.length}`);
if (dungeonSweep.errors.length > 0) {
  dungeonSweep.errors.forEach(err => console.log(`     - ${err}`));
}

// Summary Statistics
const wallModelCounts: Record<string, number> = {};
results.forEach(r => {
  wallModelCounts[r.wallModel] = (wallModelCounts[r.wallModel] || 0) + 1;
});

console.log("\n--- Model Name Distribution Across 256 Synthetic Bitmasks ---");
console.log(JSON.stringify(wallModelCounts, null, 2));

console.log("\n--- Model Name Counts Across 16,000 Dungeon Cells ---");
console.log(JSON.stringify(dungeonSweep.modelCounts, null, 2));

const overallSuccess = totalErrors === 0 && edgeErrors.length === 0 && dungeonSweep.errors.length === 0;
console.log(`\nFINAL VERDICT: ${overallSuccess ? "SUCCESS (APPROVE)" : "FAILURE (REJECT)"}`);
