import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameStateManager, GameState } from "../src/core/GameStateManager";
import { AudioManager } from "../src/audio/AudioManager";
import { VisualPipelineManager, GraphicsPreset } from "../src/rendering/VisualPipelineManager";
import { StorageAdapter } from "../src/core/StorageAdapter";

describe("Challenger Stage 1 Stress Testing", () => {
  beforeEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  afterEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  describe("GameStateManager Transition Stress Tests", () => {
    it("handles full lifecycle transition sequence: MAIN_MENU -> TOWN_HUB -> DUNGEON -> PAUSED -> DUNGEON", () => {
      const gsm = new GameStateManager();
      const transitions: GameState[] = [];
      gsm.onStateChanged.add((st) => transitions.push(st));

      expect(gsm.getState()).toBe("MAIN_MENU");
      expect(gsm.getPreviousState()).toBe("MAIN_MENU");

      // MAIN_MENU -> TOWN_HUB
      gsm.setState("TOWN_HUB");
      expect(gsm.getState()).toBe("TOWN_HUB");
      expect(gsm.getPreviousState()).toBe("MAIN_MENU");

      // TOWN_HUB -> DUNGEON
      gsm.setState("DUNGEON");
      expect(gsm.getState()).toBe("DUNGEON");
      expect(gsm.getPreviousState()).toBe("TOWN_HUB");

      // Pause from DUNGEON
      gsm.setPaused(true);
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.isPaused()).toBe(true);
      expect(gsm.getPreviousState()).toBe("DUNGEON");

      // Unpause from PAUSED -> back to DUNGEON
      gsm.setPaused(false);
      expect(gsm.getState()).toBe("DUNGEON");
      expect(gsm.isPaused()).toBe(false);
      expect(gsm.getPreviousState()).toBe("PAUSED");

      expect(transitions).toEqual(["TOWN_HUB", "DUNGEON", "PAUSED", "DUNGEON"]);
    });

    it("handles pause from MAIN_MENU and unpauses safely to TOWN_HUB fallback", () => {
      const gsm = new GameStateManager("MAIN_MENU");
      gsm.setPaused(true);
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.getPreviousState()).toBe("MAIN_MENU");

      gsm.setPaused(false);
      expect(gsm.getState()).toBe("TOWN_HUB");
    });

    it("handles pause from TOWN_HUB and returns to TOWN_HUB on unpause", () => {
      const gsm = new GameStateManager("TOWN_HUB");
      gsm.setPaused(true);
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.getPreviousState()).toBe("TOWN_HUB");

      gsm.setPaused(false);
      expect(gsm.getState()).toBe("TOWN_HUB");
    });

    it("does not trigger observers or change previousState on redundant setState calls", () => {
      const gsm = new GameStateManager("TOWN_HUB");
      gsm.setState("DUNGEON"); // state: DUNGEON, prev: TOWN_HUB

      let callCount = 0;
      gsm.onStateChanged.add(() => callCount++);

      gsm.setState("DUNGEON"); // redundant
      expect(callCount).toBe(0);
      expect(gsm.getState()).toBe("DUNGEON");
      expect(gsm.getPreviousState()).toBe("TOWN_HUB");
    });

    it("survives 10,000 random state transitions without breaking consistency", () => {
      const gsm = new GameStateManager("MAIN_MENU");
      const validStates: GameState[] = ["MAIN_MENU", "TOWN_HUB", "DUNGEON", "PAUSED"];

      let expectedCurrent: GameState = "MAIN_MENU";
      let expectedPrev: GameState = "MAIN_MENU";

      for (let i = 0; i < 10000; i++) {
        const nextState = validStates[Math.floor(Math.random() * validStates.length)];
        if (nextState !== expectedCurrent) {
          expectedPrev = expectedCurrent;
          expectedCurrent = nextState;
        }
        gsm.setState(nextState);

        expect(gsm.getState()).toBe(expectedCurrent);
        expect(gsm.getPreviousState()).toBe(expectedPrev);
        expect(gsm.isPaused()).toBe(expectedCurrent === "PAUSED");
      }
    });

    it("handles calling setPaused(true) when already PAUSED without corrupting previousState", () => {
      const gsm = new GameStateManager("DUNGEON");
      gsm.setPaused(true); // PAUSED, prev: DUNGEON
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.getPreviousState()).toBe("DUNGEON");

      gsm.setPaused(true); // redundant call
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.getPreviousState()).toBe("DUNGEON"); // must remain DUNGEON, not become PAUSED!

      gsm.setPaused(false);
      expect(gsm.getState()).toBe("DUNGEON");
    });
  });

  describe("AudioManager Persistence & Reboot Stress Tests", () => {
    it("persists custom volume settings across fresh instance reboots", () => {
      // Session 1: Adjust settings and save
      const audio1 = new AudioManager();
      audio1.setMasterVolume(0.65);
      audio1.setMusicVolume(0.35);
      audio1.setSFXVolume(0.85);
      audio1.saveAudioSettings();
      audio1.dispose();

      // Session 2: Fresh reboot (new instance)
      const audio2 = new AudioManager();
      // Expect automatic loading in constructor
      expect(audio2.getMasterVolumeLinear()).toBeCloseTo(0.65, 3);
      expect(audio2.getMusicVolumeLinear()).toBeCloseTo(0.35, 3);
      expect(audio2.getSFXVolumeLinear()).toBeCloseTo(0.85, 3);
      audio2.dispose();
    });

    it("handles boundary volume values (0.0 and 1.0) and persists correctly", () => {
      const audio1 = new AudioManager();
      audio1.setMasterVolume(0.0);
      audio1.setMusicVolume(1.0);
      audio1.setSFXVolume(0.0001);
      audio1.saveAudioSettings();
      audio1.dispose();

      const audio2 = new AudioManager();
      expect(audio2.getMasterVolumeLinear()).toBeCloseTo(0.0, 3);
      expect(audio2.getMusicVolumeLinear()).toBeCloseTo(1.0, 3);
      expect(audio2.getSFXVolumeLinear()).toBeCloseTo(0.0001, 3);
      audio2.dispose();
    });

    it("handles corrupted storage data in audio settings gracefully on reboot", () => {
      // Inject corrupted JSON payload
      (StorageAdapter as any).setItem("dungo_audio_settings", "{ invalid_json: ");

      // Fresh instance should not crash and should fall back to default values
      const audio = new AudioManager();
      expect(audio.getMasterVolumeLinear()).toBeGreaterThan(0);
      expect(audio.getMusicVolumeLinear()).toBeGreaterThan(0);
      expect(audio.getSFXVolumeLinear()).toBeGreaterThan(0);
      audio.dispose();
    });

    it("handles unexpected data types in audio settings storage payload", () => {
      // Inject data with wrong types
      const badData = {
        version: 1,
        timestamp: Date.now(),
        slotId: "settings",
        data: { master: "loud", sfx: null, music: undefined },
      };
      (StorageAdapter as any).setItem("dungo_audio_settings", JSON.stringify(badData));

      const audio = new AudioManager();
      // Should not crash and keep defaults
      expect(typeof audio.getMasterVolumeLinear()).toBe("number");
      expect(audio.getMasterVolumeLinear()).toBeCloseTo(1.0, 3);
      audio.dispose();
    });
  });

  describe("VisualPipelineManager Persistence & Reboot Stress Tests", () => {
    let engine: NullEngine;
    let scene: Scene;
    let camera: TargetCamera;

    beforeEach(() => {
      engine = new NullEngine();
      scene = new Scene(engine);
      camera = new TargetCamera("cam", Vector3.Zero(), scene);
    });

    afterEach(() => {
      scene.dispose();
      engine.dispose();
    });

    it("persists preset selection ('low') across fresh instance reboots", () => {
      // Session 1: Change to low and save
      const vp1 = new VisualPipelineManager(scene, camera, "high");
      vp1.setPreset("low");
      vp1.saveGraphicsSettings();
      vp1.dispose();

      // Session 2: Fresh instance (defaulting to high in constructor)
      const vp2 = new VisualPipelineManager(scene, camera, "high");
      // Constructor should have auto-loaded saved "low" preset
      expect(vp2.getPreset()).toBe("low");
      vp2.dispose();
    });

    it("persists all valid presets ('ultra', 'medium', 'low', 'high')", () => {
      const presets: GraphicsPreset[] = ["ultra", "medium", "low", "high"];

      for (const preset of presets) {
        const vp1 = new VisualPipelineManager(scene, camera);
        vp1.setPreset(preset);
        vp1.saveGraphicsSettings();
        vp1.dispose();

        const vp2 = new VisualPipelineManager(scene, camera);
        expect(vp2.getPreset()).toBe(preset);
        vp2.dispose();
      }
    });

    it("ignores invalid or unknown preset names in storage on reboot", () => {
      const badPayload = {
        version: 1,
        timestamp: Date.now(),
        slotId: "settings",
        data: { preset: "super_extreme_4k" },
      };
      (StorageAdapter as any).setItem("dungo_graphics_settings", JSON.stringify(badPayload));

      const vp = new VisualPipelineManager(scene, camera, "medium");
      // Should ignore "super_extreme_4k" and remain "medium"
      expect(vp.getPreset()).toBe("medium");
      vp.dispose();
    });

    it("handles simulated localStorage across process mock reboots", () => {
      // Simulate real browser window.localStorage persistence
      const fakeStorage: Record<string, string> = {};
      const origWindow = (globalThis as any).window;

      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => fakeStorage[k] ?? null,
          setItem: (k: string, v: string) => {
            fakeStorage[k] = v;
          },
          removeItem: (k: string) => {
            delete fakeStorage[k];
          },
          length: Object.keys(fakeStorage).length,
          key: (i: number) => Object.keys(fakeStorage)[i] ?? null,
        },
      };

      try {
        const audio1 = new AudioManager();
        audio1.setMusicVolume(0.12);
        audio1.saveAudioSettings();
        audio1.dispose();

        // Clear in-memory fallback to guarantee window.localStorage was actually used!
        (StorageAdapter as any).memoryFallback.clear();

        const audio2 = new AudioManager();
        expect(audio2.getMusicVolumeLinear()).toBeCloseTo(0.12, 3);
        audio2.dispose();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    it("handles re-entrant setState calls inside onStateChanged observer callback", () => {
      const gsm = new GameStateManager("MAIN_MENU");
      const visited: GameState[] = [];

      gsm.onStateChanged.add((state) => {
        visited.push(state);
        if (state === "TOWN_HUB") {
          gsm.setState("DUNGEON");
        }
      });

      gsm.setState("TOWN_HUB");
      expect(gsm.getState()).toBe("DUNGEON");
      expect(visited).toEqual(["TOWN_HUB", "DUNGEON"]);
    });

    it("verifies decibel math stability across multiple set/get cycles", () => {
      const audio = new AudioManager();
      
      // Test linear to dB and back
      const testVolumes = [0.0, 0.001, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const vol of testVolumes) {
        audio.setMasterVolume(vol);
        const retrieved = audio.getMasterVolumeLinear();
        if (vol === 0) {
          expect(retrieved).toBeLessThan(0.001);
        } else {
          expect(retrieved).toBeCloseTo(vol, 3);
        }
      }

      audio.dispose();
    });
  });
});

