import { Observable } from "@babylonjs/core/Misc/observable";

export enum StatType {
  AttackDamage = "AttackDamage",
  CritChance = "CritChance",
  Armor = "Armor",
  MaxHp = "MaxHp",
  CooldownReduction = "CooldownReduction",
  MoveSpeed = "MoveSpeed",
  CritDamage = "CritDamage",
  // Compatibility aliases
  MaxHealth = "MaxHp",
  AttackPower = "AttackDamage",
  Health = "Health",
  Mana = "Mana",
  MaxMana = "MaxMana",
}

export type ModifierType = "flat" | "percent";

export interface StatModifier {
  id: string;
  stat: StatType;
  type: ModifierType;
  value: number;
  source?: string;
  duration?: number;
  elapsedTime?: number;
}

export interface StatChangeEvent {
  stat: StatType;
  oldValue: number;
  newValue: number;
  baseValue: number;
}

export class StatsComponent {
  private baseStats: Map<StatType, number> = new Map();
  private modifiers: StatModifier[] = [];
  private cachedStats: Map<StatType, number> = new Map();
  private isDirty: boolean = true;

  // Resource Pools State
  private _currentHealth: number = 100;
  private _currentMana: number = 100;

  // Observables
  public readonly onStatChanged: Observable<StatChangeEvent> = new Observable<StatChangeEvent>();
  public readonly onHealthChanged: Observable<{ current: number; max: number; delta: number; isFatal: boolean }> = new Observable();
  public readonly onDeath: Observable<void> = new Observable<void>();
  public readonly onManaChanged: Observable<{ current: number; max: number; delta: number }> = new Observable();

  constructor(initialBaseStats?: Partial<Record<StatType, number>>) {
    // Defaults
    this.baseStats.set(StatType.AttackDamage, 15);
    this.baseStats.set(StatType.CritChance, 0.10);
    this.baseStats.set(StatType.Armor, 10);
    this.baseStats.set(StatType.MaxHp, 100);
    this.baseStats.set(StatType.MaxMana, 100);
    this.baseStats.set(StatType.CooldownReduction, 0);
    this.baseStats.set(StatType.MoveSpeed, 7.0);
    this.baseStats.set(StatType.CritDamage, 1.5);

    if (initialBaseStats) {
      for (const [statKey, value] of Object.entries(initialBaseStats)) {
        if (value !== undefined) {
          this.baseStats.set(statKey as StatType, value);
        }
      }
    }

    // Initialize resource pools from initial stats
    this._currentHealth = this.maxHealth;
    this._currentMana = this.maxMana;
  }

  // Resource Pool Getters
  public get currentHealth(): number {
    return this._currentHealth;
  }

  public get maxHealth(): number {
    return this.getStat(StatType.MaxHp);
  }

  public get currentMana(): number {
    return this._currentMana;
  }

  public get maxMana(): number {
    return this.getStat(StatType.MaxMana);
  }

  public get isAlive(): boolean {
    return this._currentHealth > 0;
  }

  /**
   * Modifies current health by amount (+ for heal, - for damage).
   * Clamps between 0 and maxHealth. Notifies onHealthChanged and onDeath.
   */
  public modifyHealth(amount: number): number {
    if (amount === 0) return this._currentHealth;

    const prevHp = this._currentHealth;
    const maxHp = this.maxHealth;
    const newHp = Math.max(0, Math.min(maxHp, prevHp + amount));
    const delta = newHp - prevHp;

    if (delta !== 0) {
      this._currentHealth = newHp;
      const isFatal = newHp <= 0;

      this.onHealthChanged.notifyObservers({
        current: newHp,
        max: maxHp,
        delta,
        isFatal,
      });

      if (prevHp > 0 && isFatal) {
        this.onDeath.notifyObservers();
      }
    }

    return this._currentHealth;
  }

  /**
   * Modifies current mana by amount (+ for restore, - for spend).
   */
  public modifyMana(amount: number): number {
    if (amount === 0) return this._currentMana;

    const prevMana = this._currentMana;
    const maxMana = this.maxMana;
    const newMana = Math.max(0, Math.min(maxMana, prevMana + amount));
    const delta = newMana - prevMana;

    if (delta !== 0) {
      this._currentMana = newMana;
      this.onManaChanged.notifyObservers({
        current: newMana,
        max: maxMana,
        delta,
      });
    }

    return this._currentMana;
  }

  public setMana(newMana: number): void {
    const prevMana = this._currentMana;
    const maxMana = this.maxMana;
    this._currentMana = Math.max(0, Math.min(maxMana, newMana));
    const delta = this._currentMana - prevMana;
    if (delta !== 0) {
      this.onManaChanged.notifyObservers({
        current: this._currentMana,
        max: maxMana,
        delta,
      });
    }
  }

  public setBaseStat(stat: StatType, value: number): void {
    const oldCalc = this.getStat(stat);
    this.baseStats.set(stat, value);
    this.markDirty();
    const newCalc = this.getStat(stat);
    if (oldCalc !== newCalc) {
      this.onStatChanged.notifyObservers({
        stat,
        oldValue: oldCalc,
        newValue: newCalc,
        baseValue: value,
      });
    }
  }

  public getBaseStat(stat: StatType): number {
    return this.baseStats.get(stat) ?? 0;
  }

  public addModifier(modifier: StatModifier): void {
    this.removeModifier(modifier.id, false);
    this.modifiers.push({ ...modifier, elapsedTime: 0 });
    this.markDirty();
  }

  public removeModifier(id: string, notify: boolean = true): void {
    const index = this.modifiers.findIndex((m) => m.id === id);
    if (index !== -1) {
      const removedMod = this.modifiers[index];
      this.modifiers.splice(index, 1);
      this.markDirty();
      if (notify) {
        this.getStat(removedMod.stat);
      }
    }
  }

  public removeModifiersBySource(source: string): void {
    this.modifiers = this.modifiers.filter((m) => m.source !== source);
    this.markDirty();
  }

  public getStat(stat: StatType): number {
    if (this.isDirty || !this.cachedStats.has(stat)) {
      this.recalculateAll();
    }
    return this.cachedStats.get(stat) ?? this.getBaseStat(stat);
  }

  public update(deltaTime: number): void {
    let modified = false;
    for (let i = this.modifiers.length - 1; i >= 0; i--) {
      const mod = this.modifiers[i];
      if (mod.duration !== undefined) {
        mod.elapsedTime = (mod.elapsedTime ?? 0) + deltaTime;
        if (mod.elapsedTime >= mod.duration) {
          this.modifiers.splice(i, 1);
          modified = true;
        }
      }
    }
    if (modified) {
      this.markDirty();
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private recalculateAll(): void {
    const oldValues = new Map(this.cachedStats);
    this.cachedStats.clear();

    const statsToCalculate: StatType[] = [
      StatType.AttackDamage,
      StatType.CritChance,
      StatType.Armor,
      StatType.MaxHp,
      StatType.MaxMana,
      StatType.CooldownReduction,
      StatType.MoveSpeed,
      StatType.CritDamage,
    ];

    for (const stat of statsToCalculate) {
      const base = this.getBaseStat(stat);
      const statMods = this.modifiers.filter((m) => m.stat === stat);

      let flatSum = 0;
      let percentSum = 0;

      for (const mod of statMods) {
        if (mod.type === "flat") {
          flatSum += mod.value;
        } else if (mod.type === "percent") {
          percentSum += mod.value;
        }
      }

      let finalValue = (base + flatSum) * (1.0 + percentSum);

      // Bounds Clamping
      if (stat === StatType.CritChance) {
        finalValue = Math.max(0.0, Math.min(1.0, finalValue));
      } else if (stat === StatType.CooldownReduction) {
        finalValue = Math.max(0.0, Math.min(0.50, finalValue));
      } else if (stat === StatType.Armor) {
        finalValue = Math.max(0.0, finalValue);
      } else if (stat === StatType.MaxHp || stat === StatType.MaxMana) {
        finalValue = Math.max(1.0, finalValue);
      } else if (stat === StatType.MoveSpeed) {
        finalValue = Math.max(0.1, finalValue);
      }

      this.cachedStats.set(stat, finalValue);

      if (stat === StatType.MaxHp && this._currentHealth > finalValue) {
        this._currentHealth = finalValue;
      }
      if (stat === StatType.MaxMana && this._currentMana > finalValue) {
        this._currentMana = finalValue;
      }

      const oldVal = oldValues.get(stat);
      if (oldVal !== undefined && oldVal !== finalValue) {
        this.onStatChanged.notifyObservers({
          stat,
          oldValue: oldVal,
          newValue: finalValue,
          baseValue: base,
        });
      }
    }

    this.isDirty = false;
  }
}
