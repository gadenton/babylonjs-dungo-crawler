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

  /** Clear all registered migrations (useful for unit testing) */
  public static clearMigrations(): void {
    this.migrations.clear();
  }

  /** Write payload atomically with backup key fallback */
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
      let currentData = payload.data !== undefined ? payload.data : payload;
      while (currentVer < targetVersion) {
        const migrator = this.migrations.get(currentVer);
        if (!migrator) {
          throw new Error(`Missing migration function from version ${currentVer} to ${currentVer + 1}`);
        }
        console.log(`StorageAdapter: Migrating save data from version ${currentVer} -> ${currentVer + 1}`);
        currentData = migrator(currentData);
        currentVer++;
      }
      payload.data = currentData;
      payload.version = currentVer;

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

  /** Get raw SavePayload without running migration, for metadata checks */
  public static getPayload<T = any>(key: string): SavePayload<T> | null {
    const rawPrimary = this.getItem(key);
    if (rawPrimary) {
      try {
        return JSON.parse(rawPrimary) as SavePayload<T>;
      } catch {}
    }

    const rawBak = this.getItem(`${key}_bak`);
    if (rawBak) {
      try {
        return JSON.parse(rawBak) as SavePayload<T>;
      } catch {}
    }

    return null;
  }

  public static exists(key: string): boolean {
    return this.getItem(key) !== null || this.getItem(`${key}_bak`) !== null;
  }

  public static delete(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(`${key}_bak`);
      }
    } catch {}
    this.memoryFallback.delete(key);
    this.memoryFallback.delete(`${key}_bak`);
  }

  /** Clear memory fallback and optionally localStorage keys starting with prefix */
  public static clearAll(prefix: string = "dungo_save_"): void {
    this.memoryFallback.clear();
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          window.localStorage.removeItem(k);
        }
      }
    } catch {}
  }

  private static setItem(key: string, value: string): void {
    let success = false;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        success = true;
      }
    } catch {}

    if (!success) {
      this.memoryFallback.set(key, value);
    }
  }

  private static getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}
    return this.memoryFallback.get(key) ?? null;
  }
}
