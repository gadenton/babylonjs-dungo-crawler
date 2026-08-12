import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Player } from "../entities/Player";
import { InputManager } from "../core/InputManager";
import { ArchetypeManager } from "../combat/Archetypes";
import { Item, ItemCategory } from "../entities/components/InventoryComponent";
import { getRarityHex } from "../entities/LootDrop";

export class HUD {
  private scene: Scene;
  private player: Player;
  private inputManager: InputManager | null = null;
  private guiTexture: AdvancedDynamicTexture;

  // Observers
  private healthChangedObserver: Observer<any> | null = null;
  private manaChangedObserver: Observer<any> | null = null;
  private statChangedObserver: Observer<any> | null = null;
  private levelUpObserver: Observer<number> | null = null;
  private archetypeSwappedObserver: Observer<any> | null = null;
  private goldChangedObserver: Observer<number> | null = null;
  private itemPickedUpObserver: Observer<Item> | null = null;

  // Resource Bars
  private healthBarFill: Rectangle;
  private healthText: TextBlock;
  private manaBarFill: Rectangle;
  private manaText: TextBlock;

  // Level & XP & Gold
  private levelText: TextBlock;
  private xpBarFill: Rectangle;
  private xpText: TextBlock;
  private goldText: TextBlock;

  // Archetype & Skill Hotbar
  private archetypeBadgeText: TextBlock;
  private skill0Rect: Rectangle;
  private skill0IconText: TextBlock;
  private skill0CdOverlay: Rectangle;
  private skill0CdText: TextBlock;

  // Interaction Prompt Banner (for Altar)
  private interactionBanner: Rectangle;
  private interactionPromptText: TextBlock;

  // Header Buttons
  private mapButton: Button;
  private talentButton: Button;
  private inventoryButton: Button;
  private saveButton: Button;

  // Toast Notification Stack
  private toastStack: StackPanel;

  constructor(scene: Scene, player: Player, inputManager?: InputManager) {
    this.scene = scene;
    this.player = player;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("HUDOverlay", true, this.scene);

    // 1. Top-Left Player Status Bar (Health, Mana, XP, Gold)
    const statusRect = new Rectangle("statusRect");
    statusRect.width = "320px";
    statusRect.height = "120px";
    statusRect.background = "rgba(10, 15, 25, 0.75)";
    statusRect.color = "#DAA520";
    statusRect.thickness = 2;
    statusRect.cornerRadius = 8;
    statusRect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    statusRect.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    statusRect.left = "15px";
    statusRect.top = "15px";
    this.guiTexture.addControl(statusRect);

    const statusStack = new StackPanel("statusStack");
    statusStack.isVertical = true;
    statusStack.width = "92%";
    statusStack.height = "92%";
    statusRect.addControl(statusStack);

    // Level, Archetype & Gold Row
    const headerGrid = new Grid("headerGrid");
    headerGrid.height = "25px";
    headerGrid.width = "100%";
    headerGrid.addColumnDefinition(0.3);
    headerGrid.addColumnDefinition(0.35);
    headerGrid.addColumnDefinition(0.35);
    statusStack.addControl(headerGrid);

    this.levelText = new TextBlock("levelText", "Lvl 1");
    this.levelText.color = "#FFD700";
    this.levelText.fontSize = 13;
    this.levelText.fontWeight = "bold";
    this.levelText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerGrid.addControl(this.levelText, 0, 0);

    this.archetypeBadgeText = new TextBlock("archetypeBadgeText", "Tank");
    this.archetypeBadgeText.color = "#00FFFF";
    this.archetypeBadgeText.fontSize = 13;
    this.archetypeBadgeText.fontWeight = "bold";
    this.archetypeBadgeText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    headerGrid.addControl(this.archetypeBadgeText, 0, 1);

    this.goldText = new TextBlock("goldText", "🪙 0");
    this.goldText.color = "#F59E0B";
    this.goldText.fontSize = 13;
    this.goldText.fontWeight = "bold";
    this.goldText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    headerGrid.addControl(this.goldText, 0, 2);

    // Health Bar
    const healthBarBg = new Rectangle("healthBarBg");
    healthBarBg.height = "18px";
    healthBarBg.width = "100%";
    healthBarBg.background = "rgba(40, 0, 0, 0.8)";
    healthBarBg.color = "#990000";
    healthBarBg.cornerRadius = 4;
    statusStack.addControl(healthBarBg);

    this.healthBarFill = new Rectangle("healthBarFill");
    this.healthBarFill.height = "100%";
    this.healthBarFill.width = "100%";
    this.healthBarFill.background = "#DC2626"; // Crimson Red
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthBarBg.addControl(this.healthBarFill);

    this.healthText = new TextBlock("healthText", "180 / 180");
    this.healthText.color = "#FFFFFF";
    this.healthText.fontSize = 11;
    this.healthText.fontWeight = "bold";
    healthBarBg.addControl(this.healthText);

    // Mana Bar
    const manaBarBg = new Rectangle("manaBarBg");
    manaBarBg.height = "14px";
    manaBarBg.width = "100%";
    manaBarBg.background = "rgba(0, 20, 50, 0.8)";
    manaBarBg.color = "#004499";
    manaBarBg.cornerRadius = 3;
    statusStack.addControl(manaBarBg);

    this.manaBarFill = new Rectangle("manaBarFill");
    this.manaBarFill.height = "100%";
    this.manaBarFill.width = "100%";
    this.manaBarFill.background = "#2563EB"; // Royal Blue
    this.manaBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    manaBarBg.addControl(this.manaBarFill);

    this.manaText = new TextBlock("manaText", "80 / 80");
    this.manaText.color = "#FFFFFF";
    this.manaText.fontSize = 10;
    manaBarBg.addControl(this.manaText);

    // XP Bar
    const xpBarBg = new Rectangle("xpBarBg");
    xpBarBg.height = "10px";
    xpBarBg.width = "100%";
    xpBarBg.background = "rgba(30, 30, 10, 0.8)";
    xpBarBg.color = "#665500";
    xpBarBg.cornerRadius = 2;
    statusStack.addControl(xpBarBg);

    this.xpBarFill = new Rectangle("xpBarFill");
    this.xpBarFill.height = "100%";
    this.xpBarFill.width = "0%";
    this.xpBarFill.background = "#F59E0B"; // Amber Gold
    this.xpBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    xpBarBg.addControl(this.xpBarFill);

    this.xpText = new TextBlock("xpText", "XP: 0 / 100");
    this.xpText.color = "#FFFFFF";
    this.xpText.fontSize = 9;
    xpBarBg.addControl(this.xpText);

    // 2. Bottom Skill Hotbar
    const hotbarRect = new Rectangle("hotbarRect");
    hotbarRect.width = "360px";
    hotbarRect.height = "70px";
    hotbarRect.background = "rgba(10, 15, 25, 0.85)";
    hotbarRect.color = "#DAA520";
    hotbarRect.thickness = 2;
    hotbarRect.cornerRadius = 8;
    hotbarRect.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    hotbarRect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    hotbarRect.top = "-20px";
    this.guiTexture.addControl(hotbarRect);

    const hotbarGrid = new Grid("hotbarGrid");
    hotbarGrid.width = "95%";
    hotbarGrid.height = "90%";
    hotbarGrid.addColumnDefinition(0.2); // Slot 0
    hotbarGrid.addColumnDefinition(0.2);
    hotbarGrid.addColumnDefinition(0.2);
    hotbarGrid.addColumnDefinition(0.2);
    hotbarGrid.addColumnDefinition(0.2);
    hotbarRect.addControl(hotbarGrid);

    // Slot 0 Setup (Signature Skill)
    this.skill0Rect = new Rectangle("skill0Rect");
    this.skill0Rect.width = "54px";
    this.skill0Rect.height = "54px";
    this.skill0Rect.background = "#1E2A3A";
    this.skill0Rect.color = "#FFD700";
    this.skill0Rect.thickness = 2;
    this.skill0Rect.cornerRadius = 6;
    hotbarGrid.addControl(this.skill0Rect, 0, 0);

    this.skill0IconText = new TextBlock("skill0IconText", "[1]\nSlam");
    this.skill0IconText.color = "#FFFFFF";
    this.skill0IconText.fontSize = 11;
    this.skill0IconText.fontWeight = "bold";
    this.skill0Rect.addControl(this.skill0IconText);

    this.skill0CdOverlay = new Rectangle("skill0CdOverlay");
    this.skill0CdOverlay.width = "100%";
    this.skill0CdOverlay.height = "100%";
    this.skill0CdOverlay.background = "rgba(0, 0, 0, 0.75)";
    this.skill0CdOverlay.isVisible = false;
    this.skill0Rect.addControl(this.skill0CdOverlay);

    this.skill0CdText = new TextBlock("skill0CdText", "0.0s");
    this.skill0CdText.color = "#FF4444";
    this.skill0CdText.fontSize = 14;
    this.skill0CdText.fontWeight = "bold";
    this.skill0CdOverlay.addControl(this.skill0CdText);

    // Other Hotbar Slots
    const slotLabels = ["[2]\nSlot 2", "[3]\nSlot 3", "[4]\nSlot 4", "[Space]\nDodge"];
    slotLabels.forEach((label, i) => {
      const slot = new Rectangle(`slot_${i + 1}`);
      slot.width = "54px";
      slot.height = "54px";
      slot.background = "#111827";
      slot.color = "#374151";
      slot.thickness = 1;
      slot.cornerRadius = 6;

      const txt = new TextBlock(`slotTxt_${i + 1}`, label);
      txt.color = "#6B7280";
      txt.fontSize = 10;
      slot.addControl(txt);

      hotbarGrid.addControl(slot, 0, i + 1);
    });

    // 3. Top-Right Header Button Stack (Map [M], Inventory [I], Talents [T], Saves [P])
    const buttonStack = new StackPanel("headerBtnStack");
    buttonStack.isVertical = false;
    buttonStack.width = "520px";
    buttonStack.height = "40px";
    buttonStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    buttonStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    buttonStack.left = "-15px";
    buttonStack.top = "15px";
    this.guiTexture.addControl(buttonStack);

    this.mapButton = Button.CreateSimpleButton("mapBtn", "Map [M]");
    this.mapButton.width = "120px";
    this.mapButton.height = "38px";
    this.mapButton.color = "#FFFFFF";
    this.mapButton.background = "#7C3AED"; // Purple Accent
    this.mapButton.cornerRadius = 6;
    this.mapButton.fontSize = 13;
    this.mapButton.fontWeight = "bold";
    buttonStack.addControl(this.mapButton);

    this.inventoryButton = Button.CreateSimpleButton("invBtn", "Inventory [I]");
    this.inventoryButton.width = "125px";
    this.inventoryButton.height = "38px";
    this.inventoryButton.color = "#FFFFFF";
    this.inventoryButton.background = "#2563EB"; // Royal Blue
    this.inventoryButton.cornerRadius = 6;
    this.inventoryButton.fontSize = 13;
    this.inventoryButton.fontWeight = "bold";
    buttonStack.addControl(this.inventoryButton);

    this.talentButton = Button.CreateSimpleButton("talentBtn", "Talents [T]");
    this.talentButton.width = "125px";
    this.talentButton.height = "38px";
    this.talentButton.color = "#FFFFFF";
    this.talentButton.background = "#D97706"; // Amber
    this.talentButton.cornerRadius = 6;
    this.talentButton.fontSize = 13;
    this.talentButton.fontWeight = "bold";
    buttonStack.addControl(this.talentButton);

    this.saveButton = Button.CreateSimpleButton("saveBtn", "Saves [P]");
    this.saveButton.width = "125px";
    this.saveButton.height = "38px";
    this.saveButton.color = "#FFFFFF";
    this.saveButton.background = "#059669"; // Emerald Green
    this.saveButton.cornerRadius = 6;
    this.saveButton.fontSize = 13;
    this.saveButton.fontWeight = "bold";
    buttonStack.addControl(this.saveButton);

    // 4. Pickup Notification Toast Stack (Left Side, below status panel)
    this.toastStack = new StackPanel("toastStack");
    this.toastStack.isVertical = true;
    this.toastStack.width = "260px";
    this.toastStack.height = "160px";
    this.toastStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.toastStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.toastStack.left = "15px";
    this.toastStack.top = "145px";
    this.guiTexture.addControl(this.toastStack);

    // 5. Proximity Interaction Banner (Center-Bottom)
    this.interactionBanner = new Rectangle("interactionBanner");
    this.interactionBanner.width = "400px";
    this.interactionBanner.height = "42px";
    this.interactionBanner.background = "rgba(0, 200, 255, 0.85)";
    this.interactionBanner.color = "#FFFFFF";
    this.interactionBanner.thickness = 2;
    this.interactionBanner.cornerRadius = 8;
    this.interactionBanner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.interactionBanner.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.interactionBanner.top = "-105px";
    this.interactionBanner.isVisible = false;
    this.guiTexture.addControl(this.interactionBanner);

    this.interactionPromptText = new TextBlock("interactionPromptText", "Press [E] or (A) to Access Altar");
    this.interactionPromptText.color = "#FFFFFF";
    this.interactionPromptText.fontSize = 15;
    this.interactionPromptText.fontWeight = "bold";
    this.interactionBanner.addControl(this.interactionPromptText);

    // Subscriptions for Event-Driven HUD Updates
    this.healthChangedObserver = this.player.stats.onHealthChanged.add(() => this.updateHealthDisplay());
    this.manaChangedObserver = this.player.stats.onManaChanged.add(() => this.updateManaDisplay());
    this.statChangedObserver = this.player.stats.onStatChanged.add(() => {
      this.updateHealthDisplay();
      this.updateManaDisplay();
    });
    this.levelUpObserver = this.player.onLevelUp.add(() => this.updateLevelDisplay());
    this.archetypeSwappedObserver = this.player.onArchetypeSwapped.add(() => this.updateArchetypeDisplay());
    this.goldChangedObserver = this.player.inventory.onGoldChanged.add((gold) => this.updateGoldDisplay(gold));
    this.itemPickedUpObserver = this.player.inventory.onItemPickedUp.add((item) => this.onItemPickedUp(item));

    // Initial Refresh
    this.updateHealthDisplay();
    this.updateManaDisplay();
    this.updateLevelDisplay();
    this.updateArchetypeDisplay();
    this.updateGoldDisplay(this.player.inventory.gold);
  }

  public setOnMapButtonClick(callback: () => void): void {
    this.mapButton.onPointerUpObservable.add(callback);
  }

  public setOnTalentButtonClick(callback: () => void): void {
    this.talentButton.onPointerUpObservable.add(callback);
  }

  public setOnInventoryButtonClick(callback: () => void): void {
    this.inventoryButton.onPointerUpObservable.add(callback);
  }

  public setOnSaveButtonClick(callback: () => void): void {
    this.saveButton.onPointerUpObservable.add(callback);
  }

  public showInteractionPrompt(prompt: string): void {
    this.interactionPromptText.text = prompt;
    this.interactionBanner.isVisible = true;
  }

  public hideInteractionPrompt(): void {
    this.interactionBanner.isVisible = false;
  }

  public updateHealthDisplay(): void {
    const current = Math.round(this.player.stats.currentHealth);
    const max = Math.round(this.player.stats.maxHealth);
    const pct = Math.max(0, Math.min(1.0, current / Math.max(1, max)));

    this.healthBarFill.width = `${(pct * 100).toFixed(1)}%`;
    this.healthText.text = `${current} / ${max}`;
  }

  public updateManaDisplay(): void {
    const current = Math.round(this.player.stats.currentMana);
    const max = Math.round(this.player.stats.maxMana);
    const pct = Math.max(0, Math.min(1.0, current / Math.max(1, max)));

    this.manaBarFill.width = `${(pct * 100).toFixed(1)}%`;
    this.manaText.text = `${current} / ${max}`;
  }

  public updateLevelDisplay(): void {
    const level = this.player.level;
    const currentXp = this.player.xp;
    const reqXp = this.player.getRequiredXpForNextLevel();
    const pct = Math.max(0, Math.min(1.0, currentXp / Math.max(1, reqXp)));

    this.levelText.text = `Lvl ${level}`;
    this.xpBarFill.width = `${(pct * 100).toFixed(1)}%`;
    this.xpText.text = `XP: ${currentXp} / ${reqXp}`;
  }

  public updateGoldDisplay(gold: number): void {
    this.goldText.text = `🪙 ${gold.toLocaleString()}`;
  }

  public updateArchetypeDisplay(): void {
    const arch = ArchetypeManager.getArchetype(this.player.activeArchetypeId);
    this.archetypeBadgeText.text = arch.name;

    const skill = this.player.equippedSkills[0];
    if (skill) {
      this.skill0IconText.text = `[1]\n${skill.def.name}`;
    } else {
      this.skill0IconText.text = `[1]\n${arch.signatureSkill.def.name}`;
    }
  }

  public onItemPickedUp(item: Item): void {
    let text = `Picked up ${item.name}`;
    let hex = getRarityHex(item.rarity);
    if (item.category === ItemCategory.Gold) {
      text = `Picked up +${item.goldAmount} Gold`;
      hex = "#F59E0B";
    }
    this.showPickupNotification(text, hex);
  }

  public showPickupNotification(text: string, colorHex: string = "#FFD700"): void {
    const toast = new Rectangle(`toast_${Date.now()}`);
    toast.width = "250px";
    toast.height = "26px";
    toast.background = "rgba(15, 23, 42, 0.85)";
    toast.color = colorHex;
    toast.thickness = 1;
    toast.cornerRadius = 4;

    const txt = new TextBlock(`toastTxt_${Date.now()}`, text);
    txt.color = colorHex;
    txt.fontSize = 11;
    txt.fontWeight = "bold";
    toast.addControl(txt);

    this.toastStack.addControl(toast);

    // Auto fadeout after 2.5 seconds
    setTimeout(() => {
      this.toastStack.removeControl(toast);
      toast.dispose();
    }, 2500);
  }

  public setVisible(visible: boolean): void {
    const rootControls = this.guiTexture.getChildren();
    for (const control of rootControls) {
      control.isVisible = visible;
    }
  }

  public update(deltaTime: number): void {
    // Cooldown overlay sweep for active signature skill slot 0
    const skill = this.player.equippedSkills[0];
    if (skill && skill.currentCooldown > 0) {
      this.skill0CdOverlay.isVisible = true;
      this.skill0CdText.text = `${skill.currentCooldown.toFixed(1)}s`;
    } else {
      this.skill0CdOverlay.isVisible = false;
    }
  }

  public dispose(): void {
    if (this.healthChangedObserver) {
      this.player.stats.onHealthChanged.remove(this.healthChangedObserver);
      this.healthChangedObserver = null;
    }
    if (this.manaChangedObserver) {
      this.player.stats.onManaChanged.remove(this.manaChangedObserver);
      this.manaChangedObserver = null;
    }
    if (this.statChangedObserver) {
      this.player.stats.onStatChanged.remove(this.statChangedObserver);
      this.statChangedObserver = null;
    }
    if (this.levelUpObserver) {
      this.player.onLevelUp.remove(this.levelUpObserver);
      this.levelUpObserver = null;
    }
    if (this.archetypeSwappedObserver) {
      this.player.onArchetypeSwapped.remove(this.archetypeSwappedObserver);
      this.archetypeSwappedObserver = null;
    }
    if (this.goldChangedObserver) {
      this.player.inventory.onGoldChanged.remove(this.goldChangedObserver);
      this.goldChangedObserver = null;
    }
    if (this.itemPickedUpObserver) {
      this.player.inventory.onItemPickedUp.remove(this.itemPickedUpObserver);
      this.itemPickedUpObserver = null;
    }

    this.guiTexture.dispose();
  }
}
