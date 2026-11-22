import * as THREE from 'three';

// ============================================================================
// PROCEDURAL PBR MILITARY AVIATION & NAVAL SURFACE TEXTURES (Zero 404s)
// ============================================================================
let cachedJetTex: THREE.CanvasTexture | null = null;
let cachedAggressorTex: THREE.CanvasTexture | null = null;
let cachedNavalTex: THREE.CanvasTexture | null = null;
let cachedOliveTex: THREE.CanvasTexture | null = null;

function buildPanelTexture(
  baseHex: string,
  panelHexA: string,
  panelHexB: string,
  seamHex: string,
  splinterHex?: string,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle multi-panel composite tonal shift (realistic F-22/F-35 stealth plating)
    const panels: [number, number, number, number, string][] = [
      [0, 0, 128, 84, panelHexA],
      [128, 84, 128, 88, panelHexB],
      [0, 172, 96, 84, panelHexB],
      [96, 172, 160, 84, panelHexA],
    ];
    for (const [x, y, w, h, col] of panels) {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    }

    // Optional angular splinter camo for enemy aggressor fighters
    if (splinterHex) {
      ctx.fillStyle = splinterHex;
      ctx.beginPath();
      ctx.moveTo(0, 32);
      ctx.lineTo(148, 0);
      ctx.lineTo(188, 108);
      ctx.lineTo(42, 132);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(120, 156);
      ctx.lineTo(256, 128);
      ctx.lineTo(256, 232);
      ctx.lineTo(164, 256);
      ctx.closePath();
      ctx.fill();
    }

    // Crisp riveted panel seam lines
    ctx.strokeStyle = seamHex;
    ctx.lineWidth = 1.5;
    for (const y of [42, 84, 128, 172, 214]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (const x of [64, 128, 192]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }

    // Flush aerospace fasteners along seams
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let y = 46; y < 250; y += 42) {
      for (let x = 10; x < 250; x += 24) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Maintenance stencil accent stripe
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(16, 104, 54, 4);
    ctx.fillRect(144, 188, 72, 3);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

function getJetHullTexture(): THREE.CanvasTexture {
  if (!cachedJetTex) {
    cachedJetTex = buildPanelTexture('#6f7e8f', '#657485', '#7b8a9c', 'rgba(18,24,34,0.42)');
  }
  return cachedJetTex;
}

function getAggressorCamoTexture(): THREE.CanvasTexture {
  if (!cachedAggressorTex) {
    cachedAggressorTex = buildPanelTexture('#2b3240', '#232936', '#363f52', 'rgba(8,10,16,0.55)', '#7f1d1d');
  }
  return cachedAggressorTex;
}

function getNavalSteelTexture(): THREE.CanvasTexture {
  if (!cachedNavalTex) {
    cachedNavalTex = buildPanelTexture('#4b5768', '#424e5e', '#566375', 'rgba(15,23,42,0.45)');
  }
  return cachedNavalTex;
}

function getOliveArmorTexture(): THREE.CanvasTexture {
  if (!cachedOliveTex) {
    cachedOliveTex = buildPanelTexture('#424e44', '#39453c', '#4c594e', 'rgba(12,18,14,0.48)');
  }
  return cachedOliveTex;
}

export interface PlayerAircraftRig {
  root: THREE.Group;
  jetGroup: THREE.Group;
  gunshipGroup: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  afterburners: THREE.Mesh[];
  heatShrouds: THREE.Mesh[];
  afterburnerUniforms: {
    uTime: { value: number };
    uBoost: { value: number };
  };
  afterburnerLight: THREE.PointLight;
  coreDiscMat: THREE.MeshBasicMaterial;
  ringGlowMat: THREE.MeshBasicMaterial;
  machCone: THREE.Mesh;
  aegisShield: THREE.Mesh;
  liveryMeshes: THREE.Mesh[];
}

/**
 * Real-World 5th-Gen Stealth Fighter (VX-44 FALCON, F-22/F-35 inspired)
 * & Modern Twin-Seat Attack Gunship (AH-88 KESTREL, AH-64D Longbow inspired)
 */
export function createPlayerAircraftRig(liveryHex: number): PlayerAircraftRig {
  const root = new THREE.Group();
  const liveryMeshes: THREE.Mesh[] = [];

  const jetTex = getJetHullTexture();
  const oliveTex = getOliveArmorTexture();

  const hullMat = new THREE.MeshPhysicalMaterial({
    map: jetTex,
    color: 0xb9c5d4,
    roughness: 0.32,
    metalness: 0.72,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.45,
  });
  const darkTitaniumMat = new THREE.MeshStandardMaterial({
    color: 0x1c2430,
    roughness: 0.30,
    metalness: 0.88,
    envMapIntensity: 1.4,
  });
  const radomeMat = new THREE.MeshStandardMaterial({
    color: 0x2b3646,
    roughness: 0.48,
    metalness: 0.34,
    envMapIntensity: 1.15,
  });
  const intakeInteriorMat = new THREE.MeshBasicMaterial({ color: 0x070a10 });
  const goldCanopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x182234,
    emissive: 0xc2610c,
    emissiveIntensity: 0.16,
    roughness: 0.06,
    metalness: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.75,
  });
  const gunshipCanopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    emissive: 0x0e7490,
    emissiveIntensity: 0.2,
    roughness: 0.1,
    metalness: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.45,
  });
  const liveryMat = new THREE.MeshPhysicalMaterial({
    color: liveryHex,
    roughness: 0.34,
    metalness: 0.45,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.35,
  });
  const missileBodyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.32,
    metalness: 0.38,
    envMapIntensity: 1.2,
  });
  const afterburnerUniforms = {
    uTime: { value: 0 },
    uBoost: { value: 0.18 },
  };
  const outerFlameMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: afterburnerUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float downstream = uv.y;
        float flutter = sin(downstream * 15.0 - uTime * 42.0 + pos.x * 3.5) * 0.055 * downstream * (0.28 + 0.72 * uBoost);
        pos.xy *= 1.0 + flutter;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y: 0.0 at nozzle exit -> 1.0 at trailing plume tip
        float t = 1.0 - vUv.y;
        float axial = smoothstep(0.02, 0.94, t);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.15);

        // High-speed supersonic shear streaks & standing acoustic shock waves
        float shear = 0.84 + 0.16 * sin(vUv.x * 37.699 + uTime * 18.0 + t * 8.0);
        float shockWave = 0.76 + 0.24 * pow(max(0.0, cos((1.0 - t) * 22.0 - uTime * 11.0)), 4.0);

        vec3 tipViolet = vec3(0.42, 0.22, 0.88);
        vec3 midOrange = vec3(1.0, 0.48, 0.10);
        vec3 blueShear = vec3(0.28, 0.68, 1.0);
        vec3 coreBlueWhite = vec3(0.84, 0.95, 1.0);

        vec3 col = mix(tipViolet, midOrange, smoothstep(0.04, 0.56, t));
        col = mix(col, blueShear, smoothstep(0.58, 0.86, t) * (0.35 + 0.65 * uBoost));
        col = mix(col, coreBlueWhite, smoothstep(0.84, 0.99, t) * (0.45 + 0.55 * uBoost));

        float boostGain = mix(0.62, 1.68, uBoost);
        float alpha = axial * (0.26 + 0.74 * edge) * shear * shockWave * mix(0.62, 0.95, uBoost);
        gl_FragColor = vec4(col * boostGain, alpha);
      }
    `,
  });
  const innerFlameMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: afterburnerUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        // Standing Prandtl-Meyer expansion/compression waisting along exhaust core
        float pinch = sin(uv.y * 26.0 - sin(uTime * 22.0) * 0.3) * 0.11 * uv.y * (0.35 + 0.65 * uBoost);
        pos.xy *= 1.0 + pinch;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y: 0.0 at nozzle exit -> 1.0 at core tip
        float t = 1.0 - vUv.y;
        float axial = smoothstep(0.04, 0.96, t);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.02);

        // Authentic supersonic Mach shock diamonds along blue plasma core
        float diamondWave = cos((1.0 - t) * 26.0 - sin(uTime * 24.0) * 0.28);
        float diamond = pow(max(0.0, diamondWave), 6.0) * smoothstep(0.08, 0.88, t);

        vec3 tailAmber = vec3(1.0, 0.58, 0.18);
        vec3 electricBlue = vec3(0.20, 0.62, 1.0);
        vec3 cyanCore = vec3(0.72, 0.94, 1.0);
        vec3 hotWhiteBlue = vec3(0.94, 0.99, 1.0);

        vec3 col = mix(tailAmber, electricBlue, smoothstep(0.10, 0.48, t) * (0.45 + 0.55 * uBoost));
        col = mix(col, cyanCore, smoothstep(0.45, 0.90, t));
        col = mix(col, hotWhiteBlue, clamp(diamond * (0.45 + 0.55 * uBoost) + smoothstep(0.88, 1.0, t), 0.0, 1.0));

        float intensity = mix(0.85, 1.95, uBoost) + diamond * 0.85 * uBoost;
        float alpha = axial * (0.36 + 0.64 * edge) * (0.72 + 0.28 * diamond);
        gl_FragColor = vec4(col * intensity, alpha);
      }
    `,
  });
  const heatDistortionMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: afterburnerUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float downstream = uv.y;
        float wave = sin(downstream * 18.0 - uTime * 34.0 + pos.y * 2.5) * 0.11 * downstream * (0.35 + 0.65 * uBoost);
        float swirl = cos(downstream * 12.0 - uTime * 26.0 + pos.x * 2.5) * 0.08 * downstream;
        pos.x += wave;
        pos.y += swirl;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main() {
        // vUv.y: 0.0 right behind nozzle -> 1.0 turbulent far wake
        float axialMask = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.22, vUv.y);
        float viewFacing = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.35);

        // Two counter-scrolling supersonic thermal turbulence octaves
        vec2 flowA = vec2(vUv.x * 7.0, vUv.y * 5.0 - uTime * 7.5);
        vec2 flowB = vec2(vUv.x * 13.0 + 1.7, vUv.y * 10.0 - uTime * 13.0);
        float n1 = vnoise(flowA);
        float n2 = vnoise(flowB);
        float turb = n1 * 0.62 + n2 * 0.38;

        // Refractive mirage wavelets & caustic shimmer stripes
        float ripple = sin(vUv.y * 38.0 - uTime * 46.0 + turb * 7.5) * 0.5 + 0.5;
        float shimmerBand = smoothstep(0.45, 0.92, ripple * turb * 1.45);

        vec3 coolSkyRefract = vec3(0.76, 0.87, 1.0);
        vec3 warmHeatMirage = vec3(1.0, 0.72, 0.44);
        vec3 hazeTint = mix(coolSkyRefract, warmHeatMirage, smoothstep(0.25, 0.85, 1.0 - vUv.y) * (0.4 + 0.6 * uBoost));
        hazeTint += vec3(0.28, 0.22, 0.16) * shimmerBand;

        float baseAlpha = (0.02 + 0.22 * shimmerBand + 0.05 * turb) * axialMask * pow(viewFacing, 1.45);
        float alpha = clamp(baseAlpha * (0.16 + 0.92 * uBoost), 0.0, 0.30);
        gl_FragColor = vec4(hazeTint, alpha);
      }
    `,
  });

  // =========================================================
  // 1. VX-44 FALCON 5TH-GEN STEALTH FIGHTER (F-22 / F-35 Silhouette, nose -Z)
  // =========================================================
  const jetGroup = new THREE.Group();

  // Sculpted forward nose radome + needle pitot probe
  const radomeGeo = new THREE.ConeGeometry(0.95, 4.4, 12);
  radomeGeo.rotateX(-Math.PI / 2);
  radomeGeo.scale(1.18, 0.54, 1);
  const radome = new THREE.Mesh(radomeGeo, radomeMat);
  radome.position.set(0, -0.02, -6.3);
  jetGroup.add(radome);

  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.35, 6), darkTitaniumMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, -0.02, -8.9);
  jetGroup.add(pitot);

  // Mid-to-aft blended lifting-body stealth fuselage (chined cross section)
  const midBodyGeo = new THREE.CylinderGeometry(1.12, 1.65, 8.2, 8);
  midBodyGeo.rotateX(Math.PI / 2);
  midBodyGeo.scale(1.38, 0.48, 1);
  const midBody = new THREE.Mesh(midBodyGeo, hullMat);
  midBody.position.set(0, -0.02, -0.3);
  jetGroup.add(midBody);

  // Dorsal avionics spine fairing behind cockpit
  const spineGeo = new THREE.BoxGeometry(1.15, 0.62, 5.4);
  const spine = new THREE.Mesh(spineGeo, hullMat);
  spine.position.set(0, 0.48, 0.7);
  jetGroup.add(spine);

  // Twin rear engine nacelles with metallic heat shields
  const nacelleGeo = new THREE.CylinderGeometry(0.64, 0.72, 4.8, 10);
  nacelleGeo.rotateX(Math.PI / 2);
  for (const sx of [-0.82, 0.82]) {
    const nacelle = new THREE.Mesh(nacelleGeo, darkTitaniumMat);
    nacelle.position.set(sx, -0.05, 3.35);
    jetGroup.add(nacelle);
  }

  // Caret-shaped supersonic stealth air intakes + dark compressor openings
  const intakeShape = new THREE.Shape();
  intakeShape.moveTo(0, -0.38);
  intakeShape.lineTo(1.15, -0.32);
  intakeShape.lineTo(1.35, 0.34);
  intakeShape.lineTo(0.15, 0.42);
  intakeShape.closePath();
  const intakeGeo = new THREE.ExtrudeGeometry(intakeShape, { depth: 4.5, bevelEnabled: false });
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(intakeGeo, hullMat);
    intake.position.set(side * 1.15, -0.14, -2.5);
    if (side === -1) intake.scale.x = -1;
    jetGroup.add(intake);

    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.56, 0.14), intakeInteriorMat);
    duct.position.set(side * 1.72, -0.12, -2.52);
    duct.rotation.y = side * -0.16;
    jetGroup.add(duct);
  }

  // Realistic F-22 Trapezoidal Diamond Stealth Main Wings (ExtrudeGeometry, nose -Z)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(1.1, -2.35);  // LERX forward leading edge root
  wingShape.lineTo(2.4, -1.25);  // Wing root leading edge
  wingShape.lineTo(7.45, 2.25);  // Swept wingtip leading edge
  wingShape.lineTo(7.15, 3.45);  // Clipped stealth wingtip
  wingShape.lineTo(2.35, 3.05);  // Trailing edge flap root
  wingShape.lineTo(1.35, 2.75);  // Inner trailing edge
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, hullMat);
  rightWing.position.set(0, 0.06, 0);
  jetGroup.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  jetGroup.add(leftWing);

  // Dark graphite trailing edge ailerons / flaperons
  const flapGeo = new THREE.BoxGeometry(3.5, 0.14, 0.45);
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(flapGeo, darkTitaniumMat);
    flap.position.set(side * 4.5, -0.02, 3.15);
    flap.rotation.y = side * 0.08;
    jetGroup.add(flap);
  }

  // Squadron livery stealth wing accents (flush over top wing skin)
  const wingBandShape = new THREE.Shape();
  wingBandShape.moveTo(3.4, 0.15);
  wingBandShape.lineTo(5.6, 1.65);
  wingBandShape.lineTo(5.35, 2.55);
  wingBandShape.lineTo(3.2, 1.45);
  wingBandShape.closePath();
  const wingBandGeo = new THREE.ExtrudeGeometry(wingBandShape, { depth: 0.04, bevelEnabled: false });
  wingBandGeo.rotateX(Math.PI / 2);

  const rightBand = new THREE.Mesh(wingBandGeo, liveryMat);
  rightBand.position.set(0, 0.14, 0);
  jetGroup.add(rightBand);
  liveryMeshes.push(rightBand);

  const leftBand = new THREE.Mesh(wingBandGeo, liveryMat);
  leftBand.scale.x = -1;
  leftBand.position.set(0, 0.14, 0);
  jetGroup.add(leftBand);
  liveryMeshes.push(leftBand);

  // Wingtip Aviation Navigation Strobe Lights (Red Port, Green Starboard)
  const portLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  );
  portLight.position.set(-7.3, 0.02, 2.75);
  const stbdLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x22c55e }),
  );
  stbdLight.position.set(7.3, 0.02, 2.75);
  jetGroup.add(portLight, stbdLight);

  // Underwing Ordnance Pylons + Visible AIM-9X / AMRAAM Missiles
  const pylonGeo = new THREE.BoxGeometry(0.12, 0.42, 1.35);
  const railMissileGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.25, 6);
  railMissileGeo.rotateX(Math.PI / 2);
  for (const sx of [-4.4, -3.1, 3.1, 4.4]) {
    const pylon = new THREE.Mesh(pylonGeo, darkTitaniumMat);
    pylon.position.set(sx, -0.26, 1.8 + Math.abs(sx) * 0.25);
    jetGroup.add(pylon);

    const aim = new THREE.Mesh(railMissileGeo, missileBodyMat);
    aim.position.set(sx, -0.52, 1.65 + Math.abs(sx) * 0.25);
    jetGroup.add(aim);
  }

  // Swept All-Moving Horizontal Stabilators (ExtrudeGeometry)
  const stabShape = new THREE.Shape();
  stabShape.moveTo(1.2, 3.55);
  stabShape.lineTo(3.95, 4.85);
  stabShape.lineTo(3.65, 5.75);
  stabShape.lineTo(1.25, 5.35);
  stabShape.closePath();
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 1 });
  stabGeo.rotateX(Math.PI / 2);

  const rightStab = new THREE.Mesh(stabGeo, hullMat);
  rightStab.position.set(0, -0.02, 0);
  const leftStab = rightStab.clone();
  leftStab.scale.x = -1;
  jetGroup.add(rightStab, leftStab);

  // Twin Outward-Canted Swept Stealth Vertical Tail Fins (Real Trapezoidal Fin Geometry!)
  const vTailShape = new THREE.Shape();
  vTailShape.moveTo(0, 0);
  vTailShape.lineTo(2.75, 0);
  vTailShape.lineTo(2.35, 2.35);
  vTailShape.lineTo(1.15, 2.35);
  vTailShape.closePath();
  const vTailGeo = new THREE.ExtrudeGeometry(vTailShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  // Orient fin so chord runs along +Z and height runs along +Y
  vTailGeo.rotateY(-Math.PI / 2);

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(vTailGeo, hullMat);
    fin.position.set(side * 1.25, 0.2, 2.7);
    fin.rotation.z = side * -0.44;
    jetGroup.add(fin);

    // Squadron livery tip cap on each canted tail fin
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 1.35), liveryMat);
    tip.position.set(side * 2.02, 1.92, 4.35);
    tip.rotation.z = side * -0.44;
    jetGroup.add(tip);
    liveryMeshes.push(tip);
  }

  // Interior pilot ejection headrest + glowing green HUD combiner visible under gold canopy
  const pilotSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.36), darkTitaniumMat);
  pilotSeat.position.set(0, 0.38, -2.15);
  const pilotHelmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.4 }),
  );
  pilotHelmet.position.set(0, 0.68, -2.35);
  const hudCombiner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.28),
    new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  hudCombiner.position.set(0, 0.62, -3.45);
  hudCombiner.rotation.x = -0.55;
  jetGroup.add(pilotSeat, pilotHelmet, hudCombiner);

  // Gold-Tinted Stealth Bubble Cockpit Canopy + Interior Frame
  const canopyGeo = new THREE.SphereGeometry(0.84, 16, 10);
  canopyGeo.scale(0.86, 0.66, 2.65);
  const canopy = new THREE.Mesh(canopyGeo, goldCanopyMat);
  canopy.position.set(0, 0.56, -2.55);
  jetGroup.add(canopy);

  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 14, Math.PI), darkTitaniumMat);
  canopyFrame.position.set(0, 0.5, -1.7);
  canopyFrame.scale.set(0.95, 0.78, 1);
  jetGroup.add(canopyFrame);

  // Prandtl-Glauert Supersonic Mach Vapor Cone (soft Fresnel-faded shock collar around aft wings)
  const machConeGeo = new THREE.ConeGeometry(4.2, 4.6, 28, 4, true);
  machConeGeo.rotateX(-Math.PI / 2);
  const machConeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float axial = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float rim = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float wispy = pow(rim, 1.45) * 0.85 + 0.15;
        gl_FragColor = vec4(vec3(0.88, 0.95, 1.0), axial * wispy * uOpacity);
      }
    `,
  });
  const machCone = new THREE.Mesh(machConeGeo, machConeMat);
  machCone.position.set(0, 0.05, 0.65);
  machCone.visible = false;
  jetGroup.add(machCone);

  // Twin 2D Thrust-Vectoring Exhaust Nozzles & Blue-Core Mach-Shock Afterburners + Heat Shrouds
  const nozzleGeo = new THREE.CylinderGeometry(0.48, 0.58, 1.15, 14);
  nozzleGeo.rotateX(Math.PI / 2);
  const innerRingGeo = new THREE.TorusGeometry(0.39, 0.065, 8, 16);
  const turbineCoreGeo = new THREE.CircleGeometry(0.41, 16);
  const outerFlameGeo = new THREE.CylinderGeometry(0.11, 0.52, 5.8, 20, 10, true);
  outerFlameGeo.rotateX(Math.PI / 2);
  outerFlameGeo.translate(0, 0, 2.9);
  const innerFlameGeo = new THREE.CylinderGeometry(0.05, 0.39, 4.2, 20, 10, true);
  innerFlameGeo.rotateX(Math.PI / 2);
  innerFlameGeo.translate(0, 0, 2.1);
  const heatDistortionGeo = new THREE.CylinderGeometry(1.42, 0.56, 10.6, 20, 12, true);
  heatDistortionGeo.rotateX(Math.PI / 2);
  heatDistortionGeo.translate(0, 0, 5.3);

  const coreDiscMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    side: THREE.DoubleSide,
  });
  const ringGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
  });

  const afterburners: THREE.Mesh[] = [];
  const heatShrouds: THREE.Mesh[] = [];
  for (const sx of [-0.82, 0.82]) {
    const nozzle = new THREE.Mesh(nozzleGeo, darkTitaniumMat);
    nozzle.position.set(sx, -0.05, 5.75);
    jetGroup.add(nozzle);

    const coreDisc = new THREE.Mesh(turbineCoreGeo, coreDiscMat);
    coreDisc.position.set(sx, -0.05, 6.24);
    jetGroup.add(coreDisc);

    const glowRing = new THREE.Mesh(innerRingGeo, ringGlowMat);
    glowRing.position.set(sx, -0.05, 6.28);
    jetGroup.add(glowRing);

    const flame = new THREE.Mesh(outerFlameGeo, outerFlameMat);
    flame.position.set(sx, -0.05, 6.25);
    flame.renderOrder = 2;
    const core = new THREE.Mesh(innerFlameGeo, innerFlameMat);
    core.renderOrder = 3;
    flame.add(core);
    jetGroup.add(flame);
    afterburners.push(flame);

    const shroud = new THREE.Mesh(heatDistortionGeo, heatDistortionMat);
    shroud.position.set(sx, -0.05, 6.32);
    shroud.renderOrder = 4;
    jetGroup.add(shroud);
    heatShrouds.push(shroud);
  }

  // Dynamic aft afterburner light spill illuminating tail fins, stabilators & upper hull
  const afterburnerLight = new THREE.PointLight(0xff8c3a, 2.2, 26, 1.35);
  afterburnerLight.position.set(0, 1.35, 5.35);
  jetGroup.add(afterburnerLight);

  root.add(jetGroup);

  // =========================================================
  // 2. AH-88 KESTREL ATTACK GUNSHIP (AH-64D Apache Longbow Silhouette)
  // =========================================================
  const gunshipGroup = new THREE.Group();
  gunshipGroup.visible = false;

  const gunshipHullMat = new THREE.MeshPhysicalMaterial({
    map: oliveTex,
    color: 0x6b7c6e,
    roughness: 0.62,
    metalness: 0.38,
    clearcoat: 0.14,
  });

  // Faceted angular armored main fuselage
  const gBody = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.75, 6.4), gunshipHullMat);
  gBody.position.set(0, 0.1, -0.2);
  gunshipGroup.add(gBody);

  // Side armored avionics cheek sponsons (iconic Apache profile)
  for (const side of [-1, 1]) {
    const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.92, 4.9), gunshipHullMat);
    sponson.position.set(side * 1.28, -0.25, -0.6);
    gunshipGroup.add(sponson);

    // Twin turboshaft engine nacelles with circular intakes & IR exhaust boxes
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.44, 3.6, 10), darkTitaniumMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(side * 1.38, 0.72, 0.65);
    gunshipGroup.add(eng);

    const intakeHole = new THREE.Mesh(new THREE.CircleGeometry(0.36, 10), intakeInteriorMat);
    intakeHole.position.set(side * 1.38, 0.72, -1.16);
    intakeHole.rotation.y = Math.PI;
    gunshipGroup.add(intakeHole);
  }

  // Tapered armored nose + TADS/PNVS FLIR electro-optical sensor turret
  const gNoseGeo = new THREE.ConeGeometry(1.25, 3.4, 6);
  gNoseGeo.rotateX(-Math.PI / 2);
  gNoseGeo.scale(1.05, 0.72, 1);
  const gNose = new THREE.Mesh(gNoseGeo, gunshipHullMat);
  gNose.position.set(0, -0.1, -4.8);
  gunshipGroup.add(gNose);

  const flirTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.85, 10), darkTitaniumMat);
  flirTurret.position.set(0, -0.05, -6.55);
  gunshipGroup.add(flirTurret);

  const flirLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );
  flirLens.position.set(0, 0.05, -6.98);
  gunshipGroup.add(flirLens);

  // Stepped tandem armored cockpit canopy with structural mullions
  const gCanopy = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.05, 3.85), gunshipCanopyMat);
  gCanopy.position.set(0, 1.15, -1.75);
  gCanopy.rotation.x = 0.14;
  gunshipGroup.add(gCanopy);

  for (const fz of [-3.3, -1.8, -0.3]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.12), darkTitaniumMat);
    mullion.position.set(0, 1.15, fz);
    gunshipGroup.add(mullion);
  }

  // Underslung M230 30mm Chain Gun Turret
  const gunMount = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.55, 8), darkTitaniumMat);
  gunMount.position.set(0, -0.95, -3.5);
  const chinGun = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.8, 8), darkTitaniumMat);
  chinGun.rotation.x = Math.PI / 2;
  chinGun.position.set(0, -1.12, -5.0);
  gunshipGroup.add(gunMount, chinGun);

  // Swept Stub Weapon Wings + Hydra-70 19-Tube Rocket Pods + Quad Hellfire Racks
  const stubWingShape = new THREE.Shape();
  stubWingShape.moveTo(1.0, -0.8);
  stubWingShape.lineTo(3.9, 0.25);
  stubWingShape.lineTo(3.6, 1.15);
  stubWingShape.lineTo(1.0, 0.85);
  stubWingShape.closePath();
  const stubGeo = new THREE.ExtrudeGeometry(stubWingShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  stubGeo.rotateX(Math.PI / 2);

  const stubR = new THREE.Mesh(stubGeo, gunshipHullMat);
  stubR.position.set(0, -0.05, -0.2);
  const stubL = stubR.clone();
  stubL.scale.x = -1;
  gunshipGroup.add(stubR, stubL);

  const podGeo = new THREE.CylinderGeometry(0.42, 0.42, 2.2, 12);
  podGeo.rotateX(Math.PI / 2);
  for (const sx of [-2.45, 2.45]) {
    const pod = new THREE.Mesh(podGeo, darkTitaniumMat);
    pod.position.set(sx, -0.58, 0.0);
    gunshipGroup.add(pod);

    const podCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 12), liveryMat);
    podCap.rotation.x = Math.PI / 2;
    podCap.position.set(sx, -0.58, -1.12);
    gunshipGroup.add(podCap);
    liveryMeshes.push(podCap);
  }
  // Outer Hellfire missile twin rails
  for (const sx of [-3.45, 3.45]) {
    for (const dy of [-0.45, -0.78]) {
      const hf = new THREE.Mesh(railMissileGeo, missileBodyMat);
      hf.position.set(sx, dy, 0.2);
      hf.scale.setScalar(0.88);
      gunshipGroup.add(hf);
    }
  }

  // Tapered tail boom, horizontal stabilator, and swept tail fin
  const boomGeo = new THREE.CylinderGeometry(0.45, 0.85, 6.8, 8);
  boomGeo.rotateX(Math.PI / 2);
  const tailBoom = new THREE.Mesh(boomGeo, gunshipHullMat);
  tailBoom.position.set(0, 0.42, 5.6);
  gunshipGroup.add(tailBoom);

  const tailHStab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.95), gunshipHullMat);
  tailHStab.position.set(0, 0.48, 8.2);
  gunshipGroup.add(tailHStab);

  const tailFinShape = new THREE.Shape();
  tailFinShape.moveTo(0, 0);
  tailFinShape.lineTo(1.75, 0);
  tailFinShape.lineTo(2.35, 2.55);
  tailFinShape.lineTo(1.25, 2.55);
  tailFinShape.closePath();
  const tailFinGeo = new THREE.ExtrudeGeometry(tailFinShape, { depth: 0.2, bevelEnabled: false });
  tailFinGeo.rotateY(-Math.PI / 2);
  const tailFin = new THREE.Mesh(tailFinGeo, liveryMat);
  tailFin.position.set(0.1, 0.45, 7.6);
  gunshipGroup.add(tailFin);
  liveryMeshes.push(tailFin);

  // Heavy wheeled landing gear struts (Apache style)
  for (const sx of [-1.25, 1.25]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 6), darkTitaniumMat);
    strut.position.set(sx, -1.15, -1.6);
    strut.rotation.z = sx > 0 ? -0.35 : 0.35;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.32, 10), darkTitaniumMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * 1.18, -1.6, -1.6);
    gunshipGroup.add(strut, wheel);
  }

  // Articulated 4-Blade Main Rotor + Longbow Millimeter-Wave Fire Control Radar Dome
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 1.25, 10), darkTitaniumMat);
  mast.position.set(0, 1.58, -0.15);
  gunshipGroup.add(mast);

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.2, -0.15);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.32, 10), darkTitaniumMat);
  mainRotor.add(hub);

  const bladeGeo = new THREE.BoxGeometry(12.4, 0.07, 0.44);
  const blade1 = new THREE.Mesh(bladeGeo, darkTitaniumMat);
  const blade2 = new THREE.Mesh(bladeGeo, darkTitaniumMat);
  blade2.rotation.y = Math.PI / 2;
  mainRotor.add(blade1, blade2);

  // Iconic Longbow Radar Dome perched atop rotor hub
  const longbowRadome = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.72, 0.55, 12), gunshipHullMat);
  longbowRadome.position.y = 0.52;
  mainRotor.add(longbowRadome);

  const blurDisc = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 6.25, 28),
    new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  blurDisc.rotation.x = -Math.PI / 2;
  mainRotor.add(blurDisc);
  gunshipGroup.add(mainRotor);

  // Scissored 4-blade quiet tail rotor
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.36, 2.35, 9.2);
  const tBladeGeo = new THREE.BoxGeometry(0.08, 2.35, 0.22);
  const tBlade1 = new THREE.Mesh(tBladeGeo, darkTitaniumMat);
  const tBlade2 = new THREE.Mesh(tBladeGeo, darkTitaniumMat);
  tBlade2.rotation.x = Math.PI / 2;
  tailRotor.add(tBlade1, tBlade2);
  gunshipGroup.add(tailRotor);

  root.add(gunshipGroup);

  // =========================================================
  // 3. FRESNEL AEGIS HEX SHIELD (for Ironclad Ultimate)
  // =========================================================
  const aegisMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x10f2a0) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.2);
        float grid = abs(sin(vLocalPos.x * 2.4 + uTime * 3.0) * sin(vLocalPos.y * 2.4) * sin(vLocalPos.z * 2.4));
        float alpha = clamp(fresnel * 0.85 + smoothstep(0.7, 0.95, grid) * 0.25, 0.0, 0.85);
        gl_FragColor = vec4(uColor * (1.2 + fresnel * 0.8), alpha);
      }
    `,
  });
  const aegisShield = new THREE.Mesh(new THREE.IcosahedronGeometry(7.6, 2), aegisMat);
  aegisShield.visible = false;
  root.add(aegisShield);

  return {
    root,
    jetGroup,
    gunshipGroup,
    mainRotor,
    tailRotor,
    afterburners,
    heatShrouds,
    afterburnerUniforms,
    afterburnerLight,
    coreDiscMat,
    ringGlowMat,
    machCone,
    aegisShield,
    liveryMeshes,
  };
}

/**
 * Enemy Bandit Interceptor — Real-World Su-57 / MiG-35 Aggressor Stealth Fighter (nose -Z)
 */
export function createBanditInterceptor(): THREE.Group {
  const g = new THREE.Group();
  const camoTex = getAggressorCamoTexture();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: camoTex,
    color: 0xe2e8f0,
    roughness: 0.46,
    metalness: 0.52,
    clearcoat: 0.22,
  });
  const crimsonMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.42,
    metalness: 0.35,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x18202c,
    roughness: 0.38,
    metalness: 0.78,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x111827,
    emissive: 0xdc2626,
    emissiveIntensity: 0.32,
    roughness: 0.1,
    metalness: 0.85,
    clearcoat: 1.0,
  });

  // Needle radome + long flattened twin-engine Su-57 body
  const noseGeo = new THREE.ConeGeometry(0.86, 4.4, 10);
  noseGeo.rotateX(-Math.PI / 2);
  noseGeo.scale(1.12, 0.56, 1);
  const nose = new THREE.Mesh(noseGeo, darkMetalMat);
  nose.position.set(0, 0, -5.8);
  g.add(nose);

  const bodyGeo = new THREE.CylinderGeometry(1.05, 1.55, 7.8, 8);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(1.42, 0.44, 1);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0, -0.1);
  g.add(body);

  // Swept clipped-delta aggressor wings with leading-edge strakes (LERX)
  const wShape = new THREE.Shape();
  wShape.moveTo(0.95, -2.9);
  wShape.lineTo(2.1, -1.4);
  wShape.lineTo(6.65, 2.35);
  wShape.lineTo(6.35, 3.45);
  wShape.lineTo(1.7, 2.85);
  wShape.closePath();
  const wGeo = new THREE.ExtrudeGeometry(wShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.05,
    bevelSegments: 1,
  });
  wGeo.rotateX(Math.PI / 2);

  const wingR = new THREE.Mesh(wGeo, bodyMat);
  wingR.position.set(0, 0.04, 0);
  const wingL = wingR.clone();
  wingL.scale.x = -1;
  g.add(wingR, wingL);

  // Crimson aggressor wingtip stripes
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 1.2), crimsonMat);
    tip.position.set(side * 5.2, 0.02, 2.45);
    tip.rotation.y = side * -0.45;
    g.add(tip);
  }

  // Rear horizontal stabilators
  for (const side of [-1, 1]) {
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.25), bodyMat);
    hStab.position.set(side * 2.25, -0.05, 4.35);
    hStab.rotation.y = side * -0.42;
    g.add(hStab);
  }

  // Twin widely-spaced canted vertical tails (Su-57 signature silhouette)
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(2.2, 0);
  tailShape.lineTo(1.9, 2.05);
  tailShape.lineTo(0.9, 2.05);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.12, bevelEnabled: false });
  tailGeo.rotateY(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(tailGeo, crimsonMat);
    fin.position.set(side * 1.45, 0.15, 2.75);
    fin.rotation.z = side * -0.48;
    g.add(fin);
  }

  // Sleek red-tinted canopy
  const canopyGeo = new THREE.SphereGeometry(0.76, 12, 8);
  canopyGeo.scale(0.84, 0.62, 2.45);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.position.set(0, 0.48, -2.2);
  g.add(canopy);

  // Twin engine nozzles & glowing orange-red afterburner plumes
  const nozGeo = new THREE.CylinderGeometry(0.4, 0.48, 1.0, 8);
  nozGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.38, 2.8, 8);
  flameGeo.rotateX(Math.PI / 2);
  for (const sx of [-0.95, 0.95]) {
    const noz = new THREE.Mesh(nozGeo, darkMetalMat);
    noz.position.set(sx, -0.06, 4.65);
    g.add(noz);

    const flame = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.position.set(sx, -0.06, 6.2);
    g.add(flame);
  }

  return g;
}

/**
 * 28m Modern Stealth Guided-Missile Corvette (Tumblehome hull, 76mm gun, Harpoon launchers, helipad)
 */
export function createPatrolGunboat(): THREE.Group {
  const g = new THREE.Group();
  const navalTex = getNavalSteelTexture();

  const hullMat = new THREE.MeshStandardMaterial({
    map: navalTex,
    color: 0x94a3b8,
    roughness: 0.56,
    metalness: 0.48,
  });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.72, metalness: 0.3 });
  const redHullMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.62, metalness: 0.2 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.7 });
  const bridgeGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.85,
    clearcoat: 0.9,
  });

  // Faceted stealth naval hull (ExtrudeGeometry planform with sharp wave-piercing bow!)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, -16.5);     // Sharp bow
  hullShape.lineTo(3.4, -7.2);    // Mid-forward beam
  hullShape.lineTo(3.55, 11.2);   // Full beam
  hullShape.lineTo(2.9, 13.5);    // Transom stern
  hullShape.lineTo(-2.9, 13.5);
  hullShape.lineTo(-3.55, 11.2);
  hullShape.lineTo(-3.4, -7.2);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 3.1,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 1,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 3.15;
  g.add(hull);

  // Dark waterline anti-fouling boot stripe
  const waterline = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.75, 22.8), redHullMat);
  waterline.position.set(0, 0.38, 1.5);
  g.add(waterline);

  // Stealth faceted superstructure bridge + integrated mast
  const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.2, 8.6), hullMat);
  bridgeBase.position.set(0, 4.7, 0.4);
  g.add(bridgeBase);

  const bridgeUpper = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.9, 5.2), hullMat);
  bridgeUpper.position.set(0, 7.0, -0.4);
  g.add(bridgeUpper);

  const windows = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.65, 1.9), bridgeGlassMat);
  windows.position.set(0, 7.15, -2.35);
  g.add(windows);

  // Phased-array enclosed stealth radar pyramid mast + rotating X-band bar
  const mast = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.4, 4), hullMat);
  mast.rotation.y = Math.PI / 4;
  mast.position.set(0, 10.4, 0.2);
  g.add(mast);

  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 0.32), darkSteelMat);
  radarBar.position.set(0, 12.6, 0.2);
  g.add(radarBar);

  // Forward OTO Melara 76mm faceted stealth deck gun turret
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 1.4, 6), hullMat);
  turret.position.set(0, 3.85, -8.4);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.2, 8), darkSteelMat);
  barrel.rotation.x = Math.PI / 2.25;
  barrel.position.set(0, 4.35, -10.5);
  g.add(turret, barrel);

  // Midship angled anti-ship missile canister launchers (Harpoon style)
  for (const side of [-1, 1]) {
    for (const dz of [5.2, 6.2]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.8, 8), darkSteelMat);
      tube.rotation.z = side * 0.68;
      tube.rotation.x = -0.35;
      tube.position.set(side * 1.45, 4.1, dz);
      g.add(tube);
    }
  }

  // Aft helicopter flight deck with markings
  const helipad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 6.2), deckMat);
  helipad.position.set(0, 3.38, 9.8);
  const hRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.85, 20),
    new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide }),
  );
  hRing.rotation.x = -Math.PI / 2;
  hRing.position.set(0, 3.48, 9.8);
  g.add(helipad, hRing);

  // Realistic V-shaped translucent foam wake
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 19),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.14, 21.5);
  g.add(wake);

  return g;
}

/**
 * Modern Mobile Armored Quad-Tube SAM Battery (Patriot / Pantsir style, grounded bottom-center)
 */
export function createAABunker(): THREE.Group {
  const g = new THREE.Group();
  const oliveTex = getOliveArmorTexture();

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.88, metalness: 0.08 });
  const armorMat = new THREE.MeshStandardMaterial({ map: oliveTex, color: 0x64748b, roughness: 0.55, metalness: 0.45 });
  const canisterMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.42, metalness: 0.32 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48, metalness: 0.25 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.72 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a55 });

  // Reinforced octagonal concrete blast pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.8, 1.4, 8), concreteMat);
  pad.position.y = 0.7;
  g.add(pad);

  // Armored rotary turret carriage
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.8, 8), armorMat);
  base.position.y = 2.2;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 3.8), armorMat);
  housing.position.y = 3.9;
  g.add(base, housing);

  // Quad inclined SAM launch canister tubes with red warhead nose caps
  for (const sx of [-1.25, -0.55, 0.55, 1.25]) {
    const tubeGroup = new THREE.Group();
    tubeGroup.position.set(sx, 4.9, -0.4);
    tubeGroup.rotation.x = -Math.PI / 4.2;

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 4.6, 8), canisterMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.5, 8), capMat);
    cap.position.y = 2.35;
    tubeGroup.add(tube, cap);
    g.add(tubeGroup);
  }

  // Target acquisition radar bar + glowing warning beacon
  const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.0, 8), darkMetalMat);
  radarMast.position.set(0, 5.8, 1.1);
  const radarDish = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.35), darkMetalMat);
  radarDish.position.set(0, 6.9, 1.1);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), beaconMat);
  beacon.position.set(0, 7.6, 1.1);
  g.add(radarMast, radarDish, beacon);

  return g;
}

/**
 * Industrial Aviation Fuel Refinery Tank (Ribbed steel cylinder, catwalk, manifold pipes, hazard bands)
 */
export function createFuelTank(): THREE.Group {
  const g = new THREE.Group();
  const navalTex = getNavalSteelTexture();

  const tankMat = new THREE.MeshStandardMaterial({
    map: navalTex,
    color: 0xf1f5f9,
    roughness: 0.48,
    metalness: 0.38,
  });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.52, metalness: 0.22 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.72 });

  const berm = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 6.7, 1.0, 16), steelMat);
  berm.position.y = 0.5;
  g.add(berm);

  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 8.4, 18), tankMat);
  cyl.position.y = 4.9;
  g.add(cyl);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
  dome.position.y = 9.0;
  dome.scale.y = 0.36;
  g.add(dome);

  // Dual aviation fuel hazard stripes
  const band1 = new THREE.Mesh(new THREE.CylinderGeometry(5.72, 5.72, 1.15, 18), bandMat);
  band1.position.y = 6.2;
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(5.72, 5.72, 0.55, 18), bandMat);
  band2.position.y = 4.6;
  g.add(band1, band2);

  // Vertical exterior stiffener ribs + vent stack
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 8.2, 0.4), steelMat);
    rib.position.set(Math.cos(a) * 5.65, 4.9, Math.sin(a) * 5.65);
    rib.rotation.y = -a;
    g.add(rib);
  }

  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 1.6, 8), steelMat);
  vent.position.y = 11.2;
  g.add(vent);

  return g;
}

/**
 * Geodesic Early-Warning Alpine Radar Dome (Bunker plinth, triangulated radome, rotating array)
 */
export function createRadarDome(): { group: THREE.Group; dish: THREE.Group } {
  const group = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.78, metalness: 0.25 });
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.16 });
  const strutMat = new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.42, metalness: 0.45 });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 7.0, 7.6, 10), towerMat);
  plinth.position.y = 3.8;
  group.add(plinth);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 1.1, 12), accentMat);
  collar.position.y = 7.8;
  group.add(collar);

  const radome = new THREE.Mesh(new THREE.IcosahedronGeometry(5.6, 1), domeMat);
  radome.position.y = 11.4;
  const radomeWire = new THREE.Mesh(new THREE.IcosahedronGeometry(5.68, 1), strutMat);
  radomeWire.position.y = 11.4;
  group.add(radome, radomeWire);

  const dish = new THREE.Group();
  dish.position.y = 17.8;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.5, 0.75), accentMat);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.4, 8), towerMat);
  mast.position.y = -0.9;
  dish.add(bar, mast);
  group.add(dish);

  return { group, dish };
}

/**
 * 8x8 Armored Tactical Convoy Truck (HEMTT military transporter)
 */
export function createConvoyTruck(): THREE.Group {
  const g = new THREE.Group();
  const oliveTex = getOliveArmorTexture();

  const armorMat = new THREE.MeshStandardMaterial({ map: oliveTex, color: 0x5c6b54, roughness: 0.72, metalness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.82, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.8 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  // Heavy chassis frame
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 9.6), darkMat);
  chassis.position.set(0, 1.0, -0.2);
  g.add(chassis);

  // Armored cargo/missile container bed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 6.2), armorMat);
  bed.position.set(0, 2.55, 1.2);
  g.add(bed);

  // Sloped armored forward cab with split windshield
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.15, 2.7), armorMat);
  cab.position.set(0, 2.35, -3.4);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.72, 0.15), glassMat);
  wind.position.set(0, 2.75, -4.76);
  g.add(cab, wind);

  // 4 pairs of chunky heavy tires (8x8)
  const wheelGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.55, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wz of [-3.5, -1.5, 1.2, 3.2]) {
    for (const sx of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.position.set(sx, 0.76, wz);
      g.add(wheel);
    }
  }

  // Headlights
  for (const sx of [-1.05, 1.05]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.18), lightMat);
    head.position.set(sx, 1.65, -4.8);
    g.add(head);
  }

  return g;
}

/**
 * Modern Main Battle Tank (M1A2 Abrams / Leopard 2A7 silhouette, grounded bottom-center)
 * Returns independently rotating 120mm turret for live anti-air / ground tracking.
 */
export function createBattleTank(): { group: THREE.Group; turret: THREE.Group } {
  const group = new THREE.Group();
  const oliveTex = getOliveArmorTexture();

  const hullMat = new THREE.MeshStandardMaterial({
    map: oliveTex,
    color: 0x627058,
    roughness: 0.64,
    metalness: 0.34,
  });
  const reactiveMat = new THREE.MeshStandardMaterial({
    color: 0x454f3f,
    roughness: 0.72,
    metalness: 0.28,
  });
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x1a1f26,
    roughness: 0.88,
    metalness: 0.35,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3441,
    roughness: 0.42,
    metalness: 0.74,
  });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

  // Heavy caterpillar track housings & armored roadwheel skirts (left & right)
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 8.6), trackMat);
    track.position.set(side * 2.15, 0.68, 0);
    group.add(track);

    // Armored ballistic side skirt over upper tracks
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.95, 8.4), reactiveMat);
    skirt.position.set(side * 2.72, 1.18, 0);
    group.add(skirt);

    // Visible road wheels along lower tread
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.35, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    for (let wz = -3.2; wz <= 3.2; wz += 1.28) {
      const wheel = new THREE.Mesh(wheelGeo, steelMat);
      wheel.position.set(side * 2.6, 0.48, wz);
      group.add(wheel);
    }
  }

  // Main composite armored hull + sloped glacis plate
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.35, 8.2), hullMat);
  hull.position.set(0, 1.48, 0.1);
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.72, 2.3), hullMat);
  glacis.position.set(0, 1.42, -4.2);
  glacis.rotation.x = 0.38;
  group.add(glacis);

  // Rear turbine engine deck exhaust louver
  const grille = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 2.2), steelMat);
  grille.position.set(0, 2.22, 2.8);
  group.add(grille);

  // Independently rotating angular wedge turret + 120mm smoothbore gun (aims along -Z)
  const turret = new THREE.Group();
  turret.position.set(0, 2.25, -0.35);

  const turretCore = new THREE.Mesh(new THREE.BoxGeometry(3.55, 1.25, 4.6), hullMat);
  turretCore.position.set(0, 0.65, 0.25);
  turret.add(turretCore);

  // Wedge composite cheek armor on front of turret
  const cheekGeo = new THREE.BoxGeometry(1.75, 1.1, 1.65);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, reactiveMat);
    cheek.position.set(side * 0.92, 0.62, -2.15);
    cheek.rotation.y = side * -0.38;
    turret.add(cheek);
  }

  // Commander cupola, remote weapon station & whip antenna
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.45, 8), steelMat);
  cupola.position.set(0.85, 1.45, 0.45);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.48, 0.65), steelMat);
  sight.position.set(-0.9, 1.48, -0.7);
  const sensorLens = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.12), beaconMat);
  sensorLens.position.set(-0.9, 1.52, -1.04);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.4, 5), steelMat);
  antenna.position.set(-1.35, 2.8, 1.9);
  turret.add(cupola, sight, sensorLens, antenna);

  // 120mm L/55 main gun barrel with bore evacuator (fume extractor)
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.72, 0.95), steelMat);
  mantlet.position.set(0, 0.68, -2.55);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 6.8, 8), steelMat);
  barrel.rotation.x = Math.PI / 2 - 0.14; // Slightly elevated to engage aircraft & ground
  barrel.position.set(0, 1.12, -5.65);
  const boreEvac = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.15, 8), hullMat);
  boreEvac.rotation.x = Math.PI / 2 - 0.14;
  boreEvac.position.set(0, 0.96, -4.55);
  turret.add(mantlet, barrel, boreEvac);

  group.add(turret);
  return { group, turret };
}

/**
 * 8x8 Mobile Tactical MLRS / SAM Missile Launcher (HIMARS / S-400 TELAR style)
 * Rotates elevated 6-tube missile pod toward hostile aircraft before firing salvos.
 */
export function createMLRSLauncher(): { group: THREE.Group; turret: THREE.Group } {
  const group = new THREE.Group();
  const oliveTex = getOliveArmorTexture();

  const armorMat = new THREE.MeshStandardMaterial({
    map: oliveTex,
    color: 0x525d4c,
    roughness: 0.66,
    metalness: 0.32,
  });
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1e252e, roughness: 0.82, metalness: 0.35 });
  const podMat = new THREE.MeshStandardMaterial({ color: 0x3f4a3c, roughness: 0.56, metalness: 0.42 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.42, metalness: 0.25 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a55 });

  // Heavy 8x8 armored flatbed chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 11.4), chassisMat);
  chassis.position.set(0, 1.15, 0);
  group.add(chassis);

  // Armored forward crew cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.35, 3.2), armorMat);
  cab.position.set(0, 2.65, -3.9);
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.78, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.88 }),
  );
  windshield.position.set(0, 3.05, -5.52);
  group.add(cab, windshield);

  // 8 chunky all-terrain military tires
  const wheelGeo = new THREE.CylinderGeometry(0.84, 0.84, 0.62, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wz of [-4.2, -1.8, 1.8, 4.2]) {
    for (const sx of [-1.85, 1.85]) {
      const wheel = new THREE.Mesh(wheelGeo, chassisMat);
      wheel.position.set(sx, 0.84, wz);
      group.add(wheel);
    }
  }

  // Rotating rear missile launcher pod + fire-control radar mast
  const turret = new THREE.Group();
  turret.position.set(0, 2.15, 2.2);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 1.1, 8), chassisMat);
  pedestal.position.y = 0.55;
  turret.add(pedestal);

  const podPivot = new THREE.Group();
  podPivot.position.set(0, 1.65, 0);
  podPivot.rotation.x = 0.58; // Tilted dramatically skyward (-Z front elevated!)

  const podHousing = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.95, 5.4), podMat);
  podPivot.add(podHousing);

  // 6 visible missile canister faces with crimson warhead nose caps
  const capGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.35, 8);
  capGeo.rotateX(Math.PI / 2);
  for (const mx of [-0.88, 0, 0.88]) {
    for (const my of [-0.42, 0.42]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(mx, my, -2.78);
      podPivot.add(cap);
    }
  }
  turret.add(podPivot);

  // Tracking radar beacon atop launcher
  const radar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 0.3), chassisMat);
  radar.position.set(0, 3.6, 1.8);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), beaconMat);
  beacon.position.set(0, 4.25, 1.8);
  turret.add(radar, beacon);

  group.add(turret);
  return { group, turret };
}

/**
 * Autonomous Wingman Stealth UCAV Drone (X-47B / MQ-28 Ghost Bat style, for Frostbite Ultimate)
 */
export function createEscortDrone(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.35,
    roughness: 0.28,
    metalness: 0.75,
    clearcoat: 0.5,
  });

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -2.4);
  wingShape.lineTo(2.8, 0.8);
  wingShape.lineTo(2.2, 1.5);
  wingShape.lineTo(0, 0.9);
  wingShape.lineTo(-2.2, 1.5);
  wingShape.lineTo(-2.8, 0.8);
  wingShape.closePath();
  const geo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, bodyMat);
  g.add(mesh);
  return g;
}

/**
 * Massive 96m 3-Phase Titan Dreadnought Super-Carrier Boss
 */
export interface TitanBossRig {
  root: THREE.Group;
  turretAnchors: THREE.Vector3[];
  pylonAnchors: THREE.Vector3[];
  coreAnchor: THREE.Vector3;
  turretMeshes: THREE.Group[];
  pylonMeshes: THREE.Group[];
  coreMesh: THREE.Group;
  shieldDome: THREE.Mesh;
}

export function createTitanDreadnought(): TitanBossRig {
  const root = new THREE.Group();
  const navalTex = getNavalSteelTexture();

  const hullMat = new THREE.MeshStandardMaterial({ map: navalTex, color: 0x475569, roughness: 0.58, metalness: 0.52 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.76, metalness: 0.28 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.52, metalness: 0.32 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
  const pylonGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.8,
  });
  const coreGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.8,
    roughness: 0.18,
    metalness: 0.6,
  });

  // Lower twin armored hull (96m long, 32m beam)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(28, 10, 82), hullMat);
  hull.position.set(0, 4.2, 0);
  root.add(hull);

  // Forward armored ram prow
  const prowGeo = new THREE.ConeGeometry(19.5, 18, 4);
  prowGeo.rotateY(Math.PI / 4);
  prowGeo.rotateX(-Math.PI / 2);
  prowGeo.scale(1, 0.52, 1);
  const prow = new THREE.Mesh(prowGeo, hullMat);
  prow.position.set(0, 4.2, -50);
  root.add(prow);

  // Wide armored flight deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.8, 90), deckMat);
  deck.position.set(0, 10.0, -2);
  root.add(deck);

  // Crimson hull trim stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(29.2, 2.0, 84), accentMat);
  stripe.position.set(0, 6.2, 0);
  root.add(stripe);

  // Starboard command superstructure tower with phased-array radar panels
  const tower = new THREE.Mesh(new THREE.BoxGeometry(8.5, 15, 22), hullMat);
  tower.position.set(11.5, 17.8, 14);
  root.add(tower);

  // 4 glowing orange deck beacons
  for (const [bx, bz] of [
    [-15.5, -42],
    [15.5, -42],
    [-15.5, 38],
    [15.5, 38],
  ]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), beaconMat);
    b.position.set(bx, 11.6, bz);
    root.add(b);
  }

  // Phase 1: 4 Deck Turrets
  const turretCoords: [number, number, number][] = [
    [-10, 11.2, -26],
    [10, 11.2, -26],
    [-10, 11.2, 24],
    [10, 11.2, 24],
  ];
  const turretAnchors: THREE.Vector3[] = [];
  const turretMeshes: THREE.Group[] = [];
  for (const [tx, ty, tz] of turretCoords) {
    const tg = new THREE.Group();
    tg.position.set(tx, ty, tz);
    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 2.4, 8), accentMat);
    tBase.position.y = 1.2;
    const tBarrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5.5, 6), hullMat);
    tBarrel1.rotation.x = Math.PI / 3;
    tBarrel1.position.set(-0.9, 2.8, -2.2);
    const tBarrel2 = tBarrel1.clone();
    tBarrel2.position.x = 0.9;
    tg.add(tBase, tBarrel1, tBarrel2);
    root.add(tg);
    turretMeshes.push(tg);
    turretAnchors.push(new THREE.Vector3(tx, ty + 2, tz));
  }

  // Phase 2: 2 Glowing Shield Pylons
  const pylonCoords: [number, number, number][] = [
    [-11, 11.2, -2],
    [11, 11.2, -2],
  ];
  const pylonAnchors: THREE.Vector3[] = [];
  const pylonMeshes: THREE.Group[] = [];
  for (const [px, py, pz] of pylonCoords) {
    const pg = new THREE.Group();
    pg.position.set(px, py, pz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 4.5, 6), hullMat);
    base.position.y = 2.25;
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), pylonGlowMat);
    crystal.position.y = 7.4;
    pg.add(base, crystal);
    root.add(pg);
    pylonMeshes.push(pg);
    pylonAnchors.push(new THREE.Vector3(px, py + 6.5, pz));
  }

  // Phase 3: Central Core Reactor + Protective Shield Sphere
  const coreMesh = new THREE.Group();
  coreMesh.position.set(0, 11.5, -2);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.9, 8, 16), hullMat);
  coreRing.rotation.x = Math.PI / 2;
  coreRing.position.y = 2.0;
  const coreOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 1), coreGlowMat);
  coreOrb.position.y = 5.2;
  coreMesh.add(coreRing, coreOrb);
  root.add(coreMesh);

  const shieldDome = new THREE.Mesh(
    new THREE.SphereGeometry(9.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      wireframe: true,
      depthWrite: false,
    }),
  );
  shieldDome.position.set(0, 15.5, -2);
  root.add(shieldDome);

  return {
    root,
    turretAnchors,
    pylonAnchors,
    coreAnchor: new THREE.Vector3(0, 16.5, -2),
    turretMeshes,
    pylonMeshes,
    coreMesh,
    shieldDome,
  };
}

/**
 * Allied Aircraft Carrier (scenic home base behind spawn at z = 235m)
 */
export function createAlliedCarrier(): THREE.Group {
  const g = new THREE.Group();
  const navalTex = getNavalSteelTexture();

  const hullMat = new THREE.MeshStandardMaterial({ map: navalTex, color: 0x64748b, roughness: 0.64, metalness: 0.4 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.82, metalness: 0.2 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 8.5, 76), hullMat);
  hull.position.y = 3.5;
  g.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(27, 1.4, 84), deckMat);
  deck.position.y = 8.4;
  g.add(deck);

  // Runway center & edge markings (offset by 0.04 on Y to avoid Z-fighting)
  const runway = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 72), lineMat);
  runway.position.set(-2.5, 9.15, 0);
  const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 76), whiteMat);
  edgeL.position.set(-12.2, 9.15, 0);
  const edgeR = edgeL.clone();
  edgeR.position.x = 7.2;
  g.add(runway, edgeL, edgeR);

  // Command island + radar mast
  const island = new THREE.Mesh(new THREE.BoxGeometry(5.5, 11.5, 16), hullMat);
  island.position.set(9.8, 14.5, 8);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 8.5, 8), hullMat);
  mast.position.set(9.8, 24.2, 6.5);
  g.add(island, mast);

  return g;
}

/**
 * Coastal Lighthouse on West Headland
 */
export function createLighthouse(): { group: THREE.Group; beacon: THREE.Group } {
  const group = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.75, metalness: 0.05 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7, metalness: 0.08 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 10, 10), whiteMat);
  base.position.y = 5;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 6, 10), redMat);
  band.position.y = 13;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 5, 10), whiteMat);
  top.position.y = 18.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 10), redMat);
  roof.position.y = 23.8;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.4, 10), lampMat);
  lamp.position.y = 21.8;
  group.add(base, band, top, lamp, roof);

  const beacon = new THREE.Group();
  beacon.position.y = 21.8;
  const beamGeo = new THREE.ConeGeometry(4.5, 38, 10, 1, true);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, -19);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beacon.add(beam);
  group.add(beacon);

  return { group, beacon };
}

export const ROCKET_PLUME_UNIFORMS = {
  uTime: { value: 0 },
};

export interface RocketVisualRig {
  root: THREE.Group;
  flame: THREE.Mesh;
  coreGlow: THREE.Mesh;
}

/**
 * Sleek aerodynamic supersonic 20mm / 30mm tracer bolt geometry (tip +Z, feathered wake -Z).
 */
export function createTracerBoltGeometry(): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(0.18, 0.045, 14.5, 8, 1, true);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -3.5);
  return geo;
}

/**
 * Photorealistic pyrotechnic tracer shader: incandescent white-hot tip feathering
 * into a rich amber/cyan/crimson supersonic tracer streak.
 */
export function createTracerBoltMaterial(hexColor: number, isFlare = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(hexColor) },
      uIsFlare: { value: isFlare ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIsFlare;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y: 0.0 = trailing tail (-Z), 1.0 = leading round tip (+Z)
        float tailFade = smoothstep(0.0, 0.72, vUv.y);
        float noseCap = smoothstep(1.0, 0.90, vUv.y);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.85);
        float hotHead = smoothstep(0.55, 0.95, vUv.y);
        vec3 whiteHot = vec3(1.0, 0.98, 0.92);
        vec3 col = mix(uColor, whiteHot, hotHead * 0.88);
        float boost = mix(1.85, 2.5, uIsFlare);
        float alpha = tailFade * noseCap * (0.35 + 0.65 * edge);
        gl_FragColor = vec4(col * boost, alpha);
      }
    `,
  });
}

let cachedRocketFlameMat: THREE.ShaderMaterial | null = null;
let cachedSamFlameMat: THREE.ShaderMaterial | null = null;

function getRocketMotorFlameMaterial(isFriendly: boolean): THREE.ShaderMaterial {
  if (isFriendly && cachedRocketFlameMat) return cachedRocketFlameMat;
  if (!isFriendly && cachedSamFlameMat) return cachedSamFlameMat;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: ROCKET_PLUME_UNIFORMS.uTime,
      uOuterColor: { value: new THREE.Color(isFriendly ? 0xff7b1c : 0xff3b2f) },
      uInnerColor: { value: new THREE.Color(isFriendly ? 0xdbeafe : 0xffd166) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float flutter = sin(uv.y * 16.0 - uTime * 48.0) * 0.06 * uv.y;
        pos.xy *= 1.0 + flutter;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uOuterColor;
      uniform vec3 uInnerColor;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y: 0.0 = rocket nozzle bell, 1.0 = trailing plume tip
        float t = 1.0 - vUv.y;
        float axial = smoothstep(0.02, 0.94, t);
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.08);
        float diamond = pow(max(0.0, cos((1.0 - t) * 22.0 - uTime * 36.0)), 4.0) * smoothstep(0.12, 0.92, t);
        vec3 col = mix(uOuterColor, uInnerColor, smoothstep(0.45, 0.96, t));
        col = mix(col, vec3(1.0, 0.98, 0.94), diamond * 0.85);
        float alpha = axial * (0.30 + 0.70 * edge) * (0.78 + 0.22 * diamond);
        gl_FragColor = vec4(col * (1.7 + diamond * 0.65), alpha);
      }
    `,
  });

  if (isFriendly) cachedRocketFlameMat = mat;
  else cachedSamFlameMat = mat;
  return mat;
}

/**
 * Realistic composite 3D AIM-120 AMRAAM / AIM-9X Tactical Missile, Enemy SAM,
 * and GBU-38 JDAM Finned Bomb (nose +Z for Three.js lookAt).
 */
export function createRocketVisual(variant: 'friendly' | 'enemy_sam' | 'bomb'): RocketVisualRig {
  const root = new THREE.Group();

  if (variant === 'bomb') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b4639, roughness: 0.56, metalness: 0.42 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.2 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48, metalness: 0.62 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.46, 2.4, 12), bodyMat);
    body.rotation.x = Math.PI / 2;
    root.add(body);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.41, 10, 8), bodyMat);
    nose.position.z = 1.18;
    nose.scale.set(1, 1, 1.5);
    root.add(nose);

    const fuzeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 8), finMat);
    fuzeCap.rotation.x = Math.PI / 2;
    fuzeCap.position.z = 1.78;
    root.add(fuzeCap);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.22, 12), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.72;
    root.add(band);

    // JDAM aerodynamic strake collar + cruciform rear fins
    const finH = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 0.85), finMat);
    finH.position.z = -1.12;
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.52, 0.85), finMat);
    finV.position.z = -1.12;
    root.add(finH, finV);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), new THREE.MeshBasicMaterial({ visible: false }));
    const coreGlow = flame.clone();
    return { root, flame, coreGlow };
  }

  const isFriendly = variant === 'friendly';
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: isFriendly ? 0xe8edf3 : 0x475569,
    roughness: 0.34,
    metalness: 0.45,
    clearcoat: 0.25,
  });
  const radomeMat = new THREE.MeshPhysicalMaterial({
    color: isFriendly ? 0x1e293b : 0x18181b,
    roughness: 0.14,
    metalness: 0.55,
    clearcoat: 0.9,
  });
  const seekerLensMat = new THREE.MeshPhysicalMaterial({
    color: isFriendly ? 0x0f172a : 0x450a0a,
    emissive: isFriendly ? 0x0284c7 : 0x991b1b,
    emissiveIntensity: 0.22,
    roughness: 0.06,
    metalness: 0.85,
    clearcoat: 1.0,
  });
  const warheadBandMat = new THREE.MeshStandardMaterial({
    color: isFriendly ? 0xf59e0b : 0xdc2626,
    roughness: 0.35,
    metalness: 0.25,
  });
  const motorBandMat = new THREE.MeshStandardMaterial({
    color: isFriendly ? 0x9a3412 : 0x7f1d1d,
    roughness: 0.42,
    metalness: 0.3,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: isFriendly ? 0x334155 : 0x27272a,
    roughness: 0.38,
    metalness: 0.72,
  });

  // Main cylindrical tactical airframe (nose +Z for lookAt)
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 3.6, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  root.add(fuselage);

  // Ogive nose radome + smoked sapphire IR seeker tip
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.05, 12), radomeMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.32;
  root.add(nose);

  const seekerEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), seekerLensMat);
  seekerEye.position.z = 2.84;
  root.add(seekerEye);

  // Authentic NATO ordinance bands (Yellow HE warhead + Brown/Red rocket motor)
  const warheadBand = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.22, 12), warheadBandMat);
  warheadBand.rotation.x = Math.PI / 2;
  warheadBand.position.z = 1.15;
  const motorBand = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.20, 12), motorBandMat);
  motorBand.rotation.x = Math.PI / 2;
  motorBand.position.z = -0.35;
  root.add(warheadBand, motorBand);

  // Forward clipped delta control fins + aft cruciform stabilizers
  const canardH = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.045, 0.44), finMat);
  canardH.position.z = 0.78;
  const canardV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.84, 0.44), finMat);
  canardV.position.z = 0.78;
  root.add(canardH, canardV);

  const finH = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.055, 0.76), finMat);
  finH.position.z = -1.36;
  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.36, 0.76), finMat);
  finV.position.z = -1.36;
  root.add(finH, finV);

  // Titanium rocket nozzle bell at -Z rear
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.34, 12), finMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -1.94;
  root.add(nozzle);

  // Supersonic solid-propellant rocket motor plume with Mach shock diamonds
  const flameGeo = new THREE.CylinderGeometry(0.05, 0.32, 4.4, 14, 6, true);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -2.2);
  const flame = new THREE.Mesh(flameGeo, getRocketMotorFlameMaterial(isFriendly));
  flame.position.z = -2.06;
  flame.renderOrder = 3;
  root.add(flame);

  // Incandescent nozzle throat Mach glow
  const coreGeo = new THREE.SphereGeometry(0.32, 10, 8);
  const coreGlow = new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({
      color: isFriendly ? 0xe0f2fe : 0xfef3c7,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  coreGlow.position.z = -2.14;
  root.add(coreGlow);

  return { root, flame, coreGlow };
}

