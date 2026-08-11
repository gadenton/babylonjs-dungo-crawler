import { Generator, TileType } from "../src/dungeon/Generator";

export async function runDungeonGenTest(): Promise<boolean> {
  console.log("\n=== [TEST] Dungeon Generator Reachability & Structure ===");
  const seeds = [42, 100, 12345, 99999, 77777, 314159, 271828, 88888, 123, 456];

  let allPassed = true;

  for (const seed of seeds) {
    const generator = new Generator({ seed });
    const grid = generator.generate();

    console.log(`Seed ${seed}:`);
    console.log(`  Dimensions: ${grid.width}x${grid.height}`);
    console.log(`  Rooms carved: ${grid.rooms.length}`);
    console.log(`  Spawn Position: (${grid.spawnPosition.x}, ${grid.spawnPosition.y})`);
    console.log(`  Stairs Position: (${grid.stairsPosition.x}, ${grid.stairsPosition.y})`);

    // Check spawn cell type
    const spawnCell = grid.cells[grid.spawnPosition.y][grid.spawnPosition.x];
    if (spawnCell.type !== TileType.Floor) {
      console.error(`  ❌ FAIL: Spawn cell is not Floor (type=${spawnCell.type})!`);
      allPassed = false;
    }

    // Check stairs cell type
    const stairsCell = grid.cells[grid.stairsPosition.y][grid.stairsPosition.x];
    if (stairsCell.type !== TileType.Stairs) {
      console.error(`  ❌ FAIL: Stairs cell is not Stairs (type=${stairsCell.type})!`);
      allPassed = false;
    }

    // Reachability check using BFS from spawn
    const visited = new Set<string>();
    const queue: { x: number; y: number }[] = [grid.spawnPosition];
    visited.add(`${grid.spawnPosition.x},${grid.spawnPosition.y}`);

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;

      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < grid.width && n.y >= 0 && n.y < grid.height) {
          const key = `${n.x},${n.y}`;
          const cell = grid.cells[n.y][n.x];
          if (!visited.has(key) && cell.type !== TileType.Empty && cell.type !== TileType.Wall) {
            visited.add(key);
            queue.push(n);
          }
        }
      }
    }

    // Verify stairs is reached
    const stairsKey = `${grid.stairsPosition.x},${grid.stairsPosition.y}`;
    if (!visited.has(stairsKey)) {
      console.error(`  ❌ FAIL: Stairs position (${grid.stairsPosition.x}, ${grid.stairsPosition.y}) is not reachable from spawn!`);
      allPassed = false;
    }

    // Verify all room centers are reached
    let unreachedRooms = 0;
    for (const room of grid.rooms) {
      const roomKey = `${room.centerX},${room.centerY}`;
      if (!visited.has(roomKey)) {
        unreachedRooms++;
      }
    }

    if (unreachedRooms > 0) {
      console.error(`  ❌ FAIL: ${unreachedRooms} room(s) unreached from spawn!`);
      allPassed = false;
    } else {
      console.log(`  ✅ PASS: All ${grid.rooms.length} rooms and stairs 100% reachable from spawn.`);
    }
  }

  if (allPassed) {
    console.log("=== Dungeon Generator Test PASSED ===");
  } else {
    console.error("=== Dungeon Generator Test FAILED ===");
  }

  return allPassed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDungeonGenTest().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}
