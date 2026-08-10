# Handoff Report: Phase 6 Save Persistence & UI Technical Exploration

## 1. Observation

### Codebase & Architectural Inspection Findings:
1. **Missing Storage Abstraction**: `src/core/StorageAdapter.ts` and `src/persistence/SaveManager.ts` do not currently exist in `src/`. Their implementation is assigned to Phase 6 as specified in `PROJECT.md` (item 18) and `ORIGINAL_REQUEST.md` (R5/R6).
2. **Existing Serializable State**:
   - `src/combat/TalentTree.ts` (lines 584-604): Already implements `serialize()` returning `Record<string, Record<string, number>>` (mapping archetype IDs to node rank maps) and `deserialize(data)` to restore ranks and re-apply talent stat modifiers.
   - `src/entities/Player.ts` (lines 25-30, 69-98, 172-211): Holds state for `level`, `xp`, `activeArchetypeId` (`'tank' | 'healer' | 'mage' | 'physical_dps'`), `equippedSkills` (array of 5 `Skill | null`), `stats` (`StatsComponent`), `health` (`HealthComponent`), `inventory` (`InventoryComponent`), and `talentTree` (`TalentTree`).
   - `src/entities/components/InventoryComponent.ts` (lines 58-73): Holds `maxWeight` (30), `gold`, `items` (`Item[]`), and `equipment` (`Map<EquipmentSlot, Item | null>`).
   - `src/ui/HUD.ts` (lines 66-333): Uses `@babylonjs/gui` (`AdvancedDynamicTexture`) with header buttons (`Inventory [I]`, `Talents [T]`), toast notification stacks, hotbars, and status panels.
   - `src/index.ts` (lines 84-100, 234-282): Bootstraps the game loop, handles key listeners (`KeyI`, `KeyT`, `KeyE`, `Escape`), and scene updates.

3. **Relevant Guidelines & Standards**:
   - `save-systems` skill (`.agents/skills/save-systems/SKILL.md`): Mandates capturing pure data (not live engine nodes), version stamping in every save schema, atomic writes (`.tmp` + `.bak` fallbacks), versioned loading with a migration pipeline (`MIGRATIONS`), and auto-saving on safe boundaries (zone changes, equipment changes, archetype swaps).

---

## 2. Logic Chain

1. **State Isolation**: The game's state lives in decoupled components (`Player`, `StatsComponent`, `InventoryComponent`, `TalentTree`). To persist game progress safely without coupling to Babylon.js scene objects or node references, all state must be captured as plain JSON-serializable primitives (strings, numbers, simple object dicts).
2. **Crash-Safe Persistence with Browser Fallback**: Web applications writing to `window.localStorage` can fail if local storage is blocked, full (QuotaExceededError), or corrupted. Using a `StorageAdapter` wrapper that writes to a temporary string, maintains a `.bak` key fallback, and degrades gracefully to an in-memory `Map` ensures crash-safe data integrity.
3. **Schema Evolution Security**: Game updates frequently add or rename stats, items, or progression mechanics. Stamping a `version: 1` header on the save payload and running an incremental migration registry loop (`v -> v + 1`) allows loading saves across game patches without corrupting player progress.
4. **Event-Driven Auto-Save**: Manual saves can be forgotten, while constant polling mid-combat introduces frame stutter. Subscribing `SaveManager` to lifecycle events (`player.onArchetypeSwapped`, `player.inventory.onItemEquipped`, `player.onLevelUp`, zone load/exit) ensures autosaves occur strictly at safe boundaries.
5. **Seamless UI Integration**: Adding a dedicated `@babylonjs/gui` `SaveLoadUI` modal accessible via `HUD.ts` header button or `[Esc]` menu provides the player with clear slot management (3 manual slots + 1 auto-save slot) with timestamped visual summaries.

---

## 3. Caveats

- `window.localStorage` has a typical 5MB limit per origin, which is more than sufficient for thousands of ARPG JSON save snapshots (~2-5KB per save).
- Babylon.js meshes and WebGL textures are reconstructed on load from model URLs/templates; no live scene objects are serialized.
- When loading a save file that includes equipment, existing stat modifiers attached to `StatsComponent` must be cleared and re-derived via `inventory.equipItem()` to avoid stat drift.

---

## 4. Conclusion & Technical Specifications for Implementation Worker

The implementation of Phase 6 Save Persistence & UI should be executed by creating two core modules in `src/core/` and `src/persistence/`, and one UI overlay in `src/ui/`.

### 4.1 StorageAdapter Specification (`src/core/StorageAdapter.ts`)

```typescript
export type MigrationFn = (oldData: any) => any;

export interface SavePayload<T = any> {
  version: number;
  timestamp: number;
  slotId: string;
  data: T;
}

export class StorageAdapter {
  private static memoryFallback: Map<string, string> = new Map();
  private static migrations: Map<number, MigrationFn> = new Map();

  /** Register a migration function to upgrade save data from `fromVersion` to `fromVersion + 1` */
  public static registerMigration(fromVersion: number, migrationFn: MigrationFn): void {
    this.migrations.set(fromVersion, migrationFn);
  }

  /** Write payload atomically to localStorage with backup key fallback */
  public static save<T>(key: string, data: T, version: number, slotId: string = "autosave"): boolean {
    const payload: SavePayload<T> = {
      version,
      timestamp: Date.now(),
      slotId,
      data,
    };

    const jsonString = JSON.stringify(payload);
    const backupKey = `${key}_bak`;

    try {
      // 1. Copy existing current save to backup key if present
      const existing = this.getItem(key);
      if (existing) {
        this.setItem(backupKey, existing);
      }

      // 2. Write new save to primary key
      this.setItem(key, jsonString);
      return true;
    } catch (err) {
      console.error(`StorageAdapter: Failed to save key '${key}':`, err);
      return false;
    }
  }

  /** Load payload with version verification and migration pipeline */
  public static load<T>(key: string, targetVersion: number): T | null {
    let raw = this.getItem(key);
    let backupUsed = false;

    if (!raw) {
      // Try backup key fallback
      raw = this.getItem(`${key}_bak`);
      backupUsed = true;
    }

    if (!raw) return null;

    try {
      let payload: SavePayload<any> = JSON.parse(raw);
      let currentVer = payload.version ?? 0;

      if (currentVer > targetVersion) {
        console.warn(`StorageAdapter: Save version (${currentVer}) is newer than supported engine version (${targetVersion}).`);
        return null;
      }

      // Execute migration pipeline step-by-step up to targetVersion
      while (currentVer < targetVersion) {
        const migrator = this.migrations.get(currentVer);
        if (!migrator) {
          throw new Error(`Missing migration function from version ${currentVer} to ${currentVer + 1}`);
        }
        console.log(`StorageAdapter: Migrating save data from version ${currentVer} -> ${currentVer + 1}`);
        payload.data = migrator(payload.data);
        currentVer++;
        payload.version = currentVer;
      }

      return payload.data as T;
    } catch (err) {
      console.error(`StorageAdapter: Failed to load/parse save data for '${key}' (backupUsed=${backupUsed}):`, err);
      if (!backupUsed) {
        // Fallback retry with .bak key
        return this.load<T>(`${key}_bak`, targetVersion);
      }
      return null;
    }
  }

  public static exists(key: string): boolean {
    return this.getItem(key) !== null;
  }

  public static delete(key: string): void {
    try {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}_bak`);
    } catch {
      this.memoryFallback.delete(key);
      this.memoryFallback.delete(`${key}_bak`);
    }
  }

  private static setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      this.memoryFallback.set(key, value);
    }
  }

  private static getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key) ?? this.memoryFallback.get(key) ?? null;
    } catch {
      return this.memoryFallback.get(key) ?? null;
    }
  }
}
```

---

### 4.2 Version 1 Save Schema & SaveManager Specification (`src/persistence/SaveManager.ts`)

#### GameSaveState Schema Interface:
```typescript
import { ArchetypeType } from "../combat/Archetypes";
import { Item, EquipmentSlot } from "../entities/components/InventoryComponent";
import { StatType } from "../entities/components/StatsComponent";

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
```

#### Migration Registry Example (Version Upgrade Paths):
- Register migration `0 -> 1` to parse legacy save schemas.
- Example pattern for future `1 -> 2` migration:
```typescript
StorageAdapter.registerMigration(0, (oldData: any) => {
  // Migrate raw legacy state into V1 structure
  return {
    version: 1,
    player: oldData.player || { level: 1, xp: 0, activeArchetypeId: 'tank' },
    inventory: oldData.inventory || { gold: 0, items: [], equipment: {} },
    talents: oldData.talents || {},
    world: oldData.world || { currentZone: 'town_hub', dungeonFloor: 1 }
  };
});

StorageAdapter.registerMigration(1, (v1Data: GameSaveStateV1) => {
  // Example future upgrade to Version 2 (adding quest flags or dynamic difficulty)
  return {
    ...v1Data,
    version: 2,
    quests: { completedQuests: [] },
  };
});
```

#### SaveManager Class Responsibilities:
1. **Capture State (`SaveManager.captureState(player, zoneInfo)`)**:
   - Collect player `level`, `xp`, `activeArchetypeId`, `position`, `health.currentHp`, `mana`.
   - Collect inventory `gold`, `maxWeight`, `items`, and convert `equipment` Map to plain object dictionary.
   - Collect `player.talentTree.serialize()`.
   - Include `zoneInfo` (zone type & dungeon floor level).
2. **Apply State (`SaveManager.loadState(slotId, player, scene)`)**:
   - Call `StorageAdapter.load<GameSaveStateV1>(`save_slot_${slotId}`, CURRENT_VERSION)`.
   - Restore player level & XP (`player.level`, `player.xp`).
   - Switch archetype (`player.setArchetype(data.player.activeArchetypeId)`).
   - Restore talent tree (`player.talentTree.deserialize(data.talents)`).
   - Clear inventory & equipment, add items back to `player.inventory.items`, set gold (`player.inventory.gold`), and re-equip gear using `player.inventory.equipItem(item, player.stats)`.
   - Set player health & mana (`player.health.setHp(data.player.currentHp)`).
   - Restore position (`player.transformNode.position`).
3. **Auto-Save Registration (`SaveManager.registerAutoSaveEvents(player)`)**:
   - Subscribe to:
     - `player.onArchetypeSwapped`: Auto-saves to `"autosave"` slot.
     - `player.inventory.onItemEquipped`: Auto-saves to `"autosave"` slot.
     - `player.onLevelUp`: Auto-saves to `"autosave"` slot.

---

### 4.3 Save/Load UI Overlay Specification (`src/ui/SaveLoadUI.ts`)

1. **UI Container**: Fullscreen `@babylonjs/gui` modal window (`SaveLoadUI`).
2. **Slot Selection Card Layout**:
   - Header: "GAME SAVES & PERSISTENCE"
   - Row 0: **Auto-Save Slot** (Shows timestamp, level, archetype, gold. Displays `[LOAD]` button).
   - Row 1: **Manual Save Slot 1** (Displays `[SAVE]`, `[LOAD]`, `[DELETE]` buttons).
   - Row 2: **Manual Save Slot 2** (Displays `[SAVE]`, `[LOAD]`, `[DELETE]` buttons).
   - Row 3: **Manual Save Slot 3** (Displays `[SAVE]`, `[LOAD]`, `[DELETE]` buttons).
3. **Feedback Toasts**: Integrated with `HUD.ts` pickup/status notification system to display feedback when save operations succeed or fail.
4. **Keybindings & Controls**:
   - Add `[P]` or `[Esc]` key overlay toggle in `index.ts`.
   - Wire a new "Save/Load [P]" button in `HUD.ts` header stack panel alongside `[I]` and `[T]`.

---

## 5. Verification Method

To verify the implementation once written by the Worker:
1. **Compilation Check**:
   Run `npm run build` or `npx tsc --noEmit` from project root to ensure zero TypeScript compiler errors.
2. **Runtime Verification**:
   - Launch Vite dev server (`npm run dev`).
   - Open browser, pick up items, equip gear, swap archetype at Town Hub Altar, and gain XP.
   - Trigger Manual Save in Slot 1 via `SaveLoadUI`.
   - Reload browser page (`F5`).
   - Click `[LOAD]` on Slot 1 in `SaveLoadUI`.
   - Inspect player stats, equipped items, gold, level, and talent tree ranks to confirm 100% restoration without stat drift.
3. **Migration Verification**:
   - Manually edit a `save_slot_1` item in `localStorage` in browser devtools with `"version": 0`.
   - Trigger load; verify via console logs that `StorageAdapter` executes migration step `0 -> 1` and successfully upgrades schema.
