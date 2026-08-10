# 3D Modular Dungeon Wall Collision Rules

- **Visual Stone Face Alignment**: Align directional wall colliders flush with visual stone wall faces at tile center lines (`worldX` / `worldZ`), not cell outer bounds, to allow exact flush player touching.
- **Continuous Corner Extensions**: Directional wall colliders must check adjacent wall cell neighbors (`isNorthWall`, `isSouthWall`, `isEastWall`, `isWestWall`) and extend continuously to overlap perpendicular wall faces at `(worldX, worldZ)`, eliminating sliding gaps before room corners.
- **Ellipsoid Radius Harmony**: Player collision ellipsoid radius must scale proportionally with character model scale (`0.25 * modelScale`) to achieve 0.0000m flush wall touching without body mesh clipping or premature stopping.
