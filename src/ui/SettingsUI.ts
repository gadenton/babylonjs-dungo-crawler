import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Slider } from "@babylonjs/gui/2D/controls/sliders/slider";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { AudioManager } from "../audio/AudioManager";
import { VisualPipelineManager, GraphicsPreset } from "../rendering/VisualPipelineManager";
import { InputManager } from "../core/InputManager";

export class SettingsUI {
  private scene: Scene;
  private audioManager: AudioManager | null;
  private pipelineManager: VisualPipelineManager | null;
  private inputManager: InputManager | null;
  private guiTexture: AdvancedDynamicTexture;

  private rootPanel: Rectangle;
  private isVisibleState: boolean = false;

  private presetButtons: Map<GraphicsPreset, Button> = new Map();

  constructor(
    scene: Scene,
    audioManager?: AudioManager,
    pipelineManager?: VisualPipelineManager,
    inputManager?: InputManager
  ) {
    this.scene = scene;
    this.audioManager = audioManager ?? null;
    this.pipelineManager = pipelineManager ?? null;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("SettingsUI", true, this.scene);

    // Root Panel Modal
    this.rootPanel = new Rectangle("settingsRoot");
    this.rootPanel.width = "680px";
    this.rootPanel.height = "560px";
    this.rootPanel.background = "rgba(10, 14, 23, 0.96)";
    this.rootPanel.color = "#DAA520";
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 12;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    const mainStack = new StackPanel("settingsMainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    mainStack.paddingTop = "15px";
    mainStack.paddingBottom = "15px";
    this.rootPanel.addControl(mainStack);

    // Header Bar
    const headerRect = new Rectangle("settingsHeader");
    headerRect.height = "45px";
    headerRect.width = "100%";
    headerRect.background = "rgba(24, 32, 50, 0.9)";
    headerRect.color = "#DAA520";
    headerRect.thickness = 1;
    mainStack.addControl(headerRect);

    const titleText = new TextBlock("settingsTitle", "GAME SETTINGS & CONTROLS");
    titleText.color = "#FFD700";
    titleText.fontSize = 20;
    titleText.fontWeight = "bold";
    titleText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    titleText.left = "20px";
    headerRect.addControl(titleText);

    const closeBtn = Button.CreateSimpleButton("closeSettingsBtn", "X");
    closeBtn.width = "32px";
    closeBtn.height = "32px";
    closeBtn.color = "#FFFFFF";
    closeBtn.background = "#8B0000";
    closeBtn.cornerRadius = 5;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = "-15px";
    closeBtn.onPointerClickObservable.add(() => this.hide());
    headerRect.addControl(closeBtn);

    const contentStack = new StackPanel("settingsContent");
    contentStack.isVertical = true;
    contentStack.width = "90%";
    contentStack.height = "470px";
    contentStack.paddingTop = "10px";
    mainStack.addControl(contentStack);

    // --- SECTION 1: AUDIO SETTINGS ---
    this.createSectionHeader(contentStack, "AUDIO SETTINGS");

    if (this.audioManager) {
      // Master Volume Slider
      this.createSliderRow(
        contentStack,
        "Master Volume",
        this.audioManager.getMasterVolumeLinear(),
        (val) => {
          if (this.audioManager) {
            this.audioManager.setMasterVolume(val);
            this.audioManager.saveAudioSettings();
          }
        }
      );

      // SFX Volume Slider
      this.createSliderRow(
        contentStack,
        "SFX Volume",
        this.audioManager.getSFXVolumeLinear(),
        (val) => {
          if (this.audioManager) {
            this.audioManager.setSFXVolume(val);
            this.audioManager.saveAudioSettings();
          }
        }
      );
    }

    // --- SECTION 2: GRAPHICS SETTINGS ---
    this.createSectionHeader(contentStack, "GRAPHICS QUALITY PRESET");
    this.createGraphicsPresetSelector(contentStack);

    // --- SECTION 3: KEYBINDING REFERENCE ---
    this.createSectionHeader(contentStack, "KEYBINDING & CONTROLS");
    this.createControlsGuide(contentStack);

    this.setupKeyboardListeners();
  }

  private createSectionHeader(parent: StackPanel, title: string): void {
    const text = new TextBlock(`sec_${title}`, title);
    text.color = "#87CEFA";
    text.fontSize = 15;
    text.fontWeight = "bold";
    text.height = "30px";
    text.paddingTop = "8px";
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(text);

    const sep = new Rectangle(`sep_${title}`);
    sep.height = "1px";
    sep.width = "100%";
    sep.background = "#4A5568";
    sep.thickness = 0;
    sep.paddingBottom = "8px";
    parent.addControl(sep);
  }

  private createSliderRow(
    parent: StackPanel,
    label: string,
    initialValue: number,
    onChange: (val: number) => void
  ): void {
    const row = new StackPanel(`row_${label}`);
    row.isVertical = false;
    row.width = "100%";
    row.height = "35px";
    parent.addControl(row);

    const labelText = new TextBlock(`label_${label}`, label);
    labelText.color = "#D1D5DB";
    labelText.fontSize = 14;
    labelText.width = "140px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const slider = new Slider(`slider_${label}`);
    slider.minimum = 0.0;
    slider.maximum = 1.0;
    slider.value = initialValue;
    slider.width = "300px";
    slider.height = "20px";
    slider.color = "#FFD700";
    slider.background = "#374151";
    slider.borderColor = "#DAA520";
    slider.onValueChangedObservable.add((val) => onChange(val));
    row.addControl(slider);

    const valText = new TextBlock(`val_${label}`, `${Math.round(initialValue * 100)}%`);
    valText.color = "#87CEFA";
    valText.fontSize = 13;
    valText.width = "60px";
    valText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    slider.onValueChangedObservable.add((val) => {
      valText.text = `${Math.round(val * 100)}%`;
    });
    row.addControl(valText);
  }

  private createGraphicsPresetSelector(parent: StackPanel): void {
    const row = new StackPanel("presetRow");
    row.isVertical = false;
    row.width = "100%";
    row.height = "42px";
    row.paddingTop = "4px";
    row.paddingBottom = "8px";
    parent.addControl(row);

    const presets: GraphicsPreset[] = ["low", "medium", "high", "ultra"];
    const currentPreset = this.pipelineManager ? this.pipelineManager.getPreset() : "high";

    for (const preset of presets) {
      const btn = Button.CreateSimpleButton(`presetBtn_${preset}`, preset.toUpperCase());
      btn.width = "120px";
      btn.height = "34px";
      btn.color = preset === currentPreset ? "#FFD700" : "#D1D5DB";
      btn.background = preset === currentPreset ? "#1E3A8A" : "#1F2937";
      btn.cornerRadius = 6;
      btn.fontSize = 13;
      btn.fontWeight = "bold";
      btn.paddingRight = "8px";
      btn.onPointerClickObservable.add(() => {
        if (this.pipelineManager) {
          this.pipelineManager.setPreset(preset);
          this.pipelineManager.saveGraphicsSettings();
          this.updatePresetButtons(preset);
        }
        if (this.audioManager) this.audioManager.playUIClickSFX();
      });
      row.addControl(btn);
      this.presetButtons.set(preset, btn);
    }
  }

  private updatePresetButtons(activePreset: GraphicsPreset): void {
    this.presetButtons.forEach((btn, preset) => {
      if (preset === activePreset) {
        btn.color = "#FFD700";
        btn.background = "#1E3A8A";
      } else {
        btn.color = "#D1D5DB";
        btn.background = "#1F2937";
      }
    });
  }

  private createControlsGuide(parent: StackPanel): void {
    const guideRect = new Rectangle("controlsGuideRect");
    guideRect.width = "100%";
    guideRect.height = "165px";
    guideRect.background = "rgba(17, 24, 39, 0.7)";
    guideRect.color = "#374151";
    guideRect.thickness = 1;
    guideRect.cornerRadius = 6;
    parent.addControl(guideRect);

    const guideText = new TextBlock("controlsGuideText");
    guideText.color = "#E5E7EB";
    guideText.fontSize = 12;
    guideText.lineSpacing = "4px";
    guideText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    guideText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    guideText.left = "15px";
    guideText.top = "10px";
    guideText.text = [
      "• Move Hero: [WASD] Keys or Left-Click Ground / Drag",
      "• Basic Attack: Left-Click Target Enemy or Melee Range",
      "• Activate Skills: [1] [2] [3] [4] [5] Hotkeys",
      "• Map Overlay: [Tab] or [M]",
      "• Inventory: [I] | Talent Tree: [T] | Class Altar / Portal: [E] or [F]",
      "• Save & Load UI: [P] | Pause Menu: [Esc]",
    ].join("\n");
    guideRect.addControl(guideText);
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isVisibleState) return;

      if (e.key === "Escape") {
        this.hide();
        e.preventDefault();
      }
    });
  }

  public show(): void {
    this.isVisibleState = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("SettingsUI", true);
    }
  }

  public hide(): void {
    this.isVisibleState = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("SettingsUI", false);
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
