import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { JuiceOverlay } from "../src/ui/JuiceOverlay";
import { AudioManager } from "../src/audio/AudioManager";

// Mock canvas and 2D context for Node.js environment
class Mock2DContext {
  public canvas: any = {};
  public font: string = "";
  public fillStyle: string = "";
  public strokeStyle: string = "";
  public lineWidth: number = 1;
  public textAlign: string = "";
  public textBaseline: string = "";
  public globalAlpha: number = 1.0;
  public shadowColor: string = "";
  public shadowBlur: number = 0;
  public shadowOffsetX: number = 0;
  public shadowOffsetY: number = 0;

  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  clip() {}
  scale() {}
  translate() {}
  transform() {}
  stroke() {}
  fill() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  rect() {}
  fillRect() {}
  clearRect() {}
  strokeRect() {}
  fillText() {}
  strokeText() {}
  measureText(text: string) {
    return { width: text.length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
  }
  setTransform() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
}

class MockCanvas {
  public width: number = 1024;
  public height: number = 768;
  public style: any = {};
  getContext(type: string) {
    return new Mock2DContext();
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1024, height: 768 };
  }
}

// Polyfill globals for Babylon GUI in Node.js
if (typeof globalThis.OffscreenCanvas === "undefined") {
  (globalThis as any).OffscreenCanvas = MockCanvas;
}
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === "canvas") return new MockCanvas();
      return {};
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    document: (globalThis as any).document,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
} else {
  if (!globalThis.window.setTimeout) {
    (globalThis.window as any).setTimeout = globalThis.setTimeout.bind(globalThis);
  }
  if (!globalThis.window.clearTimeout) {
    (globalThis.window as any).clearTimeout = globalThis.clearTimeout.bind(globalThis);
  }
}

// Custom Mock for Web Audio API to run empirically in Node.js
class MockAudioParam {
  public value: number;
  public scheduledEvents: any[] = [];

  constructor(initialValue: number = 1.0) {
    this.value = initialValue;
  }

  cancelScheduledValues(startTime: number) {
    this.scheduledEvents.push({ type: "cancel", startTime });
  }

  setValueAtTime(value: number, startTime: number) {
    this.value = value;
    this.scheduledEvents.push({ type: "setValue", value, startTime });
  }

  linearRampToValueAtTime(value: number, endTime: number) {
    this.value = value;
    this.scheduledEvents.push({ type: "linearRamp", value, endTime });
  }

  exponentialRampToValueAtTime(value: number, endTime: number) {
    this.value = value;
    this.scheduledEvents.push({ type: "exponentialRamp", value, endTime });
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number) {
    this.value = target;
    this.scheduledEvents.push({ type: "setTarget", target, startTime, timeConstant });
  }
}

class MockAudioNode {
  public connectedTo: MockAudioNode[] = [];

  connect(destination: MockAudioNode) {
    this.connectedTo.push(destination);
  }

  disconnect() {
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  public gain: MockAudioParam;
  constructor() {
    super();
    this.gain = new MockAudioParam(1.0);
  }
}

class MockPannerNode extends MockAudioNode {
  public panningModel: string = "";
  public distanceModel: string = "";
  public refDistance: number = 0;
  public maxDistance: number = 0;
  public rolloffFactor: number = 0;
  public positionX: MockAudioParam = new MockAudioParam(0);
  public positionY: MockAudioParam = new MockAudioParam(0);
  public positionZ: MockAudioParam = new MockAudioParam(0);

  setPosition(x: number, y: number, z: number) {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  }
}

class MockOscillatorNode extends MockAudioNode {
  public type: string = "sine";
  public frequency: MockAudioParam = new MockAudioParam(440);
  public started: boolean = false;
  public stopped: boolean = false;

  start(when?: number) {
    this.started = true;
  }

  stop(when?: number) {
    this.stopped = true;
  }
}

class MockAudioListener {
  public positionX: MockAudioParam = new MockAudioParam(0);
  public positionY: MockAudioParam = new MockAudioParam(0);
  public positionZ: MockAudioParam = new MockAudioParam(0);

  public forwardX: MockAudioParam = new MockAudioParam(0);
  public forwardY: MockAudioParam = new MockAudioParam(0);
  public forwardZ: MockAudioParam = new MockAudioParam(1);

  public upX: MockAudioParam = new MockAudioParam(0);
  public upY: MockAudioParam = new MockAudioParam(1);
  public upZ: MockAudioParam = new MockAudioParam(0);

  setPosition(x: number, y: number, z: number) {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  }
  setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) {
    this.forwardX.value = fx;
    this.forwardY.value = fy;
    this.forwardZ.value = fz;
    this.upX.value = ux;
    this.upY.value = uy;
    this.upZ.value = uz;
  }
}

class MockAudioContext {
  public currentTime: number = 0;
  public state: string = "running";
  public destination: MockAudioNode = new MockAudioNode();
  public listener: MockAudioListener = new MockAudioListener();
  public createdNodes: MockAudioNode[] = [];

  createGain(): MockGainNode {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }

  createPanner(): MockPannerNode {
    const node = new MockPannerNode();
    this.createdNodes.push(node);
    return node;
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }
}

async function runEmpiricalVerification() {
  console.log("==========================================================");
  console.log("CHALLENGER 2: PHASE 3 EMPIRICAL VERIFICATION SUITE");
  console.log("==========================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------
  // SECTION 1: JuiceOverlay Floating Text & Lifecycle Cleanup
  // -------------------------------------------------------------------
  console.log("--- 1. Verifying JuiceOverlay Floating Text & Lifecycle Cleanup ---");
  
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new TargetCamera("testCam", new Vector3(0, 5, -10), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;

  // Force camera matrix update for Vector3.Project
  scene.updateTransformMatrix(true);

  const juice = new JuiceOverlay(scene, 40);
  const textPool = (juice as any).textPool as any[];

  assert(textPool.length === 40, "JuiceOverlay pre-allocates pool of 40 TextBlocks on initialization");
  assert(textPool.every((item) => item.active === false && item.textBlock.isVisible === false), "All 40 pooled items initially inactive and hidden");

  // 1.1 Spawn floating texts
  juice.spawnFloatingText(new Vector3(0, 0, 0), "100", "damage");
  juice.spawnFloatingText(new Vector3(2, 0, 2), "250!", "crit");
  juice.spawnFloatingText(new Vector3(-2, 0, -2), "+50", "heal");

  const activeItems = textPool.filter((item) => item.active);
  assert(activeItems.length === 3, "spawnFloatingText activated 3 items in textPool");

  // Inspect damage item defaults
  const dmgItem = textPool.find((item) => item.active && item.textBlock.text === "100");
  assert(dmgItem !== undefined, "Damage item activated with text '100'");
  if (dmgItem) {
    assert(dmgItem.textBlock.color === "#FFFFFF", "Damage text color is '#FFFFFF'");
    assert(parseInt(dmgItem.textBlock.fontSize.toString(), 10) === 20, "Damage text fontSize is 20px");
    assert(dmgItem.durationMs === 800, "Damage text durationMs is 800ms");
    assert(dmgItem.scalePop === 1.3, "Damage text scalePop is 1.3");
  }

  // Inspect crit item defaults
  const critItem = textPool.find((item) => item.active && item.textBlock.text === "250!");
  assert(critItem !== undefined, "Crit item activated with text '250!'");
  if (critItem) {
    assert(critItem.textBlock.color === "#FFD700", "Crit text color is '#FFD700' (Gold)");
    assert(critItem.textBlock.outlineColor === "#8B0000", "Crit text outlineColor is '#8B0000'");
    assert(parseInt(critItem.textBlock.fontSize.toString(), 10) === 32, "Crit text fontSize is 32px");
    assert(critItem.durationMs === 1100, "Crit text durationMs is 1100ms");
    assert(critItem.scalePop === 1.6, "Crit text scalePop is 1.6");
  }

  // Inspect heal item defaults
  const healItem = textPool.find((item) => item.active && item.textBlock.text === "+50");
  assert(healItem !== undefined, "Heal item activated with text '+50'");
  if (healItem) {
    assert(healItem.textBlock.color === "#32CD32", "Heal text color is '#32CD32' (Green)");
    assert(parseInt(healItem.textBlock.fontSize.toString(), 10) === 22, "Heal text fontSize is 22px");
    assert(healItem.durationMs === 900, "Heal text durationMs is 900ms");
    assert(healItem.scalePop === 1.2, "Heal text scalePop is 1.2");
  }

  // 1.2 Movement & Screen Projection Update Step
  juice.update(0.1); // 100ms
  if (dmgItem) {
    assert(dmgItem.elapsedMs === 100, "elapsedMs updated to 100ms");
    assert(dmgItem.textBlock.left.endsWith("px"), "TextBlock.left calculated and assigned string with 'px'");
    assert(dmgItem.textBlock.top.endsWith("px"), "TextBlock.top calculated and assigned string with 'px'");
    assert(dmgItem.textBlock.scaleX > 1.0, "TextBlock scalePop lerp applied scaleX > 1.0");
  }

  // 1.3 Pool Lifecycle Cleanup on Expiration
  juice.update(1.2); // Advance by 1.2s (1200ms, exceeding max duration 1100ms)
  const remainingActive = textPool.filter((item) => item.active);
  assert(remainingActive.length === 0, "All floating text items deactivated and hidden after durationMs expired");
  assert(textPool.every((item) => item.textBlock.isVisible === false), "All TextBlocks hidden (isVisible=false) for reuse in pool");

  // 1.4 Hit Flash Queue & Freeze Frame
  const testMesh = MeshBuilder.CreateBox("testBox", { size: 1 }, scene);
  const origMat = new StandardMaterial("origMat", scene);
  origMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
  testMesh.material = origMat;

  juice.triggerHitFlash(testMesh, 100);
  assert(origMat.emissiveColor.r === 1.0 && origMat.emissiveColor.g === 1.0 && origMat.emissiveColor.b === 1.0, "triggerHitFlash immediately set material emissiveColor to white (1, 1, 1)");

  // Update loop by 120ms to flush activeFlashes queue
  juice.update(0.12);
  assert(origMat.emissiveColor.r === 0.1 && origMat.emissiveColor.g === 0.1 && origMat.emissiveColor.b === 0.1, "Hit flash restored original emissiveColor (0.1, 0.1, 0.1) after durationMs expired");

  // Trigger hit stop
  juice.triggerHitStop(50);
  assert((juice as any).isHitStopped === true, "triggerHitStop set isHitStopped flag to true and paused render loop");

  await new Promise((res) => setTimeout(res, 80));
  assert((juice as any).isHitStopped === false, "triggerHitStop timer cleared isHitStopped flag and resumed render loop");

  juice.dispose();
  scene.dispose();
  engine.dispose();


  // -------------------------------------------------------------------
  // SECTION 2: AudioManager Web Audio Graph, Sidechain Ducking & Spatial Audio
  // -------------------------------------------------------------------
  console.log("\n--- 2. Verifying AudioManager Web Audio Node Setup & Ducking Math ---");

  const mockAudioCtx = new MockAudioContext();
  (globalThis as any).window.AudioContext = function () {
    return mockAudioCtx;
  };

  const audioMgr = new AudioManager();

  // 2.1 Gain Bus Hierarchy
  const masterGain = (audioMgr as any).masterGain as MockGainNode;
  const musicGain = (audioMgr as any).musicGain as MockGainNode;
  const musicDuckingGain = (audioMgr as any).musicDuckingGain as MockGainNode;
  const sfxGain = (audioMgr as any).sfxGain as MockGainNode;
  const uiGain = (audioMgr as any).uiGain as MockGainNode;

  assert(masterGain !== null, "MasterGainNode created");
  assert(musicGain !== null, "MusicGainNode created");
  assert(musicDuckingGain !== null, "MusicDuckingGainNode created");
  assert(sfxGain !== null, "SFXGainNode created");
  assert(uiGain !== null, "UIGainNode created");

  assert(musicGain.connectedTo.includes(musicDuckingGain), "musicGain connected to musicDuckingGain");
  assert(musicDuckingGain.connectedTo.includes(masterGain), "musicDuckingGain connected to masterGain");
  assert(sfxGain.connectedTo.includes(masterGain), "sfxGain connected to masterGain");
  assert(uiGain.connectedTo.includes(masterGain), "uiGain connected to masterGain");
  assert(masterGain.connectedTo.includes(mockAudioCtx.destination), "masterGain connected to AudioContext destination");

  // 2.2 Volume Clamping & Decibel Math
  const linear0dB = audioMgr.dbToLinear(0);
  const linearMinus6dB = audioMgr.dbToLinear(-6);
  assert(linear0dB === 1.0, "dbToLinear(0) returns 1.0");
  assert(Math.abs(linearMinus6dB - 0.501187) < 0.0001, "dbToLinear(-6) returns ~0.5012");

  audioMgr.setBusVolumeDb("master", -10);
  assert(audioMgr.getBusVolumeDb("master") === -10, "setBusVolumeDb('master', -10) stored -10 dB");
  assert(Math.abs(masterGain.gain.value - audioMgr.dbToLinear(-10)) < 0.0001, "masterGain applied linear gain for -10 dB (~0.3162)");

  // 2.3 Sidechain Ducking Timing Math & Ramps
  mockAudioCtx.currentTime = 10.0;
  audioMgr.triggerSidechainDucking(-10, 300);

  const duckDbTarget = audioMgr.dbToLinear(-10); // 0.31622776601683794
  assert(Math.abs(duckDbTarget - 0.316228) < 0.0001, "Sidechain ducking -10dB target linear gain math is correct (~0.3162)");

  const events = musicDuckingGain.gain.scheduledEvents;
  assert(events.some((e) => e.type === "setTarget" && Math.abs(e.target - duckDbTarget) < 0.0001 && e.timeConstant === 0.015), "triggerSidechainDucking scheduled fast attack setTargetAtTime with timeConstant 0.015 (15ms attack)");

  // Test duck release after duration
  await new Promise((res) => setTimeout(res, 350));
  assert(events.some((e) => e.type === "setTarget" && e.target === 1.0 && e.timeConstant === 0.3), "triggerSidechainDucking scheduled release setTargetAtTime(1.0) with timeConstant 0.3 (300ms release) after duration timeout");

  // 2.4 Spatial Panner Node Parameters & Synthesized Audio
  mockAudioCtx.createdNodes = [];
  const hitPos = new Vector3(10, 2, 15);
  audioMgr.playHitSFX(hitPos, false);

  const pannerNode = mockAudioCtx.createdNodes.find((n) => n instanceof MockPannerNode) as MockPannerNode;
  assert(pannerNode !== undefined, "playHitSFX created spatial PannerNode when 3D position was specified");
  if (pannerNode) {
    assert(pannerNode.panningModel === "HRTF", "PannerNode panningModel is 'HRTF'");
    assert(pannerNode.distanceModel === "inverse", "PannerNode distanceModel is 'inverse'");
    assert(pannerNode.refDistance === 3.0, "PannerNode refDistance is 3.0");
    assert(pannerNode.maxDistance === 50.0, "PannerNode maxDistance is 50.0");
    assert(pannerNode.rolloffFactor === 1.0, "PannerNode rolloffFactor is 1.0");
    assert(pannerNode.positionX.value === 10 && pannerNode.positionY.value === 2 && pannerNode.positionZ.value === 15, "PannerNode positionX/Y/Z correctly set to (10, 2, 15)");
    assert(pannerNode.connectedTo.includes(sfxGain), "PannerNode output connected to sfxGain");
  }

  // 2.5 Listener Update
  const cameraPos = new Vector3(3, 4, 5);
  audioMgr.updateListener(cameraPos);
  assert(mockAudioCtx.listener.positionX.value === 3 && mockAudioCtx.listener.positionY.value === 4 && mockAudioCtx.listener.positionZ.value === 5, "updateListener updated AudioListener 3D position to camera position (3, 4, 5)");

  audioMgr.dispose();

  console.log(`\n=== EMPIRICAL TEST RESULT: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
}

runEmpiricalVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
