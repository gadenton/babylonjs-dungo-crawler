import { Observer } from "@babylonjs/core/Misc/observable";
import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { AudioManager } from "../audio/AudioManager";
import { ArchetypeManager } from "../combat/Archetypes";
import { InputDeviceType, InputManager } from "../core/InputManager";
import { Player } from "../entities/Player";

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
  private headerSub: TextBlock | null = null;

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
    headerRect.height = "60px";
    headerRect.width = "100%";
    headerRect.background = "rgba(20, 30, 48, 0.8)";
    headerRect.color = "#00FFFF";
    headerRect.thickness = 1;
    mainStack.addControl(headerRect);

    const headerTitle = new TextBlock("headerTitle", "ARCHETYPE ALTAR — CHOOSE YOUR CLASS");
    headerTitle.color = "#00FFFF";
    headerTitle.fontSize = 20;
    headerTitle.fontWeight = "bold";
    headerTitle.top = "-12px";
    headerTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    headerTitle.isHitTestVisible = false;
    headerRect.addControl(headerTitle);

    this.headerSub = new TextBlock("headerSub", "");
    this.headerSub.color = "#FFD700";
    this.headerSub.fontSize = 12;
    this.headerSub.fontWeight = "bold";
    this.headerSub.top = "14px";
    this.headerSub.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.headerSub.isHitTestVisible = false;
    headerRect.addControl(this.headerSub);

    const headerCloseBtn = Button.CreateSimpleButton("headerCloseBtn", "✕");
    headerCloseBtn.width = "32px";
    headerCloseBtn.height = "32px";
    headerCloseBtn.color = "#9CA3AF";
    headerCloseBtn.background = "transparent";
    headerCloseBtn.thickness = 0;
    headerCloseBtn.fontSize = 18;
    headerCloseBtn.fontWeight = "bold";
    headerCloseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    headerCloseBtn.left = "-12px";
    const closeAction = () => {
      if (this.audioManager) this.audioManager.playUIClickSFX();
      this.hide();
    };
    headerCloseBtn.onPointerClickObservable.add(closeAction);
    headerCloseBtn.onPointerUpObservable.add(closeAction);
    headerRect.addControl(headerCloseBtn);

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

    this.promptLabel = new TextBlock("promptLabel", "KBM: [Click / WASD] Select Class  [Esc] Close");
    this.promptLabel.color = "#9CA3AF";
    this.promptLabel.fontSize = 13;
    this.promptLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.promptLabel.isHitTestVisible = false;
    footerRect.addControl(this.promptLabel);

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
    closeBtn.onPointerClickObservable.add(closeAction);
    closeBtn.onPointerUpObservable.add(closeAction);
    footerRect.addControl(closeBtn);

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
    const currentArchetypeId = this.player.activeArchetypeId;
    const availableTokens = this.player.getAvailableUnlockTokens();
    const playerLevel = this.player.level;

    if (this.headerSub) {
      this.headerSub.text = "";
      if (availableTokens > 0) {
        this.headerSub.text = `★ ${availableTokens} UNLOCK TOKEN(S) AVAILABLE — CLICK UNLOCK BELOW!`;
        this.headerSub.color = "#FFD700";
      } else if (playerLevel < 10) {
        this.headerSub.text = `Next Class Slot Unlocks at Level 10 (Current Level: ${playerLevel})`;
        this.headerSub.color = "#87CEFA";
      } else if (playerLevel < 20) {
        this.headerSub.text = `Next Class Slot Unlocks at Level 20 (Current Level: ${playerLevel})`;
        this.headerSub.color = "#87CEFA";
      } else if (playerLevel < 30) {
        this.headerSub.text = `Next Class Slot Unlocks at Level 30 (Current Level: ${playerLevel})`;
        this.headerSub.color = "#87CEFA";
      }
    }

    if (availableTokens > 0) {
      this.promptLabel.text = `★ ${availableTokens} CLASS UNLOCK TOKEN(S) AVAILABLE! Click UNLOCK on any class below.`;
      this.promptLabel.color = "#FFD700";
    } else {
      const device = this.inputManager?.getActiveDevice() ?? "kbm";
      this.promptLabel.text = device === "gamepad"
        ? "Gamepad: [D-Pad] Navigate  [A] Equip Class  [B] Close"
        : "KBM: [Click / WASD] Select Class  [Esc] Close";
      this.promptLabel.color = "#9CA3AF";
    }

    allArchetypes.forEach((arch, colIdx) => {
      const isUnlocked = this.player.isArchetypeUnlocked(arch.id);
      const isActive = arch.id === currentArchetypeId;
      const canUnlock = !isUnlocked && availableTokens > 0;

      const cardRect = new Rectangle(`card_${arch.id}`);
      cardRect.width = "94%";
      cardRect.height = "96%";
      cardRect.background = isActive ? "rgba(24, 45, 65, 0.9)" : (canUnlock ? "rgba(35, 30, 20, 0.9)" : "rgba(16, 24, 38, 0.85)");
      cardRect.color = isActive ? "#00FFFF" : (isUnlocked ? "#3B82F6" : (canUnlock ? "#FFD700" : "#4B5563"));
      cardRect.thickness = isActive ? 3 : (canUnlock ? 2.5 : 2);
      cardRect.cornerRadius = 8;
      this.cardsGrid.addControl(cardRect, 0, colIdx);

      const cardStack = new StackPanel(`cardStack_${arch.id}`);
      cardStack.isVertical = true;
      cardStack.width = "90%";
      cardStack.height = "92%";
      cardRect.addControl(cardStack);

      // Title & Status
      const nameText = new TextBlock(`name_${arch.id}`, arch.name);
      nameText.color = isActive ? "#00FFFF" : "#FFD700";
      nameText.fontSize = 18;
      nameText.fontWeight = "bold";
      nameText.height = "30px";
      nameText.isHitTestVisible = false;
      cardStack.addControl(nameText);

      let statusStr = "Unlocked";
      if (isActive) {
        statusStr = "Active Class";
      } else if (!isUnlocked) {
        statusStr = canUnlock ? "Unlock Available!" : "Locked";
      }
      const reqText = new TextBlock(`req_${arch.id}`, statusStr);
      reqText.color = isActive ? "#00FFFF" : (isUnlocked ? "#34D399" : (canUnlock ? "#FFD700" : "#F87171"));
      reqText.fontSize = 12;
      reqText.fontWeight = "bold";
      reqText.height = "20px";
      reqText.isHitTestVisible = false;
      cardStack.addControl(reqText);

      // Role & Description
      const descText = new TextBlock(`desc_${arch.id}`, arch.description);
      descText.color = "#9CA3AF";
      descText.fontSize = 11;
      descText.textWrapping = true;
      descText.height = "70px";
      descText.isHitTestVisible = false;
      cardStack.addControl(descText);

      // Signature Skill Box
      const skillHeader = new TextBlock(`skHeader_${arch.id}`, `Skill: ${arch.signatureSkill.def.name}`);
      skillHeader.color = "#F59E0B"; // Amber
      skillHeader.fontSize = 13;
      skillHeader.fontWeight = "bold";
      skillHeader.height = "25px";
      skillHeader.isHitTestVisible = false;
      cardStack.addControl(skillHeader);

      const skillDesc = new TextBlock(`skDesc_${arch.id}`, arch.signatureSkill.def.description);
      skillDesc.color = "#D1D5DB";
      skillDesc.fontSize = 11;
      skillDesc.textWrapping = true;
      skillDesc.height = "80px";
      skillDesc.isHitTestVisible = false;
      cardStack.addControl(skillDesc);

      // Stats Summary
      let statsSummary = `HP: ${arch.baseStats.MaxHp}  Armor: ${arch.baseStats.Armor}\nATK: ${arch.baseStats.AttackDamage}  Mana: ${arch.baseStats.MaxMana}`;
      const statsText = new TextBlock(`stats_${arch.id}`, statsSummary);
      statsText.color = "#60A5FA";
      statsText.fontSize = 12;
      statsText.height = "45px";
      statsText.isHitTestVisible = false;
      cardStack.addControl(statsText);

      // Action Button
      let btnLabel = "LOCKED";
      if (isActive) btnLabel = "ACTIVE";
      else if (isUnlocked) btnLabel = "EQUIP";
      else if (canUnlock) btnLabel = "UNLOCK";

      const btn = Button.CreateSimpleButton(`btn_${arch.id}`, btnLabel);
      btn.height = "38px";
      btn.width = "90%";
      btn.cornerRadius = 6;
      btn.fontSize = 14;
      btn.fontWeight = "bold";

      if (isActive) {
        btn.background = "#047857"; // Deep Emerald active
        btn.color = "#FFFFFF";
        btn.thickness = 2;
      } else if (isUnlocked) {
        btn.background = "#1D4ED8"; // Bright Blue equip
        btn.color = "#FFFFFF";
        btn.onPointerUpObservable.add(() => {
          if (this.player.setArchetype(arch.id)) {
            if (this.audioManager) {
              this.audioManager.triggerSidechainDucking(-6, 250);
            }
            this.refreshUI();
          }
        });
      } else if (canUnlock) {
        btn.background = "#D97706"; // Amber gold unlock
        btn.color = "#FFFFFF";
        btn.onPointerUpObservable.add(() => {
          if (this.player.unlockArchetype(arch.id)) {
            if (this.audioManager) {
              this.audioManager.playItemPickupSFX();
            }
            this.refreshUI();
          }
        });
      } else {
        btn.background = "#1F2937"; // Dark slate background
        btn.color = "#9CA3AF"; // High-contrast readable gray text
        btn.thickness = 1;
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
