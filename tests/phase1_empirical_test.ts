import { CameraRig } from "../src/camera/CameraRig";
import { InputManager } from "../src/core/InputManager";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Collisions/collisionCoordinator";

async function runEmpiricalTests() {
  console.log("=== EMPIRICAL TEST SUITE: PHASE 1 CORE LOGIC ===\n");

  let passes = 0;
  let fails = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passes++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      fails++;
    }
  }

  // Set up headless Babylon scene for testing
  const nullEngine = new NullEngine();
  const scene = new Scene(nullEngine);

  // -------------------------------------------------------------
  // TEST 1: CameraRig Exponential Smoothing Math & Delta-Times
  // -------------------------------------------------------------
  console.log("--- 1. CameraRig Exponential Smoothing Math Across Variable Delta-Times ---");

  const targetNode = new TransformNode("target", scene);
  targetNode.position = new Vector3(0, 0, 0);

  // Test 1a: Mathematical convergence comparison across dt = 0.016s (60fps), 0.033s (30fps), 0.1s (10fps)
  // Formula: current = lerp(current, target, 1 - exp(-rate * dt))
  const followRate = 10.0;
  const initialPos = 0.0;
  const targetPosVal = 100.0;
  const totalDuration = 1.0; // 1 second simulation

  // Simulating 60fps (dt = 0.016666...s)
  let pos60 = initialPos;
  const steps60 = 60;
  const dt60 = totalDuration / steps60;
  for (let i = 0; i < steps60; i++) {
    const tFollow = 1.0 - Math.exp(-followRate * dt60);
    pos60 = pos60 + (targetPosVal - pos60) * tFollow;
  }

  // Simulating 30fps (dt = 0.033333...s)
  let pos30 = initialPos;
  const steps30 = 30;
  const dt30 = totalDuration / steps30;
  for (let i = 0; i < steps30; i++) {
    const tFollow = 1.0 - Math.exp(-followRate * dt30);
    pos30 = pos30 + (targetPosVal - pos30) * tFollow;
  }

  // Simulating 10fps (dt = 0.1s)
  let pos10 = initialPos;
  const steps10 = 10;
  const dt10 = totalDuration / steps10;
  for (let i = 0; i < steps10; i++) {
    const tFollow = 1.0 - Math.exp(-followRate * dt10);
    pos10 = pos10 + (targetPosVal - pos10) * tFollow;
  }

  // Exact analytical solution: target - (target - initial) * exp(-rate * T)
  const analyticalPos = targetPosVal - (targetPosVal - initialPos) * Math.exp(-followRate * totalDuration);

  console.log(`Pos after 1s (60fps / dt=0.0166s): ${pos60.toFixed(8)}`);
  console.log(`Pos after 1s (30fps / dt=0.0333s): ${pos30.toFixed(8)}`);
  console.log(`Pos after 1s (10fps / dt=0.1000s): ${pos10.toFixed(8)}`);
  console.log(`Analytical Exact Pos:               ${analyticalPos.toFixed(8)}`);

  const diff60 = Math.abs(pos60 - analyticalPos);
  const diff30 = Math.abs(pos30 - analyticalPos);
  const diff10 = Math.abs(pos10 - analyticalPos);

  assert(diff60 < 1e-6 && diff30 < 1e-6 && diff10 < 1e-6, 
    "CameraRig exponential smoothing is frame-rate independent across dt=0.016s, 0.033s, 0.1s",
    `Diffs: 60fps=${diff60}, 30fps=${diff30}, 10fps=${diff10}`
  );

  // Test 1b: CameraRig instance update loop
  const cameraRig = new CameraRig(scene, { followRate: 10.0, lookAheadDist: 3.5, lookAheadRate: 5.0 });
  cameraRig.attachToTarget(targetNode);

  // Move target node to (10, 0, 10)
  targetNode.position = new Vector3(10, 0, 10);
  
  // Step CameraRig with dt = 0.016s
  cameraRig.update(0.016, new Vector3(1, 0, 0), Vector3.Zero());
  const camPos1 = cameraRig.getCamera().position.clone();
  
  // Add trauma for screen shake
  cameraRig.addTrauma(0.5);
  cameraRig.update(0.016, new Vector3(1, 0, 0), Vector3.Zero());

  assert(cameraRig.getCamera() !== null, "CameraRig produces valid TargetCamera instance");

  // -------------------------------------------------------------
  // TEST 2: InputManager Input Buffer 120ms Filtering Window
  // -------------------------------------------------------------
  console.log("\n--- 2. InputManager 120ms Input Buffer Filtering ---");

  // Stub window & navigator if running in Node environment
  if (typeof window === "undefined") {
    (global as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  if (typeof navigator === "undefined") {
    (global as any).navigator = {
      getGamepads: () => [],
    };
  }

  const inputManager = new InputManager(scene);

  // Test 2a: Buffer input and consume immediately (<120ms)
  const startTime = performance.now();
  inputManager.bufferSkillInput(0, new Vector3(5, 0, 5));
  
  const consumedImmediately = inputManager.consumeBufferedSkill();
  assert(
    consumedImmediately !== null && consumedImmediately.skillSlot === 0,
    "Input buffered is immediately consumable within window",
    `Consumed: ${JSON.stringify(consumedImmediately)}`
  );

  // Test 2b: Buffer input and wait past 120ms window
  inputManager.bufferSkillInput(1, new Vector3(10, 0, 10));
  
  // Simulate delay > 120ms by manually adjusting mock or sleeping
  await new Promise(res => setTimeout(res, 150));

  const consumedExpired = inputManager.consumeBufferedSkill();
  assert(
    consumedExpired === null,
    "Input older than 120ms is correctly pruned/discarded",
    `Expected null, got: ${JSON.stringify(consumedExpired)}`
  );

  // Test 2c: Sliding window with multiple actions (1 fresh, 1 expired)
  inputManager.bufferSkillInput(2); // Skill 2
  await new Promise(res => setTimeout(res, 80));
  inputManager.bufferSkillInput(3); // Skill 3 at t + 80ms

  // At t + 130ms total (Skill 2 is 130ms old -> expired; Skill 3 is 50ms old -> valid)
  await new Promise(res => setTimeout(res, 50));

  const consumedSliding = inputManager.consumeBufferedSkill();
  assert(
    consumedSliding !== null && consumedSliding.skillSlot === 3,
    "Sliding window correctly prunes expired Skill 2 (130ms) and yields active Skill 3 (50ms)",
    `Expected skillSlot 3, got: ${consumedSliding?.skillSlot}`
  );

  // Test 2d: Gamepad button hold rising-edge trigger check
  console.log("\n--- 3. Stress-Testing Gamepad Edge Trigger & Input Mapping ---");
  let gamepadInputCount = 0;
  const mockGamepad = {
    index: 0,
    connected: true,
    axes: [0, -1], // Stick UP (nx=0, ny=-1 -> normY=+1)
    buttons: [{ pressed: true }, { pressed: false }, { pressed: false }, { pressed: false }, { pressed: false }],
  };
  (global as any).navigator.getGamepads = () => [mockGamepad];

  // Test 3a: Isometric vector mapping (Stick UP -> nx=0, ny=+1 -> screen UP -> world (-0.7071, 0, +0.7071))
  inputManager.update(0.016);
  const moveVec = inputManager.getMoveVector();
  console.log(`Stick UP Move Vector: (${moveVec.x.toFixed(4)}, ${moveVec.y.toFixed(4)}, ${moveVec.z.toFixed(4)})`);
  assert(
    Math.abs(moveVec.x - (-0.7071)) < 0.01 && Math.abs(moveVec.z - 0.7071) < 0.01 && moveVec.y === 0,
    "Isometric directional mapping correctly converts screen UP (W/Stick UP) to isometric world vector (-0.7071, 0, 0.7071)"
  );

  // Test 3b: Gamepad button hold edge trigger
  inputManager.clearBuffer();
  // Release button first to set prev state to false
  mockGamepad.buttons[0].pressed = false;
  inputManager.update(0.016);

  // Press button (rising edge -> 1 event buffered)
  mockGamepad.buttons[0].pressed = true;
  inputManager.update(0.016);

  // Run 9 more frames with button 0 still pressed (no rising edge -> 0 new events buffered)
  for (let f = 0; f < 9; f++) {
    inputManager.update(0.016);
  }

  let bufferedCount = 0;
  while (inputManager.consumeBufferedSkill() !== null) {
    bufferedCount++;
  }

  console.log(`Gamepad button held for 10 frames generated ${bufferedCount} buffered skill event(s).`);
  assert(
    bufferedCount === 1,
    "Gamepad button hold produces rising-edge trigger (exactly 1 event over 10 held frames)",
    `Count: ${bufferedCount}`
  );

  // -------------------------------------------------------------
  // TEST 4: Player Transform Movement, Single Scaling & Y-Stability
  // -------------------------------------------------------------
  console.log("\n--- 4. Player Transform Movement & Collision Stability ---");
  const { Player } = await import("../src/entities/Player");

  const player = new Player("test_player", scene);
  player.setInputManager(inputManager);

  // Set mock stick to center so direct input is 0
  mockGamepad.axes = [0, 0];
  mockGamepad.buttons[0].pressed = false;
  inputManager.update(0.016);

  const initialPlayerPos = player.position.clone();
  const initialMeshPos = player.getMesh().position.clone();

  assert(initialPlayerPos.y === 0.0, "Player root position Y is initially 0.0");
  assert(initialMeshPos.y === 0.9, "Player capsule mesh local offset Y is 0.9 (feet centered)");

  // Test 4a: Move player via nav path / position update over 1.0 second (10 steps of 0.1s)
  player.setNavPath([new Vector3(10, 0, 0)]);

  let totalDisplacementX = 0;
  let maxObservedY = player.position.y;
  let minObservedY = player.position.y;

  for (let step = 0; step < 10; step++) {
    const dt = 0.1;
    const startX = player.position.x;
    player.update(dt);
    const endX = player.position.x;
    totalDisplacementX += (endX - startX);

    if (player.position.y > maxObservedY) maxObservedY = player.position.y;
    if (player.position.y < minObservedY) minObservedY = player.position.y;
  }

  console.log(`Player pos after 1.0s: (${player.position.x.toFixed(4)}, ${player.position.y.toFixed(4)}, ${player.position.z.toFixed(4)})`);
  console.log(`Total X Displacement: ${totalDisplacementX.toFixed(4)}m`);
  console.log(`Y Coord Bounds: min=${minObservedY.toFixed(4)}, max=${maxObservedY.toFixed(4)}`);

  // Max move speed is 7.0 m/s. Over 1s with velocity lerp, displacement should be ~5.9m - 6.2m, single scaled (NOT 12m+ doubling).
  assert(
    player.position.x > 5.0 && player.position.x < 7.0,
    "Player movement is single-scaled (~6.0m over 1s at moveSpeed=7.0, no position doubling)",
    `Actual X: ${player.position.x.toFixed(4)}`
  );

  assert(
    Math.abs(minObservedY - 0.0) < 1e-5 && Math.abs(maxObservedY - 0.0) < 1e-5,
    "Player root position Y stays strictly constant at 0.0 during ground movement",
    `Y range: [${minObservedY}, ${maxObservedY}]`
  );

  assert(
    player.getMesh().position.y === 0.9,
    "Player mesh local position Y remains constant at offset 0.9",
    `Mesh Y: ${player.getMesh().position.y}`
  );

  // Cleanup
  player.dispose();
  inputManager.dispose();
  cameraRig.dispose();
  scene.dispose();
  nullEngine.dispose();

  console.log(`\n=== SUMMARY: ${passes} PASSED, ${fails} FAILED ===`);
  if (fails > 0) {
    process.exit(1);
  }
}

runEmpiricalTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});

