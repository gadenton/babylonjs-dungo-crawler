import { Generator, TileType, DungeonGrid, Room } from "../../src/dungeon/Generator";

interface TestResult {
  seed: number;
  roomCount: number;
  hasOverlap: boolean;
  minRoomsPassed: boolean;
  corridorsExist: boolean;
  doorsPlaced: number;
  doorsValidTransitions: boolean;
  spawnValid: boolean;
  exitStairsValid: boolean;
  stairsReachable: boolean;
  roomsReachableCount: number;
  totalRoomsCount: number;
  allRoomsReachable: boolean;
  roomFloorCellsReachablePercent: number;
  passed: boolean;
  errors: string[];
}

function runDungeonTest(seed: number): TestResult {
  const errors: string[] = [];
  const generator = new Generator({ seed, width: 40, height: 40 });
  const grid: DungeonGrid = generator.generate();

  const rooms = grid.rooms;
  const roomCount = rooms.length;
  const minRoomsPassed = roomCount >= 2;
  if (!minRoomsPassed) {
    errors.push(`Room count (${roomCount}) < 2`);
  }

  // 1. Check Room Overlap
  let hasOverlap = false;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];

      const overlapX = Math.max(r1.x, r2.x) < Math.min(r1.x + r1.width, r2.x + r2.width);
      const overlapY = Math.max(r1.y, r2.y) < Math.min(r1.y + r1.height, r2.y + r2.height);

      if (overlapX && overlapY) {
        hasOverlap = true;
        errors.push(`Rooms ${r1.id} [${r1.x},${r1.y},${r1.width}x${r1.height}] and ${r2.id} [${r2.x},${r2.y},${r2.width}x${r2.height}] overlap!`);
      }
    }
  }

  // 2. Check Corridors
  let corridorTileCount = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.cells[y][x].isCorridor) {
        corridorTileCount++;
      }
    }
  }
  const corridorsExist = corridorTileCount > 0;
  if (!corridorsExist) {
    errors.push("No corridor tiles generated.");
  }

  // 3. Check Doors
  let doorCount = 0;
  let doorsValidTransitions = true;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.cells[y][x];
      if (cell.type === TileType.Door) {
        doorCount++;
        // Verify adjacency: must be adjacent to at least one room cell and one corridor tile
        let adjRoom = false;
        let adjCorridor = false;
        const dirs = [
          { x: 0, y: 1 },
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
        ];
        for (const d of dirs) {
          const nx = x + d.x;
          const ny = y + d.y;
          if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
            const neighbor = grid.cells[ny][nx];
            if (neighbor.roomId !== null) adjRoom = true;
            if (neighbor.isCorridor) adjCorridor = true;
          }
        }
        if (!adjRoom || !adjCorridor) {
          doorsValidTransitions = false;
          errors.push(`Door at (${x},${y}) is not a valid room-corridor transition (adjRoom: ${adjRoom}, adjCorridor: ${adjCorridor})`);
        }
      }
    }
  }

  // 4. Check Spawn and Exit Stairs
  const spawnCell = grid.cells[grid.spawnPosition.y][grid.spawnPosition.x];
  const spawnValid = spawnCell.type === TileType.Floor || spawnCell.type === TileType.Door || spawnCell.type === TileType.Stairs;
  if (!spawnValid) {
    errors.push(`Spawn position (${grid.spawnPosition.x},${grid.spawnPosition.y}) is on type ${TileType[spawnCell.type]}`);
  }

  const stairsCell = grid.cells[grid.stairsPosition.y][grid.stairsPosition.x];
  const exitStairsValid = stairsCell.type === TileType.Stairs;
  if (!exitStairsValid) {
    errors.push(`Stairs position (${grid.stairsPosition.x},${grid.stairsPosition.y}) has type ${TileType[stairsCell.type]}, expected Stairs (4)`);
  }

  if (grid.spawnPosition.x === grid.stairsPosition.x && grid.spawnPosition.y === grid.stairsPosition.y) {
    errors.push("Spawn position and stairs position are identical!");
  }

  // 5. BFS Flood-Fill Reachability
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [grid.spawnPosition];
  visited.add(`${grid.spawnPosition.x},${grid.spawnPosition.y}`);

  const dirs = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
        const type = grid.cells[ny][nx].type;
        if (type === TileType.Floor || type === TileType.Door || type === TileType.Stairs) {
          const key = `${nx},${ny}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }

  const stairsReachable = visited.has(`${grid.stairsPosition.x},${grid.stairsPosition.y}`);
  if (!stairsReachable) {
    errors.push(`Exit stairs at (${grid.stairsPosition.x},${grid.stairsPosition.y}) are NOT reachable from spawn (${grid.spawnPosition.x},${grid.spawnPosition.y})`);
  }

  let roomsReachableCount = 0;
  for (const room of rooms) {
    if (visited.has(`${room.centerX},${room.centerY}`)) {
      roomsReachableCount++;
    } else {
      errors.push(`Room ${room.id} center (${room.centerX},${room.centerY}) is NOT reachable from spawn`);
    }
  }
  const allRoomsReachable = roomsReachableCount === rooms.length;

  let totalRoomFloorCells = 0;
  let reachableRoomFloorCells = 0;
  for (const room of rooms) {
    for (let ry = room.y; ry < room.y + room.height; ry++) {
      for (let rx = room.x; rx < room.x + room.width; rx++) {
        totalRoomFloorCells++;
        if (visited.has(`${rx},${ry}`)) {
          reachableRoomFloorCells++;
        }
      }
    }
  }
  const roomFloorCellsReachablePercent = totalRoomFloorCells > 0 ? (reachableRoomFloorCells / totalRoomFloorCells) * 100 : 0;
  if (roomFloorCellsReachablePercent < 100) {
    errors.push(`Only ${roomFloorCellsReachablePercent.toFixed(2)}% of room floor cells are reachable (${reachableRoomFloorCells}/${totalRoomFloorCells})`);
  }

  const passed =
    minRoomsPassed &&
    !hasOverlap &&
    corridorsExist &&
    doorsValidTransitions &&
    spawnValid &&
    exitStairsValid &&
    stairsReachable &&
    allRoomsReachable &&
    roomFloorCellsReachablePercent === 100;

  return {
    seed,
    roomCount,
    hasOverlap,
    minRoomsPassed,
    corridorsExist,
    doorsPlaced: doorCount,
    doorsValidTransitions,
    spawnValid,
    exitStairsValid,
    stairsReachable,
    roomsReachableCount,
    totalRoomsCount: rooms.length,
    allRoomsReachable,
    roomFloorCellsReachablePercent,
    passed,
    errors,
  };
}

// Main Test Execution
console.log("=================================================");
console.log("   BSP Procedural Dungeon Empirical Stress Test  ");
console.log("=================================================");

console.log("\n--- Detailed Results for Seeds 1 to 10 ---");
let seed1to10Passed = true;

for (let seed = 1; seed <= 10; seed++) {
  const res = runDungeonTest(seed);
  if (!res.passed) seed1to10Passed = false;

  console.log(`Seed ${seed.toString().padStart(2, ' ')}: ` +
    `Rooms=${res.roomCount}, Doors=${res.doorsPlaced}, ` +
    `Overlap=${res.hasOverlap ? 'FAIL' : 'OK'}, ` +
    `StairsReachable=${res.stairsReachable ? 'YES' : 'NO'}, ` +
    `AllRoomsReachable=${res.allRoomsReachable ? 'YES (' + res.roomsReachableCount + '/' + res.totalRoomsCount + ')' : 'NO'}, ` +
    `FloorReachability=${res.roomFloorCellsReachablePercent.toFixed(1)}%, ` +
    `Status=${res.passed ? 'PASS' : 'FAIL'}`
  );
  if (res.errors.length > 0) {
    console.log(`   Errors: ${res.errors.join('; ')}`);
  }
}

console.log("\n--- Extended Stress Test for Seeds 1 to 100 ---");
let totalPass = 0;
let totalFail = 0;
let minRoomsFound = Infinity;
let maxRoomsFound = 0;
let totalDoorsPlaced = 0;

for (let seed = 1; seed <= 100; seed++) {
  const res = runDungeonTest(seed);
  if (res.passed) {
    totalPass++;
  } else {
    totalFail++;
    console.error(`FAIL on seed ${seed}:`, res.errors);
  }
  if (res.roomCount < minRoomsFound) minRoomsFound = res.roomCount;
  if (res.roomCount > maxRoomsFound) maxRoomsFound = res.roomCount;
  totalDoorsPlaced += res.doorsPlaced;
}

console.log(`\nStress Test Summary (Seeds 1-100):`);
console.log(`  Total Tested: 100`);
console.log(`  Passed: ${totalPass}`);
console.log(`  Failed: ${totalFail}`);
console.log(`  Room Count Range: min=${minRoomsFound}, max=${maxRoomsFound}`);
console.log(`  Average Doors per Dungeon: ${(totalDoorsPlaced / 100).toFixed(1)}`);

if (totalFail > 0) {
  console.error(`\nVERDICT: REQUEST_CHANGES (${totalFail} seed(s) failed invariants)`);
  process.exit(1);
} else {
  console.log(`\nVERDICT: APPROVE (All 100 random seeds passed all structural & reachability invariants)`);
  process.exit(0);
}
