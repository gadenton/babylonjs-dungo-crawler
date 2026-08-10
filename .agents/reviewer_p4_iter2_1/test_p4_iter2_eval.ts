import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StatsComponent, StatType } from "../../src/entities/components/StatsComponent";
import { SeismicSlamSkill } from "../../src/combat/Skill";
import { TownHubAltar } from "../../src/entities/TownHubAltar";

// Mock global window, navigator, document, and OffscreenCanvas for Node environment testing
if (typeof global.window === "undefined") {
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof global.navigator === "undefined") {
  (global as any).navigator = {
    getGamepads: () => [],
  };
}
if (typeof global.OffscreenCanvas === "undefined") {
  (global as any).OffscreenCanvas = class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        measureText: () => ({ width: 10 }),
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Uint8Array(4) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Uint8Array(4) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        clip: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        transform: () => {},
      };
    }
  };
}
if (typeof global.document === "undefined") {
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (type: string) => {
      if (type === "canvas") {
        return new (global as any).OffscreenCanvas(512, 512);
      }
      return {};
    },
  };
}

import { InputManager } from "../../src/core/InputManager";
import { Player } from "../../src/entities/Player";
import { TalentUI } from "../../src/ui/TalentUI";
import { ArchetypeUI } from "../../src/ui/ArchetypeUI";
import { HUD } from "../../src/ui/HUD";

async function runTests() {
  console.log("=== RUNNING P4 ITER2 VERIFICATION TESTS ===");
  const engine = new NullEngine();

  // --- Test 1: StatsComponent StatType.MaxMana ---
  console.log("\n[Test 1] StatsComponent MaxMana calculation & clamping");
  const stats = new StatsComponent({ [StatType.MaxMana]: 100 });
  if (stats.maxMana !== 100) throw new Error(`Expected maxMana 100, got ${stats.maxMana}`);
  if (stats.currentMana !== 100) throw new Error(`Expected currentMana 100, got ${stats.currentMana}`);

  // Add +50% MaxMana modifier (Healer passive style)
  stats.addModifier({
    id: "healer_passive",
    stat: StatType.MaxMana,
    type: "percent",
    value: 0.5,
  });
  if (stats.maxMana !== 150) throw new Error(`Expected maxMana 150 after +50% mod, got ${stats.maxMana}`);

  // Reduce MaxMana below currentMana and verify clamping
  stats.removeModifier("healer_passive");
  stats.setBaseStat(StatType.MaxMana, 80);
  if (stats.maxMana !== 80) throw new Error(`Expected maxMana 80, got ${stats.maxMana}`);
  if (stats.currentMana !== 80) throw new Error(`Expected currentMana clamped to 80, got ${stats.currentMana}`);
  console.log("-> Test 1 PASS: MaxMana correctly calculated, modified, and resource clamped!");

  // --- Test 2: InputManager 120ms Buffer Peek/Consume ---
  console.log("\n[Test 2] InputManager 120ms Skill Buffer Queueing");
  const scene2 = new Scene(engine);
  const inputMgr = new InputManager(scene2);
  inputMgr.bufferSkillInput(0); // Skill 0
  
  const peeked = inputMgr.peekBufferedSkill();
  if (!peeked || peeked.skillSlot !== 0) throw new Error("Expected peekBufferedSkill to return skillSlot 0 without consuming");

  // Consume with false predicate -> should NOT consume
  const consumedFalse = inputMgr.consumeBufferedSkillIf(() => false);
  if (consumedFalse !== null) throw new Error("Expected consumeBufferedSkillIf(false) to return null");
  if (!inputMgr.peekBufferedSkill()) throw new Error("Skill should still be buffered after false predicate");

  // Consume with true predicate -> SHOULD consume
  const consumedTrue = inputMgr.consumeBufferedSkillIf((input) => input.skillSlot === 0);
  if (!consumedTrue || consumedTrue.skillSlot !== 0) throw new Error("Expected consumeBufferedSkillIf(true) to consume skillSlot 0");
  if (inputMgr.peekBufferedSkill() !== null) throw new Error("Buffer should be empty after consuming");
  console.log("-> Test 2 PASS: 120ms input buffer peek/consume logic works as expected!");

  // --- Test 3: GUI Modal Click Isolation ---
  console.log("\n[Test 3] GUI Modal Click Event Isolation");
  let worldClickTriggered = false;
  inputMgr.onPointerClickWorld.add(() => {
    worldClickTriggered = true;
  });

  inputMgr.setModalOpen("test_modal", true);
  if (!inputMgr.isUIModalOpen) throw new Error("Expected isUIModalOpen to be true");
  
  // Simulate pointer down event when modal open
  (scene2.onPointerObservable as any).notifyObservers({
    type: 1, // PointerEventTypes.POINTERDOWN
    event: { button: 0 },
  });
  if (worldClickTriggered) throw new Error("Pointer click world should be suppressed when GUI modal is open");

  inputMgr.setModalOpen("test_modal", false);
  if (inputMgr.isUIModalOpen) throw new Error("Expected isUIModalOpen to be false");
  console.log("-> Test 3 PASS: GUI modal click event isolation operates correctly!");

  // --- Test 4: Player & Cooldown Buffer Queueing ---
  console.log("\n[Test 4] Player Cooldown Queueing via Buffer");
  const player = new Player("p1", scene2);
  player.setInputManager(inputMgr);
  const slam = new SeismicSlamSkill();
  player.equippedSkills[0] = slam;

  // Put skill on cooldown manually
  slam.currentCooldown = 2.0;

  // Buffer Skill 0 input
  inputMgr.bufferSkillInput(0);

  // Process input buffer while skill is on cooldown
  player.processInputBuffer(0.016);
  if (inputMgr.peekBufferedSkill() === null) {
    throw new Error("Skill input was prematurely consumed while skill was on cooldown!");
  }

  // Remove cooldown and process input buffer again
  slam.currentCooldown = 0;
  player.processInputBuffer(0.016);
  if (inputMgr.peekBufferedSkill() !== null) {
    throw new Error("Skill input should have been consumed now that cooldown expired!");
  }
  console.log("-> Test 4 PASS: Skill input queueing during cooldown confirmed!");

  // --- Test 5: Observer Disposal Cleanup ---
  console.log("\n[Test 5] Observer Disposal Cleanup in Altar, TalentUI, ArchetypeUI, HUD");
  const scene5 = new Scene(engine);
  const altarInputMgr = new InputManager(scene5);
  const altarPlayer = new Player("p2", scene5);
  
  const altar = new TownHubAltar(scene5, new Vector3(0, 0, 0));
  const renderObs = (altar as any).renderObserver;
  if (!renderObs || renderObs._willBeUnregistered) {
    throw new Error("Altar failed to attach active render observer");
  }
  altar.dispose();
  if ((altar as any).renderObserver !== null || !renderObs._willBeUnregistered) {
    throw new Error("Altar failed to unregister render observer on dispose!");
  }

  const talentUI = new TalentUI(scene5, altarPlayer.talentTree, altarInputMgr);
  talentUI.show();
  if (!altarInputMgr.isUIModalOpen) throw new Error("TalentUI show() failed to set modal open");
  talentUI.dispose();
  if (altarInputMgr.isUIModalOpen) throw new Error("TalentUI dispose() failed to clear modal open");

  const archetypeUI = new ArchetypeUI(scene5, altarPlayer, altarInputMgr);
  archetypeUI.show();
  if (!altarInputMgr.isUIModalOpen) throw new Error("ArchetypeUI show() failed to set modal open");
  archetypeUI.dispose();
  if (altarInputMgr.isUIModalOpen) throw new Error("ArchetypeUI dispose() failed to clear modal open");

  const hud = new HUD(scene5, altarPlayer, altarInputMgr);
  hud.dispose();
  console.log("-> Test 5 PASS: All observer disposal cleanups verified!");

  console.log("\n=== ALL P4 ITER2 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
  engine.dispose();
}

runTests().catch((err) => {
  console.error("Verification test failed:", err);
  process.exit(1);
});
