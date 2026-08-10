// Mock DOM globals if running in Node environment
if (typeof window === "undefined") {
  const listeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (event: string, eventData: any) => {
      if (listeners[event]) {
        listeners[event].forEach((fn) => fn(eventData));
      }
    },
    _listeners: listeners,
  };
}

if (typeof navigator === "undefined") {
  (globalThis as any).navigator = {
    getGamepads: () => [],
  };
}

import { InputManager } from "../src/core/InputManager";
import { Observable } from "@babylonjs/core/Misc/observable";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Mock Scene
function createMockScene() {
  return {
    onPointerObservable: new Observable(),
    pick: () => null,
    pointerX: 0,
    pointerY: 0,
  } as any;
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  }
}

function assertCloseTo(actual: number, expected: number, delta: number = 0.001, message: string = "") {
  totalTests++;
  if (Math.abs(actual - expected) > delta) {
    console.error(`❌ FAIL: ${message} - expected ${expected}, got ${actual}`);
    throw new Error(`Assertion failed: ${message} - expected ${expected}, got ${actual}`);
  } else {
    console.log(`✅ PASS: ${message} - got ${actual.toFixed(4)} (expected ${expected})`);
    passedTests++;
  }
}

console.log("=== EMPIRICAL VERIFICATION OF INPUTMANAGER.TS ===");

// TEST 1: Vector rotation formula math verification
console.log("\n--- TEST 1: Vector Rotation Formula (Keyboard W/A/S/D) ---");
const scene = createMockScene();
const inputManager = new InputManager(scene);

let lastMoveVec: Vector3 = Vector3.Zero();
inputManager.onMoveVectorChanged.add((vec) => {
  lastMoveVec = vec;
});

// Simulate Key W press (Screen UP: nx = 0, ny = 1)
(window as any)._listeners["keydown"].forEach((fn: Function) =>
  fn({ code: "KeyW", repeat: false })
);

assertCloseTo(lastMoveVec.x, -0.7071, 0.001, "W key (Screen UP) worldX should be -0.707");
assertCloseTo(lastMoveVec.y, 0.0, 0.0001, "W key worldY should be 0");
assertCloseTo(lastMoveVec.z, 0.7071, 0.001, "W key (Screen UP) worldZ should be +0.707");

// Simulate Key S press (Screen DOWN: nx = 0, ny = -1)
(window as any)._listeners["keyup"].forEach((fn: Function) =>
  fn({ code: "KeyW" })
);
(window as any)._listeners["keydown"].forEach((fn: Function) =>
  fn({ code: "KeyS", repeat: false })
);

assertCloseTo(lastMoveVec.x, 0.7071, 0.001, "S key (Screen DOWN) worldX should be +0.707");
assertCloseTo(lastMoveVec.z, -0.7071, 0.001, "S key (Screen DOWN) worldZ should be -0.707");

// Simulate Key A press (Screen LEFT: nx = -1, ny = 0)
(window as any)._listeners["keyup"].forEach((fn: Function) =>
  fn({ code: "KeyS" })
);
(window as any)._listeners["keydown"].forEach((fn: Function) =>
  fn({ code: "KeyA", repeat: false })
);

assertCloseTo(lastMoveVec.x, -0.7071, 0.001, "A key (Screen LEFT) worldX should be -0.707");
assertCloseTo(lastMoveVec.z, -0.7071, 0.001, "A key (Screen LEFT) worldZ should be -0.707");

// Simulate Key D press (Screen RIGHT: nx = 1, ny = 0)
(window as any)._listeners["keyup"].forEach((fn: Function) =>
  fn({ code: "KeyA" })
);
(window as any)._listeners["keydown"].forEach((fn: Function) =>
  fn({ code: "KeyD", repeat: false })
);

assertCloseTo(lastMoveVec.x, 0.7071, 0.001, "D key (Screen RIGHT) worldX should be +0.707");
assertCloseTo(lastMoveVec.z, 0.7071, 0.001, "D key (Screen RIGHT) worldZ should be +0.707");

// Release D key
(window as any)._listeners["keyup"].forEach((fn: Function) =>
  fn({ code: "KeyD" })
);


// TEST 2: Gamepad Rising-Edge Detection
console.log("\n--- TEST 2: Gamepad Rising-Edge Detection ---");

let skillTriggerCount = 0;
let lastSkillSlot = -1;
inputManager.onSkillTriggered.add((evt) => {
  skillTriggerCount++;
  lastSkillSlot = evt.skillSlot;
});

// Setup mock gamepad
let button0Pressed = false;
const mockGamepad = {
  index: 0,
  connected: true,
  axes: [0, 0],
  buttons: [
    { get pressed() { return button0Pressed; } },
    { pressed: false },
    { pressed: false },
    { pressed: false },
    { pressed: false }
  ]
};

(navigator as any).getGamepads = () => [mockGamepad];

// Frame 1: Button NOT pressed
inputManager.update(16);
assert(skillTriggerCount === 0, "Frame 1 (unpressed): skillTriggerCount should be 0");

// Frame 2: Button 0 PRESSED for the first time (Rising edge)
button0Pressed = true;
inputManager.update(16);
assert(skillTriggerCount === 1, "Frame 2 (press frame): skillTriggerCount should increment to 1");
assert(lastSkillSlot === 0, "Frame 2: lastSkillSlot should be 0");

// Frame 3: Button 0 STILL PRESSED (Held down)
inputManager.update(16);
assert(skillTriggerCount === 1, "Frame 3 (held frame): skillTriggerCount must remain 1 (no repeat)");

// Frame 4: Button 0 STILL PRESSED (Held down for another frame)
inputManager.update(16);
assert(skillTriggerCount === 1, "Frame 4 (held frame): skillTriggerCount must remain 1 (no repeat)");

// Frame 5: Button 0 RELEASED
button0Pressed = false;
inputManager.update(16);
assert(skillTriggerCount === 1, "Frame 5 (released): skillTriggerCount must remain 1");

// Frame 6: Button 0 PRESSED AGAIN (Second rising edge)
button0Pressed = true;
inputManager.update(16);
assert(skillTriggerCount === 2, "Frame 6 (2nd press frame): skillTriggerCount should increment to 2");

// Frame 7: Button 0 STILL PRESSED
inputManager.update(16);
assert(skillTriggerCount === 2, "Frame 7 (2nd held frame): skillTriggerCount must remain 2");

console.log(`\nALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
