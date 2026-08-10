import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { ArchetypeType, ArchetypeManager, ArchetypeDefinition } from "../combat/Archetypes";
import { Player } from "../entities/Player";
import { InputManager, InputDeviceType } from "../core/InputManager";
import { AudioManager } from "../audio/AudioManager";

export class ArchetypeUI {
  private scene: Scene;
  private player: Player;
  private inputManager: InputManager | null = null;
  private audioManager: AudioManager | null = null;
  private guiTexture: AdvancedDynamicTexture;
  private deviceChangedObserver: Observer<InputDeviceType> | null = null;

  // Root Modal Panel
  private rootPanel: Rectangle;
  private isOpen: boolean = false;

  // UI Components
  private cardsGrid: Grid;
  private promptLabel: TextBlock;

  constructor(scene: Scene, player: Player, inputManager?: InputManager, audioManager?: AudioManager) {
    this.scene = scene;
    this.player = player;
    this.inputManager = inputManager ?? null;
    this.audioManager = audioManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ArchetypeUIOverlay", true, this.scene);

    // Root Modal Rectangle
    this.rootPanel = new Rectangle("archetypeModalRoot");
    this.rootPanel.width = "940px";
    this.rootPanel.height = "560px";
    this.rootPanel.background = "rgba(12, 18, 28, 0.95)";
    this.rootPanel.color = "#00FFFF"; // Cyan border for altar
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 12;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    const mainStack = new StackPanel("archetypeMainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    this.rootPanel.addControl(mainStack);

    // Header Bar
    const headerRect = new Rectangle("headerRect");
    headerRect.height = "55px";
    headerRect.width = "100%";
    headerRect.background = "rgba(20, 30, 48, 0.8)";
    headerRect.color = "#00FFFF";
    headerRect.thickness = 1;
    mainStack.addControl(headerRect);

    const headerTitle = new TextBlock("headerTitle", "ARCHETYPE ALTAR — CHOOSE YOUR CLASS");
    headerTitle.color = "#00FFFF";
    headerTitle.fontSize = 22;
    headerTitle.fontWeight = "bold";
    headerTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    headerRect.addControl(headerTitle);

    // Cards Grid (1 row x 4 columns)
    this.cardsGrid = new Grid("cardsGrid");
    this.cardsGrid.width = "98%";
    this.cardsGrid.height = "430px";
    this.cardsGrid.addColumnDefinition(0.25);
    this.cardsGrid.addColumnDefinition(0.25);
    this.cardsGrid.addColumnDefinition(0.25);
    this.cardsGrid.addColumnDefinition(0.25);
    mainStack.addControl(this.cardsGrid);

    // Footer Bar
    const footerRect = new Rectangle("footerRect");
    footerRect.height = "50px";
    footerRect.width = "100%";
    footerRect.background = "rgba(15, 20, 32, 0.8)";
    footerRect.color = "#00FFFF";
    footerRect.thickness = 1;
    mainStack.addControl(footerRect);

    const closeBtn = Button.CreateSimpleButton("closeBtn", "Close [Esc]");
    closeBtn.width = "120px";
    closeBtn.height = "34px";
    closeBtn.color = "#FFFFFF";
    closeBtn.background = "#374151";
    closeBtn.cornerRadius = 6;
    closeBtn.fontSize = 14;
    closeBtn.fontWeight = "bold";
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = "-20px";
    closeBtn.onPointerUpObservable.add(() => this.hide());
    footerRect.addControl(closeBtn);

    this.promptLabel = new TextBlock("promptLabel", "KBM: [Click / WASD] Select Class  [Esc] Close");
    this.promptLabel.color = "#9CA3AF";
    this.promptLabel.fontSize = 13;
    this.promptLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    footerRect.addControl(this.promptLabel);

    if (this.inputManager) {
      this.deviceChangedObserver = this.inputManager.onActiveDeviceChanged.add((device) => {
        this.promptLabel.text = device === "gamepad"
          ? "Gamepad: [D-Pad] Navigate  [A] Equip Class  [B] Close"
          : "KBM: [Click / WASD] Select Class  [Esc] Close";
      });
    }
  }

  public show(): void {
    this.isOpen = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("archetype_ui", true);
    }
    this.refreshUI();
  }

  public hide(): void {
    this.isOpen = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("archetype_ui", false);
    }
  }

  public toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  public get isCurrentlyVisible(): boolean {
    return this.isOpen;
  }

  public refreshUI(): void {
    if (!this.isOpen) return;

    this.cardsGrid.children.slice().forEach((c) => c.dispose());

    const allArchetypes = ArchetypeManager.getAllArchetypes();
    const playerLevel = this.player.level;
    const currentArchetypeId = this.player.activeArchetypeId;

    allArchetypes.forEach((arch, colIdx) => {
      const isUnlocked = playerLevel >= arch.unlockLevel;
      const isActive = arch.id === currentArchetypeId;

      const cardRect = new Rectangle(`card_${arch.id}`);
      cardRect.width = "94%";
      cardRect.height = "96%";
      cardRect.background = isActive ? "rgba(24, 45, 65, 0.9)" : "rgba(16, 24, 38, 0.85)";
      cardRect.color = isActive ? "#00FFFF" : (isUnlocked ? "#3B82F6" : "#4B5563");
      cardRect.thickness = isActive ? 3 : 2;
      cardRect.cornerRadius = 8;
      this.cardsGrid.addControl(cardRect, 0, colIdx);

      const cardStack = new StackPanel(`cardStack_${arch.id}`);
      cardStack.isVertical = true;
      cardStack.width = "90%";
      cardStack.height = "92%";
      cardRect.addControl(cardStack);

      // Title & Unlock Requirement
      const nameText = new TextBlock(`name_${arch.id}`, arch.name);
      nameText.color = isActive ? "#00FFFF" : "#FFD700";
      nameText.fontSize = 18;
      nameText.fontWeight = "bold";
      nameText.height = "30px";
      cardStack.addControl(nameText);

      const reqText = new TextBlock(`req_${arch.id}`, `Req. Level ${arch.unlockLevel}`);
      reqText.color = isUnlocked ? "#34D399" : "#F87171";
      reqText.fontSize = 12;
      reqText.fontWeight = "bold";
      reqText.height = "20px";
      cardStack.addControl(reqText);

      // Role & Description
      const descText = new TextBlock(`desc_${arch.id}`, arch.description);
      descText.color = "#9CA3AF";
      descText.fontSize = 11;
      descText.textWrapping = true;
      descText.height = "70px";
      cardStack.addControl(descText);

      // Signature Skill Box
      const skillHeader = new TextBlock(`skHeader_${arch.id}`, `Skill: ${arch.signatureSkill.def.name}`);
      skillHeader.color = "#F59E0B"; // Amber
      skillHeader.fontSize = 13;
      skillHeader.fontWeight = "bold";
      skillHeader.height = "25px";
      cardStack.addControl(skillHeader);

      const skillDesc = new TextBlock(`skDesc_${arch.id}`, arch.signatureSkill.def.description);
      skillDesc.color = "#D1D5DB";
      skillDesc.fontSize = 11;
      skillDesc.textWrapping = true;
      skillDesc.height = "80px";
      cardStack.addControl(skillDesc);

      // Stats Summary
      let statsSummary = `HP: ${arch.baseStats.MaxHp}  Armor: ${arch.baseStats.Armor}\nATK: ${arch.baseStats.AttackDamage}  Mana: ${arch.baseStats.MaxMana}`;
      const statsText = new TextBlock(`stats_${arch.id}`, statsSummary);
      statsText.color = "#60A5FA";
      statsText.fontSize = 12;
      statsText.height = "45px";
      cardStack.addControl(statsText);

      // Action Button
      const btn = Button.CreateSimpleButton(`btn_${arch.id}`, isActive ? "ACTIVE" : (isUnlocked ? "EQUIP" : "LOCKED"));
      btn.height = "38px";
      btn.width = "90%";
      btn.cornerRadius = 6;
      btn.fontSize = 14;
      btn.fontWeight = "bold";

      if (isActive) {
        btn.background = "#059669"; // Emerald active
        btn.color = "#FFFFFF";
        btn.isEnabled = false;
      } else if (isUnlocked) {
        btn.background = "#2563EB"; // Blue equip
        btn.color = "#FFFFFF";
        btn.onPointerUpObservable.add(() => {
          if (this.player.setArchetype(arch.id)) {
            if (this.audioManager) {
              this.audioManager.triggerSidechainDucking(-6, 250);
            }
            this.refreshUI();
          }
        });
      } else {
        btn.background = "#374151"; // Gray locked
        btn.color = "#9CA3AF";
        btn.isEnabled = false;
      }

      cardStack.addControl(btn);
    });
  }

  public dispose(): void {
    if (this.inputManager && this.isOpen) {
      this.inputManager.setModalOpen("archetype_ui", false);
    }
    if (this.inputManager && this.deviceChangedObserver) {
      this.inputManager.onActiveDeviceChanged.remove(this.deviceChangedObserver);
      this.deviceChangedObserver = null;
    }
    this.guiTexture.dispose();
  }
}
