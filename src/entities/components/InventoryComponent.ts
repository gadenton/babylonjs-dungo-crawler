import { Observable } from "@babylonjs/core/Misc/observable";
import { StatsComponent, StatType } from "./StatsComponent";

export enum Rarity {
  Common = "common",
  Magic = "magic",
  Rare = "rare",
  Legendary = "legendary",
}

export enum EquipmentSlot {
  MainHand = "mainHand",
  OffHand = "offHand",
  Head = "head",
  Chest = "chest",
  Legs = "legs",
}

export enum ItemCategory {
  Equipment = "equipment",
  Consumable = "consumable",
  Gold = "gold",
  Globe = "globe",
}

export interface ItemStatBonus {
  stat: StatType;
  type: "flat" | "percent";
  value: number;
}

export interface Item {
  id: string; // Unique instance ID (UUID or timestamp string)
  templateId: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  weight: 1 | 2 | 3; // Option D1 weight cost: 1x, 2x, 3x
  equipmentSlot?: EquipmentSlot;
  stats?: ItemStatBonus[];
  stackable?: boolean;
  stackCount?: number;
  maxStack?: number;
  goldAmount?: number;
  healAmount?: number;
  manaAmount?: number;
  globeType?: "health" | "mana";
  iconText?: string;
  modelUrl?: string;
}

export interface ItemEquippedEvent {
  slot: EquipmentSlot;
  item: Item | null;
}

export class InventoryComponent {
  public maxWeight: number = 30; // 30 weight capacity max
  public items: Item[] = [];
  public equipment: Map<EquipmentSlot, Item | null> = new Map([
    [EquipmentSlot.MainHand, null],
    [EquipmentSlot.OffHand, null],
    [EquipmentSlot.Head, null],
    [EquipmentSlot.Chest, null],
    [EquipmentSlot.Legs, null],
  ]);
  public gold: number = 0;

  // Observables
  public readonly onInventoryChanged: Observable<void> = new Observable<void>();
  public readonly onGoldChanged: Observable<number> = new Observable<number>();
  public readonly onItemEquipped: Observable<ItemEquippedEvent> = new Observable<ItemEquippedEvent>();
  public readonly onItemPickedUp: Observable<Item> = new Observable<Item>();

  constructor(maxWeight: number = 30) {
    this.maxWeight = maxWeight;
  }

  public getCurrentWeight(): number {
    return this.items.reduce((total, item) => total + item.weight * (item.stackCount ?? 1), 0);
  }

  public canAddItem(item: Item): boolean {
    // Currency / Globes don't take inventory bag weight
    if (item.category === ItemCategory.Gold || item.category === ItemCategory.Globe) {
      return true;
    }
    const itemWeight = item.weight * (item.stackCount ?? 1);
    return this.getCurrentWeight() + itemWeight <= this.maxWeight;
  }

  public addItem(item: Item): boolean {
    if (!this.canAddItem(item)) {
      return false;
    }

    if (item.stackable) {
      const existing = this.items.find((i) => i.templateId === item.templateId);
      if (existing) {
        existing.stackCount = (existing.stackCount ?? 1) + (item.stackCount ?? 1);
        this.onInventoryChanged.notifyObservers();
        this.onItemPickedUp.notifyObservers(item);
        return true;
      }
    }

    this.items.push(item);
    this.onInventoryChanged.notifyObservers();
    this.onItemPickedUp.notifyObservers(item);
    return true;
  }

  public removeItem(itemId: string): Item | null {
    const index = this.items.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      const removed = this.items.splice(index, 1)[0];
      this.onInventoryChanged.notifyObservers();
      return removed;
    }
    return null;
  }

  public equipItem(item: Item, playerStats: StatsComponent): boolean {
    if (item.category !== ItemCategory.Equipment || !item.equipmentSlot) {
      return false;
    }

    const slot = item.equipmentSlot;
    const currentlyEquipped = this.equipment.get(slot);

    // If equipping an item currently in inventory bag, remove it from bag first
    const bagIndex = this.items.findIndex((i) => i.id === item.id);

    // If unequipping current item is necessary:
    if (currentlyEquipped) {
      // Temporarily remove stat modifiers from currently equipped item
      playerStats.removeModifiersBySource(`equipment_${slot}`);
      this.equipment.set(slot, null);

      // Add currently equipped back into items bag if space permits
      if (bagIndex !== -1) {
        // Swap place directly in bag array
        this.items[bagIndex] = currentlyEquipped;
      } else {
        if (!this.canAddItem(currentlyEquipped)) {
          // Re-equip current item if bag is full
          this.applyEquipmentModifiers(currentlyEquipped, slot, playerStats);
          this.equipment.set(slot, currentlyEquipped);
          return false;
        }
        this.items.push(currentlyEquipped);
      }
    } else {
      if (bagIndex !== -1) {
        this.items.splice(bagIndex, 1);
      }
    }

    // Set new item in equipment slot
    this.equipment.set(slot, item);

    // Attach StatModifiers onto StatsComponent without stat drift
    this.applyEquipmentModifiers(item, slot, playerStats);

    this.onItemEquipped.notifyObservers({ slot, item });
    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public unequipItem(slot: EquipmentSlot, playerStats: StatsComponent): boolean {
    const item = this.equipment.get(slot);
    if (!item) return false;

    if (!this.canAddItem(item)) {
      return false; // Cannot unequip if inventory is full
    }

    // Remove stat modifiers from StatsComponent
    playerStats.removeModifiersBySource(`equipment_${slot}`);
    this.equipment.set(slot, null);

    // Add back to inventory bag
    this.items.push(item);

    this.onItemEquipped.notifyObservers({ slot, item: null });
    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public useConsumable(item: Item, playerStats: StatsComponent): boolean {
    if (item.category !== ItemCategory.Consumable) return false;

    if (item.healAmount && item.healAmount > 0) {
      playerStats.modifyHealth(item.healAmount);
    }
    if (item.manaAmount && item.manaAmount > 0) {
      playerStats.modifyMana(item.manaAmount);
    }

    if (item.stackable && item.stackCount && item.stackCount > 1) {
      item.stackCount--;
    } else {
      this.removeItem(item.id);
    }

    this.onInventoryChanged.notifyObservers();
    return true;
  }

  public addGold(amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
    this.onGoldChanged.notifyObservers(this.gold);
  }

  private applyEquipmentModifiers(item: Item, slot: EquipmentSlot, playerStats: StatsComponent): void {
    if (!item.stats) return;
    const sourceTag = `equipment_${slot}`;
    playerStats.removeModifiersBySource(sourceTag);

    item.stats.forEach((mod, index) => {
      playerStats.addModifier({
        id: `equip_${slot}_${index}`,
        stat: mod.stat,
        type: mod.type,
        value: mod.value,
        source: sourceTag,
      });
    });
  }
}
