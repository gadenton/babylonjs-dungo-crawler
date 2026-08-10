import { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { SaveManager, SaveMetadata } from "../persistence/SaveManager";
import { StorageAdapter } from "../core/StorageAdapter";
import { Player } from "../entities/Player";
import { InputManager } from "../core/InputManager";

export class SaveLoadUI {
  private scene: Scene;
  private player: Player;
  private inputManager: InputManager | null = null;
  private guiTexture: AdvancedDynamicTexture;

  private rootPanel: Rectangle;
  private isOpen: boolean = false;

  // Slot Card Controls
  private slotPanels: Map<string, Rectangle> = new Map();
  private slotTexts: Map<string, TextBlock> = new Map();
  private slotButtonContainers: Map<string, StackPanel> = new Map();

  // Focus Navigation
  private focusableButtons: { control: Button; onSelect: () => void; id: string }[] = [];
  private currentFocusIdx: number = 0;

  // Notification Callback (e.g. to HUD toast)
  public onNotification: Observable<string> = new Observable<string>();
  public onLoadExecuted: Observable<string> = new Observable<string>();

  constructor(scene: Scene, player: Player, inputManager?: InputManager) {
    this.scene = scene;
    this.player = player;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("SaveLoadUIOverlay", true, this.scene);

    // Root Panel
    this.rootPanel = new Rectangle("saveLoadModalRoot");
    this.rootPanel.width = "750px";
    this.rootPanel.height = "520px";
    this.rootPanel.background = "rgba(12, 16, 26, 0.95)";
    this.rootPanel.color = "#DAA520"; // Gold border
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 10;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    const mainStack = new StackPanel("mainSaveStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    this.rootPanel.addControl(mainStack);

    // Header Bar
    const headerRect = new Rectangle("headerRect");
    headerRect.height = "55px";
    headerRect.width = "100%";
    headerRect.background = "rgba(24, 32, 50, 0.9)";
    headerRect.color = "#DAA520";
    headerRect.thickness = 1;
    mainStack.addControl(headerRect);

    const titleText = new TextBlock("titleText", "GAME PERSISTENCE & SAVES");
    titleText.color = "#FFD700";
    titleText.fontSize = 22;
    titleText.fontWeight = "bold";
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.left = "20px";
    headerRect.addControl(titleText);

    const closeBtn = Button.CreateSimpleButton("closeSaveUiBtn", "X");
    closeBtn.width = "35px";
    closeBtn.height = "35px";
    closeBtn.color = "#FFFFFF";
    closeBtn.background = "#8B0000";
    closeBtn.cornerRadius = 5;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = "-15px";
    closeBtn.onPointerClickObservable.add(() => this.hide());
    headerRect.addControl(closeBtn);

    // Slots Container
    const slotsStack = new StackPanel("slotsStack");
    slotsStack.isVertical = true;
    slotsStack.width = "95%";
    slotsStack.height = "380px";
    slotsStack.paddingTop = "10px";
    mainStack.addControl(slotsStack);

    // Build Slot Cards for: "autosave", "slot_1", "slot_2", "slot_3"
    const slots = [
      { id: "autosave", label: "AUTO-SAVE SLOT", isAutoSave: true },
      { id: "slot_1", label: "MANUAL SLOT 1", isAutoSave: false },
      { id: "slot_2", label: "MANUAL SLOT 2", isAutoSave: false },
      { id: "slot_3", label: "MANUAL SLOT 3", isAutoSave: false },
    ];

    for (const slotDef of slots) {
      this.createSlotCard(slotsStack, slotDef.id, slotDef.label, slotDef.isAutoSave);
    }

    // Footer Bar
    const footerRect = new Rectangle("footerRect");
    footerRect.height = "55px";
    footerRect.width = "100%";
    footerRect.background = "rgba(20, 25, 38, 0.9)";
    footerRect.thickness = 0;
    mainStack.addControl(footerRect);

    const resetBtn = Button.CreateSimpleButton("resetAllBtn", "RESET ALL PROGRESS");
    resetBtn.width = "220px";
    resetBtn.height = "38px";
    resetBtn.color = "#FFA07A";
    resetBtn.background = "#5A1818";
    resetBtn.cornerRadius = 6;
    resetBtn.fontSize = 14;
    resetBtn.fontWeight = "bold";
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    resetBtn.left = "20px";
    resetBtn.onPointerClickObservable.add(() => this.handleResetAll());
    footerRect.addControl(resetBtn);

    this.setupKeyboardListeners();
  }

  private createSlotCard(parent: StackPanel, slotId: string, titleLabel: string, isAutoSave: boolean): void {
    const card = new Rectangle(`slotCard_${slotId}`);
    card.height = "82px";
    card.width = "100%";
    card.background = isAutoSave ? "rgba(30, 45, 65, 0.8)" : "rgba(20, 28, 42, 0.7)";
    card.color = isAutoSave ? "#4682B4" : "#4A5568";
    card.thickness = 1.5;
    card.cornerRadius = 6;
    card.paddingBottom = "6px";
    parent.addControl(card);

    const cardContent = new Rectangle(`cardContent_${slotId}`);
    cardContent.width = "100%";
    cardContent.height = "100%";
    cardContent.thickness = 0;
    cardContent.background = "rgba(0,0,0,0)";
    card.addControl(cardContent);

    // Left info column
    const infoStack = new StackPanel(`infoStack_${slotId}`);
    infoStack.isVertical = true;
    infoStack.width = "65%";
    infoStack.height = "100%";
    infoStack.paddingLeft = "15px";
    infoStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    cardContent.addControl(infoStack);

    // Right Action Buttons column
    const btnStack = new StackPanel(`btnStack_${slotId}`);
    btnStack.isVertical = false;
    btnStack.width = "35%";
    btnStack.height = "100%";
    btnStack.paddingRight = "10px";
    btnStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    cardContent.addControl(btnStack);

    const slotTitle = new TextBlock(`slotTitle_${slotId}`, titleLabel);
    slotTitle.color = isAutoSave ? "#87CEFA" : "#FFD700";
    slotTitle.fontSize = 15;
    slotTitle.fontWeight = "bold";
    slotTitle.height = "24px";
    slotTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoStack.addControl(slotTitle);

    const slotDesc = new TextBlock(`slotDesc_${slotId}`, "[EMPTY SLOT]");
    slotDesc.color = "#A0AEC0";
    slotDesc.fontSize = 13;
    slotDesc.height = "36px";
    slotDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoStack.addControl(slotDesc);

    this.slotPanels.set(slotId, card);
    this.slotTexts.set(slotId, slotDesc);
    this.slotButtonContainers.set(slotId, btnStack);
  }

  public refreshSlotCards(): void {
    this.focusableButtons = [];

    const slotIds = ["autosave", "slot_1", "slot_2", "slot_3"];

    for (const slotId of slotIds) {
      const descText = this.slotTexts.get(slotId);
      const btnStack = this.slotButtonContainers.get(slotId);
      if (!descText || !btnStack) continue;

      // Clear existing buttons
      btnStack.clearControls();

      const meta = SaveManager.getMetadata(slotId);

      if (meta) {
        const dateStr = new Date(meta.timestamp).toLocaleString();
        const archName = meta.archetype.toUpperCase();
        descText.text = `Lvl ${meta.level} ${archName} | Gold: ${meta.gold}\nSaved: ${dateStr}`;

        // Add LOAD button
        const loadBtn = Button.CreateSimpleButton(`loadBtn_${slotId}`, "LOAD");
        loadBtn.width = "65px";
        loadBtn.height = "35px";
        loadBtn.color = "#FFFFFF";
        loadBtn.background = "#2E7D32";
        loadBtn.cornerRadius = 5;
        loadBtn.fontSize = 12;
        loadBtn.fontWeight = "bold";
        loadBtn.paddingRight = "5px";
        loadBtn.onPointerClickObservable.add(() => this.handleLoad(slotId));
        btnStack.addControl(loadBtn);

        this.focusableButtons.push({
          control: loadBtn,
          onSelect: () => this.handleLoad(slotId),
          id: `load_${slotId}`,
        });

        // Add SAVE button (if not autosave)
        if (slotId !== "autosave") {
          const saveBtn = Button.CreateSimpleButton(`saveBtn_${slotId}`, "SAVE");
          saveBtn.width = "65px";
          saveBtn.height = "35px";
          saveBtn.color = "#FFFFFF";
          saveBtn.background = "#1565C0";
          saveBtn.cornerRadius = 5;
          saveBtn.fontSize = 12;
          saveBtn.fontWeight = "bold";
          saveBtn.paddingRight = "5px";
          saveBtn.onPointerClickObservable.add(() => this.handleSave(slotId));
          btnStack.addControl(saveBtn);

          this.focusableButtons.push({
            control: saveBtn,
            onSelect: () => this.handleSave(slotId),
            id: `save_${slotId}`,
          });

          // Add DELETE button
          const delBtn = Button.CreateSimpleButton(`delBtn_${slotId}`, "DEL");
          delBtn.width = "55px";
          delBtn.height = "35px";
          delBtn.color = "#FFFFFF";
          delBtn.background = "#C62828";
          delBtn.cornerRadius = 5;
          delBtn.fontSize = 12;
          delBtn.fontWeight = "bold";
          delBtn.onPointerClickObservable.add(() => this.handleDelete(slotId));
          btnStack.addControl(delBtn);

          this.focusableButtons.push({
            control: delBtn,
            onSelect: () => this.handleDelete(slotId),
            id: `del_${slotId}`,
          });
        }
      } else {
        descText.text = "No save data found in this slot.";

        if (slotId !== "autosave") {
          const saveBtn = Button.CreateSimpleButton(`saveBtn_${slotId}`, "SAVE");
          saveBtn.width = "75px";
          saveBtn.height = "35px";
          saveBtn.color = "#FFFFFF";
          saveBtn.background = "#1565C0";
          saveBtn.cornerRadius = 5;
          saveBtn.fontSize = 12;
          saveBtn.fontWeight = "bold";
          saveBtn.onPointerClickObservable.add(() => this.handleSave(slotId));
          btnStack.addControl(saveBtn);

          this.focusableButtons.push({
            control: saveBtn,
            onSelect: () => this.handleSave(slotId),
            id: `save_${slotId}`,
          });
        }
      }
    }
  }

  private handleSave(slotId: string): void {
    const success = SaveManager.save(slotId, this.player);
    if (success) {
      const msg = `Game successfully saved to ${slotId.toUpperCase()}!`;
      console.log(`[SaveLoadUI] ${msg}`);
      this.onNotification.notifyObservers(msg);
      this.refreshSlotCards();
    } else {
      this.onNotification.notifyObservers(`Failed to save game to ${slotId}.`);
    }
  }

  private handleLoad(slotId: string): void {
    const success = SaveManager.load(slotId, this.player);
    if (success) {
      const msg = `Game loaded from ${slotId.toUpperCase()}!`;
      console.log(`[SaveLoadUI] ${msg}`);
      this.onNotification.notifyObservers(msg);
      this.onLoadExecuted.notifyObservers(slotId);
      this.hide();
    } else {
      this.onNotification.notifyObservers(`Failed to load save from ${slotId}.`);
    }
  }

  private handleDelete(slotId: string): void {
    SaveManager.delete(slotId);
    this.onNotification.notifyObservers(`Save data in ${slotId.toUpperCase()} deleted.`);
    this.refreshSlotCards();
  }

  private handleResetAll(): void {
    StorageAdapter.clearAll();
    this.onNotification.notifyObservers("All save progress has been reset!");
    this.refreshSlotCards();
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isOpen) return;

      if (e.key === "Escape" || e.code === "KeyP") {
        this.hide();
        e.preventDefault();
        return;
      }

      if (this.focusableButtons.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "s") {
        this.navigateFocus(1);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "w") {
        this.navigateFocus(-1);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        const item = this.focusableButtons[this.currentFocusIdx];
        if (item) item.onSelect();
        e.preventDefault();
      }
    });
  }

  private navigateFocus(delta: number): void {
    if (this.focusableButtons.length === 0) return;
    this.currentFocusIdx = (this.currentFocusIdx + delta + this.focusableButtons.length) % this.focusableButtons.length;
    this.updateFocusHighlight();
  }

  private updateFocusHighlight(): void {
    for (let i = 0; i < this.focusableButtons.length; i++) {
      const btn = this.focusableButtons[i].control;
      if (i === this.currentFocusIdx) {
        btn.thickness = 3;
        btn.color = "#FFD700";
      } else {
        btn.thickness = 0;
        btn.color = "#FFFFFF";
      }
    }
  }

  public show(): void {
    this.isOpen = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("SaveLoadUI", true);
    }
    this.refreshSlotCards();
    this.currentFocusIdx = 0;
    this.updateFocusHighlight();
  }

  public hide(): void {
    this.isOpen = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("SaveLoadUI", false);
    }
  }

  public toggle(): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  public isVisible(): boolean {
    return this.isOpen;
  }

  public dispose(): void {
    this.guiTexture.dispose();
  }
}
