# Phase 5 Investigation & Implementation Handoff: GUI Layout, Weighted Capacity & HUD Integration

## 1. Observation

Direct observations from examining the codebase, skills, and existing UI implementations (`src/ui/HUD.ts`, `src/ui/TalentUI.ts`, `src/ui/ArchetypeUI.ts`, `src/core/InputManager.ts`, `src/entities/Player.ts`, `src/index.ts`):

1. **Existing UI Architecture (`@babylonjs/gui`)**:
   - `HUD.ts` (lines 57–286): Creates fullscreen `AdvancedDynamicTexture.CreateFullscreenUI("HUDOverlay", true, scene)`. Contains Top-Left player status bar (`statusRect`), Bottom skill hotbar (`hotbarRect`), Top-Right Talent button (`talentButton`), and Center-Bottom interaction banner (`interactionBanner`). Uses event-driven observers on `player.stats` (`onHealthChanged`, `onManaChanged`, `onStatChanged`) and `player` (`onLevelUp`, `onArchetypeSwapped`).
   - `TalentUI.ts` (lines 58–253): Implements a modal overlay (`Rectangle` modal root, `900px` x `620px`) with header bar, tab grid, body grid (node tree vs tooltip card), and footer bar. Manages modal visibility with `InputManager.setModalOpen("talent_ui", isOpen)`. Subscribes to device changes via `inputManager.onActiveDeviceChanged`.
   - `ArchetypeUI.ts` (lines 40–118): Implements an altar modal overlay (`940px` x `560px`) with class cards grid. Uses `inputManager.setModalOpen("archetype_ui", isOpen)`.
2. **Input & Modal Blocking (`InputManager.ts`)**:
   - `InputManager.ts` (lines 38–64): Tracks `openModals: Set<string>`. `isUIModalOpen` returns true when modals are open. Pointer down listener (line 128) checks `isUIModalOpen` to suppress world movement clicks.
   - Keybindings (lines 102–109): Skill slots `1–4` mapped to `Digit1–Digit4` and `Space` for dodge. `index.ts` (lines 78–89) listens for global `KeyT` (Talent UI), `KeyE`/`KeyF` (Altar), and `Escape` (Close modals).
3. **Player & Stat System (`Player.ts` & `StatsComponent.ts`)**:
   - `Player.ts` (lines 67–75): Possesses `StatsComponent` and `HealthComponent`. Handles leveling (`gainXp`, `getRequiredXpForNextLevel`) and archetype swapping.
   - `StatsComponent.ts`: Supports decoupled modifier stack (`base + flat + percent`) with `addModifier` and `removeModifier`.
4. **Skill Guidelines**:
   - `game-ui-ux/SKILL.md`: Recommends anchor-based containers, event-driven HUD updates, screen state stack, explicit gamepad/keyboard focus navigation, and prompt swapping.
   - `rpg/SKILL.md`: Mandates derived stat recomputation when equipping gear (pushing/popping modifiers on `StatsComponent`), explicit rarity tiers, and inventory weight cost badges.

---

## 2. Logic Chain

From these observations, we derive the technical requirements and architecture for Phase 5 GUI & HUD integration:

### 2.1 `@babylonjs/gui` Layout for Weighted Inventory UI (`InventoryUI.ts`)

1. **Modal Overlay Container**:
   - Fullscreen UI: `AdvancedDynamicTexture.CreateFullscreenUI("InventoryUIOverlay", true, scene)`
   - Root Panel: `Rectangle` (`inventoryModalRoot`), dimensions `960px` x `640px`, background `rgba(10, 14, 23, 0.95)`, border `#DAA520` (Gold), thickness `3`, cornerRadius `12`, center-aligned.
   - Header Bar (`60px`): Title `"INVENTORY & EQUIPMENT"`, current weight capacity indicator, and close button `[X]`.
   - Main Body Split (`520px` height) into 3 columns using `@babylonjs/gui` `Grid`:
     - **Left Column (28% / ~260px) — Paperdoll Equipment Slots**: Humanoid layout for 6 slots (`Head`, `Chest`, `MainHand`, `OffHand`, `Ring`, `Amulet`).
     - **Center Column (48% / ~450px) — Inventory Bag Grid**: 5x4 uniform grid (20 slots) displaying stored items with explicit `1x`, `2x`, `3x` weight badges.
     - **Right Column (24% / ~230px) — Tooltip Popup Card**: Detailed stats, rarity color coding, weight cost, and hotkey instructions for selected/hovered item.
   - Footer Bar (`50px`): Device prompt label (`KBM: [Click] Select  [Right-Click] Drop | Gamepad: [D-Pad] Nav  (A) Equip  (X) Drop  [Select/Esc] Close`).

2. **Weight Capacity Bar ("Total capacity vs current used weight bar")**:
   - Placed in top header or above inventory grid.
   - Structure: `Rectangle` container (`width: "100%"`, `height: "22px"`, background `rgba(30,30,40,0.8)`).
   - Inner Fill `Rectangle`: `width: "${(usedWeight / maxWeight * 100).toFixed(1)}%"`, alignment `LEFT`.
   - Dynamic Color Coding:
     - Emerald Green (`#10B981`) when weight < 70%
     - Amber (`#F59E0B`) when weight 70%–90%
     - Crimson Red (`#EF4444`) when weight > 90% or full
   - Text Overlay: `TextBlock` displaying `"Weight: 14 / 30 kg"` (or `14 / 30 Capacity`).

3. **Inventory Grid & Weight Badges (`1x`, `2x`, `3x`)**:
   - Uniform slot boxes (`68px` x `68px`).
   - Rarity Color Borders:
     - Common: `#9CA3AF` (Silver)
     - Magic: `#3B82F6` (Blue)
     - Rare: `#A855F7` (Purple)
     - Legendary: `#F59E0B` (Gold)
   - Item Weight Badges:
     - Small badge overlay at top-right corner of item slot (`Rectangle`, `24px` x `18px`, `rgba(0, 0, 0, 0.85)`).
     - Badge Text:
       - Weight 1: `"1x"` (`#34D399` Green) — Consumables, rings, small items
       - Weight 2: `"2x"` (`#FBBF24` Amber) — One-handed weapons, boots, helmets, chest pieces
       - Weight 3: `"3x"` (`#F87171` Red) — Two-handed weapons, heavy plate, massive artifacts
   - Stack Quantity Badge: Bottom-right corner `TextBlock` (e.g. `x5` for potions).

4. **Paperdoll Equipment Slots**:
   - 6 Dedicated Equipment Slots:
     - `Head` (Top Center)
     - `Chest` (Middle Center)
     - `MainHand` (Middle Left)
     - `OffHand` (Middle Right)
     - `Ring` (Bottom Left)
     - `Amulet` (Bottom Right)
   - Displays equipped item icon/name with rarity border. Watermark text when empty (e.g., `"HEAD"`, `"CHEST"`).
   - Direct Equip / Unequip interaction: Clicking an item in inventory equips it to its designated slot; clicking an equipped paperdoll item unequips it back into the inventory bag (if weight capacity allows).

5. **Tooltip Popup Component**:
   - Dynamically updates on pointer enter (`onPointerEnterObservable`) or gamepad focus change.
   - Header: Item Name in Rarity Color (e.g., `Legendary Claymore`).
   - Subheader: Item Category (`Two-Handed Weapon | Weight: 3x`).
   - Stat Bonus List: Mapped green text (`+25 Attack Damage`, `+10% Crit Chance`).
   - Description: Flavor text in gray.
   - Equip Instructions: Contextual prompts based on active device.

---

### 2.2 HUD Updates (`HUD.ts`)

1. **Inventory Toggle Button & Keybindings**:
   - Keybinding: Pressing `I` (`KeyI` on keyboard) or `Select` / `View` / `Back` button on Gamepad toggles Inventory UI.
   - Top-Right HUD Button: Add a `"Inventory [I]"` button next to `"Talents [T]"` button in `HUD.ts`.
   - Toggle behavior:
     - If Inventory modal is closed: Open `InventoryUI`, register `inputManager.setModalOpen("inventory_ui", true)`.
     - If open: Close `InventoryUI`, register `inputManager.setModalOpen("inventory_ui", false)`.
     - If other modals (TalentUI/ArchetypeUI) are open when `I` is pressed, auto-hide them before opening InventoryUI.

2. **Focus Navigation for Gamepad / Keyboard Users**:
   - Navigation Matrix: 26 total focusable nodes:
     - Nodes 0–5: Paperdoll Equipment Slots (`Head`, `Chest`, `MainHand`, `OffHand`, `Ring`, `Amulet`).
     - Nodes 6–25: Inventory Grid Slots (5 cols x 4 rows).
   - Visual Focus Highlight: Thick golden border (`#FFD700`, thickness `3`) around currently focused control.
   - Controls:
     - D-Pad / Arrow keys / WASD: Move focus up, down, left, right across grid and paperdoll.
     - `A` button / `Enter`: Equip/Use focused item (or Unequip if in paperdoll).
     - `X` button / `Delete` / `R`: Drop focused item to ground.
     - `B` button / `Escape`: Close Inventory modal.

3. **Pickup Notification System**:
   - Notification Toast Container on HUD: Vertical `StackPanel` positioned at center-right or top-left (`top: "120px"`, `left: "15px"`).
   - Toast Queue: Manages up to 4 concurrent notifications. Automatically fades out after 2.5 seconds.
   - Rarity & Gold Color Coding:
     - Gold pickup: `"Picked up 50 Gold"` (`#F59E0B` Amber)
     - Health / Mana Globe: `"Restored 30 HP"` (`#10B981` Emerald)
     - Common item: `"Picked up Iron Dagger"` (`#E5E7EB` Silver)
     - Magic item: `"Picked up Starlight Robe"` (`#60A5FA` Blue)
     - Rare item: `"Picked up Ring of Might"` (`#C084FC` Purple)
     - Legendary item: `"Picked up Excalibur"` (`#FBBF24` Gold)

---

## 3. Caveats

1. **Resolution & Scaling**: `@babylonjs/gui` root panel must use proportional pixel limits (`960px` width) with responsive scale factors so it renders cleanly on screen resolutions from 720p to 4K without text clipping.
2. **Item Drag-and-Drop vs Click-to-Equip**: While `@babylonjs/gui` supports drag events, click-to-equip/unequip and gamepad focus selection offer superior cross-device reliability (especially on gamepad). Drag-and-drop can be supported as a mouse enhancement on top of click-to-equip.
3. **Overburdening Edge Case**: If the player attempts to unequip a 3x weight item when inventory bag space is full or remaining capacity is < 3x, the action must be rejected with an inventory full notification toast.

---

## 4. Conclusion & Implementation Roadmap

### 4.1 Data Structure & Interface Contracts (`src/entities/components/InventoryComponent.ts`)

```typescript
export type ItemRarity = 'common' | 'magic' | 'rare' | 'legendary';
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'currency';
export type EquipmentSlotType = 'head' | 'chest' | 'mainHand' | 'offHand' | 'ring' | 'amulet';

export interface Item {
  id: string;
  name: string;
  rarity: ItemRarity;
  type: ItemType;
  equipSlot?: EquipmentSlotType;
  weight: 1 | 2 | 3; // 1x, 2x, 3x weight cost
  stackable: boolean;
  quantity: number;
  maxStack: number;
  description: string;
  statModifiers?: StatModifier[];
  healAmount?: number;
  manaAmount?: number;
}

export interface PickupNotificationEvent {
  text: string;
  color: string;
  rarity?: ItemRarity;
}
```

### 4.2 Step-by-Step Implementation Steps

#### Step 1: Create `src/ui/InventoryUI.ts`
- Implement `InventoryUI` class with `@babylonjs/gui` controls:
  - Root modal panel (`Rectangle`, `960px` x `640px`, gold border).
  - Capacity progress bar with dynamic color fill (`#10B981` -> `#F59E0B` -> `#EF4444`).
  - 6 Paperdoll Equipment Slots with watermark text and active item rendering.
  - 5x4 Grid Layout (20 slots) with `1x`, `2x`, `3x` weight badges and stack indicators.
  - Tooltip card for item stats, rarity color coding, and equip instructions.
  - Gamepad & Keyboard focus navigation system with golden highlight border.

#### Step 2: Update `src/ui/HUD.ts`
- Add `"Inventory [I]"` button to top-right header stack.
- Create Toast Notification StackPanel for pickup alerts (`showPickupNotification(text, color)`).
- Wire `player.inventory.onItemPickedUp` and `onGoldChanged` to trigger notification toasts.

#### Step 3: Wire Input & Keybindings in `src/index.ts`
- Instantiate `InventoryUI(scene, player, inputManager)`.
- Connect `HUD` inventory button click to `inventoryUI.toggle()`.
- Add `KeyI` keyboard listener to toggle InventoryUI.
- Ensure mutual exclusion: opening `InventoryUI` closes `TalentUI` and `ArchetypeUI`.

---

## 5. Verification Method

To independently verify the Phase 5 GUI layout and HUD integration:

1. **TypeScript Build Verification**:
   ```bash
   npx tsc --noEmit
   npm run build
   ```
   Must compile with 0 syntax or type errors.

2. **Interactive UI Testing**:
   - Press `I` key or click `"Inventory [I]"` button on HUD to open `InventoryUI`.
   - Verify modal opens centered with gold border and `InputManager.isUIModalOpen` blocks world movement.
   - Verify 5x4 inventory grid displays `1x`, `2x`, `3x` weight badges on items.
   - Verify weight capacity bar updates correctly when adding/dropping items.
   - Verify paperdoll slots (`Head`, `Chest`, `MainHand`, `OffHand`, `Ring`, `Amulet`) display equipped items and unequip back to inventory on click/select.
   - Hover over/focus items to check rarity color-coded tooltips.
   - Trigger item pickup to verify notification toasts ("Picked up 50 Gold", "Legendary Sword acquired") appear on HUD and auto-fade after 2.5 seconds.
