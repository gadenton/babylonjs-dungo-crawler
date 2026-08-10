import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { DungeonGrid, TileType } from "../dungeon/Generator";

export class MapOverlay {
  private scene: Scene;
  private player: Player;
  private grid: DungeonGrid | null = null;
  private guiTexture: AdvancedDynamicTexture;

  // Fog of War / Exploration
  private exploredCells: Set<string> = new Set();
  private explorationRadius: number = 10; // Grid cells

  // UI Containers
  private container: Rectangle;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Modes: "overlay" (Diablo ARPG fullscreen overlay), "minimap" (corner)
  private isOverlayVisible: boolean = false;
  private isMinimapVisible: boolean = true;

  constructor(scene: Scene, player: Player) {
    this.scene = scene;
    this.player = player;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("MapOverlayUI", true, this.scene);

    // Create 2D HTML5 canvas overlay with fixed position & high z-index (above Babylon GUI)
    this.canvasElement = document.createElement("canvas");
    this.canvasElement.id = "arpgMapCanvas";
    this.canvasElement.style.position = "fixed";
    this.canvasElement.style.top = "0px";
    this.canvasElement.style.left = "0px";
    this.canvasElement.style.width = "100vw";
    this.canvasElement.style.height = "100vh";
    this.canvasElement.style.pointerEvents = "none";
    this.canvasElement.style.zIndex = "1000"; // Higher than Babylon GUI
    document.body.appendChild(this.canvasElement);

    this.ctx = this.canvasElement.getContext("2d")!;

    // Title banner container (Translucent backdrop so gameplay is visible through UI)
    this.container = new Rectangle("mapContainer");
    this.container.width = "100%";
    this.container.height = "100%";
    this.container.background = "rgba(0, 0, 0, 0.0)"; // Completely transparent background
    this.container.color = "#DAA520";
    this.container.thickness = 0;
    this.container.isVisible = false;
    this.guiTexture.addControl(this.container);

    const titleText = new TextBlock("mapTitleText", "DUNGEON MAP OVERLAY [M] / [TAB] TO TOGGLE");
    titleText.color = "#FFD700";
    titleText.fontSize = 14;
    titleText.fontWeight = "bold";
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    titleText.top = "20px";
    this.container.addControl(titleText);

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  public setGrid(grid: DungeonGrid): void {
    this.grid = grid;
    this.exploredCells.clear();
  }

  private resizeCanvas(): void {
    this.canvasElement.width = window.innerWidth;
    this.canvasElement.height = window.innerHeight;
  }

  public toggleOverlay(): void {
    this.isOverlayVisible = !this.isOverlayVisible;
    this.container.isVisible = this.isOverlayVisible;
  }

  public setOverlayVisible(visible: boolean): void {
    this.isOverlayVisible = visible;
    this.container.isVisible = visible;
  }

  public update(deltaTime: number, enemies: Enemy[] = []): void {
    if (!this.grid || !this.player) return;

    // 1. Update Exploration Fog-of-War around Player using REAL world position (this.player.position)
    const playerPos = this.player.position;
    const playerGx = Math.floor(playerPos.x / 2.0);
    const playerGy = Math.floor(playerPos.z / 2.0);

    for (let dy = -this.explorationRadius; dy <= this.explorationRadius; dy++) {
      for (let dx = -this.explorationRadius; dx <= this.explorationRadius; dx++) {
        if (dx * dx + dy * dy <= this.explorationRadius * this.explorationRadius) {
          const gx = playerGx + dx;
          const gy = playerGy + dy;
          if (gx >= 0 && gx < this.grid.width && gy >= 0 && gy < this.grid.height) {
            this.exploredCells.add(`${gx},${gy}`);
          }
        }
      }
    }

    // 2. Render Map Overlay
    this.renderMap(playerGx, playerGy, enemies);
  }

  private renderMap(playerGx: number, playerGy: number, enemies: Enemy[]): void {
    const W = this.canvasElement.width;
    const H = this.canvasElement.height;

    this.ctx.clearRect(0, 0, W, H);

    if (!this.isOverlayVisible && !this.isMinimapVisible) return;

    if (this.isOverlayVisible) {
      // ── Classic Translucent Diablo ARPG Fullscreen Overlay Mode ──
      const mapW = this.grid!.width;
      const mapH = this.grid!.height;
      const cellSize = Math.max(8, Math.min((W * 0.70) / mapW, (H * 0.70) / mapH));

      const offsetX = (W - mapW * cellSize) / 2;
      const offsetY = (H - mapH * cellSize) / 2;

      // Semi-transparent background card so character & 3D world are visible through overlay
      this.ctx.fillStyle = "rgba(10, 15, 25, 0.35)";
      this.ctx.strokeStyle = "rgba(218, 165, 32, 0.6)";
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(offsetX - 12, offsetY - 12, mapW * cellSize + 24, mapH * cellSize + 24);
      this.ctx.strokeRect(offsetX - 12, offsetY - 12, mapW * cellSize + 24, mapH * cellSize + 24);

      // Render grid cells
      for (let gy = 0; gy < mapH; gy++) {
        for (let gx = 0; gx < mapW; gx++) {
          const key = `${gx},${gy}`;
          const isExplored = this.exploredCells.has(key);

          const cell = this.grid!.cells[gy][gx];
          const px = offsetX + gx * cellSize;
          const py = offsetY + (mapH - 1 - gy) * cellSize; // Invert Z for screen Y

          if (!isExplored) {
            this.ctx.fillStyle = "rgba(8, 12, 20, 0.25)"; // Unexplored faint fog
            this.ctx.fillRect(px, py, cellSize, cellSize);
            continue;
          }

          if (cell.type === TileType.Floor) {
            this.ctx.fillStyle = cell.roomId !== null ? "rgba(30, 58, 138, 0.5)" : "rgba(51, 65, 85, 0.5)"; // Translucent Slate / Blue
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Wall) {
            this.ctx.fillStyle = "rgba(148, 163, 184, 0.65)"; // Crisp Wall Silhouette
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Door) {
            this.ctx.fillStyle = "rgba(56, 189, 248, 0.85)"; // Cyan Door
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Stairs) {
            this.ctx.fillStyle = "rgba(245, 158, 11, 0.9)"; // Gold Exit Stairs
            this.ctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }

      // Render Living Enemies using REAL enemy position (enemy.position)
      this.ctx.fillStyle = "#EF4444"; // Red dots
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        const ePos = enemy.position;
        const egx = Math.floor(ePos.x / 2.0);
        const egy = Math.floor(ePos.z / 2.0);

        if (this.exploredCells.has(`${egx},${egy}`)) {
          const epx = offsetX + egx * cellSize;
          const epy = offsetY + (mapH - 1 - egy) * cellSize;
          this.ctx.beginPath();
          this.ctx.arc(epx, epy, Math.max(3, cellSize * 0.45), 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      // Render Player Marker using REAL player position (this.player.position)
      const playerPos = this.player.position;
      const pgx = playerPos.x / 2.0;
      const pgy = playerPos.z / 2.0;
      const ppx = offsetX + pgx * cellSize;
      const ppy = offsetY + (mapH - 1 - pgy) * cellSize;

      // Cyan Player Marker with White Glow Ring
      this.ctx.fillStyle = "#00FFFF";
      this.ctx.strokeStyle = "#FFFFFF";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(ppx, ppy, Math.max(5, cellSize * 0.7), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

    } else if (this.isMinimapVisible) {
      // ── Top-Right Corner Minimap Mode ──
      const miniSize = 160;
      const miniX = W - miniSize - 20;
      const miniY = 70;
      const viewRange = 14; // tiles around player
      const cellSize = miniSize / (viewRange * 2);

      // Background
      this.ctx.fillStyle = "rgba(10, 15, 25, 0.85)";
      this.ctx.strokeStyle = "#DAA520";
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(miniX, miniY, miniSize, miniSize);
      this.ctx.strokeRect(miniX, miniY, miniSize, miniSize);

      const mapW = this.grid!.width;
      const mapH = this.grid!.height;

      // Clip bounds
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(miniX, miniY, miniSize, miniSize);
      this.ctx.clip();

      for (let dy = -viewRange; dy <= viewRange; dy++) {
        for (let dx = -viewRange; dx <= viewRange; dx++) {
          const gx = playerGx + dx;
          const gy = playerGy + dy;

          if (gx < 0 || gx >= mapW || gy < 0 || gy >= mapH) continue;
          if (!this.exploredCells.has(`${gx},${gy}`)) continue;

          const cell = this.grid!.cells[gy][gx];
          const px = miniX + miniSize / 2 + dx * cellSize;
          const py = miniY + miniSize / 2 - dy * cellSize;

          if (cell.type === TileType.Floor) {
            this.ctx.fillStyle = cell.roomId !== null ? "#1E293B" : "#334155";
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Wall) {
            this.ctx.fillStyle = "#94A3B8";
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Door) {
            this.ctx.fillStyle = "#38BDF8";
            this.ctx.fillRect(px, py, cellSize, cellSize);
          } else if (cell.type === TileType.Stairs) {
            this.ctx.fillStyle = "#F59E0B";
            this.ctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }

      // Render Player in Minimap center
      this.ctx.fillStyle = "#00FFFF";
      this.ctx.strokeStyle = "#FFFFFF";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(miniX + miniSize / 2, miniY + miniSize / 2, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  public dispose(): void {
    if (this.canvasElement && this.canvasElement.parentNode) {
      this.canvasElement.parentNode.removeChild(this.canvasElement);
    }
    this.guiTexture.dispose();
  }
}
