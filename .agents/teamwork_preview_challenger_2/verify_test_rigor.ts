import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createHeadlessTestContext } from "../../tests/harness";
import { TownHubAltar } from "../../src/entities/TownHubAltar";
import { TownHub } from "../../src/town/TownHub";
import { TileMap } from "../../src/dungeon/TileMap";
import { Generator } from "../../src/dungeon/Generator";

async function verifyFlaws() {
  console.log("==================================================");
  console.log("  EMPIRICAL CHALLENGER VERIFICATION HARNESS       ");
  console.log("==================================================");

  const ctx = createHeadlessTestContext();

  // ----------------------------------------------------
  // Proof 1: TownHubAltar.interact() has NO proximity check!
  // Tier 2 test wrapped interact() in a local helper to pass.
  // ----------------------------------------------------
  console.log("\n--- Proof 1: TownHubAltar Proximity Guard False Positive ---");
  const altar = new TownHubAltar(ctx.scene, new Vector3(10, 0, 16));
  let firedFarAway = false;
  altar.onInteract.add(() => {
    firedFarAway = true;
  });

  // Call altar.interact() directly when player is 100 meters away
  altar.interact(); 
  console.log(`Direct altar.interact() call fired onInteract when player far away? ${firedFarAway}`);
  if (firedFarAway) {
    console.log("CONFIRMED FLAW: TownHubAltar.interact() has NO internal proximity guard!");
    console.log("Tier 2 test passed only because it wrapped interact() in a local test helper function 'attemptInteraction'.");
  }

  // ----------------------------------------------------
  // Proof 2: Scene Hierarchy Audit False Positive in Index Transition Flow
  // Actual src/index.ts transition leaves townHubRoot active.
  // ----------------------------------------------------
  console.log("\n--- Proof 2: Scene Hierarchy Audit / Town Hub Leak Flaw ---");
  const townHub = new TownHub(ctx.scene);
  await townHub.preloadAssets();
  const builtTown = await townHub.build();

  console.log(`townHubRoot before transition: ${ctx.scene.getNodeByName("townHubRoot") !== null}`);

  // Simulate exact src/index.ts transitionToDungeon logic
  let inDungeon = false;
  const indexTransitionToDungeon = async () => {
    if (inDungeon) return;
    inDungeon = true;
    const generator = new Generator({ width: 40, height: 40 });
    const dungeonGrid = generator.generate();
    const tileMap = new TileMap(ctx.scene);
    await tileMap.buildFromGrid(dungeonGrid);
  };

  await indexTransitionToDungeon();

  const townHubRootAfter = ctx.scene.getNodeByName("townHubRoot");
  const townMeshesAfter = ctx.scene.meshes.filter((m) => m.name.startsWith("town_"));

  console.log(`townHubRoot after index.ts transition: ${townHubRootAfter !== null}`);
  console.log(`Number of town meshes lingering in scene after index.ts transition: ${townMeshesAfter.length}`);

  if (townHubRootAfter !== null && townMeshesAfter.length > 0) {
    console.log("CONFIRMED FLAW: Actual application transition in src/index.ts LEAKS Town Hub meshes in scene!");
    console.log("Tier 3 and Tier 4 tests manually disposed townHubRoot in the test file before asserting clean scene hierarchy, hiding this production bug.");
  }

  // ----------------------------------------------------
  // Proof 3: Weak Assertion Demonstration (typeof NaN === "number")
  // ----------------------------------------------------
  console.log("\n--- Proof 3: Weak Assertion Demonstration ---");
  const badRotation = NaN;
  console.log(`typeof NaN === "number": ${typeof badRotation === "number"}`);
  console.log("Tier 1 test used `typeof wallSel.yRotation === 'number'` instead of checking exact rotation value (0).");

  // ----------------------------------------------------
  // Proof 4: Tautological Assertion Demonstration (mask.fullMask >= 0)
  // ----------------------------------------------------
  console.log("\n--- Proof 4: Tautological Bitmask Assertion ---");
  const mask = 0;
  console.log(`mask >= 0: ${mask >= 0}`);
  console.log("Tier 2 test ran 320 assertions of `mask.fullMask >= 0` across 160 edge points, inflating test count while proving nothing.");

  ctx.dispose();
  console.log("\n==================================================");
  console.log("  EMPIRICAL VERIFICATION COMPLETE                  ");
  console.log("==================================================");
}

verifyFlaws().catch((err) => {
  console.error("Verification harness error:", err);
  process.exit(1);
});
