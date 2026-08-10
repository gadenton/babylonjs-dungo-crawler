export enum TileType {
  Empty = 0,
  Floor = 1,
  Wall = 2,
  Door = 3,
  Stairs = 4,
}

export interface Room {
  id: number;
  x: number;          // Grid left
  y: number;          // Grid top (z in 3D grid)
  width: number;      // Grid width
  height: number;     // Grid height
  centerX: number;
  centerY: number;
}

export interface CellMetadata {
  type: TileType;
  roomId: number | null;
  isCorridor: boolean;
  wallRotation?: number; // 0, Math.PI/2, Math.PI, 3*Math.PI/2
}

export interface DungeonGrid {
  width: number;
  height: number;
  cells: CellMetadata[][];
  rooms: Room[];
  spawnPosition: { x: number; y: number };
  stairsPosition: { x: number; y: number };
  seed: number;
}

export interface GeneratorOptions {
  width?: number;         // Default 40
  height?: number;        // Default 40
  minRoomSize?: number;   // Default 4
  maxRoomSize?: number;   // Default 10
  maxDepth?: number;      // Default 4
  corridorWidth?: number; // Default 2
  seed?: number;          // Optional seed (auto-generated if undefined)
}

/** Seedable PRNG using Mulberry32 */
export class SeedableRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns pseudo-random float in range [0, 1) */
  public random(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns random integer in inclusive range [min, max] */
  public rangeInt(min: number, max: number): number {
    if (min >= max) return min;
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Returns random item from array */
  public choice<T>(array: T[]): T {
    return array[Math.floor(this.random() * array.length)];
  }
}

class BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  leftChild: BSPNode | null = null;
  rightChild: BSPNode | null = null;
  room: Room | null = null;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  public isLeaf(): boolean {
    return this.leftChild === null && this.rightChild === null;
  }
}

export class Generator {
  private options: Required<GeneratorOptions>;
  private rng: SeedableRNG;

  constructor(options?: GeneratorOptions) {
    const seed = options?.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.options = {
      width: options?.width ?? 40,
      height: options?.height ?? 40,
      minRoomSize: options?.minRoomSize ?? 4,
      maxRoomSize: options?.maxRoomSize ?? 10,
      maxDepth: options?.maxDepth ?? 4,
      corridorWidth: options?.corridorWidth ?? 2,
      seed,
    };
    this.rng = new SeedableRNG(this.options.seed);
  }

  public generate(): DungeonGrid {
    const W = this.options.width;
    const H = this.options.height;

    // 1. Initialize empty grid
    const cells: CellMetadata[][] = [];
    for (let y = 0; y < H; y++) {
      const row: CellMetadata[] = [];
      for (let x = 0; x < W; x++) {
        row.push({
          type: TileType.Empty,
          roomId: null,
          isCorridor: false,
        });
      }
      cells.push(row);
    }

    // 2. Build BSP Tree within bounds [1, W-2] x [1, H-2]
    const rootNode = new BSPNode(1, 1, W - 2, H - 2);
    this.splitNode(rootNode, 0);

    // 3. Create rooms in leaf nodes
    const rooms: Room[] = [];
    this.createRoomsInLeaves(rootNode, cells, rooms);

    // Ensure we have at least 2 rooms
    if (rooms.length < 2) {
      // Fallback: force manual rooms if BSP created too few
      const r1: Room = { id: 0, x: 2, y: 2, width: 6, height: 6, centerX: 5, centerY: 5 };
      const r2: Room = { id: 1, x: W - 9, y: H - 9, width: 6, height: 6, centerX: W - 6, centerY: H - 6 };
      rooms.push(r1, r2);
      this.carveRoom(cells, r1);
      this.carveRoom(cells, r2);
    }

    // 4. Connect rooms with 2-tile wide L-corridors bottom-up
    this.connectBSPNodes(rootNode, cells);

    // 5. Select Spawn and Exit Stairs
    const spawnRoom = rooms[0];
    let farthestRoom = rooms[rooms.length - 1];
    let maxDist = -1;
    for (let i = 1; i < rooms.length; i++) {
      const dist = Math.abs(rooms[i].centerX - spawnRoom.centerX) + Math.abs(rooms[i].centerY - spawnRoom.centerY);
      if (dist > maxDist) {
        maxDist = dist;
        farthestRoom = rooms[i];
      }
    }

    const spawnPosition = { x: spawnRoom.centerX, y: spawnRoom.centerY };
    const stairsPosition = { x: farthestRoom.centerX, y: farthestRoom.centerY };

    cells[stairsPosition.y][stairsPosition.x].type = TileType.Stairs;

    // 6. Door placement at room-corridor transitions
    this.placeDoors(cells);

    // 7. BFS Flood Fill validation and reachability repair
    this.ensureReachability(cells, rooms, spawnPosition, stairsPosition);

    // 8. Place wall boundaries around floor cells
    this.placeWalls(cells);

    return {
      width: W,
      height: H,
      cells,
      rooms,
      spawnPosition,
      stairsPosition,
      seed: this.options.seed,
    };
  }

  private splitNode(node: BSPNode, depth: number): void {
    if (depth >= this.options.maxDepth) return;

    const minSize = this.options.minRoomSize + 2;
    const canSplitVertically = node.width >= minSize * 2;
    const canSplitHorizontally = node.height >= minSize * 2;

    if (!canSplitVertically && !canSplitHorizontally) return;

    let splitVertical = false;
    if (canSplitVertically && canSplitHorizontally) {
      if (node.width / node.height > 1.25) {
        splitVertical = true;
      } else if (node.height / node.width > 1.25) {
        splitVertical = false;
      } else {
        splitVertical = this.rng.random() < 0.5;
      }
    } else {
      splitVertical = canSplitVertically;
    }

    if (splitVertical) {
      const splitX = this.rng.rangeInt(minSize, node.width - minSize);
      node.leftChild = new BSPNode(node.x, node.y, splitX, node.height);
      node.rightChild = new BSPNode(node.x + splitX, node.y, node.width - splitX, node.height);
    } else {
      const splitY = this.rng.rangeInt(minSize, node.height - minSize);
      node.leftChild = new BSPNode(node.x, node.y, node.width, splitY);
      node.rightChild = new BSPNode(node.x, node.y + splitY, node.width, node.height - splitY);
    }

    this.splitNode(node.leftChild, depth + 1);
    this.splitNode(node.rightChild, depth + 1);
  }

  private createRoomsInLeaves(node: BSPNode, cells: CellMetadata[][], rooms: Room[]): void {
    if (node.isLeaf()) {
      const minW = Math.max(this.options.minRoomSize, 4);
      const maxW = Math.min(this.options.maxRoomSize, node.width - 2);
      const minH = Math.max(this.options.minRoomSize, 4);
      const maxH = Math.min(this.options.maxRoomSize, node.height - 2);

      if (maxW < minW || maxH < minH) return;

      const roomW = this.rng.rangeInt(minW, maxW);
      const roomH = this.rng.rangeInt(minH, maxH);
      const roomX = node.x + this.rng.rangeInt(1, Math.max(1, node.width - roomW - 1));
      const roomY = node.y + this.rng.rangeInt(1, Math.max(1, node.height - roomH - 1));

      const room: Room = {
        id: rooms.length,
        x: roomX,
        y: roomY,
        width: roomW,
        height: roomH,
        centerX: Math.floor(roomX + roomW / 2),
        centerY: Math.floor(roomY + roomH / 2),
      };

      node.room = room;
      rooms.push(room);

      this.carveRoom(cells, room);
    } else {
      if (node.leftChild) this.createRoomsInLeaves(node.leftChild, cells, rooms);
      if (node.rightChild) this.createRoomsInLeaves(node.rightChild, cells, rooms);
    }
  }

  private carveRoom(cells: CellMetadata[][], room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (y > 0 && y < this.options.height - 1 && x > 0 && x < this.options.width - 1) {
          cells[y][x].type = TileType.Floor;
          cells[y][x].roomId = room.id;
        }
      }
    }
  }

  private getRoomCenterFromSubtree(node: BSPNode): { x: number; y: number } | null {
    if (node.room) return { x: node.room.centerX, y: node.room.centerY };
    if (node.leftChild) {
      const res = this.getRoomCenterFromSubtree(node.leftChild);
      if (res) return res;
    }
    if (node.rightChild) {
      const res = this.getRoomCenterFromSubtree(node.rightChild);
      if (res) return res;
    }
    return null;
  }

  private connectBSPNodes(node: BSPNode, cells: CellMetadata[][]): void {
    if (node.isLeaf()) return;

    if (node.leftChild && node.rightChild) {
      this.connectBSPNodes(node.leftChild, cells);
      this.connectBSPNodes(node.rightChild, cells);

      const c1 = this.getRoomCenterFromSubtree(node.leftChild);
      const c2 = this.getRoomCenterFromSubtree(node.rightChild);

      if (c1 && c2) {
        this.carveLCorridor(cells, c1.x, c1.y, c2.x, c2.y);
      }
    }
  }

  private carveLCorridor(cells: CellMetadata[][], x1: number, y1: number, x2: number, y2: number): void {
    const W = this.options.width;
    const H = this.options.height;
    const cWidth = this.options.corridorWidth; // 2 tiles wide

    // Random choice: horizontal first or vertical first
    const hFirst = this.rng.random() < 0.5;

    if (hFirst) {
      // Horizontal segment: x1 -> x2 at y1
      const startX = Math.min(x1, x2);
      const endX = Math.max(x1, x2);
      for (let x = startX; x <= endX; x++) {
        for (let dw = 0; dw < cWidth; dw++) {
          const cy = y1 + dw;
          if (x > 0 && x < W - 1 && cy > 0 && cy < H - 1) {
            if (cells[cy][x].type === TileType.Empty) {
              cells[cy][x].type = TileType.Floor;
            }
            cells[cy][x].isCorridor = true;
          }
        }
      }

      // Vertical segment: y1 -> y2 at x2
      const startY = Math.min(y1, y2);
      const endY = Math.max(y1, y2);
      for (let y = startY; y <= endY; y++) {
        for (let dw = 0; dw < cWidth; dw++) {
          const cx = x2 + dw;
          if (cx > 0 && cx < W - 1 && y > 0 && y < H - 1) {
            if (cells[y][cx].type === TileType.Empty) {
              cells[y][cx].type = TileType.Floor;
            }
            cells[y][cx].isCorridor = true;
          }
        }
      }
    } else {
      // Vertical segment: y1 -> y2 at x1
      const startY = Math.min(y1, y2);
      const endY = Math.max(y1, y2);
      for (let y = startY; y <= endY; y++) {
        for (let dw = 0; dw < cWidth; dw++) {
          const cx = x1 + dw;
          if (cx > 0 && cx < W - 1 && y > 0 && y < H - 1) {
            if (cells[y][cx].type === TileType.Empty) {
              cells[y][cx].type = TileType.Floor;
            }
            cells[y][cx].isCorridor = true;
          }
        }
      }

      // Horizontal segment: x1 -> x2 at y2
      const startX = Math.min(x1, x2);
      const endX = Math.max(x1, x2);
      for (let x = startX; x <= endX; x++) {
        for (let dw = 0; dw < cWidth; dw++) {
          const cy = y2 + dw;
          if (x > 0 && x < W - 1 && cy > 0 && cy < H - 1) {
            if (cells[cy][x].type === TileType.Empty) {
              cells[cy][x].type = TileType.Floor;
            }
            cells[cy][x].isCorridor = true;
          }
        }
      }
    }
  }

  private placeDoors(cells: CellMetadata[][]): void {
    const W = this.options.width;
    const H = this.options.height;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const cell = cells[y][x];
        if (cell.type === TileType.Floor && cell.isCorridor && cell.roomId === null) {
          // Check if adjacent to a room cell
          const northRoom = cells[y - 1][x].roomId !== null;
          const southRoom = cells[y + 1][x].roomId !== null;
          const eastRoom = cells[y][x + 1].roomId !== null;
          const westRoom = cells[y][x - 1].roomId !== null;

          if ((northRoom || southRoom) !== (eastRoom || westRoom)) {
            // Check wall boundaries on sides
            cell.type = TileType.Door;
          }
        }
      }
    }
  }

  private ensureReachability(
    cells: CellMetadata[][],
    rooms: Room[],
    spawnPos: { x: number; y: number },
    stairsPos: { x: number; y: number }
  ): void {
    const W = this.options.width;
    const H = this.options.height;

    const isVisited = (start: { x: number; y: number }): Set<string> => {
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
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const type = cells[ny][nx].type;
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
    };

    let visited = isVisited(spawnPos);

    // Verify stairs reachable
    if (!visited.has(`${stairsPos.x},${stairsPos.y}`)) {
      this.carveLCorridor(cells, spawnPos.x, spawnPos.y, stairsPos.x, stairsPos.y);
      visited = isVisited(spawnPos);
    }

    // Verify all room centers reachable
    for (const room of rooms) {
      if (!visited.has(`${room.centerX},${room.centerY}`)) {
        this.carveLCorridor(cells, spawnPos.x, spawnPos.y, room.centerX, room.centerY);
        visited = isVisited(spawnPos);
      }
    }
  }

  private placeWalls(cells: CellMetadata[][]): void {
    const W = this.options.width;
    const H = this.options.height;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (cells[y][x].type === TileType.Empty) {
          // Check if adjacent to floor/door/stairs
          let isAdjacentToFloor = false;
          let floorDirX = 0;
          let floorDirY = 0;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                const neighborType = cells[ny][nx].type;
                if (
                  neighborType === TileType.Floor ||
                  neighborType === TileType.Door ||
                  neighborType === TileType.Stairs
                ) {
                  isAdjacentToFloor = true;
                  if (dx !== 0 || dy !== 0) {
                    floorDirX += dx;
                    floorDirY += dy;
                  }
                }
              }
            }
          }

          if (isAdjacentToFloor) {
            cells[y][x].type = TileType.Wall;

            // Determine rotation based on primary floor direction relative to wall
            // Wall faces towards the floor interior
            let rotation = 0;
            if (floorDirY < 0) {
              rotation = Math.PI; // Floor to South (-Y in grid)
            } else if (floorDirY > 0) {
              rotation = 0; // Floor to North (+Y in grid)
            } else if (floorDirX > 0) {
              rotation = (3 * Math.PI) / 2; // Floor to East (+X in grid)
            } else if (floorDirX < 0) {
              rotation = Math.PI / 2; // Floor to West (-X in grid)
            }
            cells[y][x].wallRotation = rotation;
          }
        }
      }
    }
  }
}
