import { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { SaveManager, SaveMetadata } from "../persistence/SaveManager";
import { AudioManager } from "../audio/AudioManager";
import { InputManager } from "../core/InputManager";

export class MainMenuUI {
  private scene: Scene;
  private audioManager: AudioManager | null;
  private inputManager: InputManager | null;
  private guiTexture: AdvancedDynamicTexture;

  private rootContainer: Rectangle;
  private continueBtn: Button | null = null;
  private continueSubtext: TextBlock | null = null;
  private recentSaveSlot: { slotId: string; metadata: SaveMetadata } | null = null;

  private focusableButtons: { control: Button; action: () => void; enabled: boolean }[] = [];
  private currentFocusIdx: number = 0;

  public onContinueRequested: Observable<string> = new Observable<string>();
  public onNewGameRequested: Observable<void> = new Observable<void>();
  public onLoadSaveRequested: Observable<void> = new Observable<void>();
  public onSettingsRequested: Observable<void> = new Observable<void>();

  private isVisibleState: boolean = false;

  constructor(scene: Scene, audioManager?: AudioManager, inputManager?: InputManager) {
    this.scene = scene;
    this.audioManager = audioManager ?? null;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("MainMenuUI", true, this.scene);

    // Root Panel - Left-aligned card with dark fantasy aesthetics
    this.rootContainer = new Rectangle("mainMenuRoot");
    this.rootContainer.width = "480px";
    this.rootContainer.height = "560px";
    this.rootContainer.background = "rgba(10, 14, 23, 0.92)";
    this.rootContainer.color = "#DAA520"; // Gold border
    this.rootContainer.thickness = 3;
    this.rootContainer.cornerRadius = 12;
    this.rootContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.rootContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootContainer.left = "80px";
    this.rootContainer.isVisible = false;
    this.guiTexture.addControl(this.rootContainer);

    const mainStack = new StackPanel("menuMainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    mainStack.paddingTop = "30px";
    mainStack.paddingBottom = "30px";
    this.rootContainer.addControl(mainStack);

    // Header Title Banner
    const titleBlock = new TextBlock("menuTitle", "DUNGO CRAWLER");
    titleBlock.color = "#FFD700";
    titleBlock.fontSize = 32;
    titleBlock.fontWeight = "bold";
    titleBlock.height = "45px";
    titleBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainStack.addControl(titleBlock);

    const subtitleBlock = new TextBlock("menuSubtitle", "— ARPG DUNGEON ADVENTURE —");
    subtitleBlock.color = "#87CEFA";
    subtitleBlock.fontSize = 14;
    subtitleBlock.height = "25px";
    subtitleBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainStack.addControl(subtitleBlock);

    // Separator line with clean container spacer
    const sepContainer = new Rectangle("menuSepContainer");
    sepContainer.height = "24px";
    sepContainer.width = "85%";
    sepContainer.thickness = 0;
    sepContainer.background = "rgba(0,0,0,0)";

    const sepLine = new Rectangle("menuSepLine");
    sepLine.height = "2px";
    sepLine.width = "100%";
    sepLine.background = "#DAA520";
    sepLine.thickness = 0;
    sepContainer.addControl(sepLine);
    mainStack.addControl(sepContainer);

    // Buttons Container
    const btnStack = new StackPanel("btnStack");
    btnStack.isVertical = true;
    btnStack.width = "85%";
    btnStack.height = "380px";
    mainStack.addControl(btnStack);

    // 1. CONTINUE BUTTON
    this.createContinueButton(btnStack);

    // 2. NEW GAME BUTTON
    this.createMenuButton(btnStack, "NEW GAME", "Start a fresh hero journey", () => {
      this.playClickSFX();
      this.onNewGameRequested.notifyObservers();
    });

    // 3. LOAD SAVE BUTTON
    this.createMenuButton(btnStack, "LOAD SAVE", "Select save slot manually", () => {
      this.playClickSFX();
      this.onLoadSaveRequested.notifyObservers();
    });

    // 4. SETTINGS BUTTON
    this.createMenuButton(btnStack, "SETTINGS", "Audio, graphics & controls", () => {
      this.playClickSFX();
      this.onSettingsRequested.notifyObservers();
    });

    this.setupKeyboardListeners();
  }

  private createContinueButton(parent: StackPanel): void {
    const btnRect = new Rectangle("continueBtnCard");
    btnRect.height = "75px";
    btnRect.width = "100%";
    btnRect.background = "rgba(30, 45, 65, 0.9)";
    btnRect.color = "#DAA520";
    btnRect.thickness = 2;
    btnRect.cornerRadius = 8;
    btnRect.paddingBottom = "12px";
    parent.addControl(btnRect);

    const btnStack = new StackPanel("continueTextStack");
    btnStack.isVertical = true;
    btnStack.width = "100%";
    btnStack.height = "100%";
    btnStack.paddingTop = "10px";
    btnRect.addControl(btnStack);

    const titleText = new TextBlock("continueTitle", "CONTINUE");
    titleText.color = "#FFD700";
    titleText.fontSize = 20;
    titleText.fontWeight = "bold";
    titleText.height = "26px";
    btnStack.addControl(titleText);

    this.continueSubtext = new TextBlock("continueSubtext", "No active save found");
    this.continueSubtext.color = "#A0AEC0";
    this.continueSubtext.fontSize = 12;
    this.continueSubtext.height = "22px";
    btnStack.addControl(this.continueSubtext);

    const continueBtn = Button.CreateSimpleButton("continueBtnNative", "");
    continueBtn.width = "100%";
    continueBtn.height = "100%";
    continueBtn.background = "rgba(0,0,0,0)";
    continueBtn.thickness = 0;
    continueBtn.onPointerClickObservable.add(() => {
      if (this.recentSaveSlot) {
        this.playClickSFX();
        this.onContinueRequested.notifyObservers(this.recentSaveSlot.slotId);
      }
    });
    btnRect.addControl(continueBtn);

    this.continueBtn = continueBtn;

    this.focusableButtons.push({
      control: continueBtn,
      action: () => {
        if (this.recentSaveSlot) {
          this.playClickSFX();
          this.onContinueRequested.notifyObservers(this.recentSaveSlot.slotId);
        }
      },
      enabled: false,
    });
  }

  private createMenuButton(parent: StackPanel, title: string, subtitle: string, onClick: () => void): void {
    const btnRect = new Rectangle(`btnCard_${title}`);
    btnRect.height = "70px";
    btnRect.width = "100%";
    btnRect.background = "rgba(20, 28, 42, 0.85)";
    btnRect.color = "#4A5568";
    btnRect.thickness = 1.5;
    btnRect.cornerRadius = 8;
    btnRect.paddingBottom = "12px";
    parent.addControl(btnRect);

    const textStack = new StackPanel(`textStack_${title}`);
    textStack.isVertical = true;
    textStack.width = "100%";
    textStack.height = "100%";
    textStack.paddingTop = "8px";
    btnRect.addControl(textStack);

    const titleText = new TextBlock(`titleText_${title}`, title);
    titleText.color = "#FFFFFF";
    titleText.fontSize = 18;
    titleText.fontWeight = "bold";
    titleText.height = "24px";
    textStack.addControl(titleText);

    const subText = new TextBlock(`subText_${title}`, subtitle);
    subText.color = "#9CA3AF";
    subText.fontSize = 12;
    subText.height = "20px";
    textStack.addControl(subText);

    const nativeBtn = Button.CreateSimpleButton(`nativeBtn_${title}`, "");
    nativeBtn.width = "100%";
    nativeBtn.height = "100%";
    nativeBtn.background = "rgba(0,0,0,0)";
    nativeBtn.thickness = 0;
    nativeBtn.onPointerClickObservable.add(() => onClick());
    btnRect.addControl(nativeBtn);

    nativeBtn.onPointerEnterObservable.add(() => {
      btnRect.background = "rgba(45, 60, 90, 0.9)";
      btnRect.color = "#FFD700";
    });

    nativeBtn.onPointerOutObservable.add(() => {
      btnRect.background = "rgba(20, 28, 42, 0.85)";
      btnRect.color = "#4A5568";
    });

    this.focusableButtons.push({
      control: nativeBtn,
      action: onClick,
      enabled: true,
    });
  }

  public refreshSaveState(): void {
    this.recentSaveSlot = SaveManager.getMostRecentSave();

    const continueFocusItem = this.focusableButtons[0];

    if (this.recentSaveSlot && this.continueSubtext) {
      const meta = this.recentSaveSlot.metadata;
      const archName = meta.archetype.toUpperCase();
      const slotName = this.recentSaveSlot.slotId.toUpperCase();
      this.continueSubtext.text = `Lvl ${meta.level} ${archName} | Slot: ${slotName}`;
      this.continueSubtext.color = "#87CEFA";

      if (continueFocusItem) {
        continueFocusItem.enabled = true;
      }
    } else if (this.continueSubtext) {
      this.continueSubtext.text = "No active save found";
      this.continueSubtext.color = "#6B7280";

      if (continueFocusItem) {
        continueFocusItem.enabled = false;
      }
      if (this.currentFocusIdx === 0) {
        this.currentFocusIdx = 1;
      }
    }

    this.updateFocusHighlight();
  }

  private playClickSFX(): void {
    if (this.audioManager) {
      this.audioManager.playUIClickSFX();
    }
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isVisibleState) return;

      const enabledItems = this.focusableButtons.filter((item) => item.enabled);
      if (enabledItems.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        this.navigateFocus(1);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        this.navigateFocus(-1);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        const target = this.focusableButtons[this.currentFocusIdx];
        if (target && target.enabled) {
          target.action();
        }
        e.preventDefault();
      }
    });
  }

  private navigateFocus(delta: number): void {
    const validIndices = this.focusableButtons
      .map((item, idx) => (item.enabled ? idx : -1))
      .filter((idx) => idx !== -1);

    if (validIndices.length === 0) return;

    const currentPos = validIndices.indexOf(this.currentFocusIdx);
    let nextPos = 0;
    if (currentPos !== -1) {
      nextPos = (currentPos + delta + validIndices.length) % validIndices.length;
    }
    this.currentFocusIdx = validIndices[nextPos];
    this.updateFocusHighlight();
  }

  private updateFocusHighlight(): void {
    for (let i = 0; i < this.focusableButtons.length; i++) {
      const item = this.focusableButtons[i];
      const parentCard = item.control.parent as Rectangle;
      if (!parentCard) continue;

      if (i === this.currentFocusIdx && item.enabled) {
        parentCard.thickness = 3;
        parentCard.color = "#FFD700";
        parentCard.background = "rgba(45, 60, 90, 0.95)";
      } else {
        parentCard.thickness = item.enabled ? 1.5 : 1;
        parentCard.color = item.enabled ? "#4A5568" : "#2D3748";
        parentCard.background = item.enabled ? "rgba(20, 28, 42, 0.85)" : "rgba(15, 20, 30, 0.5)";
      }
    }
  }

  public show(): void {
    this.isVisibleState = true;
    this.rootContainer.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("MainMenuUI", true);
    }
    this.refreshSaveState();

    // Default focus to Continue if available, otherwise New Game (idx 1)
    this.currentFocusIdx = this.focusableButtons[0]?.enabled ? 0 : 1;
    this.updateFocusHighlight();
  }

  public hide(): void {
    this.isVisibleState = false;
    this.rootContainer.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("MainMenuUI", false);
    }
  }

  public isVisible(): boolean {
    return this.isVisibleState;
  }

  public dispose(): void {
    this.guiTexture.dispose();
  }
}
