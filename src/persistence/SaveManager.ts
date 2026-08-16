import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { StorageAdapter } from "../core/StorageAdapter";
import { Player } from "../entities/Player";
import { ArchetypeManager, ArchetypeType } from "../combat/Archetypes";
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
    characterName?: string;
    level: number;
    xp: number;
    activeArchetypeId: ArchetypeType;
    unlockedArchetypes?: ArchetypeType[];
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
  characterName: string;
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
      characterName: oldData?.player?.characterName ?? "Hero",
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
  public static readonly MAX_CHARACTERS = 10;

  private static activeCharacterId: string | null = null;

  public static getActiveCharacterId(): string | null {
    return this.activeCharacterId;
  }

  public static setActiveCharacterId(characterId: string | null): void {
    this.activeCharacterId = characterId;
  }

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
      slotId: this.activeCharacterId ?? "temp",
      player: {
        characterName: player.characterName,
        level: player.level,
        xp: player.xp,
        activeArchetypeId: player.activeArchetypeId,
        unlockedArchetypes: Array.from(player.unlockedArchetypes),
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

  /** Save game state to a specified character ID */
  public static save(
    slotId: string,
    player: Player,
    currentZone: "town_hub" | "dungeon" = "town_hub",
    dungeonFloor: number = 1
  ): boolean {
    const state = this.captureState(player, currentZone, dungeonFloor);
    state.slotId = slotId;
    this.activeCharacterId = slotId;
    const key = this.getSaveKey(slotId);
    return StorageAdapter.save<GameSaveStateV1>(key, state, this.CURRENT_VERSION, slotId);
  }

  /** Resolve a unique character name, appending an incremental number if duplicate */
  public static resolveUniqueName(requestedName: string): string {
    const existing = this.getAllCharacters().map((c) => c.metadata.characterName.toLowerCase());
    let candidate = requestedName.trim();
    if (!candidate) candidate = "Hero";

    if (!existing.includes(candidate.toLowerCase())) {
      return candidate;
    }

    let index = 2;
    while (existing.includes(`${candidate} ${index}`.toLowerCase())) {
      index++;
    }
    return `${candidate} ${index}`;
  }

  /** Create a brand new character and save to disk */
  public static createCharacter(
    player: Player,
    archetype: ArchetypeType,
    customName?: string
  ): string | null {
    if (this.isCapReached()) {
      console.warn(`SaveManager: Character limit reached (${this.MAX_CHARACTERS}/${this.MAX_CHARACTERS}).`);
      return null;
    }

    const defaultName = ArchetypeManager.getArchetype(archetype)?.name ?? "Hero";
    const requested = customName && customName.trim().length > 0 ? customName.trim() : defaultName;
    const uniqueName = this.resolveUniqueName(requested);

    const safeSlug = uniqueName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const charId = `char_${safeSlug}`;

    player.resetNewGame(archetype, uniqueName);
    this.save(charId, player);
    return charId;
  }

  /** Load game state from a specified character ID into Player entity */
  public static load(
    slotId: string,
    player: Player,
    onZoneLoadRequested?: (zone: "town_hub" | "dungeon", floor: number) => void
  ): boolean {
    const key = this.getSaveKey(slotId);
    const saveState = StorageAdapter.load<GameSaveStateV1>(key, this.CURRENT_VERSION);
    if (!saveState) return false;

    this.activeCharacterId = slotId;

    // Restore Character Name
    if (saveState.player.characterName) {
      player.characterName = saveState.player.characterName;
    }

    // 1. Restore Player Level & XP
    player.level = saveState.player.level;
    player.xp = saveState.player.xp;
    player.talentTree.setPlayerLevel(player.level);

    // 2. Restore Archetype & Unlocked Classes
    if (saveState.player.unlockedArchetypes && Array.isArray(saveState.player.unlockedArchetypes)) {
      player.unlockedArchetypes = new Set(saveState.player.unlockedArchetypes);
    } else {
      player.unlockedArchetypes = new Set([saveState.player.activeArchetypeId]);
    }
    player.setArchetype(saveState.player.activeArchetypeId);

    // 3. Restore Talent Tree
    player.talentTree.deserialize(saveState.talents);

    // 4. Restore Inventory & Gold
    player.inventory.gold = saveState.inventory.gold;
    player.inventory.maxWeight = saveState.inventory.maxWeight;
    player.inventory.items = (saveState.inventory.items || []).map((item) => ({ ...item }));
    player.inventory.onGoldChanged.notifyObservers(player.inventory.gold);
    player.inventory.onInventoryChanged.notifyObservers();

    // 5. Restore Equipment
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

    // 7. Reset Position to Town Hub Spawn
    if (
      saveState.player.position &&
      typeof saveState.player.position.x === "number" &&
      saveState.player.position.x >= 8.0 &&
      saveState.player.position.x <= 32.0 &&
      saveState.player.position.z >= 8.0 &&
      saveState.player.position.z <= 32.0
    ) {
      player.transformNode.position = new Vector3(
        saveState.player.position.x,
        saveState.player.position.y,
        saveState.player.position.z
      );
    } else {
      player.transformNode.position = new Vector3(20.0, 0.0, 15.0);
    }

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
    if (this.activeCharacterId === slotId) {
      this.activeCharacterId = null;
    }
  }

  public static getMetadata(slotId: string): SaveMetadata | null {
    const key = this.getSaveKey(slotId);
    const payload = StorageAdapter.getPayload<GameSaveStateV1>(key);
    if (!payload || !payload.data) return null;

    const rawTs = (payload as any).timestamp;
    const timestamp = typeof rawTs === "number" && !isNaN(rawTs) ? rawTs : -1;

    const charName =
      payload.data.player?.characterName ??
      payload.data.player?.activeArchetypeId?.toUpperCase() ??
      "Hero";

    return {
      slotId,
      characterName: charName,
      version: payload.version,
      timestamp,
      level: payload.data.player?.level ?? 1,
      archetype: payload.data.player?.activeArchetypeId ?? "tank",
      gold: payload.data.inventory?.gold ?? 0,
    };
  }

  /** Discover all saved characters from local storage */
  public static getAllCharacters(): { slotId: string; metadata: SaveMetadata }[] {
    const characterList: { slotId: string; metadata: SaveMetadata }[] = [];
    const allKeys = StorageAdapter.getAllKeys(this.SAVE_PREFIX);

    for (const slotId of allKeys) {
      const metadata = this.getMetadata(slotId);
      if (metadata) {
        characterList.push({ slotId, metadata });
      }
    }

    // Sort by timestamp descending (most recently played first)
    characterList.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);

    return characterList;
  }

  public static getCharacterCount(): number {
    return this.getAllCharacters().length;
  }

  public static isCapReached(): boolean {
    return this.getCharacterCount() >= this.MAX_CHARACTERS;
  }

  /** Return the most recently played character */
  public static getMostRecentSave(): { slotId: string; metadata: SaveMetadata } | null {
    const chars = this.getAllCharacters();
    return chars.length > 0 ? chars[0] : null;
  }

  /** Register event listeners for auto-save on safe boundaries */
  public static registerAutoSaveEvents(
    player: Player,
    getCurrentZone: () => "town_hub" | "dungeon" = () => "town_hub",
    getDungeonFloor: () => number = () => 1
  ): () => void {
    const autoSave = () => {
      const targetSlot = this.activeCharacterId ?? "autosave";
      this.save(targetSlot, player, getCurrentZone(), getDungeonFloor());
      console.log(`[SaveManager] Auto-save triggered for character ${targetSlot}.`);
    };

    const obs1 = player.onArchetypeSwapped.add(() => autoSave());
    const obs2 = player.inventory.onItemEquipped.add(() => autoSave());
    const obs3 = player.onLevelUp.add(() => autoSave());

    return () => {
      if (obs1) player.onArchetypeSwapped.remove(obs1);
      if (obs2) player.inventory.onItemEquipped.remove(obs2);
      if (obs3) player.onLevelUp.remove(obs3);
    };
  }
}
