# E2E Test Infra: Main Menu & Settings System

## Test Philosophy

- Opaque-box & unit integration verification using `vitest`.
- Verification of state machine, save slot scanning, settings persistence, UI visibility toggle, and scene transitions.

## Feature Inventory Test Coverage

| # | Feature | Source | Tier 1 (Unit) | Tier 2 (Boundary) | Tier 3 (Integration) | Tier 4 (E2E) |
| --- | --------- | -------- | :-------------: | :-----------------: | :--------------------: | :------------: |
| 1 | State Management & Save Scanner | Survey / R2 | ✓ (`save_manager.test.ts`) | ✓ (empty slots, corrupted json) | ✓ (`game_state.test.ts`) | ✓ |
| 2 | Audio & Graphics Persistence | Survey / R4 | ✓ (`audio_settings.test.ts`) | ✓ (boundary volume 0..1) | ✓ (`graphics_settings.test.ts`) | ✓ |
| 3 | 3D Camera Panorama & Fog | R1 | ✓ (`camera_panorama.test.ts`) | ✓ (null target) | ✓ (`scene_fog.test.ts`) | ✓ |
| 4 | Main Menu UI & Continue Detection | R1, R2 | ✓ (`main_menu_ui.test.ts`) | ✓ (no saves vs save found) | ✓ | ✓ |
| 5 | Class Archetype Selection Modal | R3 | ✓ (`class_selection.test.ts`) | ✓ (all 4 archetypes) | ✓ | ✓ |
| 6 | Settings Overlay & Controls | R4 | ✓ (`settings_ui.test.ts`) | ✓ | ✓ | ✓ |
| 7 | In-Game Pause & Main Menu Transition | R5 | ✓ (`pause_menu.test.ts`) | ✓ (Esc key toggle) | ✓ (`scene_transition.test.ts`) | ✓ |

## Test Runner Command

```bash
pnpm test
```
