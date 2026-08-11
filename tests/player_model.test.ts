import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import fs from "fs";
import { polyfillXHR } from "./xhr_polyfill";

describe("Player Kenney Asset GLB Model & Animations", () => {
  it("should load player GLB model and contain critical animations", async () => {
    polyfillXHR();

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const modelPath = "public/assets/characters/player/character-male-a.glb";
    expect(fs.existsSync(modelPath)).toBe(true);

    const fileBuffer = fs.readFileSync(modelPath);
    const dataUri = "data:;base64," + fileBuffer.toString("base64");

    const result = await SceneLoader.ImportMeshAsync("", "", dataUri, scene, null, ".glb");
    expect(result.meshes.length).toBeGreaterThan(0);
    expect(result.animationGroups.length).toBeGreaterThan(0);

    const animNames = result.animationGroups.map((ag) => ag.name);

    // Verify critical animations exist
    expect(animNames).toContain("idle");
    expect(animNames).toContain("walk");
    expect(animNames).toContain("attack-melee-right");

    // Test playing walk animation
    const walkAnim = result.animationGroups.find((ag) => ag.name === "walk");
    if (walkAnim) {
      walkAnim.start(true);
      expect(walkAnim.isPlaying).toBe(true);
      walkAnim.stop();
    }

    // Test playing attack animation
    const attackAnim = result.animationGroups.find((ag) => ag.name === "attack-melee-right");
    if (attackAnim) {
      attackAnim.start(false);
      expect(attackAnim.isPlaying).toBe(true);
    }

    engine.dispose();
  });
});
