import { describe, it, expect, beforeEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { polyfillXHR } from "./xhr_polyfill";
import { Player } from "../src/entities/Player";
import { SaveManager } from "../src/persistence/SaveManager";
import { StorageAdapter } from "../src/core/StorageAdapter";

describe("Multi-Character System & 10 Character Cap", () => {
  beforeEach(() => {
    StorageAdapter.clearAll();
    SaveManager.setActiveCharacterId(null);
  });

  it("should create characters with custom names, resolution for duplicates, and track active character", () => {
    polyfillXHR();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mockMesh = new Mesh("p_test", scene);
    const player = new Player("p_unit", scene, mockMesh);

    const char1Id = SaveManager.createCharacter(player, "mage", "Kaelthas");
    expect(char1Id).toBe("char_kaelthas");
    expect(player.characterName).toBe("Kaelthas");
    expect(player.activeArchetypeId).toBe("mage");
    expect(player.level).toBe(1);
    expect(SaveManager.getActiveCharacterId()).toBe(char1Id);

    // Duplicate name automatically resolves to Kaelthas 2
    const char2Id = SaveManager.createCharacter(player, "tank", "Kaelthas");
    expect(char2Id).toBe("char_kaelthas_2");
    expect(player.characterName).toBe("Kaelthas 2");

    const chars = SaveManager.getAllCharacters();
    expect(chars.length).toBe(2);

    player.dispose();
    engine.dispose();
  });

  it("should strictly enforce the 10 character cap", () => {
    polyfillXHR();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mockMesh = new Mesh("p_test", scene);
    const player = new Player("p_unit", scene, mockMesh);

    // Create 10 characters
    const createdIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const id = SaveManager.createCharacter(player, "tank", `Hero_${i}`);
      expect(id).not.toBeNull();
      if (id) createdIds.push(id);
    }

    expect(SaveManager.getCharacterCount()).toBe(10);
    expect(SaveManager.isCapReached()).toBe(true);

    // Attempting to create an 11th character should fail and return null
    const char11Id = SaveManager.createCharacter(player, "healer", "OverCapHero");
    expect(char11Id).toBeNull();
    expect(SaveManager.getCharacterCount()).toBe(10);

    // Deleting 1 character allows a new character to be created
    SaveManager.delete(createdIds[0]);
    expect(SaveManager.getCharacterCount()).toBe(9);
    expect(SaveManager.isCapReached()).toBe(false);

    const newCharId = SaveManager.createCharacter(player, "healer", "NewHero");
    expect(newCharId).not.toBeNull();
    expect(SaveManager.getCharacterCount()).toBe(10);

    player.dispose();
    engine.dispose();
  });
});
