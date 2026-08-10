import { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { InputText } from "@babylonjs/gui/2D/controls/inputText";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { Observable } from "@babylonjs/core/Misc/observable";

export class DungeonPortalUI {
  private scene: Scene;
  private guiTexture: AdvancedDynamicTexture;
  private container: Rectangle;
  private seedInput: InputText;
  public isVisible: boolean = false;

  /** Fired when the player chooses to enter a dungeon. Parameter is seed (number) or undefined for random. */
  public readonly onEnterDungeon: Observable<number | undefined> = new Observable<number | undefined>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("DungeonPortalUI", true, this.scene);

    // Fullscreen translucent modal backdrop
    this.container = new Rectangle("portalBackdrop");
    this.container.width = "100%";
    this.container.height = "100%";
    this.container.background = "rgba(10, 15, 25, 0.75)";
    this.container.thickness = 0;
    this.container.isVisible = false;
    this.guiTexture.addControl(this.container);

    // Modal Card
    const card = new Rectangle("portalCard");
    card.width = "460px";
    card.height = "380px";
    card.background = "rgba(15, 23, 42, 0.95)";
    card.color = "#DAA520";
    card.thickness = 2;
    card.cornerRadius = 12;
    card.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    card.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.container.addControl(card);

    const stack = new StackPanel("portalStack");
    stack.isVertical = true;
    stack.width = "90%";
    stack.height = "90%";
    card.addControl(stack);

    // Title
    const title = new TextBlock("portalTitle", "🌀 ANCIENT DUNGEON PORTAL");
    title.color = "#FFD700";
    title.fontSize = 20;
    title.fontWeight = "bold";
    title.height = "40px";
    stack.addControl(title);

    // Subtitle
    const subtitle = new TextBlock("portalSub", "Enter a procedural dungeon layout or enter a custom seed.");
    subtitle.color = "#94A3B8";
    subtitle.fontSize = 12;
    subtitle.height = "25px";
    stack.addControl(subtitle);

    // Spacer
    const spacer1 = new Rectangle("sp1");
    spacer1.height = "15px";
    spacer1.thickness = 0;
    stack.addControl(spacer1);

    // Button 1: Random Seed
    const randomBtn = Button.CreateSimpleButton("randomSeedBtn", "🎲 ENTER DUNGEON (RANDOM SEED)");
    randomBtn.width = "100%";
    randomBtn.height = "48px";
    randomBtn.color = "#FFFFFF";
    randomBtn.background = "#2563EB"; // Royal Blue
    randomBtn.cornerRadius = 8;
    randomBtn.fontSize = 14;
    randomBtn.fontWeight = "bold";
    randomBtn.onPointerUpObservable.add(() => {
      this.hide();
      this.onEnterDungeon.notifyObservers(undefined);
    });
    stack.addControl(randomBtn);

    // Or Separator
    const orText = new TextBlock("orText", "─ OR ENTER CUSTOM SEED ─");
    orText.color = "#64748B";
    orText.fontSize = 11;
    orText.fontWeight = "bold";
    orText.height = "30px";
    stack.addControl(orText);

    // Seed Input Box
    this.seedInput = new InputText("seedInput");
    this.seedInput.width = "100%";
    this.seedInput.height = "44px";
    this.seedInput.color = "#00FFFF";
    this.seedInput.background = "#0F172A";
    this.seedInput.focusedBackground = "#1E293B";
    this.seedInput.thickness = 2;
    this.seedInput.placeholderText = "Enter Numeric Seed (e.g. 123456)";
    this.seedInput.placeholderColor = "#475569";
    this.seedInput.fontSize = 14;
    this.seedInput.maxWidth = "100%";
    stack.addControl(this.seedInput);

    // Button 2: Custom Seed
    const customSeedBtn = Button.CreateSimpleButton("customSeedBtn", "🔑 ENTER DUNGEON WITH SEED");
    customSeedBtn.width = "100%";
    customSeedBtn.height = "44px";
    customSeedBtn.color = "#FFFFFF";
    customSeedBtn.background = "#7C3AED"; // Purple Accent
    customSeedBtn.cornerRadius = 8;
    customSeedBtn.fontSize = 14;
    customSeedBtn.fontWeight = "bold";
    customSeedBtn.onPointerUpObservable.add(() => {
      const val = this.seedInput.text.trim();
      const numSeed = val ? parseInt(val, 10) : undefined;
      this.hide();
      this.onEnterDungeon.notifyObservers(isNaN(numSeed!) ? undefined : numSeed);
    });
    stack.addControl(customSeedBtn);

    // Close Button
    const closeBtn = Button.CreateSimpleButton("closePortalBtn", "✖ Close");
    closeBtn.width = "100px";
    closeBtn.height = "30px";
    closeBtn.color = "#94A3B8";
    closeBtn.background = "transparent";
    closeBtn.fontSize = 12;
    closeBtn.top = "10px";
    closeBtn.onPointerUpObservable.add(() => this.hide());
    stack.addControl(closeBtn);
  }

  public show(): void {
    this.isVisible = true;
    this.container.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
    this.container.isVisible = false;
  }

  public toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  public dispose(): void {
    this.guiTexture.dispose();
  }
}
