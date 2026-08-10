import { Generator, TileType, DungeonGrid } from '../../src/dungeon/Generator.ts';

function bfsVisited(grid: DungeonGrid, start: { x: number; y: number }): Set<string> {
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [start];
  visited.add(`${start.x},${start.y}`);

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

  return visited;
}

function runReachabilitySuite() {
  console.log("==================================================");
  console.log("STARTING EMPIRICAL DUNGEON REACHABILITY TEST SUITE");
  console.log("==================================================");

  let totalDungeons = 0;
  let passedDungeons = 0;
  let totalRooms = 0;
  let reachableRooms = 0;
  let reachableStairs = 0;
  const failedSeeds: number[] = [];

  // Sweep 500 seeds with standard options
  const numSeeds = 500;
  for (let seed = 1; seed <= numSeeds; seed++) {
    totalDungeons++;
    const generator = new Generator({ seed, width: 40, height: 40 });
    const grid = generator.generate();

    const visited = bfsVisited(grid, grid.spawnPosition);

    const stairsKey = `${grid.stairsPosition.x},${grid.stairsPosition.y}`;
    const stairsReachable = visited.has(stairsKey);
    if (stairsReachable) reachableStairs++;

    let allRoomsInGridReachable = true;
    for (const room of grid.rooms) {
      totalRooms++;
      const centerKey = `${room.centerX},${room.centerY}`;
      if (visited.has(centerKey)) {
        reachableRooms++;
      } else {
        allRoomsInGridReachable = false;
      }
    }

    if (stairsReachable && allRoomsInGridReachable) {
      passedDungeons++;
    } else {
      failedSeeds.push(seed);
    }
  }

  console.log(`[Suite 1: Standard 40x40 Grid (500 seeds)]`);
  console.log(`  Total Dungeons Tested : ${totalDungeons}`);
  console.log(`  Passed Dungeons       : ${passedDungeons} (${((passedDungeons / totalDungeons) * 100).toFixed(2)}%)`);
  console.log(`  Total Rooms Generated : ${totalRooms}`);
  console.log(`  Reachable Rooms       : ${reachableRooms} (${((reachableRooms / totalRooms) * 100).toFixed(2)}%)`);
  console.log(`  Reachable Exit Stairs : ${reachableStairs} (${((reachableStairs / totalDungeons) * 100).toFixed(2)}%)`);

  // Sweep various configurations
  const customConfigs = [
    { label: "Small 25x25 Grid", width: 25, height: 25, minRoomSize: 4, maxRoomSize: 8, seeds: 100 },
    { label: "Large 60x60 Grid", width: 60, height: 60, minRoomSize: 5, maxRoomSize: 12, seeds: 100 },
    { label: "Tight Min Room (3x3)", width: 40, height: 40, minRoomSize: 3, maxRoomSize: 7, seeds: 100 },
    { label: "Deep BSP Tree (depth 5)", width: 50, height: 50, minRoomSize: 4, maxRoomSize: 10, maxDepth: 5, seeds: 100 },
  ];

  for (const cfg of customConfigs) {
    let cfgTotal = 0;
    let cfgPassed = 0;
    let cfgRooms = 0;
    let cfgReachableRooms = 0;
    let cfgReachableStairs = 0;

    for (let s = 1000; s < 1000 + cfg.seeds; s++) {
      cfgTotal++;
      const gen = new Generator({ seed: s, ...cfg });
      const grid = gen.generate();
      const visited = bfsVisited(grid, grid.spawnPosition);

      const stairsOk = visited.has(`${grid.stairsPosition.x},${grid.stairsPosition.y}`);
      if (stairsOk) cfgReachableStairs++;

      let roomsOk = true;
      for (const r of grid.rooms) {
        cfgRooms++;
        if (visited.has(`${r.centerX},${r.centerY}`)) {
          cfgReachableRooms++;
        } else {
          roomsOk = false;
        }
      }

      if (stairsOk && roomsOk) cfgPassed++;
    }

    console.log(`[Suite 2: ${cfg.label}]`);
    console.log(`  Dungeons: ${cfgPassed}/${cfgTotal} passed (${((cfgPassed / cfgTotal) * 100).toFixed(2)}%)`);
    console.log(`  Rooms   : ${cfgReachableRooms}/${cfgRooms} reachable (${((cfgReachableRooms / cfgRooms) * 100).toFixed(2)}%)`);
    console.log(`  Stairs  : ${cfgReachableStairs}/${cfgTotal} reachable (${((cfgReachableStairs / cfgTotal) * 100).toFixed(2)}%)`);

    if (cfgPassed !== cfgTotal) {
      failedSeeds.push(-1);
    }
  }

  if (failedSeeds.length > 0) {
    console.error(`\nFAILED! Reachability failed for seeds: ${failedSeeds.join(', ')}`);
    process.exit(1);
  } else {
    console.log(`\nSUCCESS! 100% of rooms and exit stairs are reachable across all tested seeds & configurations.`);
  }
}

runReachabilitySuite();
