import type { AirframeType, Difficulty, GameMode, KillfeedAccent, KillfeedEntry } from './types';
import { DIFFICULTY_TUNING } from './config';

export const WORLD_HALF_SIZE = 1600; // 3200 x 3200 m combined-arms land & sea warzone
export const WATER_LEVEL = 0;
export const QUAY_HEIGHT = 4.2;
export const BRIDGE_Z = -28;
export const BRIDGE_DECK_Y = 18.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2D(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    value += amp * valueNoise(x * freq, z * freq);
    freq *= 2.05;
    amp *= 0.5;
  }
  return value;
}

function gaussianPeak(x: number, z: number, cx: number, cz: number, rx: number, rz: number, h: number): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 9) return 0;
  return h * Math.exp(-d2);
}

/**
 * Deterministic 3200x3200m combined-arms land & sea warzone heightfield.
 * Returns height in meters; <= 0 is underwater (strait / deep ocean).
 * Features:
 * - Central navigable Strait + vast Southern & Outer Open Seas for naval task forces
 * - West Harbour Quay & East Fuel Depot Quay flanking the Red Steel Truss Bridge
 * - Expansive West & East Armored Tank Plains (650m+ wide) for spread-out tank & MLRS warfare
 * - Broad Northern Mainland Armored Valley & distant snow-capped alpine mountain ranges
 */
export function getTerrainHeight(x: number, z: number): number {
  // Base deep ocean seabed
  let h = -12.0;

  // --- WEST CONTINENTAL LANDMASS & WIDE ARMORED TANK PLAINS ---
  h += gaussianPeak(x, z, -520, -20, 440, 420, 26);
  h += gaussianPeak(x, z, -690, 180, 320, 290, 24);
  h += gaussianPeak(x, z, -245, -35, 165, 195, 38);
  h += gaussianPeak(x, z, -175, 155, 72, 65, 22); // Lighthouse headland
  // Distant Western Alpine Mountain Range
  h += gaussianPeak(x, z, -1040, -180, 250, 340, 118);
  h += gaussianPeak(x, z, -960, 290, 240, 230, 86);
  h += gaussianPeak(x, z, -365, -360, 130, 125, 68);

  // --- EAST CONTINENTAL LANDMASS & WIDE STEPPE TANK PLAINS ---
  h += gaussianPeak(x, z, 535, -15, 450, 415, 25);
  h += gaussianPeak(x, z, 700, 185, 315, 285, 22);
  h += gaussianPeak(x, z, 245, -25, 165, 195, 36);
  // Distant Eastern Autumnal Ridges & Alpine Crags
  h += gaussianPeak(x, z, 1055, -165, 260, 340, 112);
  h += gaussianPeak(x, z, 950, 310, 235, 220, 80);
  h += gaussianPeak(x, z, 365, -365, 130, 125, 70);

  // --- NORTHERN MAINLAND & WIDE ARMORED VALLEY (z in [-1260, -420]) ---
  h += gaussianPeak(x, z, 0, -760, 780, 310, 30);
  h += gaussianPeak(x, z, -440, -960, 310, 230, 106);
  h += gaussianPeak(x, z, 460, -970, 320, 235, 114);
  h += gaussianPeak(x, z, -165, -425, 125, 98, 60);
  h += gaussianPeak(x, z, 175, -435, 130, 98, 64);
  h += gaussianPeak(x, z, 0, -1140, 380, 195, 122);

  // Subtle organic rocky ridge & rolling plain undulation on land
  const ridge = (fbm(x * 0.0068 + 3.1, z * 0.0068 - 1.7) - 0.45) * 22;
  const landMask = smoothstep(-4, 18, h);
  h += ridge * landMask;

  // Sculpted sharp ridged alpine mountain crags on upper ranges (leaves quays & battle plains flat)
  if (h > 30) {
    const alpineMask = smoothstep(30, 62, h);
    const r1 = 1.0 - Math.abs(valueNoise(x * 0.015 + 4.2, z * 0.015 - 2.9) * 2.0 - 1.0);
    const r2 = 1.0 - Math.abs(valueNoise(x * 0.032 - 1.5, z * 0.032 + 5.1) * 2.0 - 1.0);
    const crag = (r1 * r1 * 0.68 + r2 * 0.32 - 0.35) * 32;
    h += crag * alpineMask;
  }

  // Winding scenic coastal river channel feeding into the Strait north of East Quay
  if (x > 85 && x < 740 && z > -310 && z < -180) {
    const riverCenterZ = -238 + Math.sin(x * 0.009) * 26;
    const distRiver = Math.abs(z - riverCenterZ);
    const riverMask = (1 - smoothstep(13, 30, distRiver)) * smoothstep(85, 130, x) * (1 - smoothstep(610, 740, x));
    if (riverMask > 0.001) {
      h = h * (1 - riverMask) + -4.5 * riverMask;
    }
  }

  // Carve the central navigable Strait channel cleanly around x = 0 + vast Southern Open Sea
  const straitHalfWidth = 90 + Math.sin(z * 0.005) * 18;
  const straitMask = 1 - smoothstep(straitHalfWidth - 18, straitHalfWidth + 32, Math.abs(x));
  const southOpenSea = smoothstep(235, 385, z) * (1 - smoothstep(640, 820, Math.abs(x)) * 0.3);
  const carve = Math.max(straitMask * (1 - smoothstep(-430, -560, z)), southOpenSea);
  h = h * (1 - carve) + -11.0 * carve;

  // Flatten wide West Armored Tank Plain (x in [-860, -255], z in [-290, 290])
  const westTankPlain =
    smoothstep(-880, -760, x) * (1 - smoothstep(-290, -230, x)) *
    smoothstep(-310, -230, z) * (1 - smoothstep(245, 330, z));
  if (westTankPlain > 0.001) {
    const plainH = 11.2 + Math.sin(x * 0.015) * 1.6 + Math.cos(z * 0.015) * 1.5;
    h = h * (1 - westTankPlain * 0.82) + plainH * (westTankPlain * 0.82);
  }

  // Flatten wide East Armored Steppe Plain (x in [255, 860], z in [-290, 290])
  const eastTankPlain =
    smoothstep(230, 290, x) * (1 - smoothstep(760, 880, x)) *
    smoothstep(-310, -230, z) * (1 - smoothstep(245, 330, z));
  if (eastTankPlain > 0.001) {
    const plainH = 10.8 + Math.cos(x * 0.015) * 1.6 + Math.sin(z * 0.015) * 1.4;
    h = h * (1 - eastTankPlain * 0.82) + plainH * (eastTankPlain * 0.82);
  }

  // Flatten wide Northern Mainland Tank Valley (x in [-440, 440], z in [-860, -560])
  const northPlain =
    smoothstep(-470, -390, x) * (1 - smoothstep(390, 470, x)) *
    smoothstep(-890, -810, z) * (1 - smoothstep(-600, -530, z));
  if (northPlain > 0.001) {
    const plainH = 14.5 + Math.sin(x * 0.014) * 2.0;
    h = h * (1 - northPlain * 0.84) + plainH * (northPlain * 0.84);
  }

  // Flatten West Harbour City Quay plateau (x in [-196, -94], z in [-112, 74])
  const westQuayX = smoothstep(-210, -190, x) * (1 - smoothstep(-98, -82, x));
  const westQuayZ = smoothstep(-124, -104, z) * (1 - smoothstep(64, 82, z));
  const westQuay = westQuayX * westQuayZ;
  if (westQuay > 0.001) {
    h = h * (1 - westQuay) + QUAY_HEIGHT * westQuay;
  }

  // Flatten wider East Fuel Depot Quay plateau (x in [94, 212], z in [-105, 76])
  const eastQuayX = smoothstep(82, 98, x) * (1 - smoothstep(204, 224, x));
  const eastQuayZ = smoothstep(-116, -96, z) * (1 - smoothstep(66, 86, z));
  const eastQuay = eastQuayX * eastQuayZ;
  if (eastQuay > 0.001) {
    h = h * (1 - eastQuay) + QUAY_HEIGHT * eastQuay;
  }

  // Outer open-ocean falloff near world edge (ensures vast surrounding sea)
  const edgeDist = Math.max(Math.abs(x), Math.abs(z));
  const edgeDrop = smoothstep(1260, 1500, edgeDist);
  h = h * (1 - edgeDrop) + -12.5 * edgeDrop;

  return h;
}

export interface FlightState {
  x: number;
  y: number;
  z: number;
  yaw: number;   // radians, 0 faces -Z
  pitch: number; // radians, positive pitches nose up
  roll: number;  // radians, positive banks left
  speed: number; // m/s
  boost: number; // 0..100
  barrelRollTimer: number; // >0 while executing 360 roll
  barrelRollDir: number;   // -1 or +1
  strafeVel: number;
}

export interface FlightInput {
  turn: number;     // -1 left, +1 right
  pitch: number;    // -1 down, +1 up
  throttle: number; // -1 brake, +1 accelerate
  boost: boolean;
  driftOrStrafe: boolean;
}

export interface FlightParams {
  airframe: AirframeType;
  thrustStat: number; // 1..10
  overdriveActive: boolean;
}

/**
 * Pure arcade 6-DOF flight step with auto-leveling, jet/gunship modes,
 * boost energy management, barrel roll evade, and terrain/water safety floor.
 */
export function stepAircraftFlight(
  state: FlightState,
  input: FlightInput,
  params: FlightParams,
  dt: number,
): FlightState {
  const clampedDt = Math.min(Math.max(dt, 0), 0.05);
  const thrustMult = 0.88 + params.thrustStat * 0.025;
  const overdriveMult = params.overdriveActive ? 1.42 : 1.0;

  let { x, y, z, yaw, pitch, roll, speed, boost, barrelRollTimer, barrelRollDir, strafeVel } = state;

  const isJet = params.airframe === 'jet';
  const minSpeed = isJet ? 32 : 0;
  const cruiseSpeed = (isJet ? 58 : 34) * thrustMult;
  const maxSpeed = (isJet ? 102 : 54) * thrustMult * overdriveMult;

  const wantsBoost = (input.boost && boost > 2) || params.overdriveActive;
  if (wantsBoost && !params.overdriveActive) {
    boost = Math.max(0, boost - 28 * clampedDt);
  } else {
    boost = Math.min(100, boost + 18 * clampedDt);
  }

  let targetSpeed = cruiseSpeed;
  if (wantsBoost) {
    targetSpeed = maxSpeed;
  } else if (input.throttle > 0.1) {
    targetSpeed = cruiseSpeed + (maxSpeed - cruiseSpeed) * 0.45 * input.throttle;
  } else if (input.throttle < -0.1) {
    targetSpeed = isJet
      ? minSpeed + (cruiseSpeed - minSpeed) * (1 + input.throttle)
      : Math.max(0, cruiseSpeed * (1 + input.throttle));
  }

  const speedResponse = wantsBoost ? 5.5 : 3.2;
  // Aerodynamic gravity energy exchange: diving builds airspeed, steep climbs bleed airspeed
  const pitchGravityAccel = isJet ? -Math.sin(pitch) * 26 : -Math.sin(pitch) * 10;
  speed += ((targetSpeed - speed) * (1 - Math.exp(-speedResponse * clampedDt))) + pitchGravityAccel * clampedDt;
  speed = Math.max(minSpeed, Math.min(maxSpeed * 1.18, speed));

  // Turn & Roll
  const turnRate = isJet
    ? input.driftOrStrafe ? 2.15 : 1.48
    : 1.85;

  if (!isJet && input.driftOrStrafe) {
    // Gunship lateral strafe mode
    const targetStrafe = input.turn * 34;
    strafeVel += (targetStrafe - strafeVel) * (1 - Math.exp(-8 * clampedDt));
  } else {
    strafeVel += (0 - strafeVel) * (1 - Math.exp(-8 * clampedDt));
    yaw -= input.turn * turnRate * clampedDt;
  }

  // Smooth Pitch with auto-leveling when neutral
  const maxPitch = isJet ? 0.58 : 0.46;
  const targetPitch = input.pitch * maxPitch;
  pitch += (targetPitch - pitch) * (1 - Math.exp(-(Math.abs(input.pitch) > 0.05 ? 6.5 : 3.4) * clampedDt));

  // Visual bank / barrel roll
  if (barrelRollTimer > 0) {
    barrelRollTimer = Math.max(0, barrelRollTimer - clampedDt);
    const progress = 1 - barrelRollTimer / 0.55;
    roll = barrelRollDir * progress * Math.PI * 2;
  } else {
    const targetBank = -input.turn * (isJet ? 0.84 : 0.44);
    roll += (targetBank - roll) * (1 - Math.exp(-6.5 * clampedDt));
  }

  // Forward direction vector (yaw=0 faces -Z)
  const cosPitch = Math.cos(pitch);
  const fx = -Math.sin(yaw) * cosPitch;
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * cosPitch;

  // Right vector for gunship strafe
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  x += (fx * speed + rx * strafeVel) * clampedDt;
  y += fy * speed * clampedDt;
  z += (fz * speed + rz * strafeVel) * clampedDt;

  // Soft boundary turnback inside 1490m radius of the 3200x3200m warzone
  const softLimit = WORLD_HALF_SIZE - 110;
  if (Math.abs(x) > softLimit) {
    x = Math.sign(x) * softLimit;
    const toCenterYaw = Math.atan2(x, z);
    const diff = normalizeAngle(toCenterYaw - yaw);
    yaw += diff * Math.min(1, clampedDt * 2.5);
  }
  if (Math.abs(z) > softLimit) {
    z = Math.sign(z) * softLimit;
    const toCenterYaw = Math.atan2(x, z);
    const diff = normalizeAngle(toCenterYaw - yaw);
    yaw += diff * Math.min(1, clampedDt * 2.5);
  }

  // Terrain & water clearance guard (allows low-altitude skimming & realistic slam detection)
  const groundY = Math.max(WATER_LEVEL, getTerrainHeight(x, z));
  const minAlt = groundY + (isJet ? 5.2 : 4.2);
  if (y < minAlt) {
    y = minAlt;
    if (pitch < 0.06) pitch = 0.06;
  }
  const maxAlt = 275;
  if (y > maxAlt) {
    y = maxAlt;
    if (pitch > 0) pitch *= 0.6;
  }

  return {
    x,
    y,
    z,
    yaw: normalizeAngle(yaw),
    pitch,
    roll,
    speed,
    boost,
    barrelRollTimer,
    barrelRollDir,
    strafeVel,
  };
}

export function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/**
 * Continuous swept segment-vs-sphere intersection (prevents fast Vulcan/Rocket tunneling).
 */
export function segmentSphereIntersect(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-8) {
    const ex = ax - cx;
    const ey = ay - cy;
    const ez = az - cz;
    return ex * ex + ey * ey + ez * ez <= radius * radius;
  }
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / lenSq));
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  const pz = az + dz * t - cz;
  return px * px + py * py + pz * pz <= radius * radius;
}

/**
 * Continuous swept segment-vs-AABB slab intersection for solid buildings, cranes, and bridge piers.
 */
export function segmentAABBIntersect(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  pad = 0,
): boolean {
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [ax, bx - ax, box.minX - pad, box.maxX + pad],
    [ay, by - ay, box.minY - pad, box.maxY + pad],
    [az, bz - az, box.minZ - pad, box.maxZ + pad],
  ];
  for (const [origin, dir, minB, maxB] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < minB || origin > maxB) return false;
    } else {
      let t1 = (minB - origin) / dir;
      let t2 = (maxB - origin) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/**
 * Resolves aircraft sphere collision against a solid world AABB with exact push-out and unit surface normal.
 */
export function resolveSphereAABBCollision(
  x: number,
  y: number,
  z: number,
  radius: number,
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
): { hit: boolean; pushX: number; pushY: number; pushZ: number; nx: number; ny: number; nz: number } {
  const closestX = Math.max(box.minX, Math.min(x, box.maxX));
  const closestY = Math.max(box.minY, Math.min(y, box.maxY));
  const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));

  const dx = x - closestX;
  const dy = y - closestY;
  const dz = z - closestZ;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= radius * radius) {
    return { hit: false, pushX: 0, pushY: 0, pushZ: 0, nx: 0, ny: 0, nz: 0 };
  }

  const dist = Math.sqrt(distSq);
  if (dist > 1e-5) {
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    const overlap = radius - dist + 0.55;
    return {
      hit: true,
      pushX: nx * overlap,
      pushY: ny * overlap,
      pushZ: nz * overlap,
      nx,
      ny,
      nz,
    };
  }
  // Center is inside AABB — eject cleanly along shallowest exit face (prefer upward for decks)
  const penTop = box.maxY - y;
  const penLeft = x - box.minX;
  const penRight = box.maxX - x;
  const penFront = box.maxZ - z;
  const penBack = z - box.minZ;
  const minPen = Math.min(penTop, penLeft, penRight, penFront, penBack);

  if (minPen === penTop || penTop < 4.5) {
    return { hit: true, pushX: 0, pushY: penTop + radius + 0.8, pushZ: 0, nx: 0, ny: 1, nz: 0 };
  }
  if (minPen === penLeft) {
    return { hit: true, pushX: -(penLeft + radius + 0.8), pushY: 0, pushZ: 0, nx: -1, ny: 0, nz: 0 };
  }
  if (minPen === penRight) {
    return { hit: true, pushX: penRight + radius + 0.8, pushY: 0, pushZ: 0, nx: 1, ny: 0, nz: 0 };
  }
  if (minPen === penFront) {
    return { hit: true, pushX: 0, pushY: 0, pushZ: penFront + radius + 0.8, nx: 0, ny: 0, nz: 1 };
  }
  return { hit: true, pushX: 0, pushY: 0, pushZ: -(penBack + radius + 0.8), nx: 0, ny: 0, nz: -1 };
}

export interface AircraftImpactResult {
  severity: 'scrape' | 'bounce' | 'crash';
  damage: number;
  newSpeed: number;
  newYaw: number;
  newPitch: number;
  impulseVx: number;
  impulseVy: number;
  impulseVz: number;
  spinRollVel: number;
  spinPitchVel: number;
  spinYawVel: number;
  closingSpeed: number;
}

/**
 * Real rigid-body aircraft collision solver:
 * - Decomposes incoming velocity into normal closing impact speed & tangential slide
 * - Applies elastic restitution + aerodynamic surface friction
 * - Generates physical recoil velocity, heading deflection, and angular spin torque
 * - Scales kinetic hull damage continuously from glancing wingtip scrape -> hard oblique bounce -> head-on crash
 */
export function computeAircraftImpactPhysics(input: {
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  nx: number;
  ny: number;
  nz: number;
  airframe: AirframeType;
}): AircraftImpactResult {
  const nLen = Math.hypot(input.nx, input.ny, input.nz) || 1;
  const nx = input.nx / nLen;
  const ny = input.ny / nLen;
  const nz = input.nz / nLen;

  const speed = Math.max(1, Math.hypot(input.vx, input.vy, input.vz));
  // Closing speed into the obstacle surface (positive when moving into the wall/bridge)
  const vDotN = input.vx * nx + input.vy * ny + input.vz * nz;
  const closingSpeed = Math.max(0, -vDotN);
  const impactAngleFactor = Math.min(1, closingSpeed / speed);

  // Restitution & tangential friction
  const restitution = impactAngleFactor > 0.68 ? 0.52 : 0.36;
  const friction = impactAngleFactor < 0.35 ? 0.88 : 0.64;

  // Normal & tangential velocity decomposition
  const vnX = vDotN * nx;
  const vnY = vDotN * ny;
  const vnZ = vDotN * nz;
  const vtX = input.vx - vnX;
  const vtY = input.vy - vnY;
  const vtZ = input.vz - vnZ;

  // Reflected velocity vector
  const rx = vtX * friction - vnX * restitution;
  const ry = vtY * friction - vnY * restitution;
  const rz = vtZ * friction - vnZ * restitution;
  const reflectedSpeed = Math.hypot(rx, ry, rz);

  // Compute aircraft right vector to determine which wing struck the obstacle (for realistic roll torque)
  const rightX = Math.cos(input.yaw);
  const rightZ = -Math.sin(input.yaw);
  const sideBias = nx * rightX + nz * rightZ; // + if obstacle is on left (pushes right), - if obstacle on right

  let severity: 'scrape' | 'bounce' | 'crash' = 'scrape';
  if (impactAngleFactor >= 0.68 && closingSpeed >= 36) {
    severity = 'crash';
  } else if (impactAngleFactor >= 0.32 || closingSpeed >= 22) {
    severity = 'bounce';
  }

  // Kinetic damage proportional to closing impact speed & structural hardness
  const airframeArmorFactor = input.airframe === 'gunship' ? 0.82 : 1.0;
  let rawDamage = 8 + closingSpeed * 0.62 + impactAngleFactor * 22;
  if (severity === 'crash') {
    rawDamage = Math.max(52, closingSpeed * 1.15);
  } else if (severity === 'scrape') {
    rawDamage = Math.min(20, 7 + closingSpeed * 0.32);
  }
  const damage = Math.max(6, Math.min(95, Math.round(rawDamage * airframeArmorFactor)));

  // Linear rebound impulse (damped over time by engine aerodynamics)
  const bouncePush = Math.max(12, closingSpeed * (0.55 + restitution * 0.5));
  const impulseVx = nx * bouncePush;
  const impulseVy = ny * bouncePush + (ny > 0.35 ? 6 : 2.5);
  const impulseVz = nz * bouncePush;

  // Blend aircraft heading smoothly toward reflected vector on oblique hits, keep mostly straight on scrapes
  let newYaw = input.yaw;
  let newPitch = input.pitch;
  if (reflectedSpeed > 8 && severity !== 'scrape') {
    const reflYaw = Math.atan2(-rx, -rz);
    const reflPitch = Math.max(-0.55, Math.min(0.65, Math.asin(Math.max(-0.95, Math.min(0.95, ry / reflectedSpeed)))));
    const turnBlend = severity === 'crash' ? 0.65 : 0.42;
    const yawDelta = normalizeAngle(reflYaw - input.yaw);
    newYaw = normalizeAngle(input.yaw + yawDelta * turnBlend);
    newPitch = input.pitch + (reflPitch - input.pitch) * turnBlend + (ny > 0.4 ? 0.18 : 0);
  } else if (ny > 0.4) {
    newPitch = Math.max(0.14, input.pitch + 0.16);
  }

  // Rotational spin torque from off-center wing/nose impact
  const torqueScale = severity === 'crash' ? 7.5 : severity === 'bounce' ? 4.4 : 1.9;
  const spinRollVel = (Math.abs(sideBias) > 0.1 ? Math.sign(sideBias) : 1) * torqueScale;
  const spinYawVel = sideBias * torqueScale * 0.55;
  const spinPitchVel = ny * torqueScale * 0.38;

  const minFloorSpeed = input.airframe === 'jet' ? 26 : 12;
  const newSpeed = Math.max(
    minFloorSpeed,
    Math.min(speed * 0.92, severity === 'crash' ? speed * 0.42 : Math.max(minFloorSpeed, reflectedSpeed)),
  );

  return {
    severity,
    damage,
    newSpeed,
    newYaw,
    newPitch: Math.max(-0.68, Math.min(0.68, newPitch)),
    impulseVx,
    impulseVy,
    impulseVz,
    spinRollVel,
    spinPitchVel,
    spinYawVel,
    closingSpeed,
  };
}

export interface RocketKinematicInput {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  target: { x: number; y: number; z: number; vx: number; vy: number; vz: number } | null;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  weaveSeed: number;
}

/**
 * Proportional-navigation rocket physics:
 * - Brief 0.14s drop-away ignition phase
 * - High-thrust booster acceleration curve
 * - Lead-intercept homing + subtle Macross weave that tightens on terminal approach
 */
export function stepRocketPhysics(
  r: RocketKinematicInput,
  dt: number,
): { vx: number; vy: number; vz: number; speed: number } {
  const clampedDt = Math.min(Math.max(dt, 0), 0.05);
  let vx = r.vx;
  let vy = r.vy;
  let vz = r.vz;

  // Brief rail launch drop-away before main booster ignites
  if (r.age < 0.12) {
    vy -= 9.5 * clampedDt;
    const speed = Math.hypot(vx, vy, vz);
    return { vx, vy, vz, speed };
  }

  const curSpd = Math.max(1, Math.hypot(vx, vy, vz));
  const nextSpd = Math.min(r.maxSpeed, curSpd + r.accel * clampedDt);
  let dirX = vx / curSpd;
  let dirY = vy / curSpd;
  let dirZ = vz / curSpd;

  if (r.target) {
    const rx = r.target.x - r.x;
    const ry = r.target.y - r.y;
    const rz = r.target.z - r.z;
    const dist = Math.max(1, Math.hypot(rx, ry, rz));
    // Lead intercept time-to-go
    const tti = Math.min(1.4, dist / Math.max(40, nextSpd));
    let aimX = rx + r.target.vx * tti * 0.72;
    let aimY = ry + r.target.vy * tti * 0.72;
    let aimZ = rz + r.target.vz * tti * 0.72;

    // Subtle Macross corkscrew weave far from target, straightening cleanly in terminal 65m
    const weaveAmp = Math.max(0, Math.min(1, (dist - 55) / 140)) * 7.5;
    if (weaveAmp > 0.1) {
      const phase = r.age * 9.5 + r.weaveSeed;
      aimX += Math.cos(phase) * weaveAmp;
      aimY += Math.sin(phase * 1.15) * weaveAmp * 0.65;
    }

    const aimLen = Math.max(1e-5, Math.hypot(aimX, aimY, aimZ));
    aimX /= aimLen;
    aimY /= aimLen;
    aimZ /= aimLen;

    const blend = 1 - Math.exp(-r.turnRate * clampedDt);
    dirX += (aimX - dirX) * blend;
    dirY += (aimY - dirY) * blend;
    dirZ += (aimZ - dirZ) * blend;
    const dLen = Math.max(1e-5, Math.hypot(dirX, dirY, dirZ));
    dirX /= dLen;
    dirY /= dLen;
    dirZ /= dLen;
  }

  vx = dirX * nextSpd;
  vy = dirY * nextSpd;
  vz = dirZ * nextSpd;
  return { vx, vy, vz, speed: nextSpd };
}

export interface CCIPResult {
  x: number;
  y: number;
  z: number;
  flightTime: number;
  hitWater: boolean;
}

/**
 * Computes predicted ballistic impact point (CCIP) for dumb bombs.
 */
export function computeCCIPImpact(
  originX: number,
  originY: number,
  originZ: number,
  vx: number,
  vy: number,
  vz: number,
  gravity = 38,
): CCIPResult {
  let x = originX;
  let y = originY;
  let z = originZ;
  let curVy = vy;
  const step = 0.08;
  let t = 0;

  for (let i = 0; i < 65; i++) {
    t += step;
    curVy -= gravity * step;
    x += vx * step;
    y += curVy * step;
    z += vz * step;
    const ground = Math.max(WATER_LEVEL, getTerrainHeight(x, z));
    if (y <= ground) {
      return {
        x,
        y: ground,
        z,
        flightTime: t,
        hitWater: ground <= WATER_LEVEL + 0.05,
      };
    }
  }

  const finalGround = Math.max(WATER_LEVEL, getTerrainHeight(x, z));
  return {
    x,
    y: finalGround,
    z,
    flightTime: t,
    hitWater: finalGround <= WATER_LEVEL + 0.05,
  };
}

export interface LockCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  priority?: number;
}

/**
 * Selects up to `maxTargets` enemies within range & forward cone, ordered by angular proximity.
 */
export function selectLockTargets(
  origin: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
  candidates: LockCandidate[],
  maxRange = 360,
  minCosAngle = 0.72,
  maxTargets = 4,
): string[] {
  const scored: { id: string; score: number }[] = [];

  for (const c of candidates) {
    if (!c.alive) continue;
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const dz = c.z - origin.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < 16 || distSq > maxRange * maxRange) continue;
    const dist = Math.sqrt(distSq);
    const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / dist;
    if (dot < minCosAngle) continue;

    // Higher dot (more centered) + closer + priority bonus = higher score
    const score = dot * 2.2 - (dist / maxRange) * 0.8 + (c.priority ?? 0) * 0.2;
    scored.push({ id: c.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxTargets).map((s) => s.id);
}

/**
 * Finds adjacent fuel tanks within blast radius for cascading chain detonations.
 */
export function getChainDetonationTargets(
  sourceId: string,
  tanks: { id: string; x: number; z: number; alive: boolean }[],
  blastRadius = 32,
): string[] {
  const src = tanks.find((t) => t.id === sourceId);
  if (!src) return [];
  const r2 = blastRadius * blastRadius;
  const result: string[] = [];
  for (const t of tanks) {
    if (!t.alive || t.id === sourceId) continue;
    const dx = t.x - src.x;
    const dz = t.z - src.z;
    if (dx * dx + dz * dz <= r2) {
      result.push(t.id);
    }
  }
  return result;
}

export function evaluateMissionState(input: {
  hull: number;
  targetsDestroyed: number;
  targetsTotal: number;
  mode: GameMode;
}): 'playing' | 'victory' | 'defeat' {
  if (input.hull <= 0) return 'defeat';
  if (input.mode === 'campaign' && input.targetsTotal > 0 && input.targetsDestroyed >= input.targetsTotal) {
    return 'victory';
  }
  return 'playing';
}

export function calculateKillScore(basePoints: number, combo: number, difficulty: Difficulty): number {
  const diffMult = DIFFICULTY_TUNING[difficulty].scoreMult;
  const comboMult = 1 + Math.min(combo, 10) * 0.15;
  return Math.round(basePoints * comboMult * diffMult);
}

export function computeRunRank(
  victory: boolean,
  hullPct: number,
  elapsedSec: number,
  accuracyPct: number,
): 'S' | 'A' | 'B' | 'C' {
  if (!victory) return 'C';
  let pts = 0;
  if (hullPct >= 70) pts += 3;
  else if (hullPct >= 40) pts += 2;
  else pts += 1;

  if (elapsedSec <= 95) pts += 3;
  else if (elapsedSec <= 150) pts += 2;
  else pts += 1;

  if (accuracyPct >= 35) pts += 2;
  else if (accuracyPct >= 18) pts += 1;

  if (pts >= 7) return 'S';
  if (pts >= 5) return 'A';
  if (pts >= 3) return 'B';
  return 'C';
}

/**
 * Formats and pushes a tactical killfeed entry, capping the feed to `maxItems`.
 */
export function pushKillfeedEntry(
  feed: KillfeedEntry[],
  entry: { headline: string; pointsText?: string; accent: KillfeedAccent; ttl?: number },
  id: string,
  maxItems = 5,
): KillfeedEntry[] {
  const next: KillfeedEntry = {
    id,
    headline: entry.headline,
    pointsText: entry.pointsText,
    accent: entry.accent,
    age: 0,
    ttl: entry.ttl ?? 5.5,
  };
  return [next, ...feed].slice(0, maxItems);
}

/**
 * Ages killfeed items and drops expired entries.
 */
export function stepKillfeedEntries(feed: KillfeedEntry[], dt: number): KillfeedEntry[] {
  const out: KillfeedEntry[] = [];
  for (const item of feed) {
    const nextAge = item.age + dt;
    if (nextAge < item.ttl) {
      out.push({ ...item, age: nextAge });
    }
  }
  return out;
}

export interface AfterburnerTelemetry {
  intensity: number;
  plumeLengthScale: number;
  plumeRadiusScale: number;
  heatStrength: number;
  lightIntensity: number;
  lightR: number;
  lightG: number;
  lightB: number;
}

/**
 * Computes damped supersonic afterburner state, plume dimensions, heat-distortion
 * intensity, and fuselage light spill parameters from flight throttle/boost state.
 */
export function computeAfterburnerTelemetry(input: {
  boosting: boolean;
  overdriveActive: boolean;
  speed: number;
  boostRemaining: number;
  prevIntensity: number;
  timeSec: number;
  dt: number;
}): AfterburnerTelemetry {
  const clampedDt = Math.min(Math.max(input.dt, 0), 0.1);
  const active = (input.boosting && input.boostRemaining > 0.5) || input.overdriveActive;
  const cruiseFloor = 0.14 + Math.max(0, Math.min(0.18, (input.speed - 40) * 0.0045));
  const target = active ? 1.0 : cruiseFloor;
  const lambda = target > input.prevIntensity ? 14.0 : 6.5;
  const alpha = 1 - Math.exp(-lambda * clampedDt);
  const intensity = Math.max(0, Math.min(1, input.prevIntensity + (target - input.prevIntensity) * alpha));

  // Multi-frequency supersonic combustion instability flicker
  const flicker =
    0.5 +
    0.32 * Math.sin(input.timeSec * 37.0) +
    0.18 * Math.cos(input.timeSec * 61.0 + 1.1);

  const plumeLengthScale = 0.62 + intensity * 1.24 + (flicker - 0.5) * (0.06 + intensity * 0.22);
  const plumeRadiusScale = 0.86 + intensity * 0.30;
  const heatStrength = Math.max(0.08, Math.min(1.0, 0.10 + intensity * 0.90));
  const lightIntensity = 1.6 + intensity * (24.0 + (flicker - 0.5) * 5.2);

  // Hot fiery amber-orange outer spill blended with incandescent white-blue core energy at full boost
  const lightR = 1.0;
  const lightG = 0.50 + intensity * 0.22;
  const lightB = 0.18 + intensity * 0.28;

  return {
    intensity,
    plumeLengthScale,
    plumeRadiusScale,
    heatStrength,
    lightIntensity,
    lightR,
    lightG,
    lightB,
  };
}

export interface VirtualStickOutput {
  turn: number;
  pitch: number;
  knobX: number;
  knobY: number;
  magnitude: number;
}

/**
 * Converts pointer pixel offsets relative to the virtual stick center into
 * radially clamped, deadzone-filtered analog flight controls (-1..1).
 * Upward drag (dyPx < 0) produces positive pitch climb (+1).
 */
export function computeVirtualStickAxis(
  dxPx: number,
  dyPx: number,
  maxRadiusPx = 46,
  deadzone = 0.12,
): VirtualStickOutput {
  const radius = Math.max(8, maxRadiusPx);
  const dist = Math.hypot(dxPx, dyPx);
  if (dist < 1e-4) {
    return { turn: 0, pitch: 0, knobX: 0, knobY: 0, magnitude: 0 };
  }

  const clampedDist = Math.min(dist, radius);
  const nx = dxPx / dist;
  const ny = dyPx / dist;
  const knobX = nx * clampedDist;
  const knobY = ny * clampedDist;

  const rawMag = clampedDist / radius;
  if (rawMag <= deadzone) {
    return { turn: 0, pitch: 0, knobX, knobY, magnitude: 0 };
  }

  const scaledMag = Math.min(1, (rawMag - deadzone) / Math.max(0.05, 1 - deadzone));
  return {
    turn: Math.max(-1, Math.min(1, nx * scaledMag)),
    pitch: Math.max(-1, Math.min(1, -ny * scaledMag)),
    knobX,
    knobY,
    magnitude: scaledMag,
  };
}



