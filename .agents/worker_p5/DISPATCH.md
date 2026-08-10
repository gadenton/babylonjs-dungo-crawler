## 2026-08-05T20:58:14Z
Read ORIGINAL_REQUEST.md at c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md and PROJECT.md at c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md.
Also read Explorer findings in:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_1\handoff.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_2\handoff.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p5_3\handoff.md

Apply skills:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ui-ux\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\save-systems\SKILL.md

Your working directory is c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p5.

Implement Phase 5 (Loot System, Proximity Auto-Pickup & Weighted Inventory):
1. Create `src/entities/components/InventoryComponent.ts`:
   - Item types (Rarity: Common, Magic, Rare, Legendary; EquipmentSlot: MainHand, OffHand, Head, Chest, Legs; ItemCategory: Equipment, Consumable, Gold, Globe).
   - Weighted capacity management (30 weight capacity max, items have 1x, 2x, or 3x weight badges).
   - Equip/unequip methods attaching/removing StatModifiers on StatsComponent without stat drift.
2. Create `src/entities/LootDrop.ts`:
   - 3D visual drop on ground with rarity glow ring and idle sin-wave rotation/bobbing.
   - Proximity auto-pickup vacuum algorithm (3.0 unit radius magnet pulling item towards player).
   - Instant resource pickup handling (+Gold, +25% HP/MP globes).
   - Enemy drop table generation on enemy death in `Enemy.ts`.
3. Create `src/ui/InventoryUI.ts` using @babylonjs/gui:
   - Gold border modal with Equipment Paperdoll slots + 5x4 Inventory Grid.
   - 1x, 2x, 3x weight badges on item slots & total weight capacity gauge.
   - Stat tooltip card showing item stats & rarity header.
   - Full keyboard / gamepad focus navigation.
4. Update `src/ui/HUD.ts` and `src/core/InputManager.ts`:
   - Inventory toggle button (`I` key / Gamepad Select button) with `InputManager.setModalOpen("inventory_ui", isOpen)`.
   - Gold counter, health/mana globes, pickup toast notification stack.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run `pnpm exec tsc --noEmit` and `pnpm run build` to verify 0 build errors.
Write your implementation report in c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\worker_p5\handoff.md.
