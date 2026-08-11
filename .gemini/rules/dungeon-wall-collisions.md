# 3D Modular Dungeon Wall Collision Rules

- **Visual Stone Face Alignment**: Align directional wall colliders flush with visual stone wall faces at tile center lines (`worldX` / `worldZ`), not cell outer bounds, to allow exact flush player touching.
- **Continuous Corner Extensions**: Directional wall colliders must check adjacent wall cell neighbors (`isNorthWall`, `isSouthWall`, `isEastWall`, `isWestWall`) and extend continuously to overlap perpendicular wall faces at `(worldX, worldZ)`, eliminating sliding gaps before room corners.
- **Ellipsoid Radius Harmony**: Player collision ellipsoid radius must scale proportionally with character model scale (`0.25 * modelScale`) to achieve 0.0000m flush wall touching without body mesh clipping or premature stopping.
- **Kenney 3D Modular Wall Boundary Offset Rule**: Kenney `template-wall.glb` meshes are local-pivot centered. Instantiating wall meshes at tile cell centers (`pos = (worldX, elevation, worldZ)`) pushes wall faces 1.0 meter inside the cell, causing walls to cross through each other in room centers and leaving 1-meter gaps at outer corners. Always offset wall positions by **1.0m directly onto the tile boundary edge**:
  - **North Wall (`nN`)**: `pos = (worldX, elevation, worldZ + 1.0)` (`rotY = 0`)
  - **South Wall (`nS`)**: `pos = (worldX, elevation, worldZ - 1.0)` (`rotY = 0`)
  - **East Wall (`nE`)**: `pos = (worldX + 1.0, elevation, worldZ)` (`rotY = Math.PI / 2`)
  - **West Wall (`nW`)**: `pos = (worldX - 1.0, elevation, worldZ)` (`rotY = Math.PI / 2`)
- **Flush Corner Pillar Locking**: Perpendicular walls placed with 1.0m boundary offsets meet flush at corner vertices `(worldX ± 1.0, worldZ ± 1.0)`. Lock outer 90° corners and inner L-junctions with a single 4.0m stone column (`column.glb`) for clean castle fortress battlements without scaling hacks or cross-fins.
- **Single-Layer Perimeter Rule**: Never instantiate separate redundant terrace/retaining wall riser loops alongside perimeter walls that already extend to ground level, as this creates unwanted double-layer wall artifacts.
