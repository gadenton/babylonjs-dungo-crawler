## 2026-08-06T02:57:15Z
Read ORIGINAL_REQUEST.md at c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md and PROJECT.md at c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md.
Also read skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ui-ux\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\save-systems\SKILL.md

Your working directory is c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_1.

Investigate Phase 5 (Loot System, Proximity Auto-Pickup & Weighted Inventory):
1. Analyze existing codebase (src/entities/Entity.ts, Player.ts, Enemy.ts, DamageSystem.ts, HUD.ts).
2. Detail how to implement `src/entities/components/InventoryComponent.ts`:
   - Item data structures (Item, EquipmentSlot, Rarity tiers: Common, Magic, Rare, Legendary).
   - Drop tables per enemy type / boss.
   - Proximity auto-pickup logic: 3-unit radius for Gold and Health/Mana globes.
   - Weighted Inventory (Option D1): 1x (Small/Consumables), 2x (Medium/Armor), 3x (Large/Two-handed weapons) slot weight cost badges.
3. Detail how to implement `src/ui/InventoryUI.ts` using @babylonjs/gui: uniform grid UI, drag/equip/drop/use interactions, weight capacity indicators, keyboard/gamepad focus navigation.
4. Detail HUD integration (`src/ui/HUD.ts`) for health/mana globes, active hotbar/cooldowns, gold counter, dynamic KBM/Gamepad prompt hints.

Write your findings and implementation roadmap in c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_1\handoff.md.
