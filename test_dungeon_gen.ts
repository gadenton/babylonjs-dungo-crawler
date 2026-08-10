import { Generator, TileType } from "./src/dungeon/Generator";

async function testGenerator() {
  console.log("=== Testing New Rooms & Corridors Generator ===");
  const seeds = [42, 100, 12345, 99999, 77777, 314159, 271828, 88888, 123, 456];

  let allPassed = true;

  for (const seed of seeds) {
    const generator = new Generator({ seed });
    const grid = generator.generate();

    console.log(`\nSeed ${seed}:`);
    console.log(`  Dimensions: ${grid.width}x${grid.height}`);
    console.log(`  Rooms carved: ${grid.rooms.length}`);
    console.log(`  Spawn Position: (${grid.spawnPosition.x}, ${grid.spawnPosition.y})`);
    console.log(`  Stairs Position: (${grid.stairsPosition.x}, ${grid.stairsPosition.y})`);

    // Check bounds
    if (grid.width < 50 || grid.width > 80 || grid.height < 50 || grid.height > 80) {
      console.error(`  FAIL: Grid dimensions out of dynamic bounds [50, 80]!`);
      allPassed = false;
    }

    // Check spawn cell type
    const spawnCell = grid.cells[grid.spawnPosition.y][grid.spawnPosition.x];
    if (spawnCell.type !== TileType.Floor) {
      console.error(`  FAIL: Spawn cell is not Floor (type=${spawnCell.type})!`);
      allPassed = false;
    }

    // Check stairs cell type
    const stairsCell = grid.cells[grid.stairsPosition.y][grid.stairsPosition.x];
    if (stairsCell.type !== TileType.Stairs) {
      console.error(`  FAIL: Stairs cell is not Stairs (type=${stairsCell.type})!`);
      allPassed = false;
    }

    // Reachability check using BFS
    const visited = new Set<string>();
    const queue: [number, number][] = [[grid.spawnPosition.x, grid.spawnPosition.y]];
    visited.add(`${grid.spawnPosition.x},${grid.spawnPosition.y}`);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < grid.width && ny >= 0 && ny < grid.height) {
          const type = grid.cells[ny][nx].type;
          if (type === TileType.Floor || type === TileType.Door || type === TileType.Stairs) {
            const key = `${nx},${ny}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push([nx, ny]);
            }
          }
        }
      }
    }

    // Verify stairs reachable
    const stairsKey = `${grid.stairsPosition.x},${grid.stairsPosition.y}`;
    if (!visited.has(stairsKey)) {
      console.error(`  FAIL: Stairs unreachable from spawn!`);
      allPassed = false;
    }

    // Verify all room centers reachable
    let unreachableRooms = 0;
    for (const room of grid.rooms) {
      if (!visited.has(`${room.centerX},${room.centerY}`)) {
        unreachableRooms++;
      }
    }

    if (unreachableRooms > 0) {
      console.error(`  FAIL: ${unreachableRooms} rooms unreachable from spawn!`);
      allPassed = false;
    } else {
      console.log(`  PASS: All ${grid.rooms.length} rooms and stairs 100% reachable from spawn.`);
    }
  }

  console.log(`\n=== FINAL RESULT: ${allPassed ? "PASS" : "FAIL"} ===`);
  if (!allPassed) process.exit(1);
}

testGenerator().catch(err => {
  console.error(err);
  process.exit(1);
});
