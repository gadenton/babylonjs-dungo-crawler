# Handoff Report — Town Hub Altar / Portal Interaction & State Transitions (Milestone 2)

**Author**: Explorer 3 (M2 - Static Town Hub & Player Setup)  
**Working Directory**: `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\teamwork_preview_explorer_m2_3`  
**Date**: 2026-08-06T17:56:30Z  

---

## 1. Observation

### Existing `src/entities/TownHubAltar.ts` Implementation
`src/entities/TownHubAltar.ts` (lines 1-84) currently defines a self-contained 3D altar entity:
- **Base Mesh**: `CreateCylinder("townHubAltar", { height: 1.6, diameterTop: 2.2, diameterBottom: 2.6, tessellation: 32 }, scene)` centered at `position + Vector3(0, 0.8, 0)` with `checkCollisions = true` (lines 28-31).
- **Glow Ring**: `CreateTorus("altarGlowRing", { diameter: 3.2, thickness: 0.15, tessellation: 32 }, scene)` centered at `position + Vector3(0, 0.05, 0)` with a unlit cyan emissive material `(0.2, 0.7, 1.0)` (lines 40-47).
- **Animation**: Animated Y-rotation for the outer glow ring (`this.ringMesh.rotation.y += 0.01` per frame) using `scene.onBeforeRenderObservable` (lines 56-60).
- **Point Light**: `PointLight("altarGlowLight", this.position.add(new Vector3(0, 2.2, 0)), scene)` with diffuse cyan `(0.2, 0.7, 1.0)` and intensity `2.0` (lines 50-53).
- **Proximity Check Method**:
  ```ts
  // Lines 63-66
  public isPlayerInProximity(playerPosition: Vector3): boolean {
    const dist = Vector3.Distance(this.position, playerPosition);
    return dist <= this.interactionRadius; // interactionRadius = 3.0
  }
  ```
- **Disposal**: Cleanly disposes material, observer, light, ring mesh, and base mesh (lines 68-82).

### Current Callsite and Wiring in `src/index.ts`
In `src/index.ts`:
- **Spawn Position**: Altar is currently spawned inside the procedural dungeon room 0 at `builtDungeon.spawnPoint.add(new Vector3(3, 0, 3))` (lines 109-110).
- **Keyboard Handling**: Pressing `[E]` or `[F]` checks proximity and opens archetype UI:
  ```ts
  // Lines 152-156
  } else if (e.code === "KeyE" || e.code === "KeyF") {
    if (townHubAltar.isPlayerInProximity(player.position)) {
      archetypeUI.toggle();
    }
  }
  ```
- **Render Loop Proximity Check**:
  ```ts
  // Lines 323-327
  if (townHubAltar.isPlayerInProximity(player.position)) {
    hud.showInteractionPrompt("Press [E] or (A) to Access Archetype Altar");
  } else {
    hud.hideInteractionPrompt();
  }
  ```

### HUD Prompt Overlay System in `src/ui/HUD.ts`
`src/ui/HUD.ts` (lines 307-325, 358-365) provides a built-in interaction prompt banner:
- **UI Control**: `this.interactionBanner` (Rectangle, width `"400px"`, height `"42px"`, background `"rgba(0, 200, 255, 0.85)"`, cornerRadius `8`, centered at screen bottom, top `"-105px"`).
- **Text Control**: `this.interactionPromptText` (`TextBlock`, font size `15px`, bold).
- **API Methods**: `hud.showInteractionPrompt(prompt: string)` and `hud.hideInteractionPrompt()`.

### Proximity Detection Patterns Across Codebase
1. `TownHubAltar.ts`: Uses `Vector3.Distance(this.position, playerPosition)` vs `this.interactionRadius` (`3.0m`).
2. `LootDrop.ts` (lines 136-148): Uses `Vector3.Distance(currentPos, playerPos)` vs `this.magnetRadius` (`3.0m`) for vacuum magnet physics and `<= 0.5m` for instant pickup threshold.
3. `Enemy.ts`: Uses `Vector3.Distance(this.position, player.position)` vs `aggroRadius` (`9.0m`) and `attackRadius` (`1.8m`).

---

## 2. Logic Chain

1. **Observation**: `TownHubAltar.ts` has a well-built 3D mesh presentation, animated glow ring, point light, and `isPlayerInProximity()` method checking a `3.0m` radius using `Vector3.Distance`.
   **Reasoning**: The visual representation and proximity math of `TownHubAltar.ts` are robust and adhere to project standards. However, it lacks an event dispatch mechanism (`Observable<void>`) to inform external callers when the altar is interacted with.

2. **Observation**: In `src/index.ts`, keypresses `KeyE` and `KeyF` check `townHubAltar.isPlayerInProximity(player.position)` directly and toggle `archetypeUI`.
   **Reasoning**: Direct coupling in `index.ts` restricts flexibility. Adding an `onInteract: Observable<void>` observable to `TownHubAltar` allows `TownHubAltar` to act as an event source. Both keypresses (`[E]`, `[F]`), gamepad face button `(A)`, and direct mouse clicks on `townHubAltar.mesh` can trigger `onInteract.notifyObservers()`.

3. **Observation**: `HUD.ts` already exposes `showInteractionPrompt(prompt)` and `hideInteractionPrompt()`, which renders a prominent cyan bottom banner (`interactionBanner`).
   **Reasoning**: No new GUI overlay infrastructure is needed for interaction prompts. In Town Hub, when `townHubAltar.isPlayerInProximity(player.position)` is true, calling `hud.showInteractionPrompt("Press [E], [F] or Click Portal to Enter Dungeon")` fulfills requirement R2 cleanly.

4. **Observation**: For Milestone 2, the Town Hub must be the safe starting zone (10x10 plaza), containing `TownHubAltar` as the Dungeon Portal. In Milestone 3, `GameStateManager` will handle `TOWN_HUB` -> `DUNGEON` transitions.
   **Reasoning**: `TownHubAltar` should expose an explicit interface contract (`onInteract` observable and `interact()` method). When triggered, `onInteract` notifies the scene manager / `GameStateManager`, which triggers the level transition curtain and starts dungeon generation.

---

## 3. Caveats

- **Mouse Click Pickability**: Currently `townHubAltar.mesh` has `checkCollisions = true`, but mouse click picking relies on `scene.pick` or `scene.onPointerDown`. Ensure `townHubAltar.mesh.isPickable = true` and `glowRing.isPickable = true` so left-clicking the altar in 3D space works as expected.
- **Y-Axis Distance Measurement**: `Vector3.Distance` checks 3D Euclidean distance. Since `this.position` is at ground level `y=0` (with mesh offset `y=0.8`), and `player.position` is at `y=0`, 3D distance within `3.0m` is accurate. If planar 2D distance is preferred, `Vector3.Distance(new Vector3(p1.x, 0, p1.z), new Vector3(p2.x, 0, p2.z))` can be used.

---

## 4. Conclusion & Recommendations

### Recommended Changes to `src/entities/TownHubAltar.ts`

1. **Add Interaction Observable & Explicit Method**:
   ```ts
   import { Observable } from "@babylonjs/core/Misc/observable";

   export class TownHubAltar {
     public readonly onInteract: Observable<void> = new Observable<void>();

     // Call when player activates altar via [E], [F], or Mouse Click
     public interact(): void {
       this.onInteract.notifyObservers();
     }

     public dispose(): void {
       this.onInteract.clear();
       // ... existing cleanup
     }
   }
   ```

2. **Enable Mesh Pickability for Pointer Clicks**:
   Set `this.mesh.isPickable = true;` and `this.ringMesh.isPickable = true;` in the constructor.

3. **Interaction Wiring Pattern**:
   - **Render Loop Proximity Check**:
     ```ts
     if (townHubAltar.isPlayerInProximity(player.position)) {
       hud.showInteractionPrompt("Press [E], [F] or Click Portal to Enter Dungeon");
     } else {
       hud.hideInteractionPrompt();
     }
     ```
   - **Keyboard Listener (`[E]` / `[F]`)**:
     ```ts
     if (e.code === "KeyE" || e.code === "KeyF") {
       if (townHubAltar.isPlayerInProximity(player.position)) {
         townHubAltar.interact();
       }
     }
     ```
   - **Mouse Click Listener**:
     ```ts
     scene.onPointerDown = (evt, pickResult) => {
       if (evt.button === 0 && pickResult && pickResult.hit && pickResult.pickedMesh) {
         if (pickResult.pickedMesh === townHubAltar.mesh || pickResult.pickedMesh === townHubAltar.ringMesh) {
           if (townHubAltar.isPlayerInProximity(player.position)) {
             townHubAltar.interact();
           }
         }
       }
     };
     ```

4. **Integration with `GameStateManager`**:
   `townHubAltar.onInteract.add(() => { gameStateManager.transitionToDungeon(); });`

---

## 5. Verification Method

### 1. Static Typecheck Verification
Run TypeScript typecheck across the project:
```bash
pnpm exec tsc --noEmit
```

### 2. Manual Verification
1. Launch dev server using `pnpm run dev`.
2. Verify player spawns in Town Hub near `TownHubAltar`.
3. Walk towards the altar (within 3.0 meters) -> Verify HUD interaction prompt `"Press [E], [F] or Click Portal to Enter Dungeon"` appears at center bottom.
4. Walk away (>3.0 meters) -> Verify interaction prompt disappears.
5. Walk within 3.0 meters and press `[E]` or `[F]` or click on the altar mesh -> Verify `onInteract` observer fires and triggers dungeon transition.
