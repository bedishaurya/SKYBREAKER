import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_Z,
  QUAY_HEIGHT,
  WATER_LEVEL,
  calculateKillScore,
  computeAfterburnerTelemetry,
  computeAircraftImpactPhysics,
  computeCCIPImpact,
  computeRunRank,
  computeVirtualStickAxis,
  evaluateMissionState,
  getChainDetonationTargets,
  getTerrainHeight,
  pushKillfeedEntry,
  resolveSphereAABBCollision,
  segmentAABBIntersect,
  segmentSphereIntersect,
  selectLockTargets,
  stepAircraftFlight,
  stepKillfeedEntries,
  stepRocketPhysics,
  type FlightState,
} from './rules';

test('archipelago heightfield keeps central strait underwater and quays flat at 4.2m', () => {
  // Central strait water channel
  assert.ok(getTerrainHeight(0, 0) < WATER_LEVEL);
  assert.ok(getTerrainHeight(0, 235) < WATER_LEVEL); // Allied carrier spawn zone
  assert.ok(getTerrainHeight(0, BRIDGE_Z) < WATER_LEVEL); // Under red truss bridge

  // West Harbour City Quay plateau
  const westQuayY = getTerrainHeight(-140, -15);
  assert.ok(Math.abs(westQuayY - QUAY_HEIGHT) < 0.35, `Expected west quay ~4.2m, got ${westQuayY}`);

  // East Fuel Depot Quay plateau
  const eastQuayY = getTerrainHeight(140, -15);
  assert.ok(Math.abs(eastQuayY - QUAY_HEIGHT) < 0.35, `Expected east quay ~4.2m, got ${eastQuayY}`);

  // Alpine peaks rise high above sea level
  assert.ok(getTerrainHeight(-365, -360) > 45);
  assert.ok(getTerrainHeight(365, -365) > 45);
  assert.ok(getTerrainHeight(-1040, -180) > 80);
  assert.ok(getTerrainHeight(1055, -165) > 80);

  // Expanded 3200x3200m combined-arms tank plains & northern mainland are drivable land above sea level
  const eastPlainY = getTerrainHeight(520, 40);
  const westPlainY = getTerrainHeight(-520, 40);
  const northPlainY = getTerrainHeight(0, -690);
  assert.ok(eastPlainY > 6 && eastPlainY < 26, `Expected drivable East Tank Plain, got ${eastPlainY}`);
  assert.ok(westPlainY > 6 && westPlainY < 26, `Expected drivable West Tank Plain, got ${westPlainY}`);
  assert.ok(northPlainY > 6 && northPlainY < 28, `Expected drivable North Mainland Plain, got ${northPlainY}`);

  // Expanded outer open sea stays deep underwater for naval task forces
  assert.ok(getTerrainHeight(0, 1150) < WATER_LEVEL);
  assert.ok(getTerrainHeight(1400, 0) < WATER_LEVEL);
});

test('aircraft flight survives neutral input without crashing and responds to steering/boost', () => {
  let state: FlightState = {
    x: 0,
    y: 42,
    z: 210,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 55,
    boost: 100,
    barrelRollTimer: 0,
    barrelRollDir: 1,
    strafeVel: 0,
  };

  // Simulate 3 seconds with zero input
  for (let i = 0; i < 60; i++) {
    state = stepAircraftFlight(
      state,
      { turn: 0, pitch: 0, throttle: 0, boost: false, driftOrStrafe: false },
      { airframe: 'jet', thrustStat: 8, overdriveActive: false },
      0.05,
    );
  }
  assert.ok(state.z < 100, 'Jet should fly forward along -Z');
  assert.ok(state.y > 10, 'Jet should maintain safe altitude with no input');

  // Boost drains boost bar and increases speed
  const boosted = stepAircraftFlight(
    state,
    { turn: 1, pitch: 0.4, throttle: 1, boost: true, driftOrStrafe: false },
    { airframe: 'jet', thrustStat: 8, overdriveActive: false },
    0.05,
  );
  assert.ok(boosted.speed > state.speed);
  assert.ok(boosted.boost < state.boost);
  assert.ok(boosted.yaw < state.yaw);

  // Gunship strafe moves laterally without turning yaw
  const gunshipBefore: FlightState = { ...state, yaw: 0, strafeVel: 0 };
  const gunshipStrafed = stepAircraftFlight(
    gunshipBefore,
    { turn: 1, pitch: 0, throttle: -1, boost: false, driftOrStrafe: true },
    { airframe: 'gunship', thrustStat: 7, overdriveActive: false },
    0.05,
  );
  assert.equal(gunshipStrafed.yaw, 0);
  assert.ok(gunshipStrafed.strafeVel > 0);
});

test('CCIP ballistic solver predicts ground/water impact ahead of aircraft', () => {
  const impact = computeCCIPImpact(0, 50, 100, 0, 0, -50);
  assert.ok(impact.z < 100, 'Impact point must be forward along -Z');
  assert.ok(impact.flightTime > 0.5 && impact.flightTime < 4.0);
  assert.equal(impact.hitWater, true);
  assert.equal(impact.y, WATER_LEVEL);
});

test('Macross multi-lock selects up to 4 closest centered enemies in forward cone', () => {
  const targets = selectLockTargets(
    { x: 0, y: 40, z: 100 },
    { x: 0, y: 0, z: -1 },
    [
      { id: 'behind', x: 0, y: 40, z: 180, alive: true },
      { id: 'dead', x: 0, y: 40, z: 0, alive: false },
      { id: 'center', x: 2, y: 40, z: -20, alive: true },
      { id: 'left', x: -25, y: 40, z: -30, alive: true },
      { id: 'right', x: 28, y: 40, z: -40, alive: true },
      { id: 'far', x: 5, y: 40, z: -120, alive: true },
      { id: 'fifth', x: -12, y: 40, z: -160, alive: true },
    ],
  );
  assert.equal(targets.length, 4);
  assert.equal(targets[0], 'center');
  assert.ok(!targets.includes('behind'));
  assert.ok(!targets.includes('dead'));
});

test('fuel tank chain detonation finds nearby alive tanks only', () => {
  const victims = getChainDetonationTargets(
    't1',
    [
      { id: 't1', x: 120, z: 0, alive: false },
      { id: 't2', x: 140, z: 5, alive: true },
      { id: 't3', x: 125, z: -20, alive: true },
      { id: 't4', x: 200, z: 0, alive: true },
      { id: 't5', x: 130, z: 0, alive: false },
    ],
    30,
  );
  assert.deepEqual(victims.sort(), ['t2', 't3']);
});

test('mission evaluation, scoring, and rank calculation behave deterministically', () => {
  assert.equal(evaluateMissionState({ hull: 0, targetsDestroyed: 5, targetsTotal: 10, mode: 'campaign' }), 'defeat');
  assert.equal(evaluateMissionState({ hull: 80, targetsDestroyed: 10, targetsTotal: 10, mode: 'campaign' }), 'victory');
  assert.equal(evaluateMissionState({ hull: 80, targetsDestroyed: 10, targetsTotal: 10, mode: 'endless' }), 'playing');

  assert.ok(calculateKillScore(500, 4, 'ace') > calculateKillScore(500, 0, 'normal'));
  assert.equal(computeRunRank(true, 85, 70, 45), 'S');
  assert.equal(computeRunRank(false, 0, 50, 50), 'C');
});

test('swept segment collision prevents fast rocket/bullet tunneling and resolves AABB bounce', () => {
  // Bullet starts before sphere and ends past sphere in one step -> must still hit!
  assert.equal(segmentSphereIntersect(0, 20, 50, 0, 20, -50, 0, 20, 0, 3), true);
  assert.equal(segmentSphereIntersect(0, 20, 50, 0, 20, -50, 12, 20, 0, 3), false);

  const tower = { minX: -10, maxX: 10, minY: 0, maxY: 40, minZ: -10, maxZ: 10 };
  assert.equal(segmentAABBIntersect(0, 20, 30, 0, 20, -30, tower), true);
  assert.equal(segmentAABBIntersect(25, 20, 30, 25, 20, -30, tower), false);

  const bounce = resolveSphereAABBCollision(12, 20, 0, 4, tower);
  assert.equal(bounce.hit, true);
  assert.ok(bounce.pushX > 2, 'Should push aircraft out along +X normal');
});

test('proportional-navigation rocket physics drops on launch then accelerates toward target', () => {
  const drop = stepRocketPhysics(
    { x: 0, y: 40, z: 100, vx: 0, vy: 0, vz: -80, age: 0.05, target: null, maxSpeed: 210, accel: 150, turnRate: 7, weaveSeed: 0 },
    0.05,
  );
  assert.ok(drop.vy < 0, 'Rocket should briefly drop off launch rail before booster ignites');

  const homing = stepRocketPhysics(
    {
      x: 0,
      y: 40,
      z: 100,
      vx: 0,
      vy: 0,
      vz: -90,
      age: 0.4,
      target: { x: 45, y: 45, z: 0, vx: 10, vy: 0, vz: 0 },
      maxSpeed: 210,
      accel: 150,
      turnRate: 7,
      weaveSeed: 0,
    },
    0.05,
  );
  assert.ok(homing.speed > 90, 'Booster should accelerate missile');
  assert.ok(homing.vx > 0, 'Proportional navigation should steer toward +X target');
});

test('tactical killfeed caps entries and expires old destruction events cleanly', () => {
  let feed = pushKillfeedEntry([], { headline: 'TARGET DESTROYED: AA SAM SITE', pointsText: '+350', accent: 'kill', ttl: 4 }, 'k1', 3);
  feed = pushKillfeedEntry(feed, { headline: 'ACE RANK BONUS: ×2', pointsText: '+150', accent: 'bonus', ttl: 4 }, 'k2', 3);
  feed = pushKillfeedEntry(feed, { headline: 'SPLASH ONE: BANDIT JET', pointsText: '+500', accent: 'kill', ttl: 4 }, 'k3', 3);
  feed = pushKillfeedEntry(feed, { headline: 'CHAIN DETONATION: FUEL TANK', pointsText: '+250', accent: 'objective', ttl: 4 }, 'k4', 3);

  assert.equal(feed.length, 3);
  assert.equal(feed[0].id, 'k4');

  const aged = stepKillfeedEntries(feed, 4.1);
  assert.equal(aged.length, 0);
});

test('real aircraft impact physics differentiates glancing bridge scrape from oblique bounce and head-on crash', () => {
  // 1. Glancing belly scrape over bridge deck (moving fast along -Z, slight downward vy)
  const scrape = computeAircraftImpactPhysics({
    vx: 0,
    vy: -6,
    vz: -65,
    yaw: 0,
    pitch: -0.09,
    nx: 0,
    ny: 1,
    nz: 0,
    airframe: 'jet',
  });
  assert.equal(scrape.severity, 'scrape');
  assert.ok(scrape.damage <= 20, `Glancing scrape damage should be light, got ${scrape.damage}`);
  assert.ok(scrape.impulseVy > 0, 'Bridge deck should rebound aircraft upward');

  // 2. Hard oblique impact into bridge truss side girder
  const bounce = computeAircraftImpactPhysics({
    vx: -32,
    vy: 0,
    vz: -55,
    yaw: 0.52,
    pitch: 0,
    nx: 1,
    ny: 0,
    nz: 0,
    airframe: 'jet',
  });
  assert.equal(bounce.severity, 'bounce');
  assert.ok(bounce.impulseVx > 15, 'Should recoil strongly away from girder');
  assert.ok(Math.abs(bounce.spinRollVel) > 3, 'Oblique wing strike should induce roll spin torque');

  // 3. Full-speed head-on slam into concrete bridge pier
  const crash = computeAircraftImpactPhysics({
    vx: 0,
    vy: 0,
    vz: -78,
    yaw: 0,
    pitch: 0,
    nx: 0,
    ny: 0,
    nz: 1,
    airframe: 'jet',
  });
  assert.equal(crash.severity, 'crash');
  assert.ok(crash.damage >= 55, `Head-on crash should deal catastrophic damage, got ${crash.damage}`);
  assert.ok(crash.newSpeed < 45, 'Head-on slam should sharply bleed airspeed');
});

test('afterburner telemetry scales blue-core plume, heat distortion, and fuselage light spill dynamically', () => {
  const cruise = computeAfterburnerTelemetry({
    boosting: false,
    overdriveActive: false,
    speed: 55,
    boostRemaining: 100,
    prevIntensity: 0.2,
    timeSec: 1.0,
    dt: 0.05,
  });
  let ignited = cruise;
  for (let i = 0; i < 5; i++) {
    ignited = computeAfterburnerTelemetry({
      boosting: true,
      overdriveActive: false,
      speed: 82,
      boostRemaining: 90,
      prevIntensity: ignited.intensity,
      timeSec: 1.1 + i * 0.05,
      dt: 0.05,
    });
  }
  assert.ok(ignited.intensity > 0.85, 'Afterburner should rapidly ignite under boost');
  assert.ok(ignited.plumeLengthScale > cruise.plumeLengthScale * 1.6, 'Plume must elongate significantly on boost');
  assert.ok(ignited.heatStrength > 0.85 && cruise.heatStrength < 0.35, 'Heat distortion scales with afterburner power');
  assert.ok(ignited.lightIntensity > 18 && ignited.lightIntensity > cruise.lightIntensity * 3, 'Fuselage PointLight spill must flare brightly on boost');
});

test('virtual analog flight stick applies deadzone, circular clamp, and upward pitch climb', () => {
  const dead = computeVirtualStickAxis(3, 3, 46, 0.12);
  assert.equal(dead.turn, 0);
  assert.equal(dead.pitch, 0);

  const climbUp = computeVirtualStickAxis(0, -46, 46, 0.12);
  assert.equal(climbUp.turn, 0);
  assert.ok(climbUp.pitch > 0.99, 'Dragging stick upward should command full positive pitch');

  const diag = computeVirtualStickAxis(100, -100, 46, 0.12);
  assert.ok(Math.hypot(diag.turn, diag.pitch) <= 1.001, 'Diagonal stick must remain radially clamped inside unit circle');
  assert.ok(Math.hypot(diag.knobX, diag.knobY) <= 46.01, 'Visual knob offset stays inside stick ring radius');
});



