// Standalone Empirical Test for Player.ts transform hierarchy and moveWithCollisions logic

// Simulate transformNode and mesh hierarchy as set up in Player.ts:
// constructor:
// this.transformNode = { position: Vector3(0,0,0) }
// this.mesh = { position: Vector3(0, 0.9, 0), parent: transformNode }

class Vector3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  add(v) { return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z); }
  scale(s) { return new Vector3(this.x * s, this.y * s, this.z * s); }
  copyFrom(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}

const transformNodePosition = new Vector3(0, 0, 0);
const meshPosition = new Vector3(0, 0.9, 0); // Local position relative to transformNode

// Function simulating mesh.moveWithCollisions(displacement)
// In Babylon.js, moveWithCollisions adds the collision-resolved movement to mesh.position
function mockMoveWithCollisions(displacement) {
  meshPosition.copyFrom(meshPosition.add(displacement));
}

// Function calculating mesh absolute position in world space
function getMeshAbsolutePosition() {
  return transformNodePosition.add(meshPosition);
}

console.log("--- Simulating Player.ts Update Loop ---");
console.log(`Initial Setup:`);
console.log(`  transformNode.position: (${transformNodePosition.x}, ${transformNodePosition.y}, ${transformNodePosition.z})`);
console.log(`  mesh.position (local):  (${meshPosition.x}, ${meshPosition.y}, ${meshPosition.z})`);
console.log(`  mesh absolute position: (${getMeshAbsolutePosition().x}, ${getMeshAbsolutePosition().y}, ${getMeshAbsolutePosition().z})\n`);

// Simulate frame 1: player moves +1 unit in X direction with deltaTime = 1
const velocityFrame1 = new Vector3(1, 0, 0);
const displacementFrame1 = velocityFrame1.scale(1.0);

// Line 147: this.mesh.moveWithCollisions(displacement);
mockMoveWithCollisions(displacementFrame1);

console.log(`After mesh.moveWithCollisions( (1,0,0) ):`);
console.log(`  mesh.position (local): (${meshPosition.x}, ${meshPosition.y}, ${meshPosition.z})`);

// Line 149: this.transformNode.position.copyFrom(this.mesh.position);
transformNodePosition.copyFrom(meshPosition);

console.log(`After transformNode.position.copyFrom(this.mesh.position):`);
console.log(`  transformNode.position: (${transformNodePosition.x}, ${transformNodePosition.y}, ${transformNodePosition.z})`);
console.log(`  mesh.position (local):  (${meshPosition.x}, ${meshPosition.y}, ${meshPosition.z})`);
console.log(`  mesh absolute position: (${getMeshAbsolutePosition().x}, ${getMeshAbsolutePosition().y}, ${getMeshAbsolutePosition().z})`);

if (getMeshAbsolutePosition().x !== 1 || getMeshAbsolutePosition().y !== 0.9) {
  console.log(`\n❌ TRANSFORM CORRUPTION DETECTED!`);
  console.log(`  Expected mesh absolute position after moving +1 in X: (1.0, 0.9, 0.0)`);
  console.log(`  Actual mesh absolute position: (${getMeshAbsolutePosition().x}, ${getMeshAbsolutePosition().y}, ${getMeshAbsolutePosition().z})`);
}
