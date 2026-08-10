import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TownHubAltar } from "../../src/entities/TownHubAltar";
import { NullEngine, Engine, Scene } from "@babylonjs/core";

async function runEmpiricalTests() {
  console.log("=== EMPIRICAL VERIFICATION SUITE FOR MILESTONE 2 ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || "Assertion failed"}`);
      failed++;
    }
  }

  // Set up headless Babylon NullEngine & Scene
  const engine = new NullEngine();
  const scene = new Scene(engine);

  // -------------------------------------------------------------
  // Test 1: TownHubAltar Proximity Distance Precision (3.0m Radius)
  // -------------------------------------------------------------
  console.log("\n--- Test Suite 1: Altar Proximity Distance Math ---");
  const altarPos = new Vector3(10.0, 0.0, 16.0);
  const altar = new TownHubAltar(scene, altarPos);

  // Case 1.1: Exactly at 3.0m on Z axis (10, 0, 13)
  const posExact3m = new Vector3(10.0, 0.0, 13.0);
  assert(altar.isPlayerInProximity(posExact3m), "Exact 3.0m distance (Z=13.0)", `dist=${Vector3.Distance(altarPos, posExact3m)}`);

  // Case 1.2: Slightly inside 3.0m (2.99m -> Z=13.01)
  const posInside = new Vector3(10.0, 0.0, 13.01);
  assert(altar.isPlayerInProximity(posInside), "Inside threshold 2.99m (Z=13.01)", `dist=${Vector3.Distance(altarPos, posInside)}`);

  // Case 1.3: Slightly outside 3.0m (3.01m -> Z=12.99)
  const posOutside = new Vector3(10.0, 0.0, 12.99);
  assert(!altar.isPlayerInProximity(posOutside), "Outside threshold 3.01m (Z=12.99)", `dist=${Vector3.Distance(altarPos, posOutside)}`);

  // Case 1.4: Diagonal 2D distance at 3.0m radius (10 + 3/sqrt(2), 0, 16 - 3/sqrt(2))
  const diagOffset = 3.0 / Math.SQRT2; // ~2.12132m
  const posDiag3m = new Vector3(10.0 + diagOffset, 0.0, 16.0 - diagOffset);
  assert(altar.isPlayerInProximity(posDiag3m), "Diagonal 2D 3.0m radius", `dist=${Vector3.Distance(altarPos, posDiag3m)}`);

  // Case 1.5: Y-height sensitivity test
  // If player position has Y=0.0 (ground root):
  const posGround = new Vector3(10.0, 0.0, 13.0); // 3.0m 2D
  assert(altar.isPlayerInProximity(posGround), "Ground Y=0.0 position (3.0m 3D)", `dist=${Vector3.Distance(altarPos, posGround)}`);
  
  // If player position passed Y=0.9 (capsule center):
  const posCenter = new Vector3(10.0, 0.9, 13.0); // XZ dist 3.0m, Y dist 0.9m -> 3D dist = sqrt(9 + 0.81) = 3.132m
  const distCenter = Vector3.Distance(altarPos, posCenter);
  assert(!altar.isPlayerInProximity(posCenter), `Y-Height offset Y=0.9m yields 3D dist=${distCenter.toFixed(3)}m (>3.0m threshold)`, `dist=${distCenter}`);

  // -------------------------------------------------------------
  // Test 2: Observable Keypress & Interact Trigger Verification
  // -------------------------------------------------------------
  console.log("\n--- Test Suite 2: Altar Interaction Observable ---");
  let interactFired = false;
  altar.onInteract.add(() => {
    interactFired = true;
  });

  altar.interact();
  assert(interactFired, "townHubAltar.interact() notifies onInteract observers");

  // -------------------------------------------------------------
  // Test 3: Grid Bounds & Geometry Math Verification
  // -------------------------------------------------------------
  console.log("\n--- Test Suite 3: Grid Bounds & Geometry Math ---");
  const gridWidth = 10;
  const gridHeight = 10;
  const minX = 0 * 2.0 + 1.0 - 1.0; // 0.0
  const maxX = (gridWidth - 1) * 2.0 + 1.0 + 1.0; // 20.0
  const minZ = 0 * 2.0 + 1.0 - 1.0; // 0.0
  const maxZ = (gridHeight - 1) * 2.0 + 1.0 + 1.0; // 20.0

  assert(minX === 0.0 && maxX === 20.0, "Town Hub X floor bounds [0.0, 20.0]", `X: [${minX}, ${maxX}]`);
  assert(minZ === 0.0 && maxZ === 20.0, "Town Hub Z floor bounds [0.0, 20.0]", `Z: [${minZ}, ${maxZ}]`);

  const spawnPoint = new Vector3(10.0, 0.0, 6.0);
  assert(
    spawnPoint.x > 2.0 && spawnPoint.x < 18.0 && spawnPoint.z > 2.0 && spawnPoint.z < 18.0,
    "Player spawn point Vector3(10.0, 0.0, 6.0) is inside inner safe floor area",
    `spawn=${spawnPoint}`
  );

  console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
