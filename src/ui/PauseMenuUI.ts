import { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { AudioManager } from "../audio/AudioManager";
import { InputManager } from "../core/InputManager";

export class PauseMenuUI {
  private scene: Scene;
  private audioManager: AudioManager | null;
  private inputManager: InputManager | null;
  private guiTexture: AdvancedDynamicTexture;

  private rootPanel: Rectangle;
  private isVisibleState: boolean = false;

  private focusableButtons: { control: Button; action: () => void }[] = [];
  private currentFocusIdx: number = 0;

  public onResumeRequested: Observable<void> = new Observable<void>();
  public onSaveLoadRequested: Observable<void> = new Observable<void>();
  public onSettingsRequested: Observable<void> = new Observable<void>();
  public onMainMenuRequested: Observable<void> = new Observable<void>();

  constructor(scene: Scene, audioManager?: AudioManager, inputManager?: InputManager) {
    this.scene = scene;
    this.audioManager = audioManager ?? null;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("PauseMenuUI", true, this.scene);

    // Root Panel Modal
    this.rootPanel = new Rectangle("pauseMenuRoot");
    this.rootPanel.width = "400px";
    this.rootPanel.height = "420px";
    this.rootPanel.background = "rgba(10, 14, 23, 0.95)";
    this.rootPanel.color = "#DAA520";
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 12;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    const mainStack = new StackPanel("pauseMainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    mainStack.paddingTop = "25px";
    mainStack.paddingBottom = "25px";
    this.rootPanel.addControl(mainStack);

    // Header Title
    const titleText = new TextBlock("pauseTitle", "GAME PAUSED");
    titleText.color = "#FFD700";
    titleText.fontSize = 24;
    titleText.fontWeight = "bold";
    titleText.height = "36px";
    mainStack.addControl(titleText);

    const sep = new Rectangle("pauseSep");
    sep.height = "2px";
    sep.width = "80%";
    sep.background = "#DAA520";
    sep.thickness = 0;
    sep.paddingBottom = "20px";
    mainStack.addControl(sep);

    // Buttons Container
    const btnStack = new StackPanel("pauseBtnStack");
    btnStack.isVertical = true;
    btnStack.width = "80%";
    btnStack.height = "280px";
    mainStack.addControl(btnStack);

    // 1. RESUME
    this.createPauseButton(btnStack, "RESUME GAME", "#2E7D32", () => {
      this.playClickSFX();
      this.onResumeRequested.notifyObservers();
      this.hide();
    });

    // 2. SAVE & LOAD
    this.createPauseButton(btnStack, "SAVE & LOAD", "#1565C0", () => {
      this.playClickSFX();
      this.onSaveLoadRequested.notifyObservers();
      this.hide();
    });

    // 3. SETTINGS
    this.createPauseButton(btnStack, "SETTINGS", "#4B5563", () => {
      this.playClickSFX();
      this.onSettingsRequested.notifyObservers();
      this.hide();
    });

    // 4. MAIN MENU
    this.createPauseButton(btnStack, "RETURN TO MAIN MENU", "#8B0000", () => {
      this.playClickSFX();
      this.onMainMenuRequested.notifyObservers();
      this.hide();
    });

    this.setupKeyboardListeners();
  }

  private createPauseButton(parent: StackPanel, label: string, bg: string, onClick: () => void): void {
    const btn = Button.CreateSimpleButton(`pauseBtn_${label}`, label);
    btn.width = "100%";
    btn.height = "50px";
    btn.color = "#FFFFFF";
    btn.background = bg;
    btn.cornerRadius = 8;
    btn.fontSize = 15;
    btn.fontWeight = "bold";
    btn.paddingBottom = "10px";
    btn.onPointerClickObservable.add(() => onClick());
    parent.addControl(btn);

    this.focusableButtons.push({
      control: btn,
      action: onClick,
    });
  }

  private playClickSFX(): void {
    if (this.audioManager) {
      this.audioManager.playUIClickSFX();
    }
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isVisibleState) return;

      if (e.key === "Escape") {
        this.onResumeRequested.notifyObservers();
        this.hide();
        e.preventDefault();
        return;
      }

      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        this.navigateFocus(1);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        this.navigateFocus(-1);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        const item = this.focusableButtons[this.currentFocusIdx];
        if (item) item.action();
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
    this.isVisibleState = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("PauseMenuUI", true);
    }
    this.currentFocusIdx = 0;
    this.updateFocusHighlight();
  }

  public hide(): void {
    this.isVisibleState = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("PauseMenuUI", false);
    }
  }

  public toggle(): void {
    if (this.isVisibleState) this.hide();
    else this.show();
  }

  public isVisible(): boolean {
    return this.isVisibleState;
  }

  public dispose(): void {
    this.guiTexture.dispose();
  }
}
