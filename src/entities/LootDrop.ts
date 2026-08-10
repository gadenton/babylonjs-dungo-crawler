import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Entity } from "./Entity";
import { Item, ItemCategory, Rarity } from "./components/InventoryComponent";
import { Player } from "./Player";
import { JuiceOverlay } from "../ui/JuiceOverlay";
import { AudioManager } from "../audio/AudioManager";

export function getRarityColor(rarity: Rarity): Color3 {
  switch (rarity) {
    case Rarity.Common:
      return new Color3(0.85, 0.85, 0.85); // White/Silver
    case Rarity.Magic:
      return new Color3(0.23, 0.51, 0.96); // Blue #3B82F6
    case Rarity.Rare:
      return new Color3(0.92, 0.70, 0.03); // Yellow/Gold #EAB308
    case Rarity.Legendary:
      return new Color3(0.66, 0.33, 0.97); // Purple #A855F7
    default:
      return new Color3(1, 1, 1);
  }
}

export function getRarityHex(rarity: Rarity): string {
  switch (rarity) {
    case Rarity.Common:
      return "#D1D5DB";
    case Rarity.Magic:
      return "#3B82F6";
    case Rarity.Rare:
      return "#EAB308";
    case Rarity.Legendary:
      return "#A855F7";
    default:
      return "#FFFFFF";
  }
}

export class LootDrop extends Entity {
  public item: Item;
  public visualMesh: Mesh;
  public glowRing: Mesh;
  public isPickedUp: boolean = false;

  private basePosY: number = 0.4;
  private animTimer: number = 0;
  private magnetRadius: number = 3.0; // 3.0 unit radius magnet
  private pickupDistance: number = 0.5; // 0.5m pickup threshold
  private vacuumSpeed: number = 12.0; // m/s pulling speed

  constructor(id: string, scene: Scene, item: Item, spawnPos: Vector3) {
    super(id, `LootDrop_${item.name}`, scene);
    this.item = item;

    const rootMesh = new Mesh(`lootRoot_${id}`, scene);
    this.transformNode.dispose();
    this.transformNode = rootMesh;
    this.transformNode.position.copyFrom(spawnPos);
    this.transformNode.position.y = 0.05;

    const color = getRarityColor(item.rarity);

    // 1. Create Rarity Glow Ring at Ground Base
    this.glowRing = CreateTorus(`glowRing_${id}`, { diameter: 0.9, thickness: 0.08, tessellation: 24 }, scene);
    this.glowRing.parent = this.transformNode;
    this.glowRing.position = new Vector3(0, 0.05, 0);

    const ringMat = new StandardMaterial(`ringMat_${id}`, scene);
    ringMat.diffuseColor = color;
    ringMat.emissiveColor = color.scale(0.8);
    ringMat.alpha = 0.8;
    this.glowRing.material = ringMat;

    // 2. Create 3D Floating Mesh based on Category
    if (item.category === ItemCategory.Gold) {
      this.visualMesh = CreateCylinder(`goldCoin_${id}`, { height: 0.1, diameter: 0.4 }, scene);
      this.basePosY = 0.3;
      const mat = new StandardMaterial(`goldMat_${id}`, scene);
      mat.diffuseColor = new Color3(0.96, 0.62, 0.07);
      mat.emissiveColor = new Color3(0.6, 0.4, 0.0);
      this.visualMesh.material = mat;
    } else if (item.category === ItemCategory.Globe) {
      this.visualMesh = CreateSphere(`globeMesh_${id}`, { diameter: 0.45 }, scene);
      this.basePosY = 0.4;
      const mat = new StandardMaterial(`globeMat_${id}`, scene);
      if (item.globeType === "health") {
        mat.diffuseColor = new Color3(0.86, 0.15, 0.15); // HP Red
        mat.emissiveColor = new Color3(0.7, 0.0, 0.0);
      } else {
        mat.diffuseColor = new Color3(0.15, 0.39, 0.92); // MP Blue
        mat.emissiveColor = new Color3(0.0, 0.2, 0.7);
      }
      this.visualMesh.material = mat;
    } else if (item.category === ItemCategory.Consumable) {
      this.visualMesh = CreateCylinder(`potionMesh_${id}`, { height: 0.4, diameterTop: 0.15, diameterBottom: 0.3 }, scene);
      this.basePosY = 0.4;
      const mat = new StandardMaterial(`potionMat_${id}`, scene);
      mat.diffuseColor = new Color3(0.1, 0.8, 0.3);
      mat.emissiveColor = new Color3(0.05, 0.4, 0.15);
      this.visualMesh.material = mat;
    } else {
      // Equipment
      this.visualMesh = CreateBox(`equipMesh_${id}`, { size: 0.4 }, scene);
      this.basePosY = 0.45;
      const mat = new StandardMaterial(`equipMat_${id}`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.5);
      this.visualMesh.material = mat;
    }

    this.visualMesh.parent = this.transformNode;
    this.visualMesh.position.y = this.basePosY;
  }

  public override update(deltaTime: number, player?: Player, juice?: JuiceOverlay, audio?: AudioManager): void {
    if (this.isPickedUp || deltaTime <= 0) return;

    this.animTimer += deltaTime;

    // Y-axis rotation + sine bobbing animation
    this.visualMesh.rotation.y += 2.0 * deltaTime;
    this.visualMesh.position.y = this.basePosY + Math.sin(this.animTimer * 4.0) * 0.12;

    if (!player) return;

    // Proximity Auto-Pickup Vacuum Physics (3.0 unit radius)
    const playerPos = player.position.add(new Vector3(0, 0.5, 0));
    const currentPos = this.transformNode.position;
    const distToPlayer = Vector3.Distance(currentPos, playerPos);

    if (distToPlayer <= this.magnetRadius) {
      // Magnet Pull Math
      const pullDir = playerPos.subtract(currentPos).normalize();
      const moveStep = pullDir.scale(this.vacuumSpeed * deltaTime);
      this.transformNode.position.addInPlace(moveStep);

      // Instant Pickup Check (< 0.5m)
      if (distToPlayer <= this.pickupDistance) {
        this.executePickup(player, juice, audio);
      }
    }
  }

  private executePickup(player: Player, juice?: JuiceOverlay, audio?: AudioManager): void {
    if (this.isPickedUp) return;

    if (this.item.category === ItemCategory.Gold) {
      const goldAmt = this.item.goldAmount ?? 10;
      player.inventory.addGold(goldAmt);

      if (juice) {
        juice.spawnFloatingText(this.transformNode.position, `+${goldAmt} Gold`, "crit");
      }
      if (audio) {
        audio.playGoldPickupSFX(this.transformNode.position);
      }

      this.isPickedUp = true;
      this.dispose();
    } else if (this.item.category === ItemCategory.Globe) {
      if (this.item.globeType === "health") {
        const healAmt = Math.round(player.stats.maxHealth * 0.25);
        player.stats.modifyHealth(healAmt);
        if (juice) {
          juice.spawnFloatingText(this.transformNode.position, `+${healAmt} HP`, "heal");
        }
      } else {
        const manaAmt = Math.round(player.stats.maxMana * 0.25);
        player.stats.modifyMana(manaAmt);
        if (juice) {
          juice.spawnFloatingText(this.transformNode.position, `+${manaAmt} MP`, "normal");
        }
      }

      if (audio) {
        audio.playGlobePickupSFX(this.transformNode.position);
      }

      this.isPickedUp = true;
      this.dispose();
    } else {
      // Equipment / Consumable: check bag capacity
      const added = player.inventory.addItem(this.item);
      if (added) {
        if (juice) {
          juice.spawnFloatingText(this.transformNode.position, `Picked up ${this.item.name}`, "normal");
        }
        if (audio) {
          audio.playItemPickupSFX(this.transformNode.position);
        }
        this.isPickedUp = true;
        this.dispose();
      }
    }
  }

  public override dispose(): void {
    if (this.visualMesh) this.visualMesh.dispose();
    if (this.glowRing) this.glowRing.dispose();
    super.dispose();
  }
}
