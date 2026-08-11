import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import { polyfillXHR } from "./xhr_polyfill";
import { Player } from "../src/entities/Player";
import { SaveManager } from "../src/persistence/SaveManager";
import { Generator } from "../src/dungeon/Generator";
import { TileMap } from "../src/dungeon/TileMap";

describe("Save/Load Persistence & Dungeon Cleanup", () => {
  it("should reset player position to Town Hub spawn (10, 0, 6) when loading a save", async () => {
    polyfillXHR();

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const mockMesh = new Mesh("p_test_mesh", scene);
    const player = new Player("p_test", scene, mockMesh);
    player.level = 5;
    player.xp = 250;
    player.inventory.gold = 500;
    player.health.setCurrentHp(150);

    // Simulate player deep inside dungeon coordinates (e.g. x: 45, y: 0.9, z: 32)
    player.transformNode.position = new Vector3(45.0, 0.9, 32.0);

    const slotId = "test_cleanup_slot";
    const saveSuccess = SaveManager.save(slotId, player, "dungeon", 2);
    expect(saveSuccess).toBe(true);

    const metadata = SaveManager.getMetadata(slotId);
    expect(metadata).not.toBeNull();
    expect(metadata?.level).toBe(5);
    expect(metadata?.gold).toBe(500);

    // Mutate player stats before load
    player.level = 1;
    player.inventory.gold = 0;
    player.transformNode.position = new Vector3(99, 99, 99);

    // Load save back into player
    const loadSuccess = SaveManager.load(slotId, player);
    expect(loadSuccess).toBe(true);

    expect(player.level).toBe(5);
    expect(player.inventory.gold).toBe(500);

    // Verify player position was reset to Town Hub spawn (10, 0, 6) instead of keeping dungeon coords
    const pos = player.transformNode.position;
    expect(pos.x).toBeCloseTo(10.0, 2);
    expect(pos.y).toBeCloseTo(0.0, 2);
    expect(pos.z).toBeCloseTo(6.0, 2);

    // Clean up test save key
    SaveManager.delete(slotId);
    player.dispose();
    engine.dispose();
  });

  it("should fully remove dungeon root nodes and invisible wall colliders from scene upon clearDungeon", async () => {
    polyfillXHR();

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const generator = new Generator({ seed: 42, minWidth: 20, maxWidth: 30, minHeight: 20, maxHeight: 30 });
    const grid = generator.generate();

    const tileMap = new TileMap(scene);
    await tileMap.buildFromGrid(grid);

    // Verify dungeon root & colliders exist in scene
    expect(scene.getNodeByName("dungeonRoot")).not.toBeNull();
    expect(scene.getMeshByName("mergedWalls")).not.toBeNull();

    // Execute dungeon cleanup
    tileMap.clearDungeon();

    // Verify dungeon root & colliders are completely removed from scene
    expect(scene.getNodeByName("dungeonRoot")).toBeNull();
    expect(scene.getMeshByName("mergedWalls")).toBeNull();

    tileMap.dispose();
    engine.dispose();
  });
});
