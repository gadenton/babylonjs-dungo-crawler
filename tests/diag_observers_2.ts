import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { polyfillXHR } from "./xhr_polyfill";

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
}
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        measureText: () => ({ width: 100 }), fillRect: () => {}, clearRect: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {}, createImageData: () => {}, setTransform: () => {}, drawFocusIfNeeded: () => {},
        save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {}, stroke: () => {}, fill: () => {},
      }),
      style: {}, width: 800, height: 600, addEventListener: () => {}, removeEventListener: () => {},
    }),
  };
}
polyfillXHR();

import { Player } from "../src/entities/Player";
import { HUD } from "../src/ui/HUD";
import { InventoryUI } from "../src/ui/InventoryUI";
import { InputManager } from "../src/core/InputManager";

const engine = new NullEngine();
const scene = new Scene(engine);
const p = new Player("p", scene);

const hud = new HUD(scene, p);

console.log("HUD created. Observers in onHealthChanged:", p.stats.onHealthChanged.observers);
hud.dispose();
console.log("HUD disposed. Observers in onHealthChanged:", p.stats.onHealthChanged.observers);
console.log("hasObservers():", p.stats.onHealthChanged.hasObservers());

let hudCallbackCalled = false;
(hud as any)["updateHealthDisplay"] = () => { hudCallbackCalled = true; };
p.stats.modifyHealth(-10);
console.log("Was HUD callback called post-dispose?", hudCallbackCalled);

console.log("\n--- INVENTORY UI ---");
const invUI = new InventoryUI(scene, p, new InputManager(scene));
console.log("InvUI created. Observers in onInventoryChanged:", p.inventory.onInventoryChanged.observers);
let invRefreshCalled = false;
invUI.refresh = () => { invRefreshCalled = true; };
invUI.dispose();
console.log("InvUI disposed. Observers in onInventoryChanged:", p.inventory.onInventoryChanged.observers);
console.log("hasObservers():", p.inventory.onInventoryChanged.hasObservers());
p.inventory.addGold(10);
console.log("Was InvUI refresh called post-dispose?", invRefreshCalled);
