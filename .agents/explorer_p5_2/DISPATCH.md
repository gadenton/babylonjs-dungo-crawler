## 2026-08-05T20:57:15Z
<USER_REQUEST>
Read ORIGINAL_REQUEST.md at c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md and PROJECT.md at c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md.
Also read skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ui-ux\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\save-systems\SKILL.md

Your working directory is c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_2.

Investigate Phase 5 (Auto-Loot Physics, 3D Drop Meshes & Stat Modifiers):
1. Explore 3D world item drop representation:
   - Spawning visual GLB items/props (from public/assets/props/ or public/assets/weapons/) on enemy death with floating rarity text / glow rings.
   - Proximity magnet motion when player comes within 3 units.
   - Instant stat modification / health restoration when picking up globes/gold.
2. Explore equipment stat modifiers:
   - Equipping weapons/armor applies `StatModifier` to `StatsComponent` (`base + flat + percent`).
   - Unequipping removes modifiers cleanly without stat drift.
3. Check build and testing setup for inventory & loot unit tests.

Write your findings and implementation roadmap in c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_2\handoff.md.
</USER_REQUEST>
