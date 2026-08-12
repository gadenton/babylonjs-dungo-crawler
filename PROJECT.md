# Project: Babylon.js Dungeon Crawler ARPG — Main Menu & Settings System

## Architecture
- **State Management**: `GameStateManager.ts` central state machine handling states `MAIN_MENU | TOWN_HUB | DUNGEON | PAUSED`.
- **Persistence Subsystem**: `SaveManager.ts` scanning slots (`autosave`, `slot_1`, `slot_2`, `slot_3`) with `getMostRecentSave()` for R2 Continue flow.
- **Audio & Visual Subsystems**: `AudioManager.ts` linear volume getters/setters & storage persistence; `VisualPipelineManager.ts` graphics preset persistence for R4.
- **Rendering & 3D Scene**: `CameraRig.ts` panorama drift mode & `GameEngine` ambient fog configuration for R1 3D Town Hub background.
- **UI System (`@babylonjs/gui/2D`)**: Dark fantasy styled overlays (`rgba(12, 16, 26, 0.95)` container, `#DAA520` 3px gold borders, `#FFD700` text).
  - `MainMenuUI.ts` (R1 & R2)
  - `ClassSelectionModal.ts` (R3)
  - `SettingsUI.ts` (R4)
  - `PauseMenuUI.ts` (R5)
- **Input Navigation**: `InputManager.ts` unified focus highlight cycling for keyboard, mouse, and gamepad.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | State Management & Save Scanner API | `GameStateManager` state machine and `SaveManager.getMostRecentSave()` API | Stage 1 (M1) | Survey / R2 |
| 2 | Audio & Graphics Persistence APIs | `AudioManager` linear volume getters & `VisualPipelineManager` preset storage persistence | Stage 1 (M1) | Survey / R4 |
| 3 | 3D Camera Panorama & Ambient Fog | 3D Town Hub overview camera drift & ambient fog setup | Stage 2 (M2) | R1 |
| 4 | Main Menu UI & Continue Detection | Dark fantasy Main Menu overlay with Continue/New Game/Load/Settings buttons and gamepad/keyboard navigation | Stage 2 (M2) | R1, R2 |
| 5 | Class Archetype Selection Modal | Hero archetype modal for Level 1 New Game creation | Stage 3 (M3) | R3 |
| 6 | Settings Overlay & SaveLoad Integration | Volume sliders, Graphics preset picker, Controls table, and SaveLoadUI hookup | Stage 4 (M4) | R4 |
| 7 | In-Game Pause Menu & Unload Transition | `[Esc]` key pause menu and entity cleanup/transition back to 3D Main Menu panorama | Stage 5 (M5) | R5 |
| 8 | E2E Integration & Verification | 100% pass of test suite, adversarial testing, and forensic audit | Stage 6 (M6) | Quality Gate |

## Milestones & Execution Stages
| Stage | Milestone | Scope | Dependencies | Status |
|-------|-----------|-------|-------------|--------|
| **Stage 1** | M1: Core Architecture & Persistence APIs | `SaveManager.getMostRecentSave()`, `GameStateManager`, `AudioManager` linear volume/persistence, `VisualPipelineManager` persistence | None | PLANNED (Next) |
| **Stage 2** | M2: Main Menu UI & 3D Panorama | 3D Town Hub camera drift, ambient fog, `MainMenuUI.ts`, recent save Continue flow | Stage 1 | PLANNED |
| **Stage 3** | M3: Class Archetype Selection | `ClassSelectionModal.ts` for Hero Archetype picking & fresh save initialization | Stage 2 | PLANNED |
| **Stage 4** | M4: Settings Overlay & SaveLoad UI | `SettingsUI.ts` (audio sliders, graphics dropdown, controls reference table) & `SaveLoadUI` integration | Stage 2 | PLANNED |
| **Stage 5** | M5: Pause Menu & Main Menu Transition | `PauseMenuUI.ts`, `[Esc]` binding, render loop pause, gameplay entity unloading & return to Main Menu | Stage 2, Stage 4 | PLANNED |
| **Stage 6** | M6: E2E Testing & Quality Verification | Dual track E2E tests, adversarial coverage, reviewer/challenger/auditor verification | Stage 1-5 | PLANNED |

*Note: User instruction update requires pausing and reporting back to user for review immediately upon completion of Stage 1 before proceeding to Stage 2.*

## Interface Contracts
### `SaveManager`
- `getMostRecentSave(): { slotId: string; metadata: SaveMetadata } | null`

### `GameStateManager`
- `getState(): 'MAIN_MENU' | 'TOWN_HUB' | 'DUNGEON' | 'PAUSED'`
- `setState(newState: GameState): void`
- `onStateChanged: Observable<GameState>`

### `AudioManager`
- `getMasterVolumeLinear(): number`
- `getSFXVolumeLinear(): number`
- `getMusicVolumeLinear(): number`
- `saveAudioSettings(): void`
- `loadAudioSettings(): void`

### `VisualPipelineManager`
- `saveGraphicsSettings(): void`
- `loadGraphicsSettings(): void`

## Code Layout
- `src/core/GameStateManager.ts` (New)
- `src/persistence/SaveManager.ts` (Modified)
- `src/audio/AudioManager.ts` (Modified)
- `src/rendering/VisualPipelineManager.ts` (Modified)
- `src/camera/CameraRig.ts` (Modified)
- `src/core/Engine.ts` (Modified)
- `src/ui/MainMenuUI.ts` (New)
- `src/ui/ClassSelectionModal.ts` (New)
- `src/ui/SettingsUI.ts` (New)
- `src/ui/PauseMenuUI.ts` (New)
- `src/index.ts` (Modified)
