import { StatType } from "../entities/components/StatsComponent";
import { Item, ItemCategory, EquipmentSlot, Rarity } from "../entities/components/InventoryComponent";

export interface ItemTemplate {
  templateId: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  weight: 1 | 2 | 3;
  equipmentSlot?: EquipmentSlot;
  stats?: { stat: StatType; type: "flat" | "percent"; value: number }[];
  stackable?: boolean;
  maxStack?: number;
  iconText?: string;
  modelUrl?: string;
  healAmount?: number;
  manaAmount?: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  // Weapons
  iron_sword: {
    templateId: "iron_sword",
    name: "Iron Sword",
    description: "A standard iron sword forged by village smiths.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Common,
    weight: 2,
    equipmentSlot: EquipmentSlot.MainHand,
    stats: [{ stat: StatType.AttackDamage, type: "flat", value: 6 }],
    iconText: "⚔️",
  },
  fine_steel_sword: {
    templateId: "fine_steel_sword",
    name: "Fine Steel Sword",
    description: "Well-balanced steel sword with a razor-sharp edge.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Magic,
    weight: 2,
    equipmentSlot: EquipmentSlot.MainHand,
    stats: [
      { stat: StatType.AttackDamage, type: "flat", value: 12 },
      { stat: StatType.CritChance, type: "flat", value: 0.05 },
    ],
    iconText: "🗡️",
  },
  battle_axe: {
    templateId: "battle_axe",
    name: "Battle Axe",
    description: "Heavy double-bitted axe designed for crushing armor.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Rare,
    weight: 3,
    equipmentSlot: EquipmentSlot.MainHand,
    stats: [
      { stat: StatType.AttackDamage, type: "flat", value: 22 },
      { stat: StatType.CritDamage, type: "flat", value: 0.20 },
    ],
    iconText: "🪓",
  },
  sunfire_blade: {
    templateId: "sunfire_blade",
    name: "Sunfire Blade",
    description: "Radiant blade infused with solar flames.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Legendary,
    weight: 2,
    equipmentSlot: EquipmentSlot.MainHand,
    stats: [
      { stat: StatType.AttackDamage, type: "flat", value: 35 },
      { stat: StatType.CritChance, type: "flat", value: 0.12 },
      { stat: StatType.CritDamage, type: "flat", value: 0.25 },
    ],
    iconText: "☀️",
  },

  // OffHand
  wooden_shield: {
    templateId: "wooden_shield",
    name: "Wooden Shield",
    description: "Basic oak shield bound with iron hoops.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Common,
    weight: 2,
    equipmentSlot: EquipmentSlot.OffHand,
    stats: [{ stat: StatType.Armor, type: "flat", value: 5 }],
    iconText: "🛡️",
  },
  reinforced_shield: {
    templateId: "reinforced_shield",
    name: "Reinforced Shield",
    description: "Sturdy iron tower shield offering great block power.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Magic,
    weight: 2,
    equipmentSlot: EquipmentSlot.OffHand,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 12 },
      { stat: StatType.MaxHp, type: "flat", value: 15 },
    ],
    iconText: "🛡️",
  },
  aegis_of_valor: {
    templateId: "aegis_of_valor",
    name: "Aegis of Valor",
    description: "Blessed shield bearing the crest of ancient defenders.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Legendary,
    weight: 2,
    equipmentSlot: EquipmentSlot.OffHand,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 25 },
      { stat: StatType.MaxHp, type: "flat", value: 40 },
      { stat: StatType.CooldownReduction, type: "flat", value: 0.08 },
    ],
    iconText: "🔰",
  },

  // Head
  leather_cap: {
    templateId: "leather_cap",
    name: "Leather Cap",
    description: "Simple leather headwear for minor protection.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Common,
    weight: 1,
    equipmentSlot: EquipmentSlot.Head,
    stats: [{ stat: StatType.Armor, type: "flat", value: 3 }],
    iconText: "🧢",
  },
  steel_helm: {
    templateId: "steel_helm",
    name: "Steel Helm",
    description: "Forged steel visor helmet.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Magic,
    weight: 2,
    equipmentSlot: EquipmentSlot.Head,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 8 },
      { stat: StatType.MaxHp, type: "flat", value: 10 },
    ],
    iconText: "🪖",
  },
  crown_of_light: {
    templateId: "crown_of_light",
    name: "Crown of Light",
    description: "Gleaming circlet that empowers spells and guards the mind.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Legendary,
    weight: 1,
    equipmentSlot: EquipmentSlot.Head,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 15 },
      { stat: StatType.MaxHp, type: "flat", value: 30 },
      { stat: StatType.CooldownReduction, type: "flat", value: 0.10 },
    ],
    iconText: "👑",
  },

  // Chest
  tattered_tunic: {
    templateId: "tattered_tunic",
    name: "Tattered Tunic",
    description: "Worn cloth tunic.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Common,
    weight: 1,
    equipmentSlot: EquipmentSlot.Chest,
    stats: [{ stat: StatType.Armor, type: "flat", value: 4 }],
    iconText: "👕",
  },
  chainmail_vest: {
    templateId: "chainmail_vest",
    name: "Chainmail Vest",
    description: "Interlocked iron rings absorbing sword slashes.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Magic,
    weight: 2,
    equipmentSlot: EquipmentSlot.Chest,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 14 },
      { stat: StatType.MaxHp, type: "flat", value: 20 },
    ],
    iconText: "🤿",
  },
  dragonplate_armor: {
    templateId: "dragonplate_armor",
    name: "Dragonplate Armor",
    description: "Heavy plate forged from dragon scales.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Legendary,
    weight: 3,
    equipmentSlot: EquipmentSlot.Chest,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 32 },
      { stat: StatType.MaxHp, type: "flat", value: 50 },
      { stat: StatType.MoveSpeed, type: "percent", value: 0.05 },
    ],
    iconText: "🛡️",
  },

  // Legs
  cloth_greaves: {
    templateId: "cloth_greaves",
    name: "Cloth Greaves",
    description: "Light leg guards.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Common,
    weight: 1,
    equipmentSlot: EquipmentSlot.Legs,
    stats: [{ stat: StatType.Armor, type: "flat", value: 2 }],
    iconText: "👖",
  },
  boots_of_haste: {
    templateId: "boots_of_haste",
    name: "Boots of Haste",
    description: "Enchanted boots granting swift movement.",
    category: ItemCategory.Equipment,
    rarity: Rarity.Rare,
    weight: 2,
    equipmentSlot: EquipmentSlot.Legs,
    stats: [
      { stat: StatType.Armor, type: "flat", value: 8 },
      { stat: StatType.MoveSpeed, type: "percent", value: 0.15 },
    ],
    iconText: "🥾",
  },

  // Consumables
  health_potion: {
    templateId: "health_potion",
    name: "Health Potion",
    description: "Restores 40 Health points.",
    category: ItemCategory.Consumable,
    rarity: Rarity.Common,
    weight: 1,
    stackable: true,
    maxStack: 10,
    healAmount: 40,
    iconText: "🧪",
  },
  mana_potion: {
    templateId: "mana_potion",
    name: "Mana Potion",
    description: "Restores 30 Mana points.",
    category: ItemCategory.Consumable,
    rarity: Rarity.Common,
    weight: 1,
    stackable: true,
    maxStack: 10,
    manaAmount: 30,
    iconText: "🧪",
  },
};

let instanceCounter = 0;

export function instantiateItem(templateId: string, customRarity?: Rarity): Item {
  const template = ITEM_TEMPLATES[templateId] ?? ITEM_TEMPLATES["iron_sword"];
  instanceCounter++;
  const id = `item_${Date.now()}_${instanceCounter}`;

  return {
    id,
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    category: template.category,
    rarity: customRarity ?? template.rarity,
    weight: template.weight,
    equipmentSlot: template.equipmentSlot,
    stats: template.stats ? template.stats.map((s) => ({ ...s })) : undefined,
    stackable: template.stackable,
    stackCount: template.stackable ? 1 : undefined,
    maxStack: template.maxStack,
    iconText: template.iconText,
    modelUrl: template.modelUrl,
    healAmount: template.healAmount,
    manaAmount: template.manaAmount,
  };
}

export function createGoldItem(amount: number): Item {
  instanceCounter++;
  return {
    id: `gold_${Date.now()}_${instanceCounter}`,
    templateId: "gold_coins",
    name: `${amount} Gold`,
    description: "Shiny gold coins.",
    category: ItemCategory.Gold,
    rarity: Rarity.Common,
    weight: 1,
    goldAmount: amount,
    iconText: "🪙",
  };
}

export function createGlobeItem(type: "health" | "mana"): Item {
  instanceCounter++;
  return {
    id: `globe_${type}_${Date.now()}_${instanceCounter}`,
    templateId: `globe_${type}`,
    name: type === "health" ? "Health Globe" : "Mana Globe",
    description: type === "health" ? "Restores 25% Max HP." : "Restores 25% Max Mana.",
    category: ItemCategory.Globe,
    rarity: Rarity.Magic,
    weight: 1,
    globeType: type,
    iconText: type === "health" ? "🔴" : "🔵",
  };
}

export interface DropTableConfig {
  goldChance: number;
  minGold: number;
  maxGold: number;
  globeChance: number;
  itemDropChance: number;
  itemRolls: number;
}

export const DROP_TABLES: Record<string, DropTableConfig> = {
  standard: {
    goldChance: 0.70,
    minGold: 5,
    maxGold: 25,
    globeChance: 0.35,
    itemDropChance: 0.45,
    itemRolls: 1,
  },
  elite: {
    goldChance: 1.00,
    minGold: 25,
    maxGold: 80,
    globeChance: 0.65,
    itemDropChance: 0.85,
    itemRolls: 2,
  },
  boss: {
    goldChance: 1.00,
    minGold: 100,
    maxGold: 300,
    globeChance: 1.00,
    itemDropChance: 1.00,
    itemRolls: 4,
  },
};

export function rollEnemyDrops(tier: string = "standard"): Item[] {
  const config = DROP_TABLES[tier] ?? DROP_TABLES["standard"];
  const drops: Item[] = [];

  // 1. Roll Gold
  if (Math.random() <= config.goldChance) {
    const gold = Math.floor(Math.random() * (config.maxGold - config.minGold + 1)) + config.minGold;
    drops.push(createGoldItem(gold));
  }

  // 2. Roll Globes
  if (Math.random() <= config.globeChance) {
    const globeType = Math.random() < 0.5 ? "health" : "mana";
    drops.push(createGlobeItem(globeType));
  }

  // 3. Roll Equipment / Consumable Items
  if (Math.random() <= config.itemDropChance) {
    const pool = Object.keys(ITEM_TEMPLATES);
    for (let r = 0; r < config.itemRolls; r++) {
      const templateId = pool[Math.floor(Math.random() * pool.length)];
      drops.push(instantiateItem(templateId));
    }
  }

  return drops;
}
