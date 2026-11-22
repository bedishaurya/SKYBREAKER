import * as THREE from 'three';
import { BRIDGE_DECK_Y, BRIDGE_Z, QUAY_HEIGHT, WATER_LEVEL, WORLD_HALF_SIZE, getTerrainHeight } from './rules';
import { WEATHER_PALETTES } from './config';
import type { WeatherMood, WorldObstacleAABB } from './types';
import { createAlliedCarrier, createLighthouse } from './models';

export interface BridgeSpan {
  id: string;
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  collapsed: boolean;
  collapseTimer: number;
}

export interface WorldHandles {
  group: THREE.Group;
  oceanMat: THREE.ShaderMaterial;
  skyMat: THREE.ShaderMaterial;
  cloudsGroup: THREE.Group;
  cloudMaterials: THREE.ShaderMaterial[];
  windowMaterials: THREE.MeshStandardMaterial[];
  searchlights: THREE.Group[];
  lighthouseBeacon: THREE.Group;
  bridgeSpans: BridgeSpan[];
  obstacles: WorldObstacleAABB[];
  radarMapCanvas: HTMLCanvasElement;
  applyWeather: (mood: WeatherMood, sunLight: THREE.DirectionalLight, hemiLight: THREE.HemisphereLight, scene: THREE.Scene) => void;
  triggerWaterRipple: (x: number, z: number) => void;
  resetBridge: () => void;
}

// ============================================================================
// PROCEDURAL REAL-WORLD PBR CANVAS TEXTURES (Zero 404s)
// ============================================================================
function createTerrainDetailTexture(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  const bc = document.createElement('canvas');
  bc.width = 512;
  bc.height = 512;
  const bctx = bc.getContext('2d');

  if (ctx && bctx) {
    ctx.fillStyle = '#9a9992';
    ctx.fillRect(0, 0, 512, 512);
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 512, 512);

    // Macro organic soil / dry turf mottling patches
    for (let i = 0; i < 420; i++) {
      const x = ((Math.sin(i * 45.164) * 43758.5453) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 93.719) * 19341.123) % 1 + 1) % 1 * 512;
      const rad = 10 + (i % 7) * 5;
      const isDark = i % 2 === 0;
      ctx.fillStyle = isDark ? 'rgba(54, 50, 40, 0.16)' : 'rgba(205, 206, 192, 0.12)';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();

      bctx.fillStyle = isDark ? 'rgba(52, 52, 52, 0.22)' : 'rgba(208, 208, 208, 0.22)';
      bctx.beginPath();
      bctx.arc(x, y, rad * 0.85, 0, Math.PI * 2);
      bctx.fill();
    }

    // Crisp grass tufts, dirt crumbs & gravel pebbles
    for (let i = 0; i < 9500; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 19341.123;
      const x = (h1 - Math.floor(h1)) * 512;
      const y = (h2 - Math.floor(h2)) * 512;
      const w = 1 + (i % 3);
      const h = 2 + (i % 4);
      const mode = i % 4;
      ctx.fillStyle =
        mode === 0
          ? 'rgba(42, 56, 34, 0.34)'
          : mode === 1
            ? 'rgba(182, 178, 160, 0.24)'
            : mode === 2
              ? 'rgba(88, 74, 52, 0.30)'
              : 'rgba(34, 40, 30, 0.28)';
      ctx.fillRect(x, y, w, h);

      bctx.fillStyle = mode % 2 === 0 ? 'rgba(220, 220, 220, 0.32)' : 'rgba(40, 40, 40, 0.30)';
      bctx.fillRect(x, y, w + 0.5, h);
    }

    // Subtle rock & dry-earth fracture lines
    ctx.strokeStyle = 'rgba(42, 40, 34, 0.22)';
    bctx.strokeStyle = 'rgba(26, 26, 26, 0.34)';
    ctx.lineWidth = 1.4;
    bctx.lineWidth = 1.6;
    for (let y = 18; y < 512; y += 34) {
      ctx.beginPath();
      bctx.beginPath();
      ctx.moveTo(0, y);
      bctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        const dy = Math.sin(x * 0.05 + y * 0.2) * 5 + Math.cos(x * 0.12 - y) * 2.5;
        ctx.lineTo(x, y + dy);
        bctx.lineTo(x, y + dy);
      }
      ctx.stroke();
      bctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(96, 96);
  map.anisotropy = 4;

  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(96, 96);
  bumpMap.anisotropy = 4;

  return { map, bumpMap };
}

function createBarkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#4f3a2b';
    ctx.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x += 5) {
      ctx.fillStyle = (x / 5) % 2 === 0 ? 'rgba(32, 22, 16, 0.55)' : 'rgba(96, 74, 56, 0.35)';
      ctx.fillRect(x, 0, 2 + (x % 3), 256);
    }
    for (let i = 0; i < 450; i++) {
      const x = (i * 37) % 128;
      const y = (i * 73) % 256;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(26, 18, 12, 0.45)' : 'rgba(115, 95, 75, 0.25)';
      ctx.fillRect(x, y, 2, 10 + (i % 12));
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
}

function createPineBranchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    // Woody twigs radiating from top-center downward like a layered pine skirt bough
    ctx.strokeStyle = '#3b2b20';
    ctx.lineWidth = 4;
    for (let b = -3; b <= 3; b++) {
      ctx.beginPath();
      ctx.moveTo(128, 14);
      ctx.lineTo(128 + b * 34, 228 - Math.abs(b) * 16);
      ctx.stroke();
    }
    // Dense layered pine needle sprays with fuller lush volume
    for (let i = 0; i < 1450; i++) {
      const t = (i % 72) / 72;
      const spread = 20 + t * 114;
      const hash = ((Math.sin(i * 91.7) * 43758.5) % 1 + 1) % 1;
      const cx = 128 + (hash - 0.5) * 2 * spread;
      const scallop = Math.sin((cx - 128) * 0.085) * 12;
      const cy = 14 + t * 212 + scallop * t;
      if (cy > 248) continue;
      const len = 12 + (i % 9);
      const ang = Math.PI * 0.5 + (hash - 0.5) * 1.45;
      ctx.strokeStyle =
        i % 4 === 0 ? '#1b361f' : i % 4 === 1 ? '#294c29' : i % 4 === 2 ? '#365e32' : '#466e3a';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createOakFoliageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    // Lush dense broadleaf canopy cluster with dappled edge silhouette
    for (let i = 0; i < 580; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt(i / 580) * 108;
      const jitter = Math.sin(i * 19.3) * 10;
      const x = 128 + Math.cos(a) * (r + jitter * 0.4);
      const y = 128 + Math.sin(a) * (r * 0.92 + jitter * 0.4);
      const leafW = 10 + (i % 7) * 1.5;
      const leafH = 7 + (i % 5) * 1.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (i % 5));
      ctx.fillStyle =
        i % 5 === 0
          ? '#1e3a1e'
          : i % 5 === 1
            ? '#2d5228'
            : i % 5 === 2
              ? '#3d6633'
              : i % 5 === 3
                ? '#4f783d'
                : '#274725';
      ctx.beginPath();
      ctx.ellipse(0, 0, leafW, leafH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPalmFrondTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    // Central spine rib
    ctx.strokeStyle = '#5f7337';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(6, 64);
    ctx.lineTo(250, 64);
    ctx.stroke();
    // Radiating feathered palm leaflets
    for (let x = 18; x < 246; x += 7) {
      const t = x / 256;
      const span = Math.sin(t * Math.PI) * 54 + 6;
      for (const dir of [-1, 1]) {
        ctx.strokeStyle = x % 14 === 0 ? '#4d7c32' : '#3b6628';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(x, 64);
        ctx.quadraticCurveTo(x + 10, 64 + dir * span * 0.55, x + 22, 64 + dir * span);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createCrossedPineBoughGeo(radius: number, height: number): THREE.BufferGeometry {
  // 5 intersecting angled double-cone/card bough ribs per tier so pine foliage has true 3D branch silhouette
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vBase = 0;

  const panels = 5;
  for (let p = 0; p < panels; p++) {
    const ang = (p / panels) * Math.PI;
    const dx = Math.cos(ang) * radius;
    const dz = Math.sin(ang) * radius;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);

    // 4-vert quad spanning full width of pine bough tier (top narrower than flared skirt bottom)
    const topW = 0.16;
    positions.push(
      -dx * topW, height, -dz * topW,
      dx * topW, height, dz * topW,
      dx, 0, dz,
      -dx, 0, -dz,
    );
    uvs.push(0.42, 1, 0.58, 1, 1, 0, 0, 0);
    for (let k = 0; k < 4; k++) normals.push(nx, 0.35, nz);
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    vBase += 4;
  }

  // Drooping conical bough collar skirt for overhead/top-down fullness
  const skirtSegs = 8;
  const tipIdx = vBase++;
  positions.push(0, height * 0.92, 0);
  uvs.push(0.5, 1);
  normals.push(0, 1, 0);
  for (let s = 0; s <= skirtSegs; s++) {
    const a = (s / skirtSegs) * Math.PI * 2;
    positions.push(Math.cos(a) * radius * 0.92, height * 0.08, Math.sin(a) * radius * 0.92);
    uvs.push(s / skirtSegs, 0.05);
    normals.push(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6);
  }
  for (let s = 0; s < skirtSegs; s++) {
    indices.push(tipIdx, tipIdx + 1 + s, tipIdx + 2 + s);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createOakCrownClusterGeo(): THREE.BufferGeometry {
  // 3 intersecting tilted foliage cards + organic puff volume per lobe -> airy realistic leaf cluster
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vBase = 0;
  const r = 2.9;

  const tilts: [number, number, number][] = [
    [0, 0, 0],
    [0.62, 1.05, 0.2],
    [-0.58, 2.15, -0.25],
    [1.32, 0.4, 0.1],
  ];
  const e = new THREE.Euler();
  const v = new THREE.Vector3();

  for (const [rx, ry, rz] of tilts) {
    e.set(rx, ry, rz);
    const corners: [number, number, number, number, number][] = [
      [-r, -r * 0.85, 0, 0, 0],
      [r, -r * 0.85, 0, 1, 0],
      [r, r * 0.85, 0, 1, 1],
      [-r, r * 0.85, 0, 0, 1],
    ];
    for (const [cx, cy, cz, u, vv] of corners) {
      v.set(cx, cy, cz).applyEuler(e);
      positions.push(v.x, v.y, v.z);
      uvs.push(u, vv);
    }
    indices.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
    vBase += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createPalmCrownGeo(): THREE.BufferGeometry {
  // 7 arched palm fronds radiating from crown top
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vBase = 0;
  const fronds = 7;

  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + (f % 2) * 0.14;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const droop = f % 2 === 0 ? 1.0 : 0.72;
    const segs = 4;
    const len = 4.6;
    const halfW = 1.05;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const dist = t * len;
      const arcY = Math.sin(t * Math.PI * 0.65) * 1.15 - t * t * 1.65 * droop;
      const w = halfW * (0.45 + Math.sin(t * Math.PI) * 0.65);

      const lx = cosY * dist - sinY * w;
      const lz = sinY * dist + cosY * w;
      const rx = cosY * dist + sinY * w;
      const rz = sinY * dist - cosY * w;

      positions.push(lx, arcY, lz, rx, arcY, rz);
      uvs.push(t, 0, t, 1);
    }
    for (let s = 0; s < segs; s++) {
      const row = vBase + s * 2;
      indices.push(row, row + 1, row + 3, row, row + 3, row + 2);
    }
    vBase += (segs + 1) * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createAsphaltRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b313a';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(18, 22, 28, 0.35)';
    ctx.fillRect(42, 0, 54, 256);
    ctx.fillRect(160, 0, 54, 256);
    for (let i = 0; i < 1200; i++) {
      const x = (i * 73) % 256;
      const y = (i * 137) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(14, 0, 5, 256);
    ctx.fillRect(237, 0, 5, 256);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(121, 0, 5, 256);
    ctx.fillRect(130, 0, 5, 256);

    ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
    for (let y = 8; y < 256; y += 44) {
      ctx.fillRect(68, y, 3, 22);
      ctx.fillRect(185, y, 3, 22);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function createConcreteApronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#626c78';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = (i * 97) % 256;
      const y = (i * 53) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.07)';
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.42)';
    ctx.lineWidth = 2;
    for (let p = 0; p < 256; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 256);
      ctx.moveTo(0, p);
      ctx.lineTo(256, p);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 9);
  tex.anisotropy = 4;
  return tex;
}

function createSkyscraperFacadeTextures(): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const albedo = document.createElement('canvas');
  albedo.width = 256;
  albedo.height = 512;
  const actx = albedo.getContext('2d');

  const emissive = document.createElement('canvas');
  emissive.width = 256;
  emissive.height = 512;
  const ectx = emissive.getContext('2d');

  if (actx && ectx) {
    actx.fillStyle = '#475569';
    actx.fillRect(0, 0, 256, 512);
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, 256, 512);

    const rows = 16;
    const cols = 8;
    const rowH = 512 / rows;
    const colW = 256 / cols;

    for (let r = 0; r < rows; r++) {
      actx.fillStyle = '#64748b';
      actx.fillRect(0, r * rowH, 256, 7);

      for (let c = 0; c < cols; c++) {
        const wx = c * colW + 4;
        const wy = r * rowH + 8;
        const ww = colW - 8;
        const wh = rowH - 11;
        const seed = ((r * 31 + c * 17) % 13) / 13;

        actx.fillStyle = seed > 0.6 ? '#263a4f' : seed > 0.25 ? '#1b2b3d' : '#314961';
        actx.fillRect(wx, wy, ww, wh);

        if (seed > 0.48) {
          ectx.fillStyle = seed > 0.78 ? '#fde68a' : '#f59e0b';
          ectx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        }
      }
    }
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;

  const emissiveMap = new THREE.CanvasTexture(emissive);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;

  return { map, emissiveMap };
}

/**
 * Builds the 3200x3200m GTA-grade coastal combined-arms world:
 * - High-resolution slope-aware terrain with soil/grass/cliff strata & bump relief
 * - Natural granite boulders, scrub undergrowth, needle-cluster pines, broadleaf oaks & coastal palms
 * - Coastal asphalt highway & Red Steel Truss Bridge with lane markings + streetlights
 * - West Harbour glass skyscrapers, helipads, gantries, shipping containers & seawalls
 * - Military hangars & sandbag/Hesco fortification revetments across the warzone
 * - Fresnel-reflective coastal ocean shader & layered soft volumetric-style clouds
 */
export function buildArchipelagoWorld(): WorldHandles {
  const group = new THREE.Group();

  // ---------------------------------------------------------------------------
  // 1. 3200x3200m SLOPE-AWARE NATURAL LAND & SEA TERRAIN HEIGHTFIELD
  // ---------------------------------------------------------------------------
  const segs = 240;
  const size = WORLD_HALF_SIZE * 2;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, getTerrainHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const normAttr = terrainGeo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const tmpColor = new THREE.Color();
  const cliffColor = new THREE.Color();
  const dirtColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const h = posAttr.getY(i);
    const slopeY = normAttr.getY(i); // 1.0 = flat ground, < 0.80 = steep cliff face

    const onWestQuay = x > -200 && x < -88 && z > -114 && z < 76 && Math.abs(h - QUAY_HEIGHT) < 0.7;
    const onEastQuay = x > 88 && x < 216 && z > -108 && z < 78 && Math.abs(h - QUAY_HEIGHT) < 0.7;
    const macroPatch =
      Math.sin(x * 0.017 + z * 0.011) * 0.5 +
      Math.cos(x * 0.031 - z * 0.027) * 0.3 +
      Math.sin(x * 0.068 + z * 0.059) * 0.2;

    if (h < -0.6) {
      tmpColor.setHex(0x102d38);
    } else if (h < 2.6) {
      // Wet dark tidal shoreline sand fading to warm coastal shingle & rock
      const wetT = Math.max(0, Math.min(1, (h + 0.4) / 2.4));
      tmpColor.setHex(0x635542).lerp(cliffColor.setHex(0xa89272), wetT);
    } else if (onWestQuay || onEastQuay) {
      tmpColor.setHex(0x4b535e);
    } else if (h > 108 && slopeY > 0.76) {
      // High-altitude jagged ridge frost only (leaves mountains sculpted granite)
      tmpColor.setHex(0xb8c2ce);
    } else {
      // Deep realistic Mediterranean & Pacific coastal evergreens, olive grasslands & scrub
      if (z < -480) {
        tmpColor.setHex(0x324d29).lerp(dirtColor.setHex(0x525d35), Math.max(0, macroPatch));
      } else if (x > 85) {
        tmpColor.setHex(0x595335).lerp(dirtColor.setHex(0x3e542c), Math.max(0, -macroPatch));
        if (h > 22) tmpColor.lerp(dirtColor.setHex(0x6b5640), 0.45);
      } else {
        tmpColor.setHex(0x315028).lerp(dirtColor.setHex(0x505d36), Math.max(0, macroPatch * 0.85));
        if (macroPatch < -0.3) tmpColor.lerp(dirtColor.setHex(0x625641), 0.38);
      }

      // Slope-driven warm coastal sandstone & rugged dark slate-granite cliff strata
      if (slopeY < 0.87 || h > 36) {
        const rockMix = Math.max(
          slopeY < 0.87 ? Math.min(1, (0.87 - slopeY) / 0.19) : 0,
          h > 36 ? Math.min(0.95, (h - 36) / 34) : 0,
        );
        const strata = Math.sin(h * 0.72 + x * 0.03) * 0.07;
        cliffColor.setHex(x > 85 ? 0x62584d : 0x535a63).offsetHSL(0, 0, strata);
        tmpColor.lerp(cliffColor, rockMix);
      }
    }

    const jitter = (Math.sin(x * 0.09) * Math.cos(z * 0.08)) * 0.028;
    colors[i * 3] = Math.min(1, Math.max(0, tmpColor.r + jitter));
    colors[i * 3 + 1] = Math.min(1, Math.max(0, tmpColor.g + jitter));
    colors[i * 3 + 2] = Math.min(1, Math.max(0, tmpColor.b + jitter));
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainTex = createTerrainDetailTexture();
  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex.map,
    bumpMap: terrainTex.bumpMap,
    bumpScale: 1.35,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorldPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorldPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float macroN = sin(vTerrainWorldPos.x * 0.019 + vTerrainWorldPos.z * 0.015) * cos(vTerrainWorldPos.z * 0.023 - vTerrainWorldPos.x * 0.012);
         float detailN = sin(vTerrainWorldPos.x * 0.085) * cos(vTerrainWorldPos.z * 0.092);
         float ridgeShade = clamp(0.84 + macroN * 0.14 + detailN * 0.07, 0.62, 1.15);
         diffuseColor.rgb *= ridgeShade;`,
      );
  };
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // ---------------------------------------------------------------------------
  // 1B. NATURAL GRANITE ROCK BOULDERS, COASTAL UNDERGROWTH & MULTI-SPECIES TREES
  // ---------------------------------------------------------------------------
  const barkTex = createBarkTexture();
  const pineTex = createPineBranchTexture();
  const oakTex = createOakFoliageTexture();
  const palmTex = createPalmFrondTexture();

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    bumpMap: barkTex,
    bumpScale: 0.35,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.02,
  });

  // Perturbed organic boulder geometry (coastal headlands, mountain ledges, plain edges)
  const boulderGeo = new THREE.DodecahedronGeometry(1.5, 1);
  const bPos = boulderGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bPos.count; i++) {
    const vx = bPos.getX(i);
    const vy = bPos.getY(i);
    const vz = bPos.getZ(i);
    const n = 0.78 + Math.abs(Math.sin(vx * 3.1 + vy * 2.7 + vz * 4.3)) * 0.38;
    bPos.setXYZ(i, vx * n * 1.15, vy * n * 0.75, vz * n);
  }
  boulderGeo.computeVertexNormals();
  const boulderCoords: [number, number, number, number][] = [];
  for (let gx = -1080; gx <= 1080; gx += 88) {
    for (let gz = -1020; gz <= 380; gz += 88) {
      const jx = gx + Math.sin(gx * 0.21 + gz * 0.43) * 32;
      const jz = gz + Math.cos(gx * 0.39 - gz * 0.17) * 32;
      if (Math.abs(jx) < 224 && jz > -128 && jz < 90) continue;
      if (Math.abs(jz - BRIDGE_Z) < 16) continue;
      const bh = getTerrainHeight(jx, jz);
      if ((bh > 0.6 && bh < 4.5) || (bh > 24 && bh < 66)) {
        const sc = 0.75 + (((Math.abs(Math.round(jx + jz)) * 17) % 10) * 0.14);
        boulderCoords.push([jx, bh - 0.35 * sc, jz, sc]);
      }
    }
  }
  if (boulderCoords.length > 0) {
    const boulderMesh = new THREE.InstancedMesh(
      boulderGeo,
      new THREE.MeshStandardMaterial({
        map: terrainTex.map,
        bumpMap: terrainTex.bumpMap,
        bumpScale: 0.7,
        color: 0x6f747b,
        roughness: 0.94,
        metalness: 0.04,
      }),
      boulderCoords.length,
    );
    const dummy = new THREE.Object3D();
    const bCol = new THREE.Color();
    boulderCoords.forEach(([bx, by, bz, sc], idx) => {
      dummy.position.set(bx, by + 0.4 * sc, bz);
      dummy.rotation.set((idx % 5) * 0.2, idx * 1.7, (idx % 3) * 0.18);
      dummy.scale.set(sc * 1.25, sc * 0.85, sc);
      dummy.updateMatrix();
      boulderMesh.setMatrixAt(idx, dummy.matrix);
      bCol.setHex(by < 4 ? 0x7b7870 : idx % 2 === 0 ? 0x696e75 : 0x5d6268);
      boulderMesh.setColorAt(idx, bCol);
    });
    boulderMesh.instanceMatrix.needsUpdate = true;
    if (boulderMesh.instanceColor) boulderMesh.instanceColor.needsUpdate = true;
    group.add(boulderMesh);
  }

  // Classify trees into 3 realistic species across coastal lowlands, grassy plains, and mountain hills
  const pineCoords: [number, number, number][] = [];
  const oakCoords: [number, number, number][] = [];
  const palmCoords: [number, number, number][] = [];
  const bushCoords: [number, number, number][] = [];

  for (let gx = -1120; gx <= 1120; gx += 32) {
    for (let gz = -1040; gz <= 420; gz += 32) {
      const jx = gx + Math.sin(gx * 0.37 + gz * 0.19) * 14;
      const jz = gz + Math.cos(gx * 0.23 - gz * 0.41) * 14;
      // Keep harbour quays, tank battle plains, northern valley & highway clear
      if (Math.abs(jx) < 228 && jz > -132 && jz < 94) continue;
      if (jx > -790 && jx < -290 && jz > -220 && jz < 240) continue;
      if (jx > 290 && jx < 790 && jz > -220 && jz < 240) continue;
      if (Math.abs(jx) < 380 && jz > -830 && jz < -560) continue;
      if (Math.abs(jz - BRIDGE_Z) < 18) continue;

      const th = getTerrainHeight(jx, jz);
      const slopeH = Math.max(
        Math.abs(getTerrainHeight(jx + 6, jz) - th),
        Math.abs(getTerrainHeight(jx, jz + 6) - th),
      );
      if (slopeH > 4.6) continue;

      // Natural woodland grove clustering
      const grove = Math.sin(jx * 0.011 + 1.4) + Math.cos(jz * 0.013 - 0.8);
      if (grove < -0.55 && th > 8) continue;

      const hash = Math.abs(Math.sin(jx * 12.9898 + jz * 78.233) * 43758.5) % 1;
      if (th > 2.2 && th < 7.2 && zSafeBeach(jx, jz) && hash > 0.38) {
        palmCoords.push([jx, th - 0.25, jz]);
      } else if (th >= 4.2 && th < 20.0) {
        if (hash > 0.32) oakCoords.push([jx, th - 0.3, jz]);
        else bushCoords.push([jx, th - 0.15, jz]);
      } else if (th >= 20.0 && th < 58.0) {
        if (hash > 0.24) pineCoords.push([jx, th - 0.3, jz]);
        else bushCoords.push([jx, th - 0.15, jz]);
      }
    }
  }

  // Add coastal promenade palm trees along the West Harbour boulevard edge (away from roads & cranes)
  for (const pz of [-92, -68, -14, 10, 56]) {
    palmCoords.push([-116, QUAY_HEIGHT - 0.15, pz]);
  }

  function zSafeBeach(x: number, z: number): boolean {
    return Math.abs(x) > 195 || z < -125 || z > 90;
  }

  // 1) Mountain & Highland Conifer Pines (full-scale bark trunk + 3 rotated needle bough tiers)
  if (pineCoords.length > 0) {
    const pTrunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.32, 0.72, 6.2, 7),
      barkMat,
      pineCoords.length,
    );
    const pineBoughMat = new THREE.MeshStandardMaterial({
      map: pineTex,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.02,
      color: 0xffffff,
    });
    const tier1 = new THREE.InstancedMesh(createCrossedPineBoughGeo(4.4, 6.8), pineBoughMat, pineCoords.length);
    const tier2 = new THREE.InstancedMesh(createCrossedPineBoughGeo(3.3, 5.8), pineBoughMat, pineCoords.length);
    const tier3 = new THREE.InstancedMesh(createCrossedPineBoughGeo(2.2, 4.8), pineBoughMat, pineCoords.length);

    const dummy = new THREE.Object3D();
    const tCol = new THREE.Color();
    pineCoords.forEach(([tx, ty, tz], idx) => {
      const sc = 1.2 + ((idx * 37) % 11) * 0.085;
      const leanX = ((idx % 5) - 2) * 0.022;
      const leanZ = ((idx % 7) - 3) * 0.02;

      dummy.position.set(tx, ty + 3.0 * sc, tz);
      dummy.scale.set(sc, sc, sc);
      dummy.rotation.set(leanX, idx * 1.1, leanZ);
      dummy.updateMatrix();
      pTrunk.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, ty + 3.2 * sc, tz);
      dummy.rotation.set(leanX, idx * 1.1, leanZ);
      dummy.updateMatrix();
      tier1.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, ty + 6.8 * sc, tz);
      dummy.rotation.set(leanX, idx * 1.1 + 0.95, leanZ);
      dummy.updateMatrix();
      tier2.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, ty + 10.1 * sc, tz);
      dummy.rotation.set(leanX, idx * 1.1 + 1.85, leanZ);
      dummy.updateMatrix();
      tier3.setMatrixAt(idx, dummy.matrix);

      tCol.setHex(idx % 3 === 0 ? 0xdbe7cf : idx % 3 === 1 ? 0xf2f7eb : 0xc2d5b8);
      tier1.setColorAt(idx, tCol);
      tier2.setColorAt(idx, tCol);
      tier3.setColorAt(idx, tCol);
    });
    for (const m of [pTrunk, tier1, tier2, tier3]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      group.add(m);
    }
  }

  // 2) Broadleaf Mediterranean Oaks / Sycamores (full-scale bark trunk + dense 3-lobe leaf clusters)
  if (oakCoords.length > 0) {
    const oTrunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.42, 0.85, 5.2, 7),
      barkMat,
      oakCoords.length,
    );
    const oakMat = new THREE.MeshStandardMaterial({
      map: oakTex,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0.02,
      color: 0xffffff,
    });
    const oakGeo = createOakCrownClusterGeo();
    const lobeA = new THREE.InstancedMesh(oakGeo, oakMat, oakCoords.length);
    const lobeB = new THREE.InstancedMesh(oakGeo, oakMat, oakCoords.length);
    const lobeC = new THREE.InstancedMesh(oakGeo, oakMat, oakCoords.length);

    const dummy = new THREE.Object3D();
    const oCol = new THREE.Color();
    oakCoords.forEach(([tx, ty, tz], idx) => {
      const sc = 1.15 + ((idx * 29) % 10) * 0.085;
      const rot = idx * 1.45;
      dummy.position.set(tx, ty + 2.1 * sc, tz);
      dummy.rotation.set(((idx % 3) - 1) * 0.04, rot, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      oTrunk.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, ty + 5.6 * sc, tz);
      dummy.scale.set(sc * 1.12, sc * 0.95, sc * 1.12);
      dummy.rotation.set(0.1, rot, 0.05);
      dummy.updateMatrix();
      lobeA.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx + Math.cos(rot) * 1.8 * sc, ty + 4.7 * sc, tz + Math.sin(rot) * 1.8 * sc);
      dummy.scale.set(sc * 0.88, sc * 0.8, sc * 0.88);
      dummy.rotation.set(-0.15, rot + 1.2, 0.1);
      dummy.updateMatrix();
      lobeB.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx - Math.cos(rot) * 1.6 * sc, ty + 5.0 * sc, tz - Math.sin(rot) * 1.6 * sc);
      dummy.scale.set(sc * 0.82, sc * 0.82, sc * 0.82);
      dummy.rotation.set(0.12, rot + 2.5, -0.1);
      dummy.updateMatrix();
      lobeC.setMatrixAt(idx, dummy.matrix);

      oCol.setHex(tx > 90 && tz > -260 ? (idx % 2 === 0 ? 0xc2b97e : 0xa3ad72) : idx % 3 === 0 ? 0xd9e8c8 : 0xc1d6b0);
      lobeA.setColorAt(idx, oCol);
      lobeB.setColorAt(idx, oCol);
      lobeC.setColorAt(idx, oCol);
    });
    for (const m of [oTrunk, lobeA, lobeB, lobeC]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      group.add(m);
    }
  }

  // 3) Coastal California Palms (curved ringed trunks + radiating arched palm fronds)
  if (palmCoords.length > 0) {
    const pTrunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 8.2, 6, 4);
    const tp = pTrunkGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const yNorm = (tp.getY(i) + 4.1) / 8.2;
      tp.setX(i, tp.getX(i) + yNorm * yNorm * 1.15);
    }
    pTrunkGeo.computeVertexNormals();

    const palmTrunk = new THREE.InstancedMesh(pTrunkGeo, barkMat, palmCoords.length);
    const palmCrown = new THREE.InstancedMesh(
      createPalmCrownGeo(),
      new THREE.MeshStandardMaterial({
        map: palmTex,
        alphaTest: 0.36,
        side: THREE.DoubleSide,
        roughness: 0.78,
        color: 0xd9ecc0,
      }),
      palmCoords.length,
    );
    const dummy = new THREE.Object3D();
    palmCoords.forEach(([tx, ty, tz], idx) => {
      const sc = 0.85 + (idx % 5) * 0.08;
      const yaw = idx * 2.1;
      dummy.position.set(tx, ty + 4.0 * sc, tz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      palmTrunk.setMatrixAt(idx, dummy.matrix);

      // Crown sits at curved tip (+1.15m along local +X after yaw)
      dummy.position.set(tx + Math.cos(yaw) * 1.15 * sc, ty + 8.0 * sc, tz - Math.sin(yaw) * 1.15 * sc);
      dummy.rotation.set(0.05, yaw, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      palmCrown.setMatrixAt(idx, dummy.matrix);
    });
    palmTrunk.instanceMatrix.needsUpdate = true;
    palmCrown.instanceMatrix.needsUpdate = true;
    group.add(palmTrunk, palmCrown);
  }

  // 4) Low Chaparral Shrubs & Wild Undergrowth Tufts (grounding forests into terrain)
  if (bushCoords.length > 0) {
    const bushGeo = createOakCrownClusterGeo();
    const bushMesh = new THREE.InstancedMesh(
      bushGeo,
      new THREE.MeshStandardMaterial({
        map: oakTex,
        alphaTest: 0.38,
        side: THREE.DoubleSide,
        roughness: 0.92,
        color: 0xffffff,
      }),
      bushCoords.length,
    );
    const dummy = new THREE.Object3D();
    const sCol = new THREE.Color();
    bushCoords.forEach(([bx, by, bz], idx) => {
      const sc = 0.36 + (idx % 4) * 0.1;
      dummy.position.set(bx, by + 0.85 * sc, bz);
      dummy.rotation.set(0, idx * 1.7, 0);
      dummy.scale.set(sc * 1.3, sc * 0.85, sc * 1.3);
      dummy.updateMatrix();
      bushMesh.setMatrixAt(idx, dummy.matrix);
      sCol.setHex(bx > 90 ? 0x999560 : 0x8ea86e);
      bushMesh.setColorAt(idx, sCol);
    });
    bushMesh.instanceMatrix.needsUpdate = true;
    if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
    group.add(bushMesh);
  }

  // ---------------------------------------------------------------------------
  // 2. BAKE GTA-STYLE TOP-DOWN MINI-RADAR MAP CANVAS
  // ---------------------------------------------------------------------------
  const radarMapCanvas = document.createElement('canvas');
  radarMapCanvas.width = 220;
  radarMapCanvas.height = 220;
  const rctx = radarMapCanvas.getContext('2d');
  if (rctx) {
    rctx.fillStyle = '#091822';
    rctx.fillRect(0, 0, 220, 220);
    for (let py = 0; py < 220; py += 2) {
      for (let px = 0; px < 220; px += 2) {
        const wx = ((px / 220) * 2 - 1) * WORLD_HALF_SIZE;
        const wz = ((py / 220) * 2 - 1) * WORLD_HALF_SIZE;
        const h = getTerrainHeight(wx, wz);
        if (h > 65) rctx.fillStyle = '#47594c';
        else if (h > 30) rctx.fillStyle = '#334d38';
        else if (h > 6) rctx.fillStyle = '#25422c';
        else if (h > 0.1) rctx.fillStyle = '#2f5439';
        else continue;
        rctx.fillRect(px, py, 2, 2);
      }
    }
    const toPx = (wx: number, wz: number): [number, number] => [
      ((wx / WORLD_HALF_SIZE) * 0.5 + 0.5) * 220,
      ((wz / WORLD_HALF_SIZE) * 0.5 + 0.5) * 220,
    ];
    // Highway network lines on radar
    rctx.strokeStyle = 'rgba(203, 213, 225, 0.42)';
    rctx.lineWidth = 1.6;
    rctx.beginPath();
    const [w1x, w1y] = toPx(-720, -140);
    const [w2x, w2y] = toPx(-142, BRIDGE_Z);
    const [e2x, e2y] = toPx(152, BRIDGE_Z);
    const [e3x, e3y] = toPx(760, -120);
    rctx.moveTo(w1x, w1y);
    rctx.lineTo(w2x, w2y);
    rctx.moveTo(e2x, e2y);
    rctx.lineTo(e3x, e3y);
    const [n1x, n1y] = toPx(-124, -460);
    const [n2x, n2y] = toPx(-124, 150);
    rctx.moveTo(n1x, n1y);
    rctx.lineTo(n2x, n2y);
    rctx.stroke();

    // Red Truss Bridge span indicator
    const [bx1, by1] = toPx(-90, BRIDGE_Z);
    const [bx2, by2] = toPx(90, BRIDGE_Z);
    rctx.strokeStyle = '#ef4444';
    rctx.lineWidth = 2.2;
    rctx.beginPath();
    rctx.moveTo(bx1, by1);
    rctx.lineTo(bx2, by2);
    rctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // 3. REAL-WORLD FRESNEL COASTAL OCEAN SHADER (Sky reflection, swells & surf)
  // ---------------------------------------------------------------------------
  const hmSize = 128;
  const hmData = new Uint8Array(hmSize * hmSize * 4);
  for (let iy = 0; iy < hmSize; iy++) {
    for (let ix = 0; ix < hmSize; ix++) {
      const wx = ((ix / (hmSize - 1)) * 2 - 1) * WORLD_HALF_SIZE;
      const wz = ((iy / (hmSize - 1)) * 2 - 1) * WORLD_HALF_SIZE;
      const h = getTerrainHeight(wx, wz);
      const norm = Math.max(0, Math.min(1, (h + 12) / 24));
      const idx = (iy * hmSize + ix) * 4;
      hmData[idx] = Math.round(norm * 255);
      hmData[idx + 1] = hmData[idx];
      hmData[idx + 2] = hmData[idx];
      hmData[idx + 3] = 255;
    }
  }
  const heightTex = new THREE.DataTexture(hmData, hmSize, hmSize, THREE.RGBAFormat);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.waterShallow) },
      uDeepColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.waterDeep) },
      uSkyTop: { value: new THREE.Color(WEATHER_PALETTES.sunset.skyTop) },
      uSkyHorizon: { value: new THREE.Color(WEATHER_PALETTES.sunset.skyHorizon) },
      uSunColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.sunColor) },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.35, -0.78).normalize() },
      uFogColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.fogColor) },
      uFogDensity: { value: WEATHER_PALETTES.sunset.fogDensity },
      uHeightMap: { value: heightTex },
      uWorldSize: { value: WORLD_HALF_SIZE * 2 },
      uRipplePos: { value: new THREE.Vector2(9999, 9999) },
      uRippleAge: { value: 10.0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uWorldSize;
      varying vec3 vWorldPos;
      varying vec2 vWorldUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float w1 = sin(wp.x * 0.05 + uTime * 1.35) * cos(wp.z * 0.045 + uTime * 1.05) * 0.32;
        float w2 = sin(wp.x * 0.11 - wp.z * 0.09 + uTime * 1.9) * 0.14;
        wp.y += w1 + w2;
        vWorldPos = wp.xyz;
        vWorldUv = (wp.xz / uWorldSize) + 0.5;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uShallowColor;
      uniform vec3 uDeepColor;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform sampler2D uHeightMap;
      uniform vec2 uRipplePos;
      uniform float uRippleAge;
      varying vec3 vWorldPos;
      varying vec2 vWorldUv;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
                   mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float hm = texture2D(uHeightMap, clamp(vWorldUv, 0.002, 0.998)).r;
        float terrainH = hm * 24.0 - 12.0;
        float depth = max(0.0, -terrainH);
        float shallowMask = 1.0 - smoothstep(0.0, 8.5, depth);

        // Multi-octave ocean wave surface normal for crisp sun-path shimmer
        vec2 p1 = vWorldPos.xz * 0.12 + vec2(uTime * 0.35, uTime * 0.24);
        vec2 p2 = vWorldPos.xz * 0.28 - vec2(uTime * 0.28, -uTime * 0.32);
        vec2 p3 = vWorldPos.xz * 0.58 + vec2(-uTime * 0.2, uTime * 0.41);
        float nx = (sin(p1.x * 2.1 + p1.y) * 0.5 + cos(p2.x * 1.9 - p2.y) * 0.35 + sin(p3.x - p3.y) * 0.15) * 0.14;
        float nz = (cos(p1.y * 2.3 - p1.x * 0.7) * 0.5 + sin(p2.y * 2.1 + p2.x) * 0.35 + cos(p3.y + p3.x) * 0.15) * 0.14;
        vec3 n = normalize(vec3(nx, 1.0, nz));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 reflDir = reflect(-viewDir, n);
        float skyMix = pow(1.0 - clamp(reflDir.y, 0.0, 1.0), 3.4);
        vec3 coolZenith = max(uSkyTop * 1.45, vec3(0.14, 0.36, 0.68));
        vec3 skyRefl = mix(coolZenith, uSkyHorizon * 0.85, skyMix * 0.42);

        // Schlick Fresnel balanced to keep ocean rich sapphire-blue across the Strait
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
        fresnel = clamp(0.08 + fresnel * 0.34, 0.0, 0.42);

        // Subtle wave-crest azure sheen on ocean swells
        float waveSwell = clamp(0.5 + (nx + nz) * 2.2, 0.0, 1.0);
        vec3 waterBody = mix(uDeepColor, uShallowColor, clamp(shallowMask * 0.86 + waveSwell * 0.14, 0.0, 1.0));
        vec3 col = mix(waterBody, skyRefl, fresnel);

        // Realistic broken shoreline surf & wave crests
        float surfNoise = vnoise(vWorldPos.xz * 0.14 + vec2(uTime * 0.3, -uTime * 0.2));
        float shoreLine = smoothstep(2.2, 0.08, depth);
        float foamBreak = smoothstep(0.42, 0.76, shoreLine * (0.55 + surfNoise * 0.75));
        col = mix(col, vec3(0.88, 0.94, 0.98), foamBreak * 0.65);

        // Bomb / bridge collapse expanding water ripple
        float rDist = length(vWorldPos.xz - uRipplePos);
        float rRadius = uRippleAge * 26.0;
        float rBand = smoothstep(3.2, 0.0, abs(rDist - rRadius)) * smoothstep(2.4, 0.0, uRippleAge);
        col = mix(col, vec3(0.95, 0.98, 1.0), rBand * 0.82);

        // Focused solar reflection path across coastal waves (keeps surrounding water pure blue)
        vec3 halfVec = normalize(uSunDir + viewDir);
        float ndh = max(dot(n, halfVec), 0.0);
        float specTight = pow(ndh, 190.0) * 1.55;
        float specBroad = pow(ndh, 58.0) * 0.22;
        vec3 glintColor = mix(uSunColor, vec3(1.0, 0.96, 0.88), 0.45);
        col += glintColor * (specTight + specBroad);

        // Distance exponential atmospheric haze (gentler on near/mid ocean to preserve blue)
        float camDist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity * 0.78, 2.0));
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(6600, 6600, 72, 72), oceanMat);
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.y = 0;
  group.add(oceanMesh);

  // ---------------------------------------------------------------------------
  // 4. ATMOSPHERIC SKY DOME WITH SUN CORONA, SCATTERING & WISPY CIRRUS CLOUDS
  // ---------------------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.skyTop) },
      uMidColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.skyMid) },
      uHorizonColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.skyHorizon) },
      uSunDir: { value: new THREE.Vector3(620, 155, -880).normalize() },
      uSunColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.sunColor) },
      uNightFactor: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uNightFactor;
      varying vec3 vDir;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
                   mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = p * 2.07 + vec2(3.1, 1.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.22, h));
        sky = mix(sky, uTopColor, smoothstep(0.18, 0.78, h));

        // High-altitude backlit wispy cirrus & sunlit sunset stratocumulus streaks
        if (h > 0.015) {
          vec2 skyUv = d.xz / (h + 0.16) * 1.35;
          float n1 = fbm(skyUv * vec2(1.0, 1.9) + vec2(2.4, -1.1));
          float n2 = fbm(skyUv * 2.5 - vec2(0.8, 3.2));
          float cloudMask = smoothstep(0.45, 0.78, n1 * 0.7 + n2 * 0.35) * smoothstep(0.015, 0.14, h) * (1.0 - smoothstep(0.68, 0.98, h));
          float sunAlign = max(dot(d, normalize(uSunDir)), 0.0);
          vec3 cloudShadow = mix(uTopColor * 1.05, vec3(0.46, 0.49, 0.62), 0.55);
          vec3 cloudLit = mix(uHorizonColor * 1.05, uSunColor * 1.18, 0.42 + 0.58 * pow(sunAlign, 1.8));
          float rim = smoothstep(0.36, 0.74, n2) * (0.45 + 0.55 * pow(sunAlign, 1.4));
          vec3 cirrusCol = mix(cloudShadow, cloudLit, rim) * (1.0 - uNightFactor * 0.58);
          sky = mix(sky, cirrusCol, cloudMask * 0.68);
        }

        // Mie scattering solar glow + luminous disc
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        float disc = smoothstep(0.9984, 0.9993, sunDot);
        float corona = pow(sunDot, 36.0) * 0.75;
        float scatter = pow(sunDot, 5.5) * 0.28;
        sky += uSunColor * (disc * 1.85 + corona + scatter);

        if (uNightFactor > 0.4 && h > 0.12) {
          vec2 starGrid = floor(d.xz / (d.y + 0.15) * 46.0);
          float s = fract(sin(dot(starGrid, vec2(12.9898, 78.233))) * 43758.5453);
          if (s > 0.992) {
            sky += vec3(0.85, 0.92, 1.0) * uNightFactor * 0.85;
          }
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(3250, 32, 20), skyMat);
  group.add(skyDome);

  // ---------------------------------------------------------------------------
  // 5. VOLUMETRIC-STYLE BACKLIT SUNSET CLOUD BANKS (Soft FBM Alpha Deck)
  // ---------------------------------------------------------------------------
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 256;
  const clCtx = cloudCanvas.getContext('2d');
  if (clCtx) {
    clCtx.clearRect(0, 0, 256, 256);
    const puffs: [number, number, number, number][] = [
      [128, 128, 74, 0.34],
      [82, 134, 56, 0.30],
      [174, 132, 58, 0.30],
      [108, 102, 52, 0.28],
      [154, 106, 48, 0.28],
      [54, 144, 38, 0.24],
      [204, 142, 40, 0.24],
      [128, 148, 66, 0.26],
    ];
    for (let i = 0; i < 42; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt(i / 42) * 76;
      const px = 128 + Math.cos(a) * r * 1.15;
      const py = 128 + Math.sin(a) * r * 0.72;
      const rad = 22 + (i % 5) * 8;
      puffs.push([px, py, rad, 0.14]);
    }
    for (const [px, py, rad, alpha] of puffs) {
      const grad = clCtx.createRadialGradient(px, py, rad * 0.1, px, py, rad);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.55, `rgba(245, 240, 238, ${alpha * 0.55})`);
      grad.addColorStop(1, 'rgba(240, 235, 235, 0)');
      clCtx.fillStyle = grad;
      clCtx.beginPath();
      clCtx.arc(px, py, rad, 0, Math.PI * 2);
      clCtx.fill();
    }
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;

  const cloudsGroup = new THREE.Group();
  const cloudMaterials: THREE.ShaderMaterial[] = [];
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: cloudTex },
      uLitColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.cloudTint) },
      uShadowColor: { value: new THREE.Color(0x5e6580) },
      uFogColor: { value: new THREE.Color(WEATHER_PALETTES.sunset.fogColor) },
      uFogDensity: { value: WEATHER_PALETTES.sunset.fogDensity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uLitColor;
      uniform vec3 uShadowColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float cHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float cNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x),
                   mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float cFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * cNoise(p);
          p = p * 2.12 + vec2(4.7, 1.9);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Soft dome radial envelope + multi-octave FBM breakup eliminates oval card silhouettes
        vec2 centered = (vUv - vec2(0.5, 0.45)) * vec2(2.0, 2.2);
        float radial = 1.0 - smoothstep(0.18, 0.96, length(centered));
        float n = cFbm(vUv * vec2(4.2, 2.8) + vWorldPos.xz * 0.008);
        float density = smoothstep(0.28, 0.74, radial * 0.78 + n * 0.52);
        float alpha = density * 0.46;
        if (alpha < 0.012) discard;

        // Billowing top-sunlit edge vs cooler atmospheric base
        float sunSide = clamp((1.0 - vUv.y) * 0.55 + (1.0 - density) * 0.55 + n * 0.2, 0.0, 1.0);
        vec3 col = mix(uShadowColor, uLitColor, sunSide);

        float camDist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity * 0.78, 2.0));
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 0.85));
        gl_FragColor = vec4(col, alpha * (1.0 - fogFactor * 0.48));
      }
    `,
  });
  cloudMaterials.push(cloudMat);

  const cloudPositions: [number, number, number, number, number][] = [
    [-520, 215, -480, 260, 96],
    [420, 225, -560, 290, 106],
    [-80, 255, -880, 340, 120],
    [760, 210, -240, 260, 92],
    [-820, 200, 160, 250, 90],
    [360, 220, 420, 235, 84],
    [-340, 235, -240, 220, 82],
    [620, 265, -960, 360, 128],
    [-860, 255, -840, 330, 118],
    [1020, 240, 300, 280, 102],
    [-210, 245, 840, 280, 104],
    [220, 285, -1240, 380, 138],
    [-540, 295, -1220, 360, 130],
    [880, 275, -720, 320, 116],
  ];
  const cloudCardGeo = new THREE.PlaneGeometry(1, 1);
  for (const [cx, cy, cz, cw, ch] of cloudPositions) {
    const cluster = new THREE.Group();
    cluster.position.set(cx, cy, cz);
    const yaw = Math.atan2(-cx, -cz);
    for (let layer = 0; layer < 2; layer++) {
      const card = new THREE.Mesh(cloudCardGeo, cloudMat);
      card.scale.set(cw * (1 - layer * 0.18), ch * (1 - layer * 0.14), 1);
      card.position.set((layer - 0.5) * 38, layer * 14, (layer - 0.5) * 28);
      card.rotation.y = yaw + (layer - 0.5) * 0.52;
      cluster.add(card);
    }
    cloudsGroup.add(cluster);
  }
  group.add(cloudsGroup);

  // ---------------------------------------------------------------------------
  // 6. GTA-STYLE HARBOUR CITY, ASPHALT HIGHWAYS, CONTAINERS & MILITARY PROPS
  // ---------------------------------------------------------------------------
  const asphaltTex = createAsphaltRoadTexture();
  const concreteTex = createConcreteApronTexture();
  const facadeTex = createSkyscraperFacadeTextures();

  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const skyscraperMat = new THREE.MeshStandardMaterial({
    map: facadeTex.map,
    emissiveMap: facadeTex.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
    roughness: 0.34,
    metalness: 0.55,
  });
  windowMaterials.push(skyscraperMat);

  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x94a3b8, roughness: 0.88, metalness: 0.08 });
  const darkTowerMat = new THREE.MeshStandardMaterial({ color: 0x3f4c5e, roughness: 0.65, metalness: 0.35 });
  const warehouseMat = new THREE.MeshStandardMaterial({ color: 0x5c6878, roughness: 0.82, metalness: 0.22 });
  const craneYellowMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.45, metalness: 0.45 });
  const craneRedMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.4 });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xffffff, roughness: 0.88, metalness: 0.06 });
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x9c8863, roughness: 0.94, metalness: 0.04 });
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.64, metalness: 0.48 });

  // Quay sea walls (Textured concrete harbour aprons)
  const westQuaySlab = new THREE.Mesh(new THREE.BoxGeometry(96, 5.2, 165), concreteMat);
  westQuaySlab.position.set(-142, QUAY_HEIGHT - 2.6, -18);
  group.add(westQuaySlab);

  const eastQuaySlab = new THREE.Mesh(new THREE.BoxGeometry(118, 5.2, 174), concreteMat);
  eastQuaySlab.position.set(152, QUAY_HEIGHT - 2.6, -15);
  group.add(eastQuaySlab);

  // Asphalt Highway Network across Quays & Plains (Bridge approaches + city boulevards + coastal highways)
  const westApproachRoad = new THREE.Mesh(new THREE.BoxGeometry(108, 0.24, 13.5), roadMat);
  westApproachRoad.position.set(-142, QUAY_HEIGHT + 0.14, BRIDGE_Z);
  const westAvenueRoad = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.22, 162), roadMat);
  westAvenueRoad.position.set(-124, QUAY_HEIGHT + 0.12, -18);
  const eastApproachRoad = new THREE.Mesh(new THREE.BoxGeometry(126, 0.24, 13.5), roadMat);
  eastApproachRoad.position.set(152, QUAY_HEIGHT + 0.14, BRIDGE_Z);
  const eastServiceRoad = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 168), roadMat);
  eastServiceRoad.position.set(106, QUAY_HEIGHT + 0.12, -15);
  group.add(westApproachRoad, westAvenueRoad, eastApproachRoad, eastServiceRoad);

  // Terrain-hugging asphalt highway extensions leading across West & East Battlegrounds
  const buildTerrainHighway = (points: [number, number][], width = 11) => {
    const segCount = 26;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const samplePt = (t: number): [number, number] => {
      const scaled = t * (points.length - 1);
      const i0 = Math.min(points.length - 2, Math.floor(scaled));
      const f = scaled - i0;
      return [
        points[i0][0] + (points[i0 + 1][0] - points[i0][0]) * f,
        points[i0][1] + (points[i0 + 1][1] - points[i0][1]) * f,
      ];
    };
    for (let s = 0; s <= segCount; s++) {
      const t = s / segCount;
      const [px, pz] = samplePt(t);
      const [nx, nz] = samplePt(Math.min(1, t + 0.02));
      const dx = nx - px;
      const dz = nz - pz;
      const len = Math.hypot(dx, dz) || 1;
      const rx = (-dz / len) * (width * 0.5);
      const rz = (dx / len) * (width * 0.5);
      const yL = Math.max(WATER_LEVEL + 0.6, getTerrainHeight(px - rx, pz - rz) + 0.42);
      const yR = Math.max(WATER_LEVEL + 0.6, getTerrainHeight(px + rx, pz + rz) + 0.42);
      positions.push(px - rx, yL, pz - rz, px + rx, yR, pz + rz);
      uvs.push(0, t * 18, 1, t * 18);
      if (s < segCount) {
        const b = s * 2;
        indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rGeo.setIndex(indices);
    rGeo.computeVertexNormals();
    const rMesh = new THREE.Mesh(rGeo, roadMat);
    rMesh.receiveShadow = true;
    group.add(rMesh);
  };

  buildTerrainHighway([
    [-196, BRIDGE_Z],
    [-340, -52],
    [-530, -90],
    [-750, -140],
  ]);
  buildTerrainHighway([
    [212, BRIDGE_Z],
    [360, -45],
    [550, -82],
    [760, -120],
  ]);
  buildTerrainHighway([
    [-124, -100],
    [-118, -260],
    [-108, -460],
  ]);

  // Textured Glass Curtain-Wall City Skyscrapers, Rooftop Helipads & Warehouses
  const buildings: [number, number, number, number, number, boolean][] = [
    [-168, -72, 16, 46, 16, true],
    [-142, -78, 14, 34, 14, false],
    [-172, -46, 18, 56, 16, true],
    [-144, -48, 15, 28, 15, false],
    [-168, 8, 16, 40, 18, true],
    [-140, 14, 18, 22, 14, false],
    [-162, 46, 20, 32, 16, true],
    [-138, 52, 22, 11, 16, false],
    [-138, -62, 20, 12, 18, false],
  ];

  const obstacles: WorldObstacleAABB[] = [];
  const helipadRingMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
  const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  for (const [bx, bz, bw, bh, bd, isGlass] of buildings) {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, QUAY_HEIGHT, bz);

    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), isGlass ? skyscraperMat : warehouseMat);
    body.position.y = bh / 2;
    bGroup.add(body);

    // Concrete architectural parapet & rooftop HVAC units
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 1.2, bd + 0.8), concreteMat);
    parapet.position.y = bh + 0.6;
    bGroup.add(parapet);

    const roofUnit = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.44, 2.8, bd * 0.44), darkTowerMat);
    roofUnit.position.y = bh + 2.2;
    bGroup.add(roofUnit);

    if (isGlass) {
      // Rooftop helipad ring & aviation warning antenna
      const hRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 20), helipadRingMat);
      hRing.rotation.x = -Math.PI / 2;
      hRing.position.set(0, bh + 1.26, 0);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 8.5, 6), darkTowerMat);
      spire.position.set(bw * 0.28, bh + 5.2, bd * 0.28);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 6), beaconRedMat);
      beacon.position.set(bw * 0.28, bh + 9.6, bd * 0.28);
      bGroup.add(hRing, spire, beacon);
    }

    group.add(bGroup);

    obstacles.push({
      id: `bldg_${bx}_${bz}`,
      minX: bx - bw / 2,
      maxX: bx + bw / 2,
      minY: QUAY_HEIGHT,
      maxY: QUAY_HEIGHT + bh + 3.0,
      minZ: bz - bd / 2,
      maxZ: bz + bd / 2,
      kind: 'building',
    });
  }

  // Stacked Maritime Shipping Containers on West & East Quays (InstancedMesh)
  const containerCoords: [number, number, number, number][] = [
    [-108, QUAY_HEIGHT + 1.4, -52, 0x991b1b],
    [-108, QUAY_HEIGHT + 4.2, -52, 0x1d4ed8],
    [-113, QUAY_HEIGHT + 1.4, -52, 0xb45309],
    [-108, QUAY_HEIGHT + 1.4, 34, 0x3f6212],
    [-108, QUAY_HEIGHT + 4.2, 34, 0x991b1b],
    [-113, QUAY_HEIGHT + 1.4, 34, 0x1e40af],
    [114, QUAY_HEIGHT + 1.4, -84, 0x365314],
    [114, QUAY_HEIGHT + 1.4, 58, 0xb45309],
    [114, QUAY_HEIGHT + 4.2, 58, 0x1d4ed8],
    [194, QUAY_HEIGHT + 1.4, -58, 0x991b1b],
  ];
  const containerInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.2, 2.7, 9.2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.32 }),
    containerCoords.length,
  );
  const cDummy = new THREE.Object3D();
  const cCol = new THREE.Color();
  containerCoords.forEach(([cx, cy, cz, hex], idx) => {
    cDummy.position.set(cx, cy, cz);
    cDummy.rotation.y = idx % 2 === 0 ? 0.04 : -0.05;
    cDummy.updateMatrix();
    containerInst.setMatrixAt(idx, cDummy.matrix);
    cCol.setHex(hex);
    containerInst.setColorAt(idx, cCol);
  });
  containerInst.instanceMatrix.needsUpdate = true;
  if (containerInst.instanceColor) containerInst.instanceColor.needsUpdate = true;
  group.add(containerInst);

  // Military Airfield Hangars & Sandbag Fortification Revetments across the Ground Battlefield
  const hangarLocations: [number, number, number][] = [
    [350, 15, 0.25],
    [-360, -10, -0.35],
    [45, -660, 0.0],
  ];
  for (const [hx, hz, rotY] of hangarLocations) {
    const hy = Math.max(QUAY_HEIGHT, getTerrainHeight(hx, hz));
    const hGroup = new THREE.Group();
    hGroup.position.set(hx, hy - 0.4, hz);
    hGroup.rotation.y = rotY;
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 8.5, 18, 12, 1, false, 0, Math.PI),
      hangarMat,
    );
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI / 2;
    arch.position.y = 0.5;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 26), concreteMat);
    apron.position.y = 0.2;
    hGroup.add(arch, apron);
    group.add(hGroup);
  }

  // Sandbag / Hesco defensive revetments around coastal SAM battery ridges
  const bunkerRevetments: [number, number][] = [
    [-245, -165],
    [265, 135],
    [225, -230],
    [-235, 150],
  ];
  for (const [rx, rz] of bunkerRevetments) {
    const ry = Math.max(QUAY_HEIGHT, getTerrainHeight(rx, rz));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 1.05, 6, 10, Math.PI * 1.45), sandbagMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(rx, ry + 0.65, rz);
    group.add(ring);
  }

  // Harbour Gantry Cranes along the West Quay edge
  const cranePositions: [number, number, boolean][] = [
    [-102, -68, true],
    [-102, 18, false],
    [-102, 52, true],
  ];
  for (const [cx, cz, isRed] of cranePositions) {
    const crane = new THREE.Group();
    crane.position.set(cx, QUAY_HEIGHT, cz);
    const mat = isRed ? craneRedMat : craneYellowMat;

    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 22, 1.4), mat);
    leg1.position.set(0, 11, -3.5);
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 22, 1.4), mat);
    leg2.position.set(0, 11, 3.5);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 2.2), mat);
    beam.position.set(6, 22, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), darkTowerMat);
    cab.position.set(3, 19.5, 0);
    crane.add(leg1, leg2, beam, cab);
    group.add(crane);

    obstacles.push({
      id: `crane_${cx}_${cz}`,
      minX: cx - 3,
      maxX: cx + 16,
      minY: QUAY_HEIGHT,
      maxY: QUAY_HEIGHT + 23.5,
      minZ: cz - 4.5,
      maxZ: cz + 4.5,
      kind: 'crane',
    });
  }

  // ---------------------------------------------------------------------------
  // 7. COLLAPSIBLE 176m RED STEEL TRUSS BRIDGE (Textured Asphalt + Guardrails)
  // ---------------------------------------------------------------------------
  const bridgeGroup = new THREE.Group();
  const redSteelMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.44, metalness: 0.52 });

  for (const px of [-90, -32, 32, 90]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(7.5, BRIDGE_DECK_Y + 10, 14), concreteMat);
    pier.position.set(px, (BRIDGE_DECK_Y - 10) / 2, BRIDGE_Z);
    bridgeGroup.add(pier);
    obstacles.push({
      id: `pier_${px}`,
      minX: px - 3.8,
      maxX: px + 3.8,
      minY: -2,
      maxY: BRIDGE_DECK_Y,
      minZ: BRIDGE_Z - 7,
      maxZ: BRIDGE_Z + 7,
      kind: 'bridge_pier',
    });
  }

  const bridgeSpans: BridgeSpan[] = [];
  const spanCenters = [-61, 0, 61];
  const spanLength = 58;

  spanCenters.forEach((sx, idx) => {
    const spanGroup = new THREE.Group();
    spanGroup.position.set(sx, BRIDGE_DECK_Y, BRIDGE_Z);

    // Asphalt highway deck with lane markings
    const deck = new THREE.Mesh(new THREE.BoxGeometry(spanLength, 1.6, 12.5), roadMat);
    spanGroup.add(deck);

    for (const sz of [-5.8, 5.8]) {
      const topChord = new THREE.Mesh(new THREE.BoxGeometry(spanLength, 1.1, 1.0), redSteelMat);
      topChord.position.set(0, 9.5, sz);
      spanGroup.add(topChord);

      const botChord = new THREE.Mesh(new THREE.BoxGeometry(spanLength, 1.1, 1.0), redSteelMat);
      botChord.position.set(0, 0.8, sz);
      spanGroup.add(botChord);

      for (let d = -22; d <= 22; d += 11) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.5, 0.9), redSteelMat);
        post.position.set(d, 5.1, sz);
        spanGroup.add(post);

        const diag = new THREE.Mesh(new THREE.BoxGeometry(0.75, 12.5, 0.75), redSteelMat);
        diag.position.set(d + 5.5, 5.1, sz);
        diag.rotation.z = d % 22 === 0 ? 0.58 : -0.58;
        spanGroup.add(diag);
      }
    }

    for (let d = -20; d <= 20; d += 13) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 12.2), redSteelMat);
      cross.position.set(d, 9.5, 0);
      spanGroup.add(cross);
    }

    bridgeGroup.add(spanGroup);
    bridgeSpans.push({
      id: `bridge_span_${idx}`,
      mesh: spanGroup,
      x: sx,
      y: BRIDGE_DECK_Y + 4,
      z: BRIDGE_Z,
      collapsed: false,
      collapseTimer: 0,
    });
  });
  group.add(bridgeGroup);

  // ---------------------------------------------------------------------------
  // 8. ALLIED CARRIER (SOLID COLLISION DECK + ISLAND) & COASTAL LIGHTHOUSE
  // ---------------------------------------------------------------------------
  const carrier = createAlliedCarrier();
  carrier.position.set(0, 0, 235);
  group.add(carrier);

  obstacles.push(
    {
      id: 'allied_carrier_deck',
      minX: -13.8,
      maxX: 13.8,
      minY: -1,
      maxY: 9.4,
      minZ: 235 - 42.5,
      maxZ: 235 + 42.5,
      kind: 'carrier',
    },
    {
      id: 'allied_carrier_island',
      minX: 6.8,
      maxX: 13.2,
      minY: 9.2,
      maxY: 28.2,
      minZ: 235 - 0.5,
      maxZ: 235 + 16.5,
      kind: 'carrier',
    },
  );

  const lh = createLighthouse();
  const lhY = Math.max(4, getTerrainHeight(-155, 135));
  lh.group.position.set(-155, lhY - 0.5, 135);
  group.add(lh.group);

  // ---------------------------------------------------------------------------
  // 9. VOLUMETRIC NIGHT SEARCHLIGHTS
  // ---------------------------------------------------------------------------
  const searchlights: THREE.Group[] = [];
  const coneGeo = new THREE.ConeGeometry(16, 175, 14, 1, true);
  coneGeo.translate(0, 87.5, 0);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.11,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const slCoords: [number, number][] = [
    [-112, -32],
    [115, -24],
    [-115, 38],
  ];
  for (const [sx, sz] of slCoords) {
    const sl = new THREE.Group();
    sl.position.set(sx, QUAY_HEIGHT + 1, sz);
    const beam = new THREE.Mesh(coneGeo, coneMat);
    beam.rotation.z = 0.28;
    sl.add(beam);
    sl.visible = false;
    group.add(sl);
    searchlights.push(sl);
  }

  // ---------------------------------------------------------------------------
  // WEATHER APPLICATION HELPER
  // ---------------------------------------------------------------------------
  function applyWeather(
    mood: WeatherMood,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    scene: THREE.Scene,
  ): void {
    const p = WEATHER_PALETTES[mood];
    skyMat.uniforms.uTopColor.value.setHex(p.skyTop);
    skyMat.uniforms.uMidColor.value.setHex(p.skyMid);
    skyMat.uniforms.uHorizonColor.value.setHex(p.skyHorizon);
    skyMat.uniforms.uSunColor.value.setHex(p.sunColor);
    skyMat.uniforms.uSunDir.value.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]).normalize();
    skyMat.uniforms.uNightFactor.value = p.nightFactor;

    oceanMat.uniforms.uShallowColor.value.setHex(p.waterShallow);
    oceanMat.uniforms.uDeepColor.value.setHex(p.waterDeep);
    oceanMat.uniforms.uSkyTop.value.setHex(p.skyTop);
    oceanMat.uniforms.uSkyHorizon.value.setHex(p.skyHorizon);
    oceanMat.uniforms.uSunColor.value.setHex(p.sunColor);
    oceanMat.uniforms.uSunDir.value.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]).normalize();
    oceanMat.uniforms.uFogColor.value.setHex(p.fogColor);
    oceanMat.uniforms.uFogDensity.value = p.fogDensity;

    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);

    hemiLight.color.setHex(p.hemiSky);
    hemiLight.groundColor.setHex(p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;

    scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
    scene.background = new THREE.Color(p.fogColor);

    for (const cm of cloudMaterials) {
      cm.uniforms.uLitColor.value.setHex(p.cloudTint);
      cm.uniforms.uShadowColor.value.setHex(
        mood === 'sunset' ? 0x6e738c : mood === 'storm' ? 0x3b4959 : 0x1e2c42,
      );
      cm.uniforms.uFogColor.value.setHex(p.fogColor);
      cm.uniforms.uFogDensity.value = p.fogDensity;
    }
    for (const wm of windowMaterials) {
      wm.emissiveIntensity = p.nightFactor > 0.5 ? 1.15 : 0.28;
    }
  }

  function triggerWaterRipple(x: number, z: number): void {
    oceanMat.uniforms.uRipplePos.value.set(x, z);
    oceanMat.uniforms.uRippleAge.value = 0.0;
  }

  function resetBridge(): void {
    for (const span of bridgeSpans) {
      span.collapsed = false;
      span.collapseTimer = 0;
      span.mesh.position.set(span.x, BRIDGE_DECK_Y, BRIDGE_Z);
      span.mesh.rotation.set(0, 0, 0);
      span.mesh.visible = true;
    }
  }

  return {
    group,
    oceanMat,
    skyMat,
    cloudsGroup,
    cloudMaterials,
    windowMaterials,
    searchlights,
    lighthouseBeacon: lh.beacon,
    bridgeSpans,
    obstacles,
    radarMapCanvas,
    applyWeather,
    triggerWaterRipple,
    resetBridge,
  };
}
