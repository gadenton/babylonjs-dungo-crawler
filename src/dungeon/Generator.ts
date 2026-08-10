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
  y: number;          // Grid top
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
  width?: number;         // Explicit width (or generated if omitted)
  height?: number;        // Explicit height (or generated if omitted)
  minWidth?: number;      // Min dynamic width (default 55)
  maxWidth?: number;      // Max dynamic width (default 75)
  minHeight?: number;     // Min dynamic height (default 55)
  maxHeight?: number;     // Max dynamic height (default 75)
  minRoomSize?: number;   // Default 5
  maxRoomSize?: number;   // Default 10
  maxRooms?: number;      // Default 14
  corridorWidth?: number; // Default 1
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

export class Generator {
  private options: Required<GeneratorOptions>;
  private rng: SeedableRNG;

  constructor(options?: GeneratorOptions) {
    const seed = options?.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.rng = new SeedableRNG(seed);

    const minW = options?.minWidth ?? 55;
    const maxW = options?.maxWidth ?? 75;
    const minH = options?.minHeight ?? 55;
    const maxH = options?.maxHeight ?? 75;

    const width = options?.width ?? this.rng.rangeInt(minW, maxW);
    const height = options?.height ?? this.rng.rangeInt(minH, maxH);

    this.options = {
      width,
      height,
      minWidth: minW,
      maxWidth: maxW,
      minHeight: minH,
      maxHeight: maxH,
      minRoomSize: options?.minRoomSize ?? 5,
      maxRoomSize: options?.maxRoomSize ?? 10,
      maxRooms: options?.maxRooms ?? 14,
      corridorWidth: options?.corridorWidth ?? 1,
      seed,
    };
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

    // 2. Place non-overlapping rooms with minimum padding (4 tiles)
    const rooms: Room[] = [];
    const maxAttempts = this.options.maxRooms * 10;
    const roomPadding = 4; // Ensures clear corridor distance between rooms

    for (let attempt = 0; attempt < maxAttempts && rooms.length < this.options.maxRooms; attempt++) {
      const rw = this.rng.rangeInt(this.options.minRoomSize, this.options.maxRoomSize);
      const rh = this.rng.rangeInt(this.options.minRoomSize, this.options.maxRoomSize);
      
      const minX = 3;
      const maxX = W - rw - 4;
      const minY = 3;
      const maxY = H - rh - 4;

      if (maxX <= minX || maxY <= minY) continue;

      const rx = this.rng.rangeInt(minX, maxX);
      const ry = this.rng.rangeInt(minY, maxY);

      // Check for overlap with padding
      let overlaps = false;
      for (const other of rooms) {
        if (
          rx - roomPadding < other.x + other.width &&
          rx + rw + roomPadding > other.x &&
          ry - roomPadding < other.y + other.height &&
          ry + rh + roomPadding > other.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const room: Room = {
          id: rooms.length,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          centerX: Math.floor(rx + rw / 2),
          centerY: Math.floor(ry + rh / 2),
        };
        rooms.push(room);
        this.carveRoom(cells, room);
      }
    }

    // Fallback: ensure at least 2 rooms if map size was heavily constrained
    if (rooms.length < 2) {
      const r1: Room = { id: 0, x: 3, y: 3, width: 6, height: 6, centerX: 6, centerY: 6 };
      const r2: Room = { id: 1, x: W - 10, y: H - 10, width: 6, height: 6, centerX: W - 7, centerY: H - 7 };
      rooms.push(r1, r2);
      this.carveRoom(cells, r1);
      this.carveRoom(cells, r2);
    }

    // 3. Connect rooms sequentially (0 -> 1 -> 2 -> ... -> N-1) to guarantee 100% connectivity
    for (let i = 0; i < rooms.length - 1; i++) {
      const rA = rooms[i];
      const rB = rooms[i + 1];
      this.carveLCorridor(cells, rA.centerX, rA.centerY, rB.centerX, rB.centerY);
    }

    // Add 1 or 2 extra loop corridors for layout variety
    const extraLoops = Math.min(2, Math.floor(rooms.length / 4));
    for (let k = 0; k < extraLoops; k++) {
      const idxA = this.rng.rangeInt(0, rooms.length - 1);
      let idxB = this.rng.rangeInt(0, rooms.length - 1);
      if (idxA !== idxB && Math.abs(idxA - idxB) > 1) {
        this.carveLCorridor(cells, rooms[idxA].centerX, rooms[idxA].centerY, rooms[idxB].centerX, rooms[idxB].centerY);
      }
    }

    // 4. Select Spawn and Exit Stairs
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

    // 5. Place walls BEFORE doors so placeDoors knows exact wall topology
    this.placeWalls(cells);

    // 6. Door placement at room-corridor transitions framed strictly between two solid walls
    this.placeDoors(cells);

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

  private carveLCorridor(cells: CellMetadata[][], x1: number, y1: number, x2: number, y2: number): void {
    const W = this.options.width;
    const H = this.options.height;
    const cWidth = this.options.corridorWidth;

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

  private placeWalls(cells: CellMetadata[][]): void {
    const W = this.options.width;
    const H = this.options.height;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (cells[y][x].type === TileType.Empty) {
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
                  floorDirX += dx;
                  floorDirY += dy;
                }
              }
            }
          }

          if (isAdjacentToFloor) {
            cells[y][x].type = TileType.Wall;

            let rotation = 0;
            if (floorDirY < 0) {
              rotation = Math.PI;
            } else if (floorDirY > 0) {
              rotation = 0;
            } else if (floorDirX > 0) {
              rotation = (3 * Math.PI) / 2;
            } else if (floorDirX < 0) {
              rotation = Math.PI / 2;
            }
            cells[y][x].wallRotation = rotation;
          }
        }
      }
    }
  }

  private placeDoors(cells: CellMetadata[][]): void {
    const W = this.options.width;
    const H = this.options.height;

    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const cell = cells[y][x];
        // Only corridor floor tiles with no roomId
        if (cell.type !== TileType.Floor || !cell.isCorridor || cell.roomId !== null) {
          continue;
        }

        const nIsRoom = cells[y - 1][x].roomId !== null;
        const sIsRoom = cells[y + 1][x].roomId !== null;
        const eIsRoom = cells[y][x + 1].roomId !== null;
        const wIsRoom = cells[y][x - 1].roomId !== null;

        // N-S entrance: North is Room & South is Corridor (or vice-versa), AND BOTH East and West are Walls!
        const isNSDoorway =
          ((nIsRoom && !sIsRoom) || (sIsRoom && !nIsRoom)) &&
          !eIsRoom && !wIsRoom &&
          cells[y][x + 1].type === TileType.Wall &&
          cells[y][x - 1].type === TileType.Wall;

        // E-W entrance: East is Room & West is Corridor (or vice-versa), AND BOTH North and South are Walls!
        const isEWDoorway =
          ((eIsRoom && !wIsRoom) || (wIsRoom && !eIsRoom)) &&
          !nIsRoom && !sIsRoom &&
          cells[y - 1][x].type === TileType.Wall &&
          cells[y + 1][x].type === TileType.Wall;

        if (isNSDoorway || isEWDoorway) {
          // Ensure no adjacent door within a 2-tile radius
          let hasNearbyDoor = false;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < H && nx >= 0 && nx < W) {
                if (cells[ny][nx].type === TileType.Door) {
                  hasNearbyDoor = true;
                  break;
                }
              }
            }
            if (hasNearbyDoor) break;
          }

          if (!hasNearbyDoor) {
            cell.type = TileType.Door;
          }
        }
      }
    }
  }
}
