import { StatType } from "../src/entities/components/StatsComponent";
import { ArchetypeManager } from "../src/combat/Archetypes";
import { TalentTree } from "../src/combat/TalentTree";
import { SeismicSlamSkill, HolyBeaconSkill, ArcaneNovaSkill, WhirlwindSkill } from "../src/combat/Skill";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("=== RUNNING PHASE 4 EMPIRICAL INTEGRITY TESTS ===");

// 1. Archetype Unlock Levels
assert(ArchetypeManager.isArchetypeUnlocked("tank", 1) === true, "Tank unlocked at level 1");
assert(ArchetypeManager.isArchetypeUnlocked("healer", 1) === false, "Healer locked at level 1");
assert(ArchetypeManager.isArchetypeUnlocked("healer", 10) === true, "Healer unlocked at level 10");
assert(ArchetypeManager.isArchetypeUnlocked("mage", 19) === false, "Mage locked at level 19");
assert(ArchetypeManager.isArchetypeUnlocked("mage", 20) === true, "Mage unlocked at level 20");
assert(ArchetypeManager.isArchetypeUnlocked("physical_dps", 29) === false, "Physical DPS locked at level 29");
assert(ArchetypeManager.isArchetypeUnlocked("physical_dps", 30) === true, "Physical DPS unlocked at level 30");

// 2. Base Stats & Passive Modifiers
const tankArch = ArchetypeManager.getArchetype("tank");
assert(tankArch.baseStats[StatType.MaxHp] === 180, "Tank base MaxHp is 180");
assert(tankArch.baseStats[StatType.Armor] === 25, "Tank base Armor is 25");

const healerArch = ArchetypeManager.getArchetype("healer");
assert(healerArch.baseStats[StatType.MaxMana] === 160, "Healer base MaxMana is 160");

// 3. Signature Skill Math Checks
const slam = new SeismicSlamSkill();
assert(slam.def.id === "seismic_slam", "Seismic Slam ID correct");
assert(slam.def.manaCost === 25, "Seismic Slam mana cost 25");
assert(slam.def.baseCooldown === 6.0, "Seismic Slam base CD 6.0s");

const beacon = new HolyBeaconSkill();
assert(beacon.def.id === "holy_beacon", "Holy Beacon ID correct");
assert(beacon.def.manaCost === 35, "Holy Beacon mana cost 35");

const nova = new ArcaneNovaSkill();
assert(nova.def.id === "arcane_nova", "Arcane Nova ID correct");
assert(nova.def.multiplier === 2.2, "Arcane Nova multiplier 2.2");

const whirlwind = new WhirlwindSkill();
assert(whirlwind.def.id === "whirlwind", "Whirlwind ID correct");
assert(whirlwind.def.duration === 2.5, "Whirlwind duration 2.5s");

// 4. Talent Tree Logic Checks
const mockStatsComponent = {
  modifiers: [] as any[],
  addModifier(mod: any) { this.modifiers.push(mod); },
  removeModifiersBySource(source: string) {
    this.modifiers = this.modifiers.filter(m => m.source !== source);
  }
} as any;

const tree = new TalentTree(mockStatsComponent, "tank");
assert(tree.getTotalTalentPoints() === 0, "Level 1 has 0 talent points");

tree.setPlayerLevel(10); // 9 talent points available
assert(tree.getTotalTalentPoints() === 9, "Level 10 has 9 talent points");

// Allocate active node (cost 1)
assert(tree.canAllocateNode("tank_active").canAllocate === true, "Can allocate tank active");
assert(tree.allocateNode("tank_active") === true, "Allocated tank active");
assert(tree.getUnallocatedTalentPoints() === 8, "Unallocated points now 8");
assert(tree.isSignatureSkillUnlocked("tank") === true, "Tank signature skill unlocked");

// Try allocate tier 1 node with prerequisite met
assert(tree.canAllocateNode("tank_passive_1").canAllocate === true, "Can allocate tank passive 1 (prereq tank_active met)");
assert(tree.allocateNode("tank_passive_1") === true, "Allocated tank passive 1 rank 1");
assert(tree.getNodeRank("tank_passive_1") === 1, "Rank of tank_passive_1 is 1");

// Try allocate tier 2 node without prerequisite maxed
assert(tree.canAllocateNode("tank_passive_3").canAllocate === false, "Cannot allocate tank_passive_3 (prereq tank_passive_1 not maxed)");

// Max rank tank_passive_1 (max rank 3)
tree.allocateNode("tank_passive_1");
tree.allocateNode("tank_passive_1");
assert(tree.getNodeRank("tank_passive_1") === 3, "Rank of tank_passive_1 is 3 (maxed)");

// Now tier 2 node can be allocated since prereq is maxed AND we have remaining points (5 unallocated)
assert(tree.canAllocateNode("tank_passive_3").canAllocate === true, "Can now allocate tank_passive_3");
assert(tree.allocateNode("tank_passive_3") === true, "Allocated tank_passive_3");

// Test Respec / Reset
const spentBeforeReset = tree.getSpentTalentPoints("tank");
assert(spentBeforeReset === 5, "Spent 5 talent points so far");
const refunded = tree.resetTalents("tank");
assert(refunded === 5, "Refunded 5 talent points on reset");
assert(tree.getUnallocatedTalentPoints() === 9, "Unallocated points back to 9 after reset");
assert(tree.getNodeRank("tank_active") === 0, "Tank active rank reset to 0");

console.log("=== ALL PHASE 4 EMPIRICAL INTEGRITY TESTS PASSED SUCCESSFULLY ===");
