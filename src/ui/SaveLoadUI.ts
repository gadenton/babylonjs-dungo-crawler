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

  private slotsStack: StackPanel;
  private countLabel: TextBlock;

  // Focus Navigation
  private focusableButtons: { control: Button; onSelect: () => void; id: string }[] = [];
  private currentFocusIdx: number = 0;

  // Notification Observables
  public onNotification: Observable<string> = new Observable<string>();
  public onLoadExecuted: Observable<string> = new Observable<string>();
  public onSaveStateModified: Observable<void> = new Observable<void>();
  public onClosed: Observable<void> = new Observable<void>();

  private getCurrentZone: () => "town_hub" | "dungeon";
  private getDungeonFloor: () => number;

  constructor(
    scene: Scene,
    player: Player,
    inputManager?: InputManager,
    getCurrentZone: () => "town_hub" | "dungeon" = () => "town_hub",
    getDungeonFloor: () => number = () => 1
  ) {
    this.scene = scene;
    this.player = player;
    this.inputManager = inputManager ?? null;
    this.getCurrentZone = getCurrentZone;
    this.getDungeonFloor = getDungeonFloor;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("SaveLoadUIOverlay", true, this.scene);

    // Root Panel
    this.rootPanel = new Rectangle("saveLoadModalRoot");
    this.rootPanel.width = "780px";
    this.rootPanel.height = "540px";
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

    const titleText = new TextBlock("titleText", "CHARACTER ROSTER");
    titleText.color = "#FFD700";
    titleText.fontSize = 20;
    titleText.fontWeight = "bold";
    titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.left = "20px";
    titleText.width = "300px";
    titleText.isHitTestVisible = false;
    headerRect.addControl(titleText);

    this.countLabel = new TextBlock("countLabel", "Characters: 0 / 10");
    this.countLabel.color = "#87CEFA";
    this.countLabel.fontSize = 14;
    this.countLabel.fontWeight = "bold";
    this.countLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.countLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.countLabel.left = "-65px";
    this.countLabel.width = "200px";
    this.countLabel.isHitTestVisible = false;
    headerRect.addControl(this.countLabel);

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
    this.slotsStack = new StackPanel("slotsStack");
    this.slotsStack.isVertical = true;
    this.slotsStack.width = "95%";
    this.slotsStack.height = "410px";
    this.slotsStack.paddingTop = "10px";
    mainStack.addControl(this.slotsStack);

    // Footer Bar
    const footerRect = new Rectangle("footerRect");
    footerRect.height = "55px";
    footerRect.width = "100%";
    footerRect.background = "rgba(20, 25, 38, 0.9)";
    footerRect.thickness = 0;
    mainStack.addControl(footerRect);

    const resetBtn = Button.CreateSimpleButton("resetAllBtn", "CLEAR ALL ROSTER DATA");
    resetBtn.width = "220px";
    resetBtn.height = "38px";
    resetBtn.color = "#FFA07A";
    resetBtn.background = "#5A1818";
    resetBtn.cornerRadius = 6;
    resetBtn.fontSize = 13;
    resetBtn.fontWeight = "bold";
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    resetBtn.left = "20px";
    resetBtn.onPointerClickObservable.add(() => this.handleResetAll());
    footerRect.addControl(resetBtn);

    this.setupKeyboardListeners();
  }

  public refreshSlotCards(): void {
    this.focusableButtons = [];
    this.slotsStack.clearControls();

    const characters = SaveManager.getAllCharacters();
    this.countLabel.text = `Characters: ${characters.length} / ${SaveManager.MAX_CHARACTERS}`;

    if (characters.length === 0) {
      const emptyCard = new Rectangle("emptyRosterCard");
      emptyCard.height = "120px";
      emptyCard.width = "100%";
      emptyCard.background = "rgba(20, 28, 42, 0.6)";
      emptyCard.color = "#4A5568";
      emptyCard.thickness = 1;
      emptyCard.cornerRadius = 8;
      this.slotsStack.addControl(emptyCard);

      const emptyText = new TextBlock("emptyText", "No characters found in roster.\nClick 'NEW CHARACTER' on the main menu to embark!");
      emptyText.color = "#9CA3AF";
      emptyText.fontSize = 14;
      emptyText.textWrapping = true;
      emptyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      emptyCard.addControl(emptyText);
      return;
    }

    const activeCharId = SaveManager.getActiveCharacterId();

    for (const charInfo of characters) {
      const { slotId, metadata } = charInfo;
      const isActive = slotId === activeCharId;

      const card = new Rectangle(`charCard_${slotId}`);
      card.height = "76px";
      card.width = "100%";
      card.background = isActive ? "rgba(30, 48, 70, 0.9)" : "rgba(20, 28, 42, 0.75)";
      card.color = isActive ? "#00FFFF" : "#4A5568";
      card.thickness = isActive ? 2 : 1.5;
      card.cornerRadius = 6;
      card.paddingBottom = "6px";
      this.slotsStack.addControl(card);

      const cardContent = new Rectangle(`cardContent_${slotId}`);
      cardContent.width = "100%";
      cardContent.height = "100%";
      cardContent.thickness = 0;
      cardContent.background = "rgba(0,0,0,0)";
      card.addControl(cardContent);

      // Left info column
      const infoStack = new StackPanel(`infoStack_${slotId}`);
      infoStack.isVertical = true;
      infoStack.width = "62%";
      infoStack.height = "100%";
      infoStack.paddingLeft = "15px";
      infoStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      cardContent.addControl(infoStack);

      // Right Action Buttons column
      const btnStack = new StackPanel(`btnStack_${slotId}`);
      btnStack.isVertical = false;
      btnStack.width = "38%";
      btnStack.height = "100%";
      btnStack.paddingRight = "10px";
      btnStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      cardContent.addControl(btnStack);

      const activeTag = isActive ? " ★ (ACTIVE)" : "";
      const slotTitle = new TextBlock(`slotTitle_${slotId}`, `${metadata.characterName}${activeTag}`);
      slotTitle.color = isActive ? "#00FFFF" : "#FFD700";
      slotTitle.fontSize = 15;
      slotTitle.fontWeight = "bold";
      slotTitle.height = "24px";
      slotTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      infoStack.addControl(slotTitle);

      const dateStr = new Date(metadata.timestamp).toLocaleDateString();
      const archName = metadata.archetype.toUpperCase();
      const descStr = `Lvl ${metadata.level} ${archName} | Gold: ${metadata.gold} | Saved: ${dateStr}`;

      const slotDesc = new TextBlock(`slotDesc_${slotId}`, descStr);
      slotDesc.color = "#A0AEC0";
      slotDesc.fontSize = 12;
      slotDesc.height = "24px";
      slotDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      infoStack.addControl(slotDesc);

      // Action 1: PLAY Button
      const playBtn = Button.CreateSimpleButton(`playBtn_${slotId}`, "PLAY");
      playBtn.width = "65px";
      playBtn.height = "34px";
      playBtn.color = "#FFFFFF";
      playBtn.background = "#2E7D32";
      playBtn.cornerRadius = 5;
      playBtn.fontSize = 12;
      playBtn.fontWeight = "bold";
      playBtn.paddingRight = "5px";
      playBtn.onPointerClickObservable.add(() => this.handleLoad(slotId));
      btnStack.addControl(playBtn);

      this.focusableButtons.push({
        control: playBtn,
        onSelect: () => this.handleLoad(slotId),
        id: `play_${slotId}`,
      });

      // Action 2: SAVE Button
      const saveBtn = Button.CreateSimpleButton(`saveBtn_${slotId}`, "SAVE");
      saveBtn.width = "65px";
      saveBtn.height = "34px";
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

      // Action 3: DELETE Button
      const delBtn = Button.CreateSimpleButton(`delBtn_${slotId}`, "DEL");
      delBtn.width = "55px";
      delBtn.height = "34px";
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
  }

  private handleSave(slotId: string): void {
    const success = SaveManager.save(slotId, this.player, this.getCurrentZone(), this.getDungeonFloor());
    if (success) {
      const msg = `Character '${this.player.characterName}' saved successfully!`;
      console.log(`[SaveLoadUI] ${msg}`);
      this.onNotification.notifyObservers(msg);
      this.onSaveStateModified.notifyObservers();
      this.refreshSlotCards();
    } else {
      this.onNotification.notifyObservers("Failed to save character data.");
    }
  }

  private handleLoad(slotId: string): void {
    const success = SaveManager.load(slotId, this.player);
    if (success) {
      const msg = `Playing character '${this.player.characterName}'!`;
      console.log(`[SaveLoadUI] ${msg}`);
      this.onNotification.notifyObservers(msg);
      this.onLoadExecuted.notifyObservers(slotId);
      this.hide();
    } else {
      this.onNotification.notifyObservers("Failed to load character.");
    }
  }

  private handleDelete(slotId: string): void {
    const meta = SaveManager.getMetadata(slotId);
    const charName = meta?.characterName ?? "character";
    SaveManager.delete(slotId);
    this.onNotification.notifyObservers(`Deleted '${charName}'.`);
    this.onSaveStateModified.notifyObservers();
    this.refreshSlotCards();
  }

  private handleResetAll(): void {
    StorageAdapter.clearAll();
    SaveManager.setActiveCharacterId(null);
    this.onNotification.notifyObservers("All character roster data cleared!");
    this.onSaveStateModified.notifyObservers();
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
    this.onClosed.notifyObservers();
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
