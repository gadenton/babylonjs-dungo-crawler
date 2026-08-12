import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameStateManager } from "../src/core/GameStateManager";
import { SaveManager } from "../src/persistence/SaveManager";
import { AudioManager } from "../src/audio/AudioManager";
import { VisualPipelineManager } from "../src/rendering/VisualPipelineManager";
import { StorageAdapter } from "../src/core/StorageAdapter";

describe("Stage 1 Core Architecture & Persistence APIs", () => {
  beforeEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  afterEach(() => {
    StorageAdapter.clearAll("dungo_");
  });

  describe("GameStateManager", () => {
    it("should initialize with default state MAIN_MENU and allow state transitions", () => {
      const gsm = new GameStateManager();
      expect(gsm.getState()).toBe("MAIN_MENU");
      expect(gsm.isPaused()).toBe(false);

      const observedStates: string[] = [];
      gsm.onStateChanged.add((state) => {
        observedStates.push(state);
      });

      gsm.setState("TOWN_HUB");
      expect(gsm.getState()).toBe("TOWN_HUB");
      expect(gsm.isPaused()).toBe(false);

      gsm.setState("DUNGEON");
      expect(gsm.getState()).toBe("DUNGEON");
      expect(gsm.isPaused()).toBe(false);

      expect(observedStates).toEqual(["TOWN_HUB", "DUNGEON"]);
    });

    it("should handle pause toggle and return to previous state when unpaused", () => {
      const gsm = new GameStateManager("DUNGEON");
      expect(gsm.getState()).toBe("DUNGEON");

      gsm.setPaused(true);
      expect(gsm.getState()).toBe("PAUSED");
      expect(gsm.isPaused()).toBe(true);

      gsm.setPaused(false);
      expect(gsm.getState()).toBe("DUNGEON");
      expect(gsm.isPaused()).toBe(false);
    });

    it("should fallback to TOWN_HUB when unpausing if previous state was MAIN_MENU or PAUSED", () => {
      const gsm = new GameStateManager("MAIN_MENU");
      gsm.setPaused(true);
      expect(gsm.getState()).toBe("PAUSED");

      gsm.setPaused(false);
      expect(gsm.getState()).toBe("TOWN_HUB");
    });

    it("should not notify observers if setState is called with current state", () => {
      const gsm = new GameStateManager("TOWN_HUB");
      let count = 0;
      gsm.onStateChanged.add(() => count++);

      gsm.setState("TOWN_HUB");
      expect(count).toBe(0);

      gsm.setState("DUNGEON");
      expect(count).toBe(1);
    });
  });

  describe("SaveManager.getMostRecentSave()", () => {
    const slots = ["autosave", "slot_1", "slot_2", "slot_3"];

    beforeEach(() => {
      for (const slotId of slots) {
        SaveManager.delete(slotId);
      }
    });

    afterEach(() => {
      for (const slotId of slots) {
        SaveManager.delete(slotId);
      }
    });

    it("should return null when no save slots exist", () => {
      const recent = SaveManager.getMostRecentSave();
      expect(recent).toBeNull();
    });

    it("should return the only save slot when a single save exists", () => {
      const payload = {
        version: 1,
        timestamp: 100000,
        slotId: "slot_1",
        data: {
          player: { level: 3, activeArchetypeId: "rogue" },
          inventory: { gold: 250 },
        },
      };
      StorageAdapter.save(SaveManager.getSaveKey("slot_1"), payload.data, payload.version, "slot_1");

      const recent = SaveManager.getMostRecentSave();
      expect(recent).not.toBeNull();
      expect(recent?.slotId).toBe("slot_1");
      expect(recent?.metadata.level).toBe(3);
      expect(recent?.metadata.gold).toBe(250);
    });

    it("should return the slot with maximum timestamp among multiple valid save slots", () => {
      const createSave = (slotId: string, timestamp: number, level: number, gold: number) => {
        const payload = {
          version: 1,
          timestamp,
          slotId,
          player: { level, activeArchetypeId: "mage" },
          inventory: { gold },
        };
        const key = SaveManager.getSaveKey(slotId);
        // Custom save to enforce explicit timestamps for test verification
        const json = JSON.stringify({
          version: 1,
          timestamp,
          slotId,
          data: payload,
        });
        (StorageAdapter as any).setItem(key, json);
      };

      createSave("autosave", 1000, 1, 100);
      createSave("slot_1", 5000, 5, 500);
      createSave("slot_2", 3000, 3, 300);
      createSave("slot_3", 2000, 2, 200);

      const recent = SaveManager.getMostRecentSave();
      expect(recent).not.toBeNull();
      expect(recent?.slotId).toBe("slot_1");
      expect(recent?.metadata.timestamp).toBe(5000);
      expect(recent?.metadata.level).toBe(5);
      expect(recent?.metadata.gold).toBe(500);
    });
  });

  describe("AudioManager Linear Volume & Persistence", () => {
    it("should convert dB bus levels to linear volumes correctly", () => {
      const audioManager = new AudioManager();

      audioManager.setMasterVolume(1.0);
      audioManager.setMusicVolume(0.5);
      audioManager.setSFXVolume(0.75);

      expect(audioManager.getMasterVolumeLinear()).toBeCloseTo(1.0, 3);
      expect(audioManager.getMusicVolumeLinear()).toBeCloseTo(0.5, 3);
      expect(audioManager.getSFXVolumeLinear()).toBeCloseTo(0.75, 3);

      audioManager.dispose();
    });

    it("should save and load audio volume settings to StorageAdapter under key dungo_audio_settings", () => {
      const audioManager = new AudioManager();

      audioManager.setMasterVolume(0.8);
      audioManager.setMusicVolume(0.4);
      audioManager.setSFXVolume(0.6);

      audioManager.saveAudioSettings();

      // Clear current levels
      audioManager.setMasterVolume(1.0);
      audioManager.setMusicVolume(1.0);
      audioManager.setSFXVolume(1.0);

      // Load settings back
      audioManager.loadAudioSettings();

      expect(audioManager.getMasterVolumeLinear()).toBeCloseTo(0.8, 3);
      expect(audioManager.getMusicVolumeLinear()).toBeCloseTo(0.4, 3);
      expect(audioManager.getSFXVolumeLinear()).toBeCloseTo(0.6, 3);

      audioManager.dispose();
    });
  });

  describe("VisualPipelineManager Settings Persistence", () => {
    it("should save and load graphics preset to StorageAdapter under key dungo_graphics_settings", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new TargetCamera("testCam", Vector3.Zero(), scene);

      const pipelineManager = new VisualPipelineManager(scene, camera, "medium");
      expect(pipelineManager.getPreset()).toBe("medium");

      pipelineManager.setPreset("ultra");
      expect(pipelineManager.getPreset()).toBe("ultra");

      pipelineManager.saveGraphicsSettings();

      pipelineManager.setPreset("low");
      expect(pipelineManager.getPreset()).toBe("low");

      pipelineManager.loadGraphicsSettings();
      expect(pipelineManager.getPreset()).toBe("ultra");

      pipelineManager.dispose();
      engine.dispose();
    });
  });
});
