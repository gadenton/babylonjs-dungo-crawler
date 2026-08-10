import { Scene } from "@babylonjs/core/scene";
import { Observer } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { TalentTree, TalentNodeDef } from "../combat/TalentTree";
import { ArchetypeType, ArchetypeManager } from "../combat/Archetypes";
import { InputManager, InputDeviceType } from "../core/InputManager";

export class TalentUI {
  private scene: Scene;
  private talentTree: TalentTree;
  private inputManager: InputManager | null = null;
  private guiTexture: AdvancedDynamicTexture;

  // Root Container
  private rootPanel: Rectangle;
  private isOpen: boolean = false;

  // Header Controls
  private headerTitle: TextBlock;
  private pointsLabel: TextBlock;

  // Tab Buttons
  private tabButtons: Map<ArchetypeType, Button> = new Map();
  private selectedTab: ArchetypeType = "tank";

  // Node Grid Container & Tooltip
  private nodeGrid: Grid;
  private nodeButtons: Map<string, Button> = new Map();
  private tooltipName: TextBlock;
  private tooltipDesc: TextBlock;
  private tooltipStats: TextBlock;
  private tooltipReqs: TextBlock;

  // Navigation & Focus Matrix
  private focusableControls: { control: Control; onSelect: () => void; id: string }[] = [];
  private currentFocusIdx: number = 0;
  private promptLabel: TextBlock;

  // Observers
  private talentAllocatedObserver: Observer<any> | null = null;
  private talentResetObserver: Observer<any> | null = null;
  private archetypeSwappedObserver: Observer<any> | null = null;
  private deviceChangedObserver: Observer<InputDeviceType> | null = null;

  constructor(scene: Scene, talentTree: TalentTree, inputManager?: InputManager) {
    this.scene = scene;
    this.talentTree = talentTree;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("TalentUIOverlay", true, this.scene);

    // Main Modal Overlay Container
    this.rootPanel = new Rectangle("talentModalRoot");
    this.rootPanel.width = "900px";
    this.rootPanel.height = "620px";
    this.rootPanel.background = "rgba(10, 14, 23, 0.95)";
    this.rootPanel.color = "#DAA520"; // Gold border
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 12;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    // Main Vertical Stack
    const mainStack = new StackPanel("mainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    this.rootPanel.addControl(mainStack);

    // 1. Header Bar
    const headerRect = new Rectangle("headerRect");
    headerRect.height = "60px";
    headerRect.width = "100%";
    headerRect.background = "rgba(20, 28, 45, 0.8)";
    headerRect.color = "#DAA520";
    headerRect.thickness = 1;
    mainStack.addControl(headerRect);

    this.headerTitle = new TextBlock("headerTitle", "TALENT TREE");
    this.headerTitle.color = "#FFD700";
    this.headerTitle.fontSize = 24;
    this.headerTitle.fontWeight = "bold";
    this.headerTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.headerTitle.left = "20px";
    headerRect.addControl(this.headerTitle);

    this.pointsLabel = new TextBlock("pointsLabel", "Points: 0 / 0");
    this.pointsLabel.color = "#00FFFF";
    this.pointsLabel.fontSize = 18;
    this.pointsLabel.fontWeight = "bold";
    this.pointsLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.pointsLabel.left = "-20px";
    headerRect.addControl(this.pointsLabel);

    // 2. Archetype Tabs Row
    const tabsRect = new Rectangle("tabsRect");
    tabsRect.height = "45px";
    tabsRect.width = "100%";
    tabsRect.background = "rgba(15, 20, 32, 0.6)";
    tabsRect.thickness = 0;
    mainStack.addControl(tabsRect);

    const tabsGrid = new Grid("tabsGrid");
    tabsGrid.width = "100%";
    tabsGrid.height = "100%";
    tabsGrid.addColumnDefinition(0.25);
    tabsGrid.addColumnDefinition(0.25);
    tabsGrid.addColumnDefinition(0.25);
    tabsGrid.addColumnDefinition(0.25);
    tabsRect.addControl(tabsGrid);

    const archetypes: { id: ArchetypeType; label: string }[] = [
      { id: "tank", label: "Tank" },
      { id: "healer", label: "Healer" },
      { id: "mage", label: "Mage" },
      { id: "physical_dps", label: "Melee DPS" },
    ];

    archetypes.forEach((arch, colIdx) => {
      const btn = Button.CreateSimpleButton(`tab_${arch.id}`, arch.label);
      btn.height = "35px";
      btn.width = "95%";
      btn.color = "#FFFFFF";
      btn.background = arch.id === this.selectedTab ? "#DAA520" : "#1E2A3A";
      btn.cornerRadius = 6;
      btn.fontSize = 15;
      btn.fontWeight = "bold";
      btn.onPointerUpObservable.add(() => {
        this.selectTab(arch.id);
      });
      tabsGrid.addControl(btn, 0, colIdx);
      this.tabButtons.set(arch.id, btn);
    });

    // 3. Body Content (Left: Node Tree Grid, Right: Tooltip Card)
    const bodyGrid = new Grid("bodyGrid");
    bodyGrid.width = "100%";
    bodyGrid.height = "450px";
    bodyGrid.addColumnDefinition(0.65); // Node Tree
    bodyGrid.addColumnDefinition(0.35); // Tooltip Card
    mainStack.addControl(bodyGrid);

    // Node Tree Container
    this.nodeGrid = new Grid("nodeGrid");
    this.nodeGrid.width = "95%";
    this.nodeGrid.height = "95%";
    this.nodeGrid.addColumnDefinition(0.33);
    this.nodeGrid.addColumnDefinition(0.33);
    this.nodeGrid.addColumnDefinition(0.33);
    this.nodeGrid.addRowDefinition(0.25);
    this.nodeGrid.addRowDefinition(0.25);
    this.nodeGrid.addRowDefinition(0.25);
    this.nodeGrid.addRowDefinition(0.25);
    bodyGrid.addControl(this.nodeGrid, 0, 0);

    // Tooltip Card Container
    const tooltipRect = new Rectangle("tooltipRect");
    tooltipRect.width = "92%";
    tooltipRect.height = "95%";
    tooltipRect.background = "rgba(16, 22, 36, 0.9)";
    tooltipRect.color = "#3A4B68";
    tooltipRect.thickness = 2;
    tooltipRect.cornerRadius = 8;
    bodyGrid.addControl(tooltipRect, 0, 1);

    const tooltipStack = new StackPanel("tooltipStack");
    tooltipStack.isVertical = true;
    tooltipStack.width = "90%";
    tooltipStack.height = "90%";
    tooltipRect.addControl(tooltipStack);

    this.tooltipName = new TextBlock("tooltipName", "Select a Node");
    this.tooltipName.color = "#FFD700";
    this.tooltipName.fontSize = 18;
    this.tooltipName.fontWeight = "bold";
    this.tooltipName.height = "35px";
    tooltipStack.addControl(this.tooltipName);

    this.tooltipDesc = new TextBlock("tooltipDesc", "Hover over or navigate to a talent node to view details.");
    this.tooltipDesc.color = "#D1D5DB";
    this.tooltipDesc.fontSize = 13;
    this.tooltipDesc.textWrapping = true;
    this.tooltipDesc.height = "80px";
    tooltipStack.addControl(this.tooltipDesc);

    this.tooltipStats = new TextBlock("tooltipStats", "");
    this.tooltipStats.color = "#34D399"; // Emerald Green
    this.tooltipStats.fontSize = 13;
    this.tooltipStats.textWrapping = true;
    this.tooltipStats.height = "90px";
    tooltipStack.addControl(this.tooltipStats);

    this.tooltipReqs = new TextBlock("tooltipReqs", "");
    this.tooltipReqs.color = "#F87171"; // Red
    this.tooltipReqs.fontSize = 12;
    this.tooltipReqs.textWrapping = true;
    this.tooltipReqs.height = "60px";
    tooltipStack.addControl(this.tooltipReqs);

    // 4. Footer Bar
    const footerRect = new Rectangle("footerRect");
    footerRect.height = "55px";
    footerRect.width = "100%";
    footerRect.background = "rgba(15, 20, 32, 0.8)";
    footerRect.color = "#DAA520";
    footerRect.thickness = 1;
    mainStack.addControl(footerRect);

    const resetBtn = Button.CreateSimpleButton("resetBtn", "Reset Talents");
    resetBtn.width = "150px";
    resetBtn.height = "35px";
    resetBtn.color = "#FFFFFF";
    resetBtn.background = "#991B1B"; // Red
    resetBtn.cornerRadius = 6;
    resetBtn.fontSize = 14;
    resetBtn.fontWeight = "bold";
    resetBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    resetBtn.left = "20px";
    resetBtn.onPointerUpObservable.add(() => {
      this.talentTree.resetTalents(this.selectedTab);
      this.refreshUI();
    });
    footerRect.addControl(resetBtn);

    const closeBtn = Button.CreateSimpleButton("closeBtn", "Close [Esc]");
    closeBtn.width = "120px";
    closeBtn.height = "35px";
    closeBtn.color = "#FFFFFF";
    closeBtn.background = "#374151";
    closeBtn.cornerRadius = 6;
    closeBtn.fontSize = 14;
    closeBtn.fontWeight = "bold";
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = "-20px";
    closeBtn.onPointerUpObservable.add(() => {
      this.hide();
    });
    footerRect.addControl(closeBtn);

    this.promptLabel = new TextBlock("promptLabel", "KBM: [Click / WASD]  Allocate: [Enter]  Close: [Esc]");
    this.promptLabel.color = "#9CA3AF";
    this.promptLabel.fontSize = 13;
    this.promptLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    footerRect.addControl(this.promptLabel);

    // Subscribe to TalentTree events
    this.talentAllocatedObserver = this.talentTree.onTalentAllocated.add(() => this.refreshUI());
    this.talentResetObserver = this.talentTree.onTalentReset.add(() => this.refreshUI());
    this.archetypeSwappedObserver = this.talentTree.onArchetypeSwapped.add((evt) => {
      this.selectTab(evt.current);
    });

    if (this.inputManager) {
      this.deviceChangedObserver = this.inputManager.onActiveDeviceChanged.add((device) => this.updatePromptDevice(device));
    }
  }

  public show(): void {
    this.selectedTab = this.talentTree.getActiveArchetypeId();
    this.isOpen = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("talent_ui", true);
    }
    this.refreshUI();
  }

  public hide(): void {
    this.isOpen = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("talent_ui", false);
    }
  }

  public toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  public get isCurrentlyVisible(): boolean {
    return this.isOpen;
  }

  private selectTab(tab: ArchetypeType): void {
    this.selectedTab = tab;
    this.tabButtons.forEach((btn, id) => {
      btn.background = id === this.selectedTab ? "#DAA520" : "#1E2A3A";
    });
    this.refreshUI();
  }

  private updatePromptDevice(device: InputDeviceType): void {
    if (device === "gamepad") {
      this.promptLabel.text = "Gamepad: [D-Pad] Navigate  [A] Allocate  [Y] Reset  [B] Close";
    } else {
      this.promptLabel.text = "KBM: [Click / WASD] Navigate  [Enter] Allocate  [Esc] Close";
    }
  }

  public refreshUI(): void {
    if (!this.isOpen) return;

    // 1. Update Points Header
    const total = this.talentTree.getTotalTalentPoints();
    const unallocated = this.talentTree.getUnallocatedTalentPoints(this.selectedTab);
    const spent = this.talentTree.getSpentTalentPoints(this.selectedTab);

    this.headerTitle.text = `TALENT TREE — ${this.selectedTab.toUpperCase()}`;
    this.pointsLabel.text = `Unallocated: ${unallocated}  (Spent: ${spent}/${total})`;

    // 2. Clear Node Grid Controls
    this.nodeButtons.forEach((btn) => btn.dispose());
    this.nodeButtons.clear();
    this.focusableControls = [];

    // 3. Populate Node Grid for Selected Tab
    const nodes = this.talentTree.getTalentNodes(this.selectedTab);

    nodes.forEach((node) => {
      const currentRank = this.talentTree.getNodeRank(node.id, this.selectedTab);
      const canAllocate = this.talentTree.canAllocateNode(node.id, this.selectedTab).canAllocate;

      const btn = Button.CreateSimpleButton(`node_${node.id}`, `${node.name}\n[${currentRank}/${node.maxRank}]`);
      btn.width = "90%";
      btn.height = "85%";
      btn.cornerRadius = 8;
      btn.fontSize = 12;
      btn.fontWeight = "bold";

      if (currentRank >= node.maxRank) {
        btn.background = "#065F46"; // Maxed Emerald
        btn.color = "#A7F3D0";
      } else if (canAllocate) {
        btn.background = "#1E3A8A"; // Available Blue
        btn.color = "#93C5FD";
      } else {
        btn.background = "#1F2937"; // Locked Gray
        btn.color = "#6B7280";
      }

      btn.onPointerEnterObservable.add(() => this.updateTooltip(node));
      btn.onPointerUpObservable.add(() => {
        this.updateTooltip(node);
        if (this.talentTree.allocateNode(node.id, this.selectedTab)) {
          this.refreshUI();
        }
      });

      this.nodeGrid.addControl(btn, node.gridPosition.row, node.gridPosition.col);
      this.nodeButtons.set(node.id, btn);

      this.focusableControls.push({
        control: btn,
        id: node.id,
        onSelect: () => {
          this.updateTooltip(node);
          this.talentTree.allocateNode(node.id, this.selectedTab);
        },
      });
    });

    // Select first node by default for tooltip
    if (nodes.length > 0) {
      this.updateTooltip(nodes[0]);
    }
  }

  private updateTooltip(node: TalentNodeDef): void {
    const currentRank = this.talentTree.getNodeRank(node.id, this.selectedTab);

    this.tooltipName.text = `${node.name} (${currentRank}/${node.maxRank})`;
    this.tooltipDesc.text = node.description;

    let statText = "";
    if (node.statModifiers) {
      node.statModifiers.forEach((mod) => {
        const valStr = mod.type === "percent" ? `+${(mod.valuePerRank * 100).toFixed(0)}%` : `+${mod.valuePerRank}`;
        statText += `${mod.stat}: ${valStr} per rank\n`;
      });
    } else if (node.type === "active") {
      statText = "Unlocks signature active skill slot.";
    }
    this.tooltipStats.text = statText;

    let reqText = "";
    if (node.prerequisites.length > 0) {
      reqText = `Requires: ${node.prerequisites.join(", ")}`;
    }
    this.tooltipReqs.text = reqText;
  }

  public dispose(): void {
    if (this.inputManager) {
      this.inputManager.setModalOpen("talent_ui", false);
    }
    if (this.talentAllocatedObserver) {
      this.talentTree.onTalentAllocated.remove(this.talentAllocatedObserver);
      this.talentAllocatedObserver = null;
    }
    if (this.talentResetObserver) {
      this.talentTree.onTalentReset.remove(this.talentResetObserver);
      this.talentResetObserver = null;
    }
    if (this.archetypeSwappedObserver) {
      this.talentTree.onArchetypeSwapped.remove(this.archetypeSwappedObserver);
      this.archetypeSwappedObserver = null;
    }
    if (this.inputManager && this.deviceChangedObserver) {
      this.inputManager.onActiveDeviceChanged.remove(this.deviceChangedObserver);
      this.deviceChangedObserver = null;
    }

    this.guiTexture.dispose();
    this.nodeButtons.clear();
    this.tabButtons.clear();
  }
}
