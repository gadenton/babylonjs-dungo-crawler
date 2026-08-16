import { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { InputText } from "@babylonjs/gui/2D/controls/inputText";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { ArchetypeManager, ArchetypeType } from "../combat/Archetypes";
import { AudioManager } from "../audio/AudioManager";
import { InputManager } from "../core/InputManager";

export interface CharacterCreationEvent {
  archetype: ArchetypeType;
  name: string;
}

export class ClassSelectUI {
  private scene: Scene;
  private audioManager: AudioManager | null;
  private inputManager: InputManager | null;
  private guiTexture: AdvancedDynamicTexture;

  private rootPanel: Rectangle;
  private selectedArchetype: ArchetypeType = "tank";
  private classCards: Map<ArchetypeType, Rectangle> = new Map();
  private nameInput: InputText | null = null;

  public onArchetypeSelected: Observable<CharacterCreationEvent> = new Observable<CharacterCreationEvent>();
  private isVisibleState: boolean = false;

  constructor(scene: Scene, audioManager?: AudioManager, inputManager?: InputManager) {
    this.scene = scene;
    this.audioManager = audioManager ?? null;
    this.inputManager = inputManager ?? null;

    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ClassSelectUI", true, this.scene);

    // Root Container Modal
    this.rootPanel = new Rectangle("classSelectRoot");
    this.rootPanel.width = "780px";
    this.rootPanel.height = "560px";
    this.rootPanel.background = "rgba(10, 14, 23, 0.95)";
    this.rootPanel.color = "#DAA520";
    this.rootPanel.thickness = 3;
    this.rootPanel.cornerRadius = 12;
    this.rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.rootPanel.isVisible = false;
    this.guiTexture.addControl(this.rootPanel);

    const mainStack = new StackPanel("classMainStack");
    mainStack.isVertical = true;
    mainStack.width = "100%";
    mainStack.height = "100%";
    mainStack.paddingTop = "15px";
    mainStack.paddingBottom = "15px";
    this.rootPanel.addControl(mainStack);

    // Header Title
    const titleBlock = new TextBlock("classTitle", "CREATE YOUR HERO");
    titleBlock.color = "#FFD700";
    titleBlock.fontSize = 24;
    titleBlock.fontWeight = "bold";
    titleBlock.height = "32px";
    mainStack.addControl(titleBlock);

    const subtitleBlock = new TextBlock("classSubtitle", "Choose starting class archetype & character name");
    subtitleBlock.color = "#87CEFA";
    subtitleBlock.fontSize = 13;
    subtitleBlock.height = "20px";
    subtitleBlock.paddingBottom = "5px";
    mainStack.addControl(subtitleBlock);

    // Cards Grid (Horizontal Stack)
    const cardsStack = new StackPanel("cardsStack");
    cardsStack.isVertical = false;
    cardsStack.width = "94%";
    cardsStack.height = "310px";
    mainStack.addControl(cardsStack);

    const archetypes: ArchetypeType[] = ["tank", "healer", "mage", "physical_dps"];
    for (const type of archetypes) {
      this.createClassCard(cardsStack, type);
    }

    // Name Input & Embark Footer Row
    const footerStack = new StackPanel("creationFooterStack");
    footerStack.isVertical = false;
    footerStack.width = "90%";
    footerStack.height = "55px";
    footerStack.paddingTop = "10px";
    mainStack.addControl(footerStack);

    const nameInput = new InputText("nameInput");
    nameInput.width = "280px";
    nameInput.height = "42px";
    nameInput.color = "#00FFFF";
    nameInput.background = "#0F172A";
    nameInput.focusedBackground = "#1E293B";
    nameInput.thickness = 1.5;
    nameInput.placeholderText = "Enter Hero Name (Optional)";
    nameInput.placeholderColor = "#64748B";
    nameInput.fontSize = 13;
    footerStack.addControl(nameInput);
    this.nameInput = nameInput;

    const spacer = new Rectangle("footerSpacer");
    spacer.width = "20px";
    spacer.thickness = 0;
    footerStack.addControl(spacer);

    // Footer Embark Button
    const embarkBtn = Button.CreateSimpleButton("embarkBtn", "EMBARK ON ADVENTURE");
    embarkBtn.width = "260px";
    embarkBtn.height = "42px";
    embarkBtn.color = "#FFFFFF";
    embarkBtn.background = "#2E7D32";
    embarkBtn.cornerRadius = 8;
    embarkBtn.fontSize = 15;
    embarkBtn.fontWeight = "bold";
    embarkBtn.onPointerClickObservable.add(() => {
      if (this.audioManager) this.audioManager.playUIClickSFX();
      const customName = this.nameInput?.text.trim() ?? "";
      this.onArchetypeSelected.notifyObservers({
        archetype: this.selectedArchetype,
        name: customName,
      });
      this.hide();
    });
    footerStack.addControl(embarkBtn);

    this.updateCardSelections();
    this.setupKeyboardListeners();
  }

  private createClassCard(parent: StackPanel, type: ArchetypeType): void {
    const archDef = ArchetypeManager.getArchetype(type);

    const card = new Rectangle(`card_${type}`);
    card.width = "172px";
    card.height = "300px";
    card.background = "rgba(20, 28, 42, 0.85)";
    card.color = "#4A5568";
    card.thickness = 2;
    card.cornerRadius = 8;
    card.paddingLeft = "4px";
    card.paddingRight = "4px";
    parent.addControl(card);

    const contentStack = new StackPanel(`content_${type}`);
    contentStack.isVertical = true;
    contentStack.width = "100%";
    contentStack.height = "100%";
    contentStack.paddingTop = "15px";
    contentStack.paddingLeft = "10px";
    contentStack.paddingRight = "10px";
    contentStack.isHitTestVisible = false;
    card.addControl(contentStack);

    const nameText = new TextBlock(`name_${type}`, archDef.name.toUpperCase());
    nameText.color = "#FFD700";
    nameText.fontSize = 16;
    nameText.fontWeight = "bold";
    nameText.height = "26px";
    nameText.isHitTestVisible = false;
    contentStack.addControl(nameText);

    const titleText = new TextBlock(`title_${type}`, archDef.title);
    titleText.color = "#87CEFA";
    titleText.fontSize = 11;
    titleText.height = "20px";
    titleText.isHitTestVisible = false;
    contentStack.addControl(titleText);

    const descText = new TextBlock(`desc_${type}`, archDef.description);
    descText.color = "#D1D5DB";
    descText.fontSize = 11;
    descText.height = "110px";
    descText.textWrapping = true;
    descText.paddingTop = "10px";
    descText.isHitTestVisible = false;
    contentStack.addControl(descText);

    const skillText = new TextBlock(`skill_${type}`, `Skill:\n${archDef.signatureSkill.def.name}`);
    skillText.color = "#FBBF24";
    skillText.fontSize = 12;
    skillText.fontWeight = "bold";
    skillText.height = "45px";
    skillText.paddingTop = "10px";
    skillText.isHitTestVisible = false;
    contentStack.addControl(skillText);

    const selectClassAction = () => {
      if (this.audioManager) this.audioManager.playUIClickSFX();
      this.selectedArchetype = type;
      this.updateCardSelections();
    };

    card.isHitTestVisible = true;
    card.onPointerClickObservable.add(selectClassAction);

    const nativeBtn = Button.CreateSimpleButton(`btn_${type}`, "");
    nativeBtn.width = "100%";
    nativeBtn.height = "100%";
    nativeBtn.background = "rgba(0,0,0,0)";
    nativeBtn.thickness = 0;
    nativeBtn.onPointerClickObservable.add(selectClassAction);
    card.addControl(nativeBtn);

    this.classCards.set(type, card);
  }

  private updateCardSelections(): void {
    this.classCards.forEach((card, type) => {
      if (type === this.selectedArchetype) {
        card.color = "#FFD700";
        card.thickness = 3;
        card.background = "rgba(45, 60, 90, 0.95)";
      } else {
        card.color = "#4A5568";
        card.thickness = 1.5;
        card.background = "rgba(20, 28, 42, 0.85)";
      }
    });
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isVisibleState) return;

      const archetypes: ArchetypeType[] = ["tank", "healer", "mage", "physical_dps"];
      const currentIdx = archetypes.indexOf(this.selectedArchetype);

      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        const nextIdx = (currentIdx + 1) % archetypes.length;
        this.selectedArchetype = archetypes[nextIdx];
        this.updateCardSelections();
        if (this.audioManager) this.audioManager.playUIClickSFX();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        const prevIdx = (currentIdx - 1 + archetypes.length) % archetypes.length;
        this.selectedArchetype = archetypes[prevIdx];
        this.updateCardSelections();
        if (this.audioManager) this.audioManager.playUIClickSFX();
        e.preventDefault();
      } else if (e.key === "Enter") {
        if (this.audioManager) this.audioManager.playUIClickSFX();
        this.onArchetypeSelected.notifyObservers({
          archetype: this.selectedArchetype,
          name: this.nameInput?.text.trim() ?? "",
        });
        this.hide();
        e.preventDefault();
      } else if (e.key === "Escape") {
        this.hide();
        e.preventDefault();
      }
    });
  }

  public show(): void {
    this.isVisibleState = true;
    this.rootPanel.isVisible = true;
    if (this.inputManager) {
      this.inputManager.setModalOpen("ClassSelectUI", true);
    }
    this.selectedArchetype = "tank";
    this.updateCardSelections();
  }

  public hide(): void {
    this.isVisibleState = false;
    this.rootPanel.isVisible = false;
    if (this.inputManager) {
      this.inputManager.setModalOpen("ClassSelectUI", false);
    }
  }

  public isVisible(): boolean {
    return this.isVisibleState;
  }

  public dispose(): void {
    this.guiTexture.dispose();
  }
}
