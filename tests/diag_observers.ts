import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { polyfillXHR } from "./xhr_polyfill";

// DOM Polyfill for Node environment
if (typeof globalThis.window === "undefined") {
  const listeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    addEventListener: (type: string, fn: Function) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (listeners[type]) {
        const idx = listeners[type].indexOf(fn);
        if (idx !== -1) listeners[type].splice(idx, 1);
      }
    },
    listeners,
  };
}

if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: (tag: string) => ({
      getContext: () => ({
        measureText: () => ({ width: 100 }),
        fillRect: () => {}, clearRect: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
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

console.log("--- HUD DIAGNOSTIC ---");
console.log("Before HUD HP observers:", p.stats.onHealthChanged.observers.length);
const hud = new HUD(scene, p);
console.log("During HUD HP observers:", p.stats.onHealthChanged.observers.length);

const obs = (hud as any)["healthChangedObserver"];
console.log("Stored healthChangedObserver:", obs);
const removed = p.stats.onHealthChanged.remove(obs);
console.log("Manual remove(obs) returned:", removed);
console.log("After manual remove HP observers:", p.stats.onHealthChanged.observers.length);

console.log("--- INVENTORY UI DIAGNOSTIC ---");
console.log("Before InvUI Inv observers:", p.inventory.onInventoryChanged.observers.length);
const invUI = new InventoryUI(scene, p, new InputManager(scene));
console.log("During InvUI Inv observers:", p.inventory.onInventoryChanged.observers.length);
invUI.dispose();
console.log("After InvUI.dispose() Inv observers:", p.inventory.onInventoryChanged.observers.length);
