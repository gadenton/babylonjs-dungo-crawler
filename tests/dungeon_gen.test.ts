import { describe, it, expect } from "vitest";
import { Generator, TileType } from "../src/dungeon/Generator";

describe("Dungeon Generator Reachability & Structure", () => {
  const seeds = [42, 100, 12345, 99999, 77777, 314159, 271828, 88888, 123, 456];

  for (const seed of seeds) {
    it(`should generate a valid and 100% reachable dungeon for seed ${seed}`, () => {
      const generator = new Generator({ seed });
      const grid = generator.generate();

      expect(grid.rooms.length).toBeGreaterThan(0);

      // Check spawn cell type is Floor
      const spawnCell = grid.cells[grid.spawnPosition.y][grid.spawnPosition.x];
      expect(spawnCell.type).toBe(TileType.Floor);

      // Check stairs cell type is Stairs
      const stairsCell = grid.cells[grid.stairsPosition.y][grid.stairsPosition.x];
      expect(stairsCell.type).toBe(TileType.Stairs);

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

      // Verify stairs is reachable
      const stairsKey = `${grid.stairsPosition.x},${grid.stairsPosition.y}`;
      expect(visited.has(stairsKey)).toBe(true);

      // Verify all room centers are reachable
      for (const room of grid.rooms) {
        const roomKey = `${room.centerX},${room.centerY}`;
        expect(visited.has(roomKey)).toBe(true);
      }
    });
  }
});
