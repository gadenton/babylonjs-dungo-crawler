import { DungeonGrid, TileType } from "./Generator";

export interface TileSelection {
  modelName: string;
  yRotation: number;
}

/**
  Checks if grid cell at (gx, gy) is walkable (Floor, Door, or Stairs).
 */
export function isWalkable(grid: DungeonGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gx >= grid.width || gy < 0 || gy >= grid.height) {
    return false;
  }
  const type = grid.cells[gy][gx].type;
  return type === TileType.Floor || type === TileType.Door || type === TileType.Stairs;
}

/**
 * Computes 8-neighbor bitmask for cell at (gx, gy).
 * Bit 0 (1): North (gx, gy + 1)
 * Bit 1 (2): East (gx + 1, gy)
 * Bit 2 (4): South (gx, gy - 1)
 * Bit 3 (8): West (gx - 1, gy)
 * Bit 4 (16): North-East (gx + 1, gy + 1)
 * Bit 5 (32): South-East (gx + 1, gy - 1)
 * Bit 6 (64): South-West (gx - 1, gy - 1)
 * Bit 7 (128): North-West (gx - 1, gy + 1)
 */
export function getNeighborBitmask(grid: DungeonGrid, gx: number, gy: number): { cardinalMask: number; fullMask: number } {
  let fullMask = 0;

  if (isWalkable(grid, gx, gy + 1)) fullMask |= 1;   // N
  if (isWalkable(grid, gx + 1, gy)) fullMask |= 2;   // E
  if (isWalkable(grid, gx, gy - 1)) fullMask |= 4;   // S
  if (isWalkable(grid, gx - 1, gy)) fullMask |= 8;   // W

  if (isWalkable(grid, gx + 1, gy + 1)) fullMask |= 16;  // NE
  if (isWalkable(grid, gx + 1, gy - 1)) fullMask |= 32;  // SE
  if (isWalkable(grid, gx - 1, gy - 1)) fullMask |= 64;  // SW
  if (isWalkable(grid, gx - 1, gy + 1)) fullMask |= 128; // NW

  const cardinalMask = fullMask & 0x0f;
  return { cardinalMask, fullMask };
}

/**
 * Selects the wall piece model name and Y-rotation angle based on the 8-neighbor bitmask.
 * Returns null for diagonal-only cells (cardinalMask === 0) because the adjacent cardinal
 * straight walls already fully enclose the room corner, preventing sticking-out wall fins.
 */
export function selectWallTile(grid: DungeonGrid, gx: number, gy: number): TileSelection | null {
  const { cardinalMask } = getNeighborBitmask(grid, gx, gy);

  // Deterministic seed-based variation for straight wall details
  const detailHash = (gx * 47 + gy * 23 + grid.seed) % 100;
  const straightWallModel = detailHash < 15 ? "template-wall-detail-a.glb" : "template-wall.glb";

  switch (cardinalMask) {
    // ── Straight Walls (1 cardinal walkable neighbor) ──
    case 1: // N is walkable -> Wall along South edge facing North (+Z)
      return { modelName: straightWallModel, yRotation: 0 };
    case 2: // E is walkable -> Wall along West edge facing East (+X)
      return { modelName: straightWallModel, yRotation: Math.PI / 2 };
    case 4: // S is walkable -> Wall along North edge facing South (-Z)
      return { modelName: straightWallModel, yRotation: Math.PI };
    case 8: // W is walkable -> Wall along East edge facing West (-X)
      return { modelName: straightWallModel, yRotation: (3 * Math.PI) / 2 };

    // ── Inner Corners (2 adjacent cardinal walkable neighbors) ──
    case 3: // N + E walkable -> Inner corner facing NE
      return { modelName: "template-wall-corner.glb", yRotation: 0 };
    case 6: // E + S walkable -> Inner corner facing SE
      return { modelName: "template-wall-corner.glb", yRotation: Math.PI / 2 };
    case 12: // S + W walkable -> Inner corner facing SW
      return { modelName: "template-wall-corner.glb", yRotation: Math.PI };
    case 9: // W + N walkable -> Inner corner facing NW
      return { modelName: "template-wall-corner.glb", yRotation: (3 * Math.PI) / 2 };

    // ── T-Junctions / Narrow Walls / End Caps ──
    // Use full-height straight wall pieces to prevent half-height gaps in wall lines
    case 5: // N + S walkable (opposite)
      return { modelName: "template-wall.glb", yRotation: 0 };
    case 10: // E + W walkable (opposite)
      return { modelName: "template-wall.glb", yRotation: Math.PI / 2 };
    case 7: // N + E + S walkable (W is wall)
      return { modelName: "template-wall.glb", yRotation: Math.PI / 2 };
    case 14: // E + S + W walkable (N is wall)
      return { modelName: "template-wall.glb", yRotation: Math.PI };
    case 13: // S + W + N walkable (E is wall)
      return { modelName: "template-wall.glb", yRotation: (3 * Math.PI) / 2 };
    case 11: // W + N + E walkable (S is wall)
      return { modelName: "template-wall.glb", yRotation: 0 };
    case 15: // N + E + S + W walkable (isolated pillar)
      return { modelName: "template-wall-half.glb", yRotation: 0 };

    // ── Outer Corners / Diagonal-Only (0 cardinal walkable neighbors) ──
    // The straight walls on adjacent cardinal cells ALREADY enclose the room corner.
    // Returning null prevents placing a wall piece outside the room line into the corridor.
    case 0:
    default:
      return null;
  }
}

/**
 * Selects floor tile model and Y-rotation for visual texture variation.
 */
export function selectFloorTile(grid: DungeonGrid, gx: number, gy: number): TileSelection {
  const detailVal = (gx * 31 + gy * 17 + grid.seed) % 100;
  let modelName = "template-floor.glb";
  if (detailVal < 12) {
    modelName = "template-floor-detail.glb";
  } else if (detailVal < 24) {
    modelName = "template-floor-detail-a.glb";
  }

  const rotIndex = (gx * 13 + gy * 7 + grid.seed) % 4;
  const yRotation = rotIndex * (Math.PI / 2);

  return { modelName, yRotation };
}

/**
 * Selects door frame Y-rotation based on corridor orientation.
 */
export function selectDoorRotation(grid: DungeonGrid, gx: number, gy: number): number {
  const nWalkable = isWalkable(grid, gx, gy + 1);
  const sWalkable = isWalkable(grid, gx, gy - 1);

  if (nWalkable && sWalkable) {
    // North-South corridor: door frame stretches East-West (rotation 0)
    return 0;
  }
  // East-West corridor: door frame stretches North-South (rotation PI/2)
  return Math.PI / 2;
}
