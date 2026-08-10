---
name: game-ui-ux
description: >
  Design and build game UI/UX — HUDs, menus, and overlays — that survive every screen: anchor-
  based responsive layout, resolution/aspect scaling and safe areas, keyboard/gamepad focus
  navigation, a screen/menu state stack, and event-driven (not polled) HUD updates. Engine-
  neutral patterns that pair with the detected engine's UI skill. Use when the user mentions
  HUD, health bar, main menu, pause menu, settings screen, UI layout, anchors, UI scaling,
  aspect ratio, safe area, controller/keyboard menu navigation, or wiring UI to game state.
license: Apache-2.0
compatibility: Engine-agnostic UI/UX patterns; snippets in GDScript (Godot 4.x Control) and C# (Unity 6 uGUI/UI Toolkit). Pairs with godot-ui-control, Unity UI, and game-feel.
metadata:
  engine: none
  category: disciplines
  difficulty: intermediate
---

# Game UI/UX

Build HUDs and menus that stay correct on a phone, an ultrawide monitor, and a TV across a
gamepad and a mouse. This skill owns the engine-neutral UI architecture — responsive layout,
scaling, focus navigation, screen flow, and how UI talks to game state — and defers the
concrete widget API to the engine UI skill.
