import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { TownHub } from "../src/town/TownHub";
import { polyfillXHR } from "./xhr_polyfill";

describe("Town Hub Plaza Environment Build", () => {
  it("should build Town Hub environment with merged floor/wall colliders and class altar", async () => {
    polyfillXHR();

    const engine = new NullEngine();
    const scene = new Scene(engine);

    const townHub = new TownHub(scene);
    const builtTown = await townHub.build();

    expect(builtTown.rootNode.name).toBe("townHubRoot");
    expect(builtTown.spawnPoint.x).toBe(10);
    expect(builtTown.spawnPoint.z).toBe(6);
    expect(builtTown.altarPosition.x).toBe(10);
    expect(builtTown.altarPosition.z).toBe(16);

    expect(builtTown.mergedFloors).not.toBeNull();
    expect(builtTown.mergedWalls).not.toBeNull();
    expect(builtTown.altar).toBeDefined();

    townHub.dispose();
    engine.dispose();
  });
});
