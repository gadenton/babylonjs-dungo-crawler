import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { StorageAdapter } from "../core/StorageAdapter";
import { Player } from "../entities/Player";
import { ArchetypeType } from "../combat/Archetypes";
import { Item, EquipmentSlot } from "../entities/components/InventoryComponent";

export interface SerializedVector3 {
  x: number;
  y: number;
  z: number;
}

export interface GameSaveStateV1 {
  version: 1;
  timestamp: number;
  slotId: string;
  player: {
    level: number;
    xp: number;
    activeArchetypeId: ArchetypeType;
    equippedSkillIds: (string | null)[];
    currentHp: number;
    currentMana: number;
    position: SerializedVector3;
  };
  inventory: {
    gold: number;
    maxWeight: number;
    items: Item[];
    equipment: Record<EquipmentSlot, Item | null>;
  };
  talents: Record<string, Record<string, number>>;
  world: {
    currentZone: "town_hub" | "dungeon";
    dungeonFloor: number;
  };
}

export interface SaveMetadata {
  slotId: string;
  version: number;
  timestamp: number;
  level: number;
  archetype: ArchetypeType;
  gold: number;
}

// Register Migration Pipeline 0 -> 1
StorageAdapter.registerMigration(0, (oldData: any) => {
  return {
    version: 1,
    timestamp: Date.now(),
    slotId: oldData?.slotId ?? "unknown",
    player: {
      level: oldData?.player?.level ?? 1,
      xp: oldData?.player?.xp ?? 0,
      activeArchetypeId: oldData?.player?.activeArchetypeId ?? "tank",
      equippedSkillIds: oldData?.player?.equippedSkillIds ?? ["seismic_slam", null, null, null, null],
      currentHp: oldData?.player?.currentHp ?? 180,
      currentMana: oldData?.player?.currentMana ?? 100,
      position: oldData?.player?.position ?? { x: 0, y: 0.9, z: 0 },
    },
    inventory: {
      gold: oldData?.inventory?.gold ?? 0,
      maxWeight: oldData?.inventory?.maxWeight ?? 30,
      items: oldData?.inventory?.items ?? [],
      equipment: oldData?.inventory?.equipment ?? {
        [EquipmentSlot.MainHand]: null,
        [EquipmentSlot.OffHand]: null,
        [EquipmentSlot.Head]: null,
        [EquipmentSlot.Chest]: null,
        [EquipmentSlot.Legs]: null,
      },
    },
    talents: oldData?.talents ?? {},
    world: {
      currentZone: oldData?.world?.currentZone ?? "town_hub",
      dungeonFloor: oldData?.world?.dungeonFloor ?? 1,
    },
  };
});

export class SaveManager {
  public static readonly CURRENT_VERSION = 1;
  public static readonly SAVE_PREFIX = "dungo_save_";

  public static getSaveKey(slotId: string): string {
    return `${this.SAVE_PREFIX}${slotId}`;
  }

  /** Capture current game state into pure V1 JSON-serializable object */
  public static captureState(
    player: Player,
    currentZone: "town_hub" | "dungeon" = "town_hub",
    dungeonFloor: number = 1
  ): GameSaveStateV1 {
    const pos = player.transformNode.position;

    // Convert inventory equipment Map into plain JS dictionary object
    const equipmentObj: Record<EquipmentSlot, Item | null> = {
      [EquipmentSlot.MainHand]: player.inventory.equipment.get(EquipmentSlot.MainHand) ?? null,
      [EquipmentSlot.OffHand]: player.inventory.equipment.get(EquipmentSlot.OffHand) ?? null,
      [EquipmentSlot.Head]: player.inventory.equipment.get(EquipmentSlot.Head) ?? null,
      [EquipmentSlot.Chest]: player.inventory.equipment.get(EquipmentSlot.Chest) ?? null,
      [EquipmentSlot.Legs]: player.inventory.equipment.get(EquipmentSlot.Legs) ?? null,
    };

    const equippedSkillIds = player.equippedSkills.map((s) => (s ? s.def.id : null));

    return {
      version: 1,
      timestamp: Date.now(),
      slotId: "temp",
      player: {
        level: player.level,
        xp: player.xp,
        activeArchetypeId: player.activeArchetypeId,
        equippedSkillIds,
        currentHp: player.health.current,
        currentMana: player.stats.currentMana,
        position: { x: pos.x, y: pos.y, z: pos.z },
      },
      inventory: {
        gold: player.inventory.gold,
        maxWeight: player.inventory.maxWeight,
        items: player.inventory.items.map((item) => ({ ...item })),
        equipment: equipmentObj,
      },
      talents: player.talentTree.serialize(),
      world: {
        currentZone,
        dungeonFloor,
      },
    };
  }

  /** Save game state to a specified slot */
  public static save(
    slotId: string,
    player: Player,
    currentZone: "town_hub" | "dungeon" = "town_hub",
    dungeonFloor: number = 1
  ): boolean {
    const state = this.captureState(player, currentZone, dungeonFloor);
    state.slotId = slotId;
    const key = this.getSaveKey(slotId);
    return StorageAdapter.save<GameSaveStateV1>(key, state, this.CURRENT_VERSION, slotId);
  }

  /** Load game state from a specified slot into Player entity */
  public static load(
    slotId: string,
    player: Player,
    onZoneLoadRequested?: (zone: "town_hub" | "dungeon", floor: number) => void
  ): boolean {
    const key = this.getSaveKey(slotId);
    const saveState = StorageAdapter.load<GameSaveStateV1>(key, this.CURRENT_VERSION);
    if (!saveState) return false;

    // 1. Restore Player Level & XP
    player.level = saveState.player.level;
    player.xp = saveState.player.xp;
    player.talentTree.setPlayerLevel(player.level);

    // 2. Restore Archetype
    player.setArchetype(saveState.player.activeArchetypeId);

    // 3. Restore Talent Tree
    player.talentTree.deserialize(saveState.talents);

    // 4. Restore Inventory & Gold
    player.inventory.gold = saveState.inventory.gold;
    player.inventory.maxWeight = saveState.inventory.maxWeight;
    player.inventory.items = (saveState.inventory.items || []).map((item) => ({ ...item }));
    player.inventory.onGoldChanged.notifyObservers(player.inventory.gold);
    player.inventory.onInventoryChanged.notifyObservers();

    // 5. Restore Equipment (unequip current first, clear modifiers, then re-equip)
    for (const slot of Object.values(EquipmentSlot)) {
      player.stats.removeModifiersBySource(`equipment_${slot}`);
      player.inventory.equipment.set(slot, null);
    }
    if (saveState.inventory.equipment) {
      for (const slotKey of Object.keys(saveState.inventory.equipment) as EquipmentSlot[]) {
        const item = saveState.inventory.equipment[slotKey];
        if (item) {
          player.inventory.equipItem(item, player.stats);
        }
      }
    }

    // 6. Restore HP & MP
    player.health.setCurrentHp(saveState.player.currentHp);
    player.stats.setMana(saveState.player.currentMana);

    // 7. Reset Position to Town Hub Spawn (Loading always returns player to Town Hub)
    player.transformNode.position = new Vector3(10.0, 0.0, 6.0);

    // 8. Trigger Zone Load if callback provided
    if (onZoneLoadRequested && saveState.world) {
      onZoneLoadRequested(saveState.world.currentZone, saveState.world.dungeonFloor);
    }

    return true;
  }

  public static exists(slotId: string): boolean {
    return StorageAdapter.exists(this.getSaveKey(slotId));
  }

  public static delete(slotId: string): void {
    StorageAdapter.delete(this.getSaveKey(slotId));
  }

  public static getMetadata(slotId: string): SaveMetadata | null {
    const key = this.getSaveKey(slotId);
    const payload = StorageAdapter.getPayload<GameSaveStateV1>(key);
    if (!payload || !payload.data) return null;

    return {
      slotId,
      version: payload.version,
      timestamp: payload.timestamp,
      level: payload.data.player?.level ?? 1,
      archetype: payload.data.player?.activeArchetypeId ?? "tank",
      gold: payload.data.inventory?.gold ?? 0,
    };
  }

  /** Scan save slots (autosave, slot_1, slot_2, slot_3) and return the save with the maximum timestamp */
  public static getMostRecentSave(): { slotId: string; metadata: SaveMetadata } | null {
    const slots = ["autosave", "slot_1", "slot_2", "slot_3"];
    let maxTimestamp = -1;
    let mostRecent: { slotId: string; metadata: SaveMetadata } | null = null;

    for (const slotId of slots) {
      const metadata = this.getMetadata(slotId);
      if (metadata && typeof metadata.timestamp === "number" && metadata.timestamp > maxTimestamp) {
        maxTimestamp = metadata.timestamp;
        mostRecent = { slotId, metadata };
      }
    }

    return mostRecent;
  }

  /** Register event listeners for auto-save on safe boundaries */
  public static registerAutoSaveEvents(
    player: Player,
    getCurrentZone: () => "town_hub" | "dungeon" = () => "town_hub",
    getDungeonFloor: () => number = () => 1
  ): () => void {
    const autoSave = () => {
      this.save("autosave", player, getCurrentZone(), getDungeonFloor());
      console.log("[SaveManager] Auto-save triggered successfully.");
    };

    const obs1 = player.onArchetypeSwapped.add(() => autoSave());
    const obs2 = player.inventory.onItemEquipped.add(() => autoSave());
    const obs3 = player.onLevelUp.add(() => autoSave());

    // Return unbind/cleanup function
    return () => {
      if (obs1) player.onArchetypeSwapped.remove(obs1);
      if (obs2) player.inventory.onItemEquipped.remove(obs2);
      if (obs3) player.onLevelUp.remove(obs3);
    };
  }
}
