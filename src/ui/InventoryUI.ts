import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Observer } from "@babylonjs/core/Misc/observable";

import { Player } from "../entities/Player";
import { InputManager } from "../core/InputManager";
import {
  InventoryComponent,
  Item,
  EquipmentSlot,
  Rarity,
  ItemCategory,
  ItemEquippedEvent,
} from "../entities/components/InventoryComponent";
import { getRarityHex } from "../entities/LootDrop";

export class InventoryUI {
  private scene: Scene;
  private player: Player;
  private inputManager: InputManager;
  private inventory: InventoryComponent;

  private guiTexture: AdvancedDynamicTexture;
  private modalContainer: Rectangle;
  public isCurrentlyVisible: boolean = false;

  // Weight Capacity Gauge
  private capacityFill: Rectangle;
  private capacityText: TextBlock;
  private goldCounterText: TextBlock;

  // Paperdoll Slots
  private paperdollSlotRects: Map<EquipmentSlot, Rectangle> = new Map();
  private paperdollItemTexts: Map<EquipmentSlot, TextBlock> = new Map();

  // Inventory Grid Slots (5 cols x 4 rows = 20 slots)
  private gridSlotRects: Rectangle[] = [];
  private gridSlotItemTexts: TextBlock[] = [];
  private gridWeightBadges: Rectangle[] = [];
  private gridWeightBadgeTexts: TextBlock[] = [];
  private gridStackTexts: TextBlock[] = [];

  // Tooltip Popup Card
  private tooltipNameText: TextBlock;
  private tooltipSubtext: TextBlock;
  private tooltipStatsText: TextBlock;
  private tooltipDescText: TextBlock;

  // Navigation State (0-4 Paperdoll, 5-24 Inventory Grid)
  private currentFocusIdx: number = 5; // Default to first grid slot
  private totalFocusNodes: number = 25;
  private keyboardListener: ((e: KeyboardEvent) => void) | null = null;
  private activeDeviceObserver: Observer<any> | null = null;
  private inventoryChangedObserver: Observer<void> | null = null;
  private goldChangedObserver: Observer<number> | null = null;
  private itemEquippedObserver: Observer<ItemEquippedEvent> | null = null;

  constructor(scene: Scene, player: Player, inputManager: InputManager) {
    this.scene = scene;
    this.player = player;
    this.inventory = player.inventory;
    this.inputManager = inputManager;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("InventoryUIOverlay", true, this.scene);

    // 1. Root Modal Panel (Gold Border, dark background)
    this.modalContainer = new Rectangle("inventoryModalRoot");
    this.modalContainer.width = "940px";
    this.modalContainer.height = "600px";
    this.modalContainer.background = "rgba(10, 14, 23, 0.95)";
    this.modalContainer.color = "#DAA520"; // Gold border
    this.modalContainer.thickness = 3;
    this.modalContainer.cornerRadius = 12;
    this.modalContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.modalContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.modalContainer.isVisible = false;
    this.guiTexture.addControl(this.modalContainer);

    const mainLayoutGrid = new Grid("inventoryMainGrid");
    mainLayoutGrid.width = "96%";
    mainLayoutGrid.height = "94%";
    mainLayoutGrid.addRowDefinition(60, true); // Header
    mainLayoutGrid.addRowDefinition(470, true); // Body
    mainLayoutGrid.addRowDefinition(35, true); // Footer
    this.modalContainer.addControl(mainLayoutGrid);

    // --- Header Section ---
    const headerGrid = new Grid("headerGrid");
    headerGrid.addColumnDefinition(0.4);
    headerGrid.addColumnDefinition(0.45);
    headerGrid.addColumnDefinition(0.15);
    mainLayoutGrid.addControl(headerGrid, 0, 0);

    const titleText = new TextBlock("titleText", "INVENTORY & EQUIPMENT");
    titleText.color = "#FFD700";
    titleText.fontSize = 20;
    titleText.fontWeight = "bold";
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerGrid.addControl(titleText, 0, 0);

    // Weight Capacity Bar
    const capacityBg = new Rectangle("capacityBg");
    capacityBg.width = "240px";
    capacityBg.height = "24px";
    capacityBg.background = "rgba(30, 30, 40, 0.8)";
    capacityBg.color = "#4B5563";
    capacityBg.cornerRadius = 4;
    capacityBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerGrid.addControl(capacityBg, 0, 1);

    this.capacityFill = new Rectangle("capacityFill");
    this.capacityFill.height = "100%";
    this.capacityFill.width = "0%";
    this.capacityFill.background = "#10B981"; // Emerald
    this.capacityFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    capacityBg.addControl(this.capacityFill);

    this.capacityText = new TextBlock("capacityText", "0 / 30 Weight");
    this.capacityText.color = "#FFFFFF";
    this.capacityText.fontSize = 11;
    this.capacityText.fontWeight = "bold";
    capacityBg.addControl(this.capacityText);

    // Close Button [X]
    const closeBtn = Button.CreateSimpleButton("closeInvBtn", "[X]");
    closeBtn.width = "40px";
    closeBtn.height = "32px";
    closeBtn.color = "#FFFFFF";
    closeBtn.background = "#DC2626";
    closeBtn.cornerRadius = 4;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.onPointerUpObservable.add(() => this.hide());
    headerGrid.addControl(closeBtn, 0, 2);

    // --- Body Section Split into 3 Columns ---
    const bodyGrid = new Grid("bodyGrid");
    bodyGrid.addColumnDefinition(260, true); // Left: Paperdoll & Player Stats
    bodyGrid.addColumnDefinition(430, true); // Center: 5x4 Inventory Grid
    bodyGrid.addColumnDefinition(210, true); // Right: Tooltip Card
    mainLayoutGrid.addControl(bodyGrid, 1, 0);

    // Column 1: Paperdoll Equipment Slots
    const paperdollBox = new Rectangle("paperdollBox");
    paperdollBox.background = "rgba(15, 23, 42, 0.7)";
    paperdollBox.color = "#374151";
    paperdollBox.thickness = 1;
    paperdollBox.cornerRadius = 8;
    bodyGrid.addControl(paperdollBox, 0, 0);

    const paperdollPanel = new StackPanel("paperdollPanel");
    paperdollPanel.isVertical = true;
    paperdollPanel.width = "90%";
    paperdollPanel.height = "95%";
    paperdollBox.addControl(paperdollPanel);

    const pdTitle = new TextBlock("pdTitle", "EQUIPMENT");
    pdTitle.color = "#9CA3AF";
    pdTitle.fontSize = 14;
    pdTitle.fontWeight = "bold";
    pdTitle.height = "25px";
    paperdollPanel.addControl(pdTitle);

    const slotsOrder: { slot: EquipmentSlot; label: string; focusIdx: number }[] = [
      { slot: EquipmentSlot.Head, label: "HEAD", focusIdx: 0 },
      { slot: EquipmentSlot.Chest, label: "CHEST", focusIdx: 1 },
      { slot: EquipmentSlot.Legs, label: "LEGS", focusIdx: 2 },
      { slot: EquipmentSlot.MainHand, label: "MAIN-HAND", focusIdx: 3 },
      { slot: EquipmentSlot.OffHand, label: "OFF-HAND", focusIdx: 4 },
    ];

    slotsOrder.forEach(({ slot, label, focusIdx }) => {
      const slotRect = new Rectangle(`pdSlot_${slot}`);
      slotRect.width = "220px";
      slotRect.height = "52px";
      slotRect.background = "#111827";
      slotRect.color = "#4B5563";
      slotRect.thickness = 2;
      slotRect.cornerRadius = 6;

      const slotText = new TextBlock(`pdTxt_${slot}`, `[ ${label} ]`);
      slotText.color = "#6B7280";
      slotText.fontSize = 12;
      slotText.fontWeight = "bold";
      slotRect.addControl(slotText);

      slotRect.onPointerEnterObservable.add(() => {
        this.currentFocusIdx = focusIdx;
        this.updateFocusHighlight();
      });

      slotRect.onPointerClickObservable.add(() => {
        this.inventory.unequipItem(slot, this.player.stats);
      });

      this.paperdollSlotRects.set(slot, slotRect);
      this.paperdollItemTexts.set(slot, slotText);
      paperdollPanel.addControl(slotRect);
    });

    // Column 2: Inventory Grid (5 cols x 4 rows = 20 slots) + Gold Counter
    const gridContainer = new Rectangle("gridContainer");
    gridContainer.background = "rgba(15, 23, 42, 0.7)";
    gridContainer.color = "#374151";
    gridContainer.thickness = 1;
    gridContainer.cornerRadius = 8;
    bodyGrid.addControl(gridContainer, 0, 1);

    const gridBoxPanel = new StackPanel("gridBoxPanel");
    gridBoxPanel.isVertical = true;
    gridBoxPanel.width = "94%";
    gridBoxPanel.height = "96%";
    gridContainer.addControl(gridBoxPanel);

    const gridMatrix = new Grid("invGridMatrix");
    gridMatrix.width = "100%";
    gridMatrix.height = "380px";
    for (let r = 0; r < 4; r++) gridMatrix.addRowDefinition(0.25);
    for (let c = 0; c < 5; c++) gridMatrix.addColumnDefinition(0.2);
    gridBoxPanel.addControl(gridMatrix);

    let idx = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const focusIdx = 5 + idx;
        const slotRect = new Rectangle(`gridSlot_${idx}`);
        slotRect.width = "72px";
        slotRect.height = "72px";
        slotRect.background = "#111827";
        slotRect.color = "#374151";
        slotRect.thickness = 2;
        slotRect.cornerRadius = 6;

        const itemText = new TextBlock(`gridTxt_${idx}`, "");
        itemText.color = "#FFFFFF";
        itemText.fontSize = 11;
        slotRect.addControl(itemText);

        // Weight Badge (Top-Right Pill)
        const weightBadge = new Rectangle(`wb_${idx}`);
        weightBadge.width = "24px";
        weightBadge.height = "16px";
        weightBadge.background = "rgba(0,0,0,0.85)";
        weightBadge.color = "#34D399";
        weightBadge.thickness = 1;
        weightBadge.cornerRadius = 3;
        weightBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        weightBadge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        weightBadge.left = "-2px";
        weightBadge.top = "2px";
        weightBadge.isVisible = false;
        slotRect.addControl(weightBadge);

        const weightBadgeTxt = new TextBlock(`wbt_${idx}`, "1x");
        weightBadgeTxt.color = "#34D399";
        weightBadgeTxt.fontSize = 9;
        weightBadgeTxt.fontWeight = "bold";
        weightBadge.addControl(weightBadgeTxt);

        // Stack Count (Bottom-Right)
        const stackTxt = new TextBlock(`stk_${idx}`, "");
        stackTxt.color = "#FFD700";
        stackTxt.fontSize = 10;
        stackTxt.fontWeight = "bold";
        stackTxt.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        stackTxt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        stackTxt.left = "-4px";
        stackTxt.top = "-2px";
        slotRect.addControl(stackTxt);

        const localSlotIdx = idx;
        slotRect.onPointerEnterObservable.add(() => {
          this.currentFocusIdx = focusIdx;
          this.updateFocusHighlight();
        });

        slotRect.onPointerClickObservable.add(() => {
          this.interactWithGridSlot(localSlotIdx);
        });

        this.gridSlotRects.push(slotRect);
        this.gridSlotItemTexts.push(itemText);
        this.gridWeightBadges.push(weightBadge);
        this.gridWeightBadgeTexts.push(weightBadgeTxt);
        this.gridStackTexts.push(stackTxt);

        gridMatrix.addControl(slotRect, r, c);
        idx++;
      }
    }

    // Gold Counter
    this.goldCounterText = new TextBlock("goldCounterText", "🪙 Gold: 0");
    this.goldCounterText.color = "#F59E0B";
    this.goldCounterText.fontSize = 15;
    this.goldCounterText.fontWeight = "bold";
    this.goldCounterText.height = "30px";
    this.goldCounterText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    gridBoxPanel.addControl(this.goldCounterText);

    // Column 3: Tooltip Card
    const tooltipBox = new Rectangle("tooltipBox");
    tooltipBox.background = "rgba(15, 23, 42, 0.7)";
    tooltipBox.color = "#374151";
    tooltipBox.thickness = 1;
    tooltipBox.cornerRadius = 8;
    bodyGrid.addControl(tooltipBox, 0, 2);

    const tooltipPanel = new StackPanel("tooltipPanel");
    tooltipPanel.isVertical = true;
    tooltipPanel.width = "90%";
    tooltipPanel.height = "95%";
    tooltipBox.addControl(tooltipPanel);

    this.tooltipNameText = new TextBlock("ttName", "Select an Item");
    this.tooltipNameText.color = "#FFD700";
    this.tooltipNameText.fontSize = 15;
    this.tooltipNameText.fontWeight = "bold";
    this.tooltipNameText.height = "35px";
    tooltipPanel.addControl(this.tooltipNameText);

    this.tooltipSubtext = new TextBlock("ttSub", "");
    this.tooltipSubtext.color = "#9CA3AF";
    this.tooltipSubtext.fontSize = 11;
    this.tooltipSubtext.height = "25px";
    tooltipPanel.addControl(this.tooltipSubtext);

    this.tooltipStatsText = new TextBlock("ttStats", "");
    this.tooltipStatsText.color = "#34D399";
    this.tooltipStatsText.fontSize = 12;
    this.tooltipStatsText.height = "120px";
    this.tooltipStatsText.textWrapping = true;
    tooltipPanel.addControl(this.tooltipStatsText);

    this.tooltipDescText = new TextBlock("ttDesc", "");
    this.tooltipDescText.color = "#D1D5DB";
    this.tooltipDescText.fontSize = 11;
    this.tooltipDescText.height = "160px";
    this.tooltipDescText.textWrapping = true;
    tooltipPanel.addControl(this.tooltipDescText);

    // --- Footer Section ---
    const footerPrompt = new TextBlock(
      "footerPrompt",
      "KBM: [Click] Equip/Unequip  | Gamepad: [D-Pad] Move Focus  (A)/[Enter] Equip  (X) Drop  [I]/[Esc] Close"
    );
    footerPrompt.color = "#9CA3AF";
    footerPrompt.fontSize = 12;
    mainLayoutGrid.addControl(footerPrompt, 2, 0);

    // Subscriptions
    this.inventoryChangedObserver = this.inventory.onInventoryChanged.add(() => this.refresh());
    this.goldChangedObserver = this.inventory.onGoldChanged.add(() => this.refresh());
    this.itemEquippedObserver = this.inventory.onItemEquipped.add(() => this.refresh());

    this.setupKeyboardNavigation();
  }

  private setupKeyboardNavigation(): void {
    this.keyboardListener = (e: KeyboardEvent) => {
      if (!this.isCurrentlyVisible) return;

      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        this.navigateFocus(-1, 0);
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        this.navigateFocus(1, 0);
      } else if (e.code === "ArrowUp" || e.code === "KeyW") {
        this.navigateFocus(0, -1);
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        this.navigateFocus(0, 1);
      } else if (e.code === "Enter" || e.code === "Space") {
        this.activateFocusedItem();
      } else if (e.code === "KeyX" || e.code === "Delete") {
        this.dropFocusedItem();
      } else if (e.code === "Escape" || e.code === "KeyI") {
        this.hide();
      }
    };

    window.addEventListener("keydown", this.keyboardListener);
  }

  private navigateFocus(dx: number, dy: number): void {
    if (this.currentFocusIdx < 5) {
      // In Paperdoll (0-4)
      if (dx > 0) {
        this.currentFocusIdx = 5; // Move right into inventory grid
      } else if (dy !== 0) {
        this.currentFocusIdx = (this.currentFocusIdx + dy + 5) % 5;
      }
    } else {
      // In 5x4 Grid (5-24)
      const gridIdx = this.currentFocusIdx - 5;
      let col = gridIdx % 5;
      let row = Math.floor(gridIdx / 5);

      if (dx < 0 && col === 0) {
        this.currentFocusIdx = Math.min(4, row); // Move left into paperdoll
      } else {
        col = (col + dx + 5) % 5;
        row = (row + dy + 4) % 4;
        this.currentFocusIdx = 5 + row * 5 + col;
      }
    }

    this.updateFocusHighlight();
  }

  private activateFocusedItem(): void {
    if (this.currentFocusIdx < 5) {
      // Unequip Paperdoll Item
      const slots: EquipmentSlot[] = [
        EquipmentSlot.Head,
        EquipmentSlot.Chest,
        EquipmentSlot.Legs,
        EquipmentSlot.MainHand,
        EquipmentSlot.OffHand,
      ];
      const slot = slots[this.currentFocusIdx];
      this.inventory.unequipItem(slot, this.player.stats);
    } else {
      // Equip or Consume Grid Item
      const gridIdx = this.currentFocusIdx - 5;
      this.interactWithGridSlot(gridIdx);
    }
  }

  private interactWithGridSlot(gridIdx: number): void {
    const item = this.inventory.items[gridIdx];
    if (!item) return;

    if (item.category === ItemCategory.Equipment) {
      this.inventory.equipItem(item, this.player.stats);
    } else if (item.category === ItemCategory.Consumable) {
      this.inventory.useConsumable(item, this.player.stats);
    }
  }

  private dropFocusedItem(): void {
    if (this.currentFocusIdx >= 5) {
      const gridIdx = this.currentFocusIdx - 5;
      const item = this.inventory.items[gridIdx];
      if (item) {
        this.inventory.removeItem(item.id);
      }
    }
  }

  public show(): void {
    this.modalContainer.isVisible = true;
    this.isCurrentlyVisible = true;
    this.inputManager.setModalOpen("inventory_ui", true);
    this.refresh();
  }

  public hide(): void {
    this.modalContainer.isVisible = false;
    this.isCurrentlyVisible = false;
    this.inputManager.setModalOpen("inventory_ui", false);
  }

  public toggle(): void {
    if (this.isCurrentlyVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public refresh(): void {
    // 1. Refresh Weight Capacity Bar
    const currentWeight = this.inventory.getCurrentWeight();
    const maxWeight = this.inventory.maxWeight;
    const pct = Math.min(1.0, currentWeight / maxWeight);

    this.capacityFill.width = `${(pct * 100).toFixed(1)}%`;
    this.capacityText.text = `${currentWeight} / ${maxWeight} Weight`;

    if (pct < 0.7) {
      this.capacityFill.background = "#10B981"; // Emerald
    } else if (pct < 0.9) {
      this.capacityFill.background = "#F59E0B"; // Amber
    } else {
      this.capacityFill.background = "#EF4444"; // Red
    }

    // 2. Refresh Gold Counter
    this.goldCounterText.text = `🪙 Gold: ${this.inventory.gold.toLocaleString()}`;

    // 3. Refresh Paperdoll Slots
    this.inventory.equipment.forEach((item, slot) => {
      const rect = this.paperdollSlotRects.get(slot);
      const text = this.paperdollItemTexts.get(slot);
      if (rect && text) {
        if (item) {
          const rarityHex = getRarityHex(item.rarity);
          rect.color = rarityHex;
          text.color = rarityHex;
          text.text = `${item.iconText ?? ""} ${item.name}`;
        } else {
          rect.color = "#4B5563";
          text.color = "#6B7280";
          text.text = `[ ${slot.toUpperCase()} ]`;
        }
      }
    });

    // 4. Refresh 5x4 Grid Slots
    for (let i = 0; i < 20; i++) {
      const item = this.inventory.items[i];
      const rect = this.gridSlotRects[i];
      const text = this.gridSlotItemTexts[i];
      const wb = this.gridWeightBadges[i];
      const wbt = this.gridWeightBadgeTexts[i];
      const stk = this.gridStackTexts[i];

      if (item) {
        const rarityHex = getRarityHex(item.rarity);
        rect.color = rarityHex;
        text.color = rarityHex;
        text.text = `${item.iconText ?? ""}\n${item.name}`;

        // Weight badge (1x, 2x, 3x)
        wb.isVisible = true;
        wbt.text = `${item.weight}x`;
        if (item.weight === 1) wbt.color = "#34D399";
        else if (item.weight === 2) wbt.color = "#FBBF24";
        else wbt.color = "#F87171";

        // Stack count
        if (item.stackable && item.stackCount && item.stackCount > 1) {
          stk.text = `x${item.stackCount}`;
        } else {
          stk.text = "";
        }
      } else {
        rect.color = "#374151";
        text.text = "";
        wb.isVisible = false;
        stk.text = "";
      }
    }

    this.updateFocusHighlight();
  }

  private updateFocusHighlight(): void {
    // Reset borders
    this.paperdollSlotRects.forEach((rect, slot) => {
      const item = this.inventory.equipment.get(slot);
      rect.color = item ? getRarityHex(item.rarity) : "#4B5563";
      rect.thickness = 2;
    });

    for (let i = 0; i < 20; i++) {
      const rect = this.gridSlotRects[i];
      const item = this.inventory.items[i];
      rect.color = item ? getRarityHex(item.rarity) : "#374151";
      rect.thickness = 2;
    }

    // Apply focus highlight
    let focusedItem: Item | null = null;

    if (this.currentFocusIdx < 5) {
      const slots: EquipmentSlot[] = [
        EquipmentSlot.Head,
        EquipmentSlot.Chest,
        EquipmentSlot.Legs,
        EquipmentSlot.MainHand,
        EquipmentSlot.OffHand,
      ];
      const slot = slots[this.currentFocusIdx];
      const rect = this.paperdollSlotRects.get(slot);
      if (rect) {
        rect.color = "#FFD700"; // Golden focus glow
        rect.thickness = 3;
      }
      focusedItem = this.inventory.equipment.get(slot) ?? null;
    } else {
      const gridIdx = this.currentFocusIdx - 5;
      const rect = this.gridSlotRects[gridIdx];
      if (rect) {
        rect.color = "#FFD700";
        rect.thickness = 3;
      }
      focusedItem = this.inventory.items[gridIdx] ?? null;
    }

    // Update Tooltip Card
    if (focusedItem) {
      this.tooltipNameText.text = focusedItem.name;
      this.tooltipNameText.color = getRarityHex(focusedItem.rarity);
      this.tooltipSubtext.text = `${focusedItem.rarity.toUpperCase()} | Weight: ${focusedItem.weight}x`;

      let statLines = "";
      if (focusedItem.stats) {
        statLines = focusedItem.stats
          .map((s) => `+${s.value}${s.type === "percent" ? "%" : ""} ${s.stat}`)
          .join("\n");
      } else if (focusedItem.healAmount) {
        statLines = `Heals +${focusedItem.healAmount} HP`;
      } else if (focusedItem.manaAmount) {
        statLines = `Restores +${focusedItem.manaAmount} MP`;
      }
      this.tooltipStatsText.text = statLines;
      this.tooltipDescText.text = focusedItem.description;
    } else {
      this.tooltipNameText.text = "Empty Slot";
      this.tooltipNameText.color = "#9CA3AF";
      this.tooltipSubtext.text = "";
      this.tooltipStatsText.text = "";
      this.tooltipDescText.text = "No item stored in this slot.";
    }
  }

  public dispose(): void {
    if (this.keyboardListener) {
      window.removeEventListener("keydown", this.keyboardListener);
      this.keyboardListener = null;
    }
    if (this.inventoryChangedObserver) {
      this.inventory.onInventoryChanged.remove(this.inventoryChangedObserver);
      this.inventoryChangedObserver = null;
    }
    if (this.goldChangedObserver) {
      this.inventory.onGoldChanged.remove(this.goldChangedObserver);
      this.goldChangedObserver = null;
    }
    if (this.itemEquippedObserver) {
      this.inventory.onItemEquipped.remove(this.itemEquippedObserver);
      this.itemEquippedObserver = null;
    }
    this.guiTexture.dispose();
  }
}
