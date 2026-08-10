// Standalone Empirical Test for Isometric Vector Rotation and Camera Alignment

// Camera setup from CameraRig.ts:
// yawAngle = 45 degrees = PI/4
// pitchAngle = 45 degrees = PI/4
// distance = 22
const yawAngle = Math.PI / 4;
const pitchAngle = Math.PI / 4;
const distance = 22.0;

// Camera offset relative to focus point:
// isoOffset = (distance * sin(yaw) * cos(pitch), distance * sin(pitch), -distance * cos(yaw) * cos(pitch))
const isoOffsetX = distance * Math.sin(yawAngle) * Math.cos(pitchAngle);
const isoOffsetY = distance * Math.sin(pitchAngle);
const isoOffsetZ = -distance * Math.cos(yawAngle) * Math.cos(pitchAngle);

console.log(`Camera Iso Offset relative to focus: (${isoOffsetX.toFixed(3)}, ${isoOffsetY.toFixed(3)}, ${isoOffsetZ.toFixed(3)})`);

// On XZ plane, camera position relative to focus is (isoOffsetX, isoOffsetZ) = (+11, -11)
// Looking from camera to focus (0,0,0):
// Forward vector on XZ plane F_xz = focus - camera_xz = (0 - 11, 0 - (-11)) = (-11, +11)
// Normalized Camera Forward vector on XZ plane:
const lenF = Math.sqrt(isoOffsetX * isoOffsetX + isoOffsetZ * isoOffsetZ);
const F_x = -isoOffsetX / lenF; // -1/sqrt(2) ≈ -0.707
const F_z = -isoOffsetZ / lenF; // +1/sqrt(2) ≈ +0.707
console.log(`Camera Forward vector on XZ plane (Screen UP): (${F_x.toFixed(3)}, ${F_z.toFixed(3)})`);

// Camera Right vector on XZ plane (90 deg clockwise from Forward):
// R_x = F_z = +1/sqrt(2) ≈ +0.707
// R_z = -F_x = +1/sqrt(2) ≈ +0.707
const R_x = F_z;
const R_z = -F_x;
console.log(`Camera Right vector on XZ plane (Screen RIGHT): (${R_x.toFixed(3)}, ${R_z.toFixed(3)})\n`);

// Now test InputManager.ts logic:
// InputManager.ts formula for (nx, ny):
// worldX = (nx + ny) * invSqrt2
// worldZ = (-nx + ny) * invSqrt2
const invSqrt2 = 1.0 / Math.SQRT2;

function evaluateInputManager(nx, ny, label) {
  const worldX = (nx + ny) * invSqrt2;
  const worldZ = (-nx + ny) * invSqrt2;
  
  // Calculate component along Screen Right (dot product with R) and Screen Up (dot product with F)
  const rightComponent = worldX * R_x + worldZ * R_z;
  const upComponent = worldX * F_x + worldZ * F_z;
  
  console.log(`Input: ${label} (screenX=${nx}, screenY=${ny})`);
  console.log(`  -> Calculated World Vector: (${worldX.toFixed(3)}, ${worldZ.toFixed(3)})`);
  console.log(`  -> Screen Right component: ${rightComponent.toFixed(3)} (Expected: ${nx})`);
  console.log(`  -> Screen Up component:    ${upComponent.toFixed(3)} (Expected: ${ny})`);
  
  const okRight = Math.abs(rightComponent - nx) < 0.01;
  const okUp = Math.abs(upComponent - ny) < 0.01;
  if (!okRight || !okUp) {
    console.log(`  ❌ MISALIGNMENT DETECTED! Movement vector does NOT match screen inputs!\n`);
  } else {
    console.log(`  ✅ Vector matches screen input!\n`);
  }
}

console.log("--- Testing InputManager.ts Implementation ---");
evaluateInputManager(0, 1, "W (Press Up)");
evaluateInputManager(1, 0, "D (Press Right)");
evaluateInputManager(0, -1, "S (Press Down)");
evaluateInputManager(-1, 0, "A (Press Left)");
