import { runDungeonGenTest } from "./dungeon_gen.test";
import { runPlayerModelTest } from "./player_model.test";
import { runTownHubTest } from "./town_hub.test";
import { runSaveLoadTransitionTest } from "./save_load_transition.test";

async function main() {
  console.log("===============================================");
  console.log("       RUNNING GAME ENGINE TEST SUITE          ");
  console.log("===============================================");

  const results = [
    await runDungeonGenTest(),
    await runPlayerModelTest(),
    await runTownHubTest(),
    await runSaveLoadTransitionTest(),
  ];

  const allPassed = results.every(res => res === true);

  console.log("\n===============================================");
  if (allPassed) {
    console.log("  ALL TESTS PASSED SUCCESSFULLY! ✅");
    console.log("===============================================");
    process.exit(0);
  } else {
    console.error("  SOME TESTS FAILED! ❌");
    console.log("===============================================");
    process.exit(1);
  }
}

main();
