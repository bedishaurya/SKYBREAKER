import * as THREE from 'three';
import {
  DIFFICULTY_TUNING,
  MISSIONS,
  getPilotById,
} from './config';
import {
  BRIDGE_DECK_Y,
  BRIDGE_Z,
  QUAY_HEIGHT,
  WATER_LEVEL,
  WORLD_HALF_SIZE,
  calculateKillScore,
  computeAfterburnerTelemetry,
  computeAircraftImpactPhysics,
  computeCCIPImpact,
  computeRunRank,
  evaluateMissionState,
  getChainDetonationTargets,
  getTerrainHeight,
  normalizeAngle,
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
import {
  ROCKET_PLUME_UNIFORMS,
  createAABunker,
  createBanditInterceptor,
  createBattleTank,
  createConvoyTruck,
  createEscortDrone,
  createFuelTank,
  createMLRSLauncher,
  createPatrolGunboat,
  createPlayerAircraftRig,
  createRadarDome,
  createRocketVisual,
  createTitanDreadnought,
  createTracerBoltGeometry,
  createTracerBoltMaterial,
  type PlayerAircraftRig,
  type RocketVisualRig,
  type TitanBossRig,
} from './models';
import { buildArchipelagoWorld, type WorldHandles } from './world';
import { SoundEngine } from './audio';
import type {
  AirframeType,
  CameraMode,
  Difficulty,
  EnemyKind,
  GameMode,
  GameState,
  HudSnapshot,
  KillfeedAccent,
  KillfeedEntry,
  LaunchOptions,
  PilotConfig,
  RunSummary,
  WeatherMood,
} from './types';

interface EnemyEntity {
  id: string;
  kind: EnemyKind;
  label: string;
  mesh: THREE.Object3D;
  dish?: THREE.Group;
  turret?: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  hp: number;
  maxHp: number;
  radius: number;
  points: number;
  isPrimaryObjective: boolean;
  alive: boolean;
  dying: boolean;
  dyingTimer: number;
  hitFlash: number;
  // AI state
  aiState: 'intercept' | 'attack' | 'break';
  aiTimer: number;
  fireCooldown: number;
  patrolAngle: number;
  patrolCenterX: number;
  patrolCenterZ: number;
  patrolRx: number;
  patrolRz: number;
  invulnerable?: boolean;
}

interface Projectile {
  active: boolean;
  friendly: boolean;
  kind: 'vulcan' | 'missile' | 'bomb' | 'enemy_bullet' | 'enemy_sam' | 'flare';
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  damage: number;
  targetId: string | null;
  weaveSeed: number;
  mesh: THREE.Object3D;
  rig?: RocketVisualRig;
}

interface ShockwaveRing {
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  size: number;
  r: number;
  g: number;
  b: number;
  isSmoke: boolean;
  isExhaust?: boolean;
}

interface FloatingCallout {
  text: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  color: string;
  age: number;
  maxAge: number;
}

interface WingmanDrone {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  side: number;
  fireTimer: number;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onStateChange: (state: GameState) => void;
  onRunEnd: (summary: RunSummary) => void;
}

// Pre-allocated scratch math helpers (zero GC inside render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

const PARTICLE_POOL_SIZE = 820;
const PROJECTILE_POOL_SIZE = 200;
const SHOCKWAVE_POOL_SIZE = 20;
const BEST_SCORE_KEY = 'skybreaker_best_score_v1';

export class SkybreakerEngine {
  private container: HTMLDivElement;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D | null;
  private callbacks: EngineCallbacks;

  private renderer: THREE.WebGLRenderer;
  private isSoftwareGl: boolean;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private flashLight: THREE.PointLight;
  private flashIntensity = 0;
  private world: WorldHandles;
  private sound: SoundEngine;

  private playerRig: PlayerAircraftRig;
  private dynamicGroup: THREE.Group;
  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private particleCursor = 0;
  private afterburnerIntensity = 0.18;
  private afterburnerWakeAccum = 0;
  private afterburnerTimeSec = 0;

  private projectiles: Projectile[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private matVulcanGold!: THREE.ShaderMaterial;
  private matVulcanCyan!: THREE.ShaderMaterial;
  private matEnemyBullet!: THREE.ShaderMaterial;
  private matFlareWhite!: THREE.ShaderMaterial;
  private enemies: EnemyEntity[] = [];
  private callouts: FloatingCallout[] = [];
  private killfeed: KillfeedEntry[] = [];
  private killfeedSeq = 0;
  private collisionInvulnTimer = 0;
  private impactVx = 0;
  private impactVy = 0;
  private impactVz = 0;
  private spinRollVel = 0;
  private spinPitchVel = 0;
  private spinYawVel = 0;
  private controlStaggerTimer = 0;
  private wingtipTrailAccum = 0;
  private groundEffectAccum = 0;
  private camRollCurrent = 0;
  private wingmen: WingmanDrone[] = [];
  private wingmenTimer = 0;
  private bossRig: TitanBossRig | null = null;
  private bossPhase = 0;

  // Game & flight state
  private gameState: GameState = 'title';
  private pilot: PilotConfig = getPilotById('valkyrie');
  private airframe: AirframeType = 'jet';
  private difficulty: Difficulty = 'normal';
  private mode: GameMode = 'campaign';
  private missionIndex = 0;
  private weatherMood: WeatherMood = 'sunset';
  private cameraMode: CameraMode = 'chase';

  private flight: FlightState = {
    x: 0,
    y: 44,
    z: 205,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 58,
    boost: 100,
    barrelRollTimer: 0,
    barrelRollDir: 1,
    strafeVel: 0,
  };

  private hull = 354;
  private maxHull = 354;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private banditsSplashed = 0;
  private targetsDestroyed = 0;
  private targetsTotal = 0;
  private elapsedSec = 0;
  private wave = 1;
  private endlessSpawnTimer = 0;

  // Weapons & abilities
  private vulcanCooldown = 0;
  private missilesReady = 4;
  private maxMissiles = 4;
  private missileReloadTimer = 0;
  private bombsReady = 4;
  private maxBombs = 4;
  private bombReloadTimer = 0;
  private flaresReady = 3;
  private maxFlares = 3;
  private flareReloadTimer = 0;
  private ultCharge = 35;
  private ultActiveSec = 0;
  private aegisActiveSec = 0;
  private overdriveActiveSec = 0;

  // Targeting & lock-on
  private primaryLockId: string | null = null;
  private paintedLockIds: string[] = [];
  private paintingMultiLock = false;
  private paintTimer = 0;
  private lastSamBeep = 0;

  // Juice: hitstop, trauma camera shake, directional damage flash, radio
  private hitstopTimer = 0;
  private shakeTrauma = 0;
  private damageArcAngle = 0;
  private damageArcTimer = 0;
  private defeatDelayTimer = 0;
  private pendingDefeat = false;
  private radioText = 'Select your pilot, airframe, and sortie to launch.';
  private radioSpeaker = 'VALKYRIE';
  private radioAlert = false;
  private radioTimer = 0;

  // Unified input state
  private keys = new Set<string>();
  private mouseLeft = false;
  private mouseRight = false;
  private lastTapKey = '';
  private lastTapTime = 0;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchFiring = false;
  private touchBoosting = false;

  // Loop management
  private frameId = 0;
  private lastFrameMs = 0;
  private hudEmitAccum = 0;
  private tourAngle = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private width = 1280;
  private height = 720;

  constructor(
    container: HTMLDivElement,
    hudCanvas: HTMLCanvasElement,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.hudCanvas = hudCanvas;
    this.hudCtx = hudCanvas.getContext('2d');
    this.callbacks = callbacks;
    this.sound = new SoundEngine();

    // Detect software WebGL (SwiftShader / llvmpipe)
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param) || '');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = container.getBoundingClientRect();
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(this.width, this.height);
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    // Scene, Procedural Sunset Sky/Ocean PMREM Environment & Lights
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.buildSunsetEnvironment(pmrem);
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.8, 4500);

    this.sunLight = new THREE.DirectionalLight(0xffd28e, 2.45);
    this.sunLight.position.set(620, 155, -880);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 900;
      this.sunLight.shadow.camera.left = -260;
      this.sunLight.shadow.camera.right = 260;
      this.sunLight.shadow.camera.top = 260;
      this.sunLight.shadow.camera.bottom = -260;
      this.sunLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(0x9ec5e8, 0x6b4b3e, 1.15);
    this.scene.add(this.hemiLight);

    // Dynamic combat PointLight for Vulcan muzzle illumination & missile/explosion flashes
    this.flashLight = new THREE.PointLight(0xffa629, 0, 145, 1.5);
    this.scene.add(this.flashLight);

    // Build stylized archipelago world
    this.world = buildArchipelagoWorld();
    this.scene.add(this.world.group);
    this.world.applyWeather('sunset', this.sunLight, this.hemiLight, this.scene);

    // Dynamic entities group (enemies, projectiles, drones)
    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.dynamicGroup);

    // Player rig
    this.playerRig = createPlayerAircraftRig(this.pilot.liveryHex);
    this.playerRig.root.position.set(0, 44, 205);
    this.scene.add(this.playerRig.root);

    // Pooled soft Fresnel-feathered InstancedMesh particles (volumetric smoke, contrails, plasma & sparks)
    const pGeo = new THREE.SphereGeometry(1, 10, 8);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    pMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSoftNormal;
           varying vec3 vSoftViewDir;`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec3 instNormal = normal;
           #ifdef USE_INSTANCING
             instNormal = mat3(instanceMatrix) * instNormal;
           #endif
           vSoftNormal = normalize(normalMatrix * instNormal);
           vSoftViewDir = normalize(-mvPosition.xyz);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSoftNormal;
           varying vec3 vSoftViewDir;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `float softFalloff = pow(abs(dot(normalize(vSoftNormal), normalize(vSoftViewDir))), 1.65);
           gl_FragColor.a *= clamp(softFalloff * 1.15, 0.0, 1.0);
           #include <dithering_fragment>`,
        );
    };
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 2;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1,
        size: 0.001,
        r: 1,
        g: 1,
        b: 1,
        isSmoke: false,
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Pre-allocate Projectile & Shockwave pools
    this.initProjectilePool();
    this.initShockwavePool();

    // Populate scenic Mission 1 entities immediately so title flyover feels alive!
    this.spawnMissionEntities(MISSIONS[0], 'normal', 'campaign');

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeHudCanvas();
    this.bindEvents();
    this.lastFrameMs = performance.now();
    const isCaptureMode =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('capture') === '1';
    if (isCaptureMode) {
      const win = window as unknown as Record<string, unknown>;
      win.__skybreakerStep = (dt = 1 / 30) => {
        if (this.disposed) return;
        this.stepScene(dt);
        this.renderer.render(this.scene, this.camera);
        this.renderHudCanvas();
      };
      this.stepScene(1 / 30);
      this.renderer.render(this.scene, this.camera);
      this.renderHudCanvas();
    } else {
      this.tick();
    }
  }

  private buildSunsetEnvironment(pmrem: THREE.PMREMGenerator): THREE.Texture {
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(20, 24, 16);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col;
          if (h >= 0.0) {
            vec3 horizon = vec3(1.15, 0.72, 0.42);
            vec3 mid = vec3(0.48, 0.34, 0.44);
            vec3 top = vec3(0.14, 0.22, 0.38);
            col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
            col = mix(col, top, smoothstep(0.22, 0.85, h));
            vec3 sunDir = normalize(vec3(0.57, 0.14, -0.81));
            float sunDot = max(dot(d, sunDir), 0.0);
            col += vec3(1.8, 1.25, 0.7) * pow(sunDot, 20.0);
          } else {
            // Deep coastal ocean/land bounce reflection underneath aircraft
            col = mix(vec3(0.18, 0.22, 0.28), vec3(0.05, 0.14, 0.20), smoothstep(0.0, -0.5, h));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sphere = new THREE.Mesh(envGeo, envMat);
    envScene.add(sphere);
    const rt = pmrem.fromScene(envScene, 0.035);
    envGeo.dispose();
    envMat.dispose();
    return rt.texture;
  }

  private initProjectilePool(): void {
    const bulletGeo = createTracerBoltGeometry();
    this.matVulcanGold = createTracerBoltMaterial(0xffb74d);
    this.matVulcanCyan = createTracerBoltMaterial(0x7dd3fc);
    this.matEnemyBullet = createTracerBoltMaterial(0xff4d2e);
    this.matFlareWhite = createTracerBoltMaterial(0xfffbeb, true);

    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
      let mesh: THREE.Object3D;
      let rig: RocketVisualRig | undefined;

      if (i < 32) {
        rig = createRocketVisual('friendly');
        mesh = rig.root;
      } else if (i < 64) {
        rig = createRocketVisual('enemy_sam');
        mesh = rig.root;
      } else if (i < 78) {
        rig = createRocketVisual('bomb');
        mesh = rig.root;
      } else {
        mesh = new THREE.Mesh(bulletGeo, this.matVulcanGold);
      }

      mesh.visible = false;
      this.dynamicGroup.add(mesh);
      this.projectiles.push({
        active: false,
        friendly: true,
        kind: 'vulcan',
        x: 0,
        y: -999,
        z: 0,
        prevX: 0,
        prevY: -999,
        prevZ: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 2,
        damage: 10,
        targetId: null,
        weaveSeed: 0,
        mesh,
        rig,
      });
    }
  }

  private initShockwavePool(): void {
    const ringGeo = new THREE.RingGeometry(0.75, 1.0, 24);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.dynamicGroup.add(mesh);
      this.shockwaves.push({
        active: false,
        mesh,
        mat,
        age: 0,
        maxAge: 0.5,
        maxRadius: 18,
      });
    }
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.clearInputs);
    document.addEventListener('visibilitychange', this.clearInputs);

    this.resizeObserver = new ResizeObserver(() => {
      const r = this.container.getBoundingClientRect();
      this.width = Math.max(320, r.width);
      this.height = Math.max(240, r.height);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.resizeHudCanvas();
    });
    this.resizeObserver.observe(this.container);
  }

  private resizeHudCanvas(): void {
    const dpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.hudCanvas.width = Math.round(this.width * dpr);
    this.hudCanvas.height = Math.round(this.height * dpr);
    this.hudCanvas.style.width = `${this.width}px`;
    this.hudCanvas.style.height = `${this.height}px`;
    if (this.hudCtx) {
      this.hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  private clearInputs = (): void => {
    this.keys.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
    this.touchFiring = false;
    this.touchBoosting = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    if (this.paintingMultiLock) {
      this.paintingMultiLock = false;
      this.paintedLockIds = [];
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.gameState === 'playing') {
      e.preventDefault();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      if (this.gameState === 'playing') e.preventDefault();
    }

    if (this.gameState === 'playing') {
      if (code === 'Escape' || code === 'KeyP') {
        this.setPaused(true);
        return;
      }

      const wasDown = this.keys.has(code);
      this.keys.add(code);

      if (!wasDown) {
        this.sound.unlock();
        // Double-tap A/D for barrel roll
        const now = performance.now();
        if ((code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyD' || code === 'ArrowRight') &&
            this.lastTapKey === code && now - this.lastTapTime < 280) {
          this.triggerBarrelRoll(code === 'KeyA' || code === 'ArrowLeft' ? 1 : -1);
          this.lastTapKey = '';
        } else if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyD' || code === 'ArrowRight') {
          this.lastTapKey = code;
          this.lastTapTime = now;
        }

        if (code === 'KeyX') this.swapAirframe();
        else if (code === 'KeyC') this.cycleCamera();
        else if (code === 'KeyN') this.cycleWeather();
        else if (code === 'KeyB') this.dropBomb();
        else if (code === 'KeyF') this.deployFlares();
        else if (code === 'KeyR') this.triggerBarrelRoll(1);
        else if (code === 'KeyU' || code === 'KeyQ') this.activateUltimate();
        else if (code === 'KeyE') {
          this.paintingMultiLock = true;
          this.paintTimer = 0;
        } else if (code === 'KeyM') {
          this.toggleMute();
        }
      }
    } else if (this.gameState === 'paused') {
      if (code === 'Escape' || code === 'KeyP') {
        this.setPaused(false);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    this.keys.delete(code);
    if (code === 'KeyE' && this.paintingMultiLock && this.gameState === 'playing') {
      this.releaseMissileSalvo();
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.gameState !== 'playing') return;
    // Ignore clicks on UI buttons
    if ((e.target as HTMLElement)?.closest('button')) return;
    this.sound.unlock();
    if (e.button === 0) {
      this.mouseLeft = true;
    } else if (e.button === 2) {
      this.mouseRight = true;
      this.paintingMultiLock = true;
      this.paintTimer = 0;
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseLeft = false;
    } else if (e.button === 2) {
      this.mouseRight = false;
      if (this.paintingMultiLock && this.gameState === 'playing') {
        this.releaseMissileSalvo();
      }
    }
  };

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT UI / MOBILE TOUCH
  // =========================================================================
  public previewPilotAndAirframe(pilotId: string, airframe: AirframeType, mood: WeatherMood): void {
    this.pilot = getPilotById(pilotId);
    this.airframe = airframe;
    this.weatherMood = mood;
    this.applyPilotLivery();
    this.playerRig.jetGroup.visible = airframe === 'jet';
    this.playerRig.gunshipGroup.visible = airframe === 'gunship';
    this.world.applyWeather(mood, this.sunLight, this.hemiLight, this.scene);
  }

  public launchSortie(opts: LaunchOptions): void {
    this.pilot = getPilotById(opts.pilotId);
    this.airframe = opts.airframe;
    this.missionIndex = Math.max(0, Math.min(MISSIONS.length - 1, opts.missionIndex));
    this.difficulty = opts.difficulty;
    this.mode = opts.mode;

    const mission = MISSIONS[this.missionIndex];
    const diff = DIFFICULTY_TUNING[this.difficulty];

    this.weatherMood = opts.mode === 'freeflight' ? 'sunset' : mission.mood;
    this.world.applyWeather(this.weatherMood, this.sunLight, this.hemiLight, this.scene);
    this.world.resetBridge();

    this.applyPilotLivery();
    this.playerRig.jetGroup.visible = this.airframe === 'jet';
    this.playerRig.gunshipGroup.visible = this.airframe === 'gunship';
    this.playerRig.aegisShield.visible = false;

    // Reset flight spawn over the Allied Carrier facing North (-Z) straight toward the Red Steel Bridge!
    this.flight = {
      x: 0,
      y: 54,
      z: 215,
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: this.airframe === 'jet' ? 58 : 34,
      boost: 100,
      barrelRollTimer: 0,
      barrelRollDir: 1,
      strafeVel: 0,
    };

    this.maxHull = (90 + this.pilot.stats.shield * 4) * 3 + diff.playerHullBonus;
    this.hull = this.maxHull;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.banditsSplashed = 0;
    this.elapsedSec = 0;
    this.wave = 1;
    this.endlessSpawnTimer = 0;

    this.missilesReady = this.maxMissiles;
    this.missileReloadTimer = 0;
    this.bombsReady = this.maxBombs;
    this.bombReloadTimer = 0;
    this.flaresReady = this.maxFlares;
    this.flareReloadTimer = 0;
    this.ultCharge = 40;
    this.ultActiveSec = 0;
    this.aegisActiveSec = 0;
    this.overdriveActiveSec = 0;
    this.hitstopTimer = 0;
    this.shakeTrauma = 0;
    this.damageArcTimer = 0;
    this.pendingDefeat = false;
    this.defeatDelayTimer = 0;
    this.callouts = [];
    this.killfeed = [];
    this.collisionInvulnTimer = 0;
    this.impactVx = 0;
    this.impactVy = 0;
    this.impactVz = 0;
    this.spinRollVel = 0;
    this.spinPitchVel = 0;
    this.spinYawVel = 0;
    this.controlStaggerTimer = 0;
    this.clearWingmen();
    this.clearAllProjectiles();
    this.clearAllShockwaves();
    this.clearInputs();

    this.spawnMissionEntities(mission, this.difficulty, this.mode);
    this.postRadio(this.pilot.callsign, this.pilot.quips.launch, false);

    // Position camera cleanly behind aircraft right away
    this.camera.position.set(0, 60, 236);
    this.camera.lookAt(0, 56, 130);

    this.setGameState('playing');
    this.sound.setFlightActive(true);
    this.emitHudSnapshot();
  }

  public setPaused(paused: boolean): void {
    if (this.gameState !== 'playing' && this.gameState !== 'paused') return;
    this.clearInputs();
    this.setGameState(paused ? 'paused' : 'playing');
    this.sound.setFlightActive(!paused);
  }

  public returnToHangar(): void {
    this.clearInputs();
    this.clearWingmen();
    this.setGameState('title');
    this.sound.setFlightActive(false);
    this.world.applyWeather('sunset', this.sunLight, this.hemiLight, this.scene);
  }

  public swapAirframe(): void {
    if (this.gameState !== 'playing') return;
    this.airframe = this.airframe === 'jet' ? 'gunship' : 'jet';
    this.playerRig.jetGroup.visible = this.airframe === 'jet';
    this.playerRig.gunshipGroup.visible = this.airframe === 'gunship';
    this.sound.playSwap();
    this.spawnBurst(this.flight.x, this.flight.y - 1.2, this.flight.z - 2, 6, 0x38bdf8, 14, 0.22);
    this.postRadio(
      this.pilot.callsign,
      this.airframe === 'gunship'
        ? 'Swapped to AH-88 KESTREL Gunship. Hover & strafe online.'
        : 'Swapped to VX-44 FALCON Stealth Jet. Full afterburners online.',
      false,
    );
    this.emitHudSnapshot();
  }

  public cycleCamera(): void {
    const order: CameraMode[] = ['chase', 'topdown', 'cockpit'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.emitHudSnapshot();
  }

  public cycleWeather(): void {
    const order: WeatherMood[] = ['sunset', 'storm', 'night'];
    const idx = order.indexOf(this.weatherMood);
    this.weatherMood = order[(idx + 1) % order.length];
    this.world.applyWeather(this.weatherMood, this.sunLight, this.hemiLight, this.scene);
    for (const sl of this.world.searchlights) {
      sl.visible = this.weatherMood === 'night';
    }
    this.emitHudSnapshot();
  }

  public toggleMute(): boolean {
    const next = !this.sound.isMuted();
    this.sound.setMuted(next);
    return next;
  }

  public setTouchStick(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  public setTouchFire(active: boolean): void {
    if (active) this.sound.unlock();
    this.touchFiring = active;
  }

  public setTouchBoost(active: boolean): void {
    this.touchBoosting = active;
  }

  public triggerMissileQuick(): void {
    if (this.gameState !== 'playing') return;
    this.sound.unlock();
    this.fireHomingMissile(this.primaryLockId);
  }

  public dropBomb(): void {
    if (this.gameState !== 'playing' || this.bombsReady <= 0) return;
    this.sound.unlock();
    this.bombsReady--;
    this.sound.playBombDrop();

    const fwd = this.getPlayerForward(_v1);
    const speed = this.flight.speed;
    this.spawnProjectile({
      friendly: true,
      kind: 'bomb',
      x: this.flight.x,
      y: this.flight.y - 2.0,
      z: this.flight.z,
      vx: fwd.x * speed * 0.92,
      vy: fwd.y * speed * 0.5 - 4,
      vz: fwd.z * speed * 0.92,
      maxAge: 5.5,
      damage: 145 * (0.85 + this.pilot.stats.strike * 0.04),
      targetId: null,
      color: 0xf97316,
    });
    this.shotsFired++;
    this.emitHudSnapshot();
  }

  public deployFlares(): void {
    if (this.gameState !== 'playing' || this.flaresReady <= 0) return;
    this.sound.unlock();
    this.flaresReady--;
    this.sound.playFlare();

    // Spoof all incoming enemy SAM missiles!
    let spoofedCount = 0;
    for (const p of this.projectiles) {
      if (p.active && !p.friendly && p.kind === 'enemy_sam') {
        p.targetId = null;
        p.vx += (Math.random() - 0.5) * 45;
        p.vy -= 14;
        p.vz += (Math.random() - 0.5) * 45;
        p.maxAge = Math.min(p.maxAge, p.age + 0.55);
        spoofedCount++;
      }
    }
    if (spoofedCount > 0) {
      this.pushKillfeed(
        spoofedCount > 1 ? `Countermeasure: ${spoofedCount} SAMs Spoofed` : 'Countermeasure: SAM Spoofed',
        'counter',
        '+100',
      );
      this.score += 100 * spoofedCount;
    }

    // Spawn 4 visual decoy flares
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.spawnProjectile({
        friendly: true,
        kind: 'flare',
        x: this.flight.x + side * 2.5,
        y: this.flight.y - 1,
        z: this.flight.z,
        vx: side * (16 + Math.random() * 10),
        vy: -8 - Math.random() * 6,
        vz: 14 + Math.random() * 8,
        maxAge: 1.4,
        damage: 0,
        targetId: null,
        color: 0xffffff,
      });
    }
    this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 10, 0xfef9c3, 18);
    this.emitHudSnapshot();
  }

  public triggerBarrelRoll(dir: number): void {
    if (this.gameState !== 'playing' || this.flight.barrelRollTimer > 0) return;
    this.flight.barrelRollTimer = 0.55;
    this.flight.barrelRollDir = dir >= 0 ? 1 : -1;
    this.sound.playSwap();
  }

  public activateUltimate(): void {
    if (this.gameState !== 'playing' || this.ultCharge < 100) return;
    this.sound.unlock();
    this.ultCharge = 0;
    this.sound.playUltimate();
    this.postRadio(this.pilot.callsign, this.pilot.quips.ultimate, true);
    this.pushKillfeed(`Ultimate Online: ${this.pilot.ultimateLabel}`, 'bonus');
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.35);

    switch (this.pilot.ultimateType) {
      case 'salvo_4x': {
        this.ultActiveSec = 1.5;
        const candidates = this.enemies
          .filter((e) => e.alive && !e.invulnerable)
          .map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, alive: e.alive, priority: e.isPrimaryObjective ? 2 : 0 }));
        const fwd = this.getPlayerForward(_v1);
        const locks = selectLockTargets(this.flight, fwd, candidates, 480, 0.25, 4);
        for (let i = 0; i < 4; i++) {
          const tid = locks.length > 0 ? locks[i % locks.length] : null;
          this.fireHomingMissile(tid, true, (i - 1.5) * 2.2);
        }
        break;
      }
      case 'carpet_6x': {
        this.ultActiveSec = 1.5;
        const fwd = this.getPlayerForward(_v1);
        for (let i = 0; i < 6; i++) {
          const spreadX = (i - 2.5) * 6.5;
          const rightX = Math.cos(this.flight.yaw);
          const rightZ = -Math.sin(this.flight.yaw);
          this.spawnProjectile({
            friendly: true,
            kind: 'bomb',
            x: this.flight.x + rightX * spreadX,
            y: this.flight.y - 2,
            z: this.flight.z + rightZ * spreadX,
            vx: fwd.x * this.flight.speed * 0.95 + rightX * spreadX * 0.4,
            vy: -6 - i * 1.1,
            vz: fwd.z * this.flight.speed * 0.95 + rightZ * spreadX * 0.4,
            maxAge: 5.5,
            damage: 160,
            targetId: null,
            color: 0xef4444,
          });
        }
        this.sound.playBombDrop();
        break;
      }
      case 'mach_overdrive': {
        this.overdriveActiveSec = 6.5;
        this.ultActiveSec = 6.5;
        this.flight.boost = 100;
        break;
      }
      case 'wingmen_2x': {
        this.ultActiveSec = 12.0;
        this.spawnWingmen();
        break;
      }
      case 'aegis_dome': {
        this.aegisActiveSec = 7.0;
        this.ultActiveSec = 7.0;
        this.hull = Math.min(this.maxHull, this.hull + Math.round(this.maxHull * 0.25));
        this.playerRig.aegisShield.visible = true;
        break;
      }
    }
    this.emitHudSnapshot();
  }

  private applyPilotLivery(): void {
    for (const m of this.playerRig.liveryMeshes) {
      (m.material as THREE.MeshStandardMaterial).color.setHex(this.pilot.liveryHex);
    }
  }

  private setGameState(next: GameState): void {
    this.gameState = next;
    document.body.dataset.state = next;
    this.callbacks.onStateChange(next);
  }

  private postRadio(speaker: string, text: string, alert: boolean): void {
    this.radioSpeaker = speaker;
    this.radioText = text;
    this.radioAlert = alert;
    this.radioTimer = 6.5;
  }

  // =========================================================================
  // MISSION ENTITY SPAWNER
  // =========================================================================
  private clearEnemies(): void {
    for (const e of this.enemies) {
      // Do not remove static bridge spans owned by world.group
      if (e.kind !== 'bridge_span' && e.kind !== 'boss_turret' && e.kind !== 'boss_pylon' && e.kind !== 'boss_core') {
        this.dynamicGroup.remove(e.mesh);
      }
    }
    if (this.bossRig) {
      this.dynamicGroup.remove(this.bossRig.root);
      this.bossRig = null;
    }
    this.enemies = [];
    this.bossPhase = 0;
  }

  private clearAllProjectiles(): void {
    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  private clearAllShockwaves(): void {
    for (const sw of this.shockwaves) {
      sw.active = false;
      sw.mesh.visible = false;
    }
  }

  private pushKillfeed(headline: string, accent: KillfeedAccent, pointsText?: string, ttl = 5.5): void {
    const id = `kf_${++this.killfeedSeq}`;
    this.killfeed = pushKillfeedEntry(this.killfeed, { headline, pointsText, accent, ttl }, id, 5);
    this.emitHudSnapshot();
  }

  private formatKillfeedTarget(kind: EnemyKind): string {
    switch (kind) {
      case 'aa_bunker':
        return 'SAM Site';
      case 'battle_tank':
        return 'Main Battle Tank';
      case 'mlrs_launcher':
        return 'Mobile MLRS';
      case 'bandit':
        return 'Bandit Jet';
      case 'gunboat':
        return 'Patrol Corvette';
      case 'fuel_tank':
        return 'Fuel Tank';
      case 'bridge_span':
        return 'Bridge Span';
      case 'convoy_truck':
        return 'Armored Convoy';
      case 'radar_dome':
        return 'Alpine Radar';
      case 'boss_turret':
        return 'Dreadnought Turret';
      case 'boss_pylon':
        return 'Shield Pylon';
      case 'boss_core':
        return 'Titan Core Reactor';
    }
  }

  private clearWingmen(): void {
    for (const w of this.wingmen) {
      this.dynamicGroup.remove(w.mesh);
    }
    this.wingmen = [];
    this.wingmenTimer = 0;
  }

  private spawnWingmen(): void {
    this.clearWingmen();
    this.wingmenTimer = 12.0;
    for (const side of [-1, 1]) {
      const mesh = createEscortDrone();
      const x = this.flight.x + side * 14;
      const y = this.flight.y + 3;
      const z = this.flight.z + 6;
      mesh.position.set(x, y, z);
      this.dynamicGroup.add(mesh);
      this.wingmen.push({ mesh, x, y, z, yaw: this.flight.yaw, side, fireTimer: 0.2 });
    }
  }

  private spawnMissionEntities(
    mission: (typeof MISSIONS)[number],
    difficulty: Difficulty,
    mode: GameMode,
  ): void {
    this.clearEnemies();
    const hpMult = DIFFICULTY_TUNING[difficulty].enemyHpMult;

    for (const sl of this.world.searchlights) {
      sl.visible = mode !== 'freeflight' && (mission.hasSearchlights || this.weatherMood === 'night');
    }

    if (mode === 'freeflight') {
      // Populate scenic combined-arms land & sea targets spaced generously across the 3200x3200m warzone
      this.spawnFuelDepot(hpMult, false);
      this.spawnGunboat(-12, -185, 54, 48, hpMult, false);
      this.spawnBattleTank(380, 90, 95, 75, hpMult, false);
      this.spawnBattleTank(-395, 95, 95, 75, hpMult, false);
      this.spawnMLRSLauncher(315, -205, hpMult, false);
      this.targetsTotal = 0;
      this.targetsDestroyed = 0;
      return;
    }

    if (mode === 'endless') {
      this.spawnEndlessWave(1, hpMult);
      this.targetsTotal = 0;
      this.targetsDestroyed = 0;
      return;
    }

    // Campaign Mission Spawns spaced generously across the 3200x3200m combined-arms land & sea theatre
    for (let i = 0; i < mission.banditCount; i++) {
      const angle = (i / Math.max(1, mission.banditCount)) * Math.PI * 1.5 - 0.75;
      this.spawnBandit(
        Math.sin(angle) * 340,
        62 + (i % 3) * 16,
        -180 - i * 95,
        hpMult,
        true,
      );
    }

    const corvetteZones: [number, number, number, number][] = [
      [-15, -185, 56, 52],   // North Strait patrol
      [18, 95, 52, 42],      // South Strait patrol
      [-10, -370, 64, 52],   // Far North Bay patrol
    ];
    for (let i = 0; i < mission.gunboatCount; i++) {
      const [cx, cz, rx, rz] = corvetteZones[i % corvetteZones.length];
      this.spawnGunboat(cx, cz, rx, rz, hpMult, true);
    }

    // AA SAM Sites on distinct coastal headlands & ridges (200m+ apart, zero overlap with quays or fuel depot)
    const aaCoords: [number, number][] = [
      [-245, -165],
      [265, 135],
      [225, -230],
      [-235, 150],
    ];
    for (let i = 0; i < mission.aaCount; i++) {
      const [ax, az] = aaCoords[i % aaCoords.length];
      this.spawnAABunker(ax, az, hpMult, true);
    }

    // Patrolling Main Battle Tanks across wide distinct East/West Armored Plains & Northern Mainland Valley
    const tankZones: [number, number, number, number][] = [
      [380, 90, 95, 75],     // East Coastal Steppe South
      [-395, 95, 95, 75],    // West Armored Plain South
      [590, -135, 115, 85],  // Far East Steppe North
      [-580, -145, 115, 85], // Far West Plateau North
      [0, -690, 185, 75],    // Northern Mainland Armored Valley
    ];
    for (let i = 0; i < mission.tankCount; i++) {
      const [tx, tz, rx, rz] = tankZones[i % tankZones.length];
      this.spawnBattleTank(tx, tz, rx, rz, hpMult, true);
    }

    // Mobile MLRS Tactical Missile Launchers at wide long-range artillery battery positions
    const mlrsCoords: [number, number][] = [
      [315, -205],           // East Northern Steppe Battery
      [-325, -210],          // West Northern Steppe Battery
      [560, 200],            // Far East Southern Plain Battery
      [-550, 205],           // Far West Southern Plain Battery
      [230, -755],           // Northern Mainland Artillery Ridge
    ];
    for (let i = 0; i < mission.mlrsCount; i++) {
      const [mx, mz] = mlrsCoords[i % mlrsCoords.length];
      this.spawnMLRSLauncher(mx, mz, hpMult, true);
    }

    if (mission.hasFuelDepot) {
      this.spawnFuelDepot(hpMult, true);
    }

    if (mission.hasBridgeTarget) {
      for (const span of this.world.bridgeSpans) {
        this.enemies.push({
          id: span.id,
          kind: 'bridge_span',
          label: 'TRUSS SPAN',
          mesh: span.mesh,
          x: span.x,
          y: span.y,
          z: span.z,
          vx: 0,
          vy: 0,
          vz: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          hp: Math.round(135 * hpMult),
          maxHp: Math.round(135 * hpMult),
          radius: 17,
          points: 450,
          isPrimaryObjective: true,
          alive: true,
          dying: false,
          dyingTimer: 0,
          hitFlash: 0,
          aiState: 'intercept',
          aiTimer: 0,
          fireCooldown: 999,
          patrolAngle: 0,
          patrolCenterX: span.x,
          patrolCenterZ: span.z,
          patrolRx: 0,
          patrolRz: 0,
        });
      }
    }

    if (mission.hasConvoy) {
      for (let i = 0; i < 3; i++) {
        const mesh = createConvoyTruck();
        const cx = -72 + i * 28;
        mesh.position.set(cx, BRIDGE_DECK_Y + 0.85, BRIDGE_Z);
        mesh.rotation.y = -Math.PI / 2;
        this.dynamicGroup.add(mesh);
        this.enemies.push({
          id: `convoy_${i}`,
          kind: 'convoy_truck',
          label: 'CONVOY TRUCK',
          mesh,
          x: cx,
          y: BRIDGE_DECK_Y + 2.4,
          z: BRIDGE_Z,
          vx: 6.5,
          vy: 0,
          vz: 0,
          yaw: -Math.PI / 2,
          pitch: 0,
          roll: 0,
          hp: Math.round(55 * hpMult),
          maxHp: Math.round(55 * hpMult),
          radius: 7,
          points: 300,
          isPrimaryObjective: true,
          alive: true,
          dying: false,
          dyingTimer: 0,
          hitFlash: 0,
          aiState: 'intercept',
          aiTimer: 0,
          fireCooldown: 999,
          patrolAngle: 0,
          patrolCenterX: 0,
          patrolCenterZ: BRIDGE_Z,
          patrolRx: 80,
          patrolRz: 0,
        });
      }
    }

    if (mission.hasRadarArray) {
      const radarCoords: [number, number][] = [
        [365, -365],
        [-365, -360],
      ];
      radarCoords.forEach(([rx, rz], idx) => {
        const ry = Math.max(QUAY_HEIGHT, getTerrainHeight(rx, rz));
        const rd = createRadarDome();
        rd.group.position.set(rx, ry - 0.5, rz);
        this.dynamicGroup.add(rd.group);
        this.enemies.push({
          id: `radar_${idx}`,
          kind: 'radar_dome',
          label: 'ALPINE RADAR',
          mesh: rd.group,
          dish: rd.dish,
          x: rx,
          y: ry + 11,
          z: rz,
          vx: 0,
          vy: 0,
          vz: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          hp: Math.round(145 * hpMult),
          maxHp: Math.round(145 * hpMult),
          radius: 12,
          points: 600,
          isPrimaryObjective: true,
          alive: true,
          dying: false,
          dyingTimer: 0,
          hitFlash: 0,
          aiState: 'intercept',
          aiTimer: 0,
          fireCooldown: 999,
          patrolAngle: 0,
          patrolCenterX: rx,
          patrolCenterZ: rz,
          patrolRx: 0,
          patrolRz: 0,
        });
      });
    }

    if (mission.hasBoss) {
      this.spawnTitanBoss(hpMult);
    }

    this.targetsTotal = this.enemies.filter((e) => e.isPrimaryObjective).length;
    this.targetsDestroyed = 0;
  }

  private spawnFuelDepot(hpMult: number, isObj: boolean): void {
    const coords: [number, number][] = [
      [126, -72],
      [178, -72],
      [126, -16],
      [178, -16],
      [126, 40],
      [178, 40],
    ];
    coords.forEach(([fx, fz], idx) => {
      const mesh = createFuelTank();
      mesh.position.set(fx, QUAY_HEIGHT, fz);
      this.dynamicGroup.add(mesh);
      this.enemies.push({
        id: `fuel_tank_${idx}`,
        kind: 'fuel_tank',
        label: 'FUEL TANK',
        mesh,
        x: fx,
        y: QUAY_HEIGHT + 5,
        z: fz,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        hp: Math.round(42 * hpMult),
        maxHp: Math.round(42 * hpMult),
        radius: 9.5,
        points: 250,
        isPrimaryObjective: isObj,
        alive: true,
        dying: false,
        dyingTimer: 0,
        hitFlash: 0,
        aiState: 'intercept',
        aiTimer: 0,
        fireCooldown: 999,
        patrolAngle: 0,
        patrolCenterX: fx,
        patrolCenterZ: fz,
        patrolRx: 0,
        patrolRz: 0,
      });
    });
  }

  private spawnBandit(x: number, y: number, z: number, hpMult: number, isObj: boolean): void {
    const mesh = createBanditInterceptor();
    mesh.position.set(x, y, z);
    this.dynamicGroup.add(mesh);
    this.enemies.push({
      id: `bandit_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'bandit',
      label: 'BANDIT JET',
      mesh,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 42,
      yaw: Math.PI,
      pitch: 0,
      roll: 0,
      hp: Math.round(78 * hpMult),
      maxHp: Math.round(78 * hpMult),
      radius: 8.5,
      points: 500,
      isPrimaryObjective: isObj,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'intercept',
      aiTimer: 2 + Math.random() * 2,
      fireCooldown: 1.5 + Math.random() * 1.5,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolCenterX: 0,
      patrolCenterZ: -80,
      patrolRx: 140,
      patrolRz: 140,
    });
  }

  private spawnGunboat(cx: number, cz: number, rx: number, rz: number, hpMult: number, isObj: boolean): void {
    const mesh = createPatrolGunboat();
    const angle = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(angle) * rx;
    const z = cz + Math.sin(angle) * rz;
    mesh.position.set(x, 0, z);
    this.dynamicGroup.add(mesh);
    this.enemies.push({
      id: `gunboat_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'gunboat',
      label: 'STEALTH CORVETTE',
      mesh,
      x,
      y: 3.5,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      hp: Math.round(130 * hpMult),
      maxHp: Math.round(130 * hpMult),
      radius: 13.5,
      points: 450,
      isPrimaryObjective: isObj,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'intercept',
      aiTimer: 0,
      fireCooldown: 2.2 + Math.random() * 1.4,
      patrolAngle: angle,
      patrolCenterX: cx,
      patrolCenterZ: cz,
      patrolRx: rx,
      patrolRz: rz,
    });
  }

  private spawnAABunker(x: number, z: number, hpMult: number, isObj: boolean): void {
    const y = Math.max(QUAY_HEIGHT, getTerrainHeight(x, z));
    const mesh = createAABunker();
    mesh.position.set(x, y, z);
    this.dynamicGroup.add(mesh);
    this.enemies.push({
      id: `aa_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'aa_bunker',
      label: 'AA SAM SITE',
      mesh,
      x,
      y: y + 3.5,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      hp: Math.round(85 * hpMult),
      maxHp: Math.round(85 * hpMult),
      radius: 8.5,
      points: 350,
      isPrimaryObjective: isObj,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'intercept',
      aiTimer: 0,
      fireCooldown: 3.2 + Math.random() * 2.0,
      patrolAngle: 0,
      patrolCenterX: x,
      patrolCenterZ: z,
      patrolRx: 0,
      patrolRz: 0,
    });
  }

  private spawnBattleTank(cx: number, cz: number, rx: number, rz: number, hpMult: number, isObj: boolean): void {
    const tank = createBattleTank();
    const angle = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(angle) * rx;
    const z = cz + Math.sin(angle) * rz;
    const groundY = Math.max(QUAY_HEIGHT, getTerrainHeight(x, z));
    tank.group.position.set(x, groundY, z);
    this.dynamicGroup.add(tank.group);
    this.enemies.push({
      id: `tank_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'battle_tank',
      label: 'BATTLE TANK',
      mesh: tank.group,
      turret: tank.turret,
      x,
      y: groundY + 2.4,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      hp: Math.round(98 * hpMult),
      maxHp: Math.round(98 * hpMult),
      radius: 8.2,
      points: 420,
      isPrimaryObjective: isObj,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'intercept',
      aiTimer: 0,
      fireCooldown: 1.6 + Math.random() * 1.6,
      patrolAngle: angle,
      patrolCenterX: cx,
      patrolCenterZ: cz,
      patrolRx: rx,
      patrolRz: rz,
    });
  }

  private spawnMLRSLauncher(x: number, z: number, hpMult: number, isObj: boolean): void {
    const mlrs = createMLRSLauncher();
    const groundY = Math.max(QUAY_HEIGHT, getTerrainHeight(x, z));
    mlrs.group.position.set(x, groundY, z);
    mlrs.group.rotation.y = Math.atan2(-x, -z);
    this.dynamicGroup.add(mlrs.group);
    this.enemies.push({
      id: `mlrs_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'mlrs_launcher',
      label: 'MOBILE MLRS',
      mesh: mlrs.group,
      turret: mlrs.turret,
      x,
      y: groundY + 3.2,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: mlrs.group.rotation.y,
      pitch: 0,
      roll: 0,
      hp: Math.round(88 * hpMult),
      maxHp: Math.round(88 * hpMult),
      radius: 9.0,
      points: 460,
      isPrimaryObjective: isObj,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'attack',
      aiTimer: 0,
      fireCooldown: 2.0 + Math.random() * 1.8,
      patrolAngle: 0,
      patrolCenterX: x,
      patrolCenterZ: z,
      patrolRx: 0,
      patrolRz: 0,
    });
  }

  private spawnTitanBoss(hpMult: number): void {
    const rig = createTitanDreadnought();
    const bossX = 0;
    const bossZ = -150;
    rig.root.position.set(bossX, 0, bossZ);
    this.dynamicGroup.add(rig.root);
    this.bossRig = rig;
    this.bossPhase = 1;

    // Phase 1: 4 Deck Turrets (vulnerable immediately)
    rig.turretAnchors.forEach((a, i) => {
      this.enemies.push({
        id: `boss_turret_${i}`,
        kind: 'boss_turret',
        label: 'DREADNOUGHT TURRET',
        mesh: rig.turretMeshes[i],
        x: bossX + a.x,
        y: a.y,
        z: bossZ + a.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        hp: Math.round(115 * hpMult),
        maxHp: Math.round(115 * hpMult),
        radius: 10,
        points: 500,
        isPrimaryObjective: true,
        alive: true,
        dying: false,
        dyingTimer: 0,
        hitFlash: 0,
        aiState: 'attack',
        aiTimer: 0,
        fireCooldown: 2.0 + i * 0.7,
        patrolAngle: 0,
        patrolCenterX: bossX,
        patrolCenterZ: bossZ,
        patrolRx: 0,
        patrolRz: 0,
        invulnerable: false,
      });
    });

    // Phase 2: 2 Shield Pylons (invulnerable until turrets cleared)
    rig.pylonAnchors.forEach((a, i) => {
      this.enemies.push({
        id: `boss_pylon_${i}`,
        kind: 'boss_pylon',
        label: 'SHIELD PYLON',
        mesh: rig.pylonMeshes[i],
        x: bossX + a.x,
        y: a.y,
        z: bossZ + a.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        hp: Math.round(150 * hpMult),
        maxHp: Math.round(150 * hpMult),
        radius: 11,
        points: 750,
        isPrimaryObjective: true,
        alive: true,
        dying: false,
        dyingTimer: 0,
        hitFlash: 0,
        aiState: 'attack',
        aiTimer: 0,
        fireCooldown: 999,
        patrolAngle: 0,
        patrolCenterX: bossX,
        patrolCenterZ: bossZ,
        patrolRx: 0,
        patrolRz: 0,
        invulnerable: true,
      });
    });

    // Phase 3: Central Core Reactor (invulnerable until pylons cleared)
    this.enemies.push({
      id: 'boss_core',
      kind: 'boss_core',
      label: 'TITAN CORE REACTOR',
      mesh: rig.coreMesh,
      x: bossX + rig.coreAnchor.x,
      y: rig.coreAnchor.y,
      z: bossZ + rig.coreAnchor.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      hp: Math.round(280 * hpMult),
      maxHp: Math.round(280 * hpMult),
      radius: 13,
      points: 2000,
      isPrimaryObjective: true,
      alive: true,
      dying: false,
      dyingTimer: 0,
      hitFlash: 0,
      aiState: 'attack',
      aiTimer: 0,
      fireCooldown: 999,
      patrolAngle: 0,
      patrolCenterX: bossX,
      patrolCenterZ: bossZ,
      patrolRx: 0,
      patrolRz: 0,
      invulnerable: true,
    });
  }

  private spawnEndlessWave(waveNum: number, hpMult: number): void {
    const bandits = 2 + Math.min(waveNum, 4);
    for (let i = 0; i < bandits; i++) {
      this.spawnBandit((Math.random() - 0.5) * 680, 62 + i * 12, -240 - i * 85, hpMult * (1 + waveNum * 0.08), false);
    }
    this.spawnGunboat((Math.random() - 0.5) * 32, -185 + Math.random() * 140, 56, 48, hpMult, false);
    this.spawnBattleTank(420, 80, 95, 75, hpMult, false);
    this.spawnBattleTank(-430, 85, 95, 75, hpMult, false);
    this.spawnMLRSLauncher(waveNum % 2 === 0 ? -340 : 335, -205, hpMult, false);
    this.postRadio(this.pilot.callsign, `Endless Wave ${waveNum} inbound across the 3.2km warzone! Engage hostiles!`, true);
  }

  // =========================================================================
  // COMBAT & PROJECTILES
  // =========================================================================
  private getPlayerForward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.flight.pitch);
    return out.set(
      -Math.sin(this.flight.yaw) * cp,
      Math.sin(this.flight.pitch),
      -Math.cos(this.flight.yaw) * cp,
    ).normalize();
  }

  private spawnProjectile(opts: {
    friendly: boolean;
    kind: Projectile['kind'];
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    maxAge: number;
    damage: number;
    targetId: string | null;
    color: number;
  }): void {
    let startIdx = 78;
    let endIdx = this.projectiles.length;
    if (opts.kind === 'missile') {
      startIdx = 0;
      endIdx = 32;
    } else if (opts.kind === 'enemy_sam') {
      startIdx = 32;
      endIdx = 64;
    } else if (opts.kind === 'bomb') {
      startIdx = 64;
      endIdx = 78;
    }

    let slot: Projectile | null = null;
    for (let i = startIdx; i < endIdx; i++) {
      if (!this.projectiles[i].active) {
        slot = this.projectiles[i];
        break;
      }
    }
    if (!slot) {
      slot = this.projectiles[startIdx];
    }

    slot.active = true;
    slot.friendly = opts.friendly;
    slot.kind = opts.kind;
    slot.x = opts.x;
    slot.y = opts.y;
    slot.z = opts.z;
    slot.prevX = opts.x;
    slot.prevY = opts.y;
    slot.prevZ = opts.z;
    slot.vx = opts.vx;
    slot.vy = opts.vy;
    slot.vz = opts.vz;
    slot.age = 0;
    slot.maxAge = opts.maxAge;
    slot.damage = opts.damage;
    slot.targetId = opts.targetId;
    slot.weaveSeed = Math.random() * Math.PI * 2;
    slot.mesh.visible = true;
    slot.mesh.position.set(opts.x, opts.y, opts.z);
    slot.mesh.lookAt(opts.x + opts.vx, opts.y + opts.vy, opts.z + opts.vz);

    if (!slot.rig) {
      const m = slot.mesh as THREE.Mesh;
      if (opts.kind === 'flare') {
        m.material = this.matFlareWhite;
      } else if (!opts.friendly) {
        m.material = this.matEnemyBullet;
      } else if (opts.color === 0x38bdf8 || opts.color === 0x06b6d4) {
        m.material = this.matVulcanCyan;
      } else {
        m.material = this.matVulcanGold;
      }
    }

    const scale =
      opts.kind === 'bomb'
        ? 1.55
        : opts.kind === 'missile'
          ? 1.25
          : opts.kind === 'enemy_sam'
            ? 1.35
            : opts.kind === 'flare'
              ? 1.5
              : 1.0;
    slot.mesh.scale.setScalar(scale);
  }

  private fireVulcan(): void {
    const rate = this.overdriveActiveSec > 0 ? 0.055 : 0.095;
    if (this.vulcanCooldown > 0) return;
    this.vulcanCooldown = rate;

    const fwd = this.getPlayerForward(_v1);
    const rightX = Math.cos(this.flight.yaw);
    const rightZ = -Math.sin(this.flight.yaw);

    // Subtle soft aim-assist toward primary locked enemy within tight cone
    let aimX = fwd.x;
    let aimY = fwd.y;
    let aimZ = fwd.z;
    if (this.primaryLockId) {
      const target = this.enemies.find((e) => e.id === this.primaryLockId && e.alive && !e.invulnerable);
      if (target) {
        const dist = Math.hypot(target.x - this.flight.x, target.y - this.flight.y, target.z - this.flight.z);
        const leadT = Math.min(0.85, dist / 245);
        _v2.set(
          target.x + target.vx * leadT - this.flight.x,
          target.y + target.vy * leadT - this.flight.y,
          target.z + target.vz * leadT - this.flight.z,
        ).normalize();
        if (_v2.dot(fwd) > 0.94) {
          aimX = _v2.x;
          aimY = _v2.y;
          aimZ = _v2.z;
        }
      }
    }

    const bulletSpeed = Math.max(255, this.flight.speed + 205);
    const dmg = 16 * (0.82 + this.pilot.stats.strike * 0.035);
    const isOverdrive = this.overdriveActiveSec > 0;

    for (const side of [-1.8, 1.8]) {
      const spreadX = (Math.random() - 0.5) * 0.013;
      const spreadY = (Math.random() - 0.5) * 0.013;
      const spreadZ = (Math.random() - 0.5) * 0.013;
      const portX = this.flight.x + rightX * side + fwd.x * 3.4;
      const portY = this.flight.y - 0.45 + fwd.y * 3.4;
      const portZ = this.flight.z + rightZ * side + fwd.z * 3.4;
      this.spawnProjectile({
        friendly: true,
        kind: 'vulcan',
        x: portX,
        y: portY,
        z: portZ,
        vx: (aimX + spreadX) * bulletSpeed,
        vy: (aimY + spreadY) * bulletSpeed,
        vz: (aimZ + spreadZ) * bulletSpeed,
        maxAge: 1.6,
        damage: dmg,
        targetId: null,
        color: isOverdrive ? 0x38bdf8 : 0xfef08a,
      });
      // Crisp gun-port muzzle spark & gunsmoke wisp
      this.spawnSmokePuff(
        portX,
        portY,
        portZ,
        fwd.x * (this.flight.speed + 16),
        fwd.y * (this.flight.speed + 16) + 0.6,
        fwd.z * (this.flight.speed + 16),
        isOverdrive ? 0xbae6fd : 0xfed7aa,
        0.24,
        0.14,
        true,
      );
    }
    // Muzzle flash illumination & crisp tracer bolt flash
    this.triggerFlash(this.flight.x + fwd.x * 5, this.flight.y - 0.3, this.flight.z + fwd.z * 5, isOverdrive ? 0x38bdf8 : 0xffd166, 5.2);
    this.shotsFired++;
    this.sound.playVulcan();
  }

  private fireHomingMissile(targetId: string | null, free = false, lateralOffset = 0): void {
    if (!free && this.missilesReady <= 0) return;
    if (!free) this.missilesReady--;

    const fwd = this.getPlayerForward(_v1);
    const rightX = Math.cos(this.flight.yaw);
    const rightZ = -Math.sin(this.flight.yaw);
    const railSide = lateralOffset !== 0 ? lateralOffset : (this.missilesReady % 2 === 0 ? -2.4 : 2.4);
    const spawnX = this.flight.x + rightX * railSide + fwd.x * 2.2;
    const spawnY = this.flight.y - 1.3;
    const spawnZ = this.flight.z + rightZ * railSide + fwd.z * 2.2;
    const launchSpeed = Math.max(78, this.flight.speed + 26);

    this.spawnProjectile({
      friendly: true,
      kind: 'missile',
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      vx: fwd.x * launchSpeed + rightX * railSide * 2.5,
      vy: fwd.y * launchSpeed - 1.5,
      vz: fwd.z * launchSpeed + rightZ * railSide * 2.5,
      maxAge: 4.8,
      damage: 94 * (0.85 + this.pilot.stats.strike * 0.035),
      targetId,
      color: 0x38bdf8,
    });
    // Crisp launch ignition puff under the wing rail
    this.spawnSmokePuff(spawnX, spawnY, spawnZ, -fwd.x * 12, -2, -fwd.z * 12, 0xe2e8f0, 0.36, 0.32);
    this.spawnBurst(spawnX, spawnY, spawnZ, 4, 0xffa629, 10, 0.18);
    this.shotsFired++;
    this.sound.playMissile();
    this.emitHudSnapshot();
  }

  private releaseMissileSalvo(): void {
    this.paintingMultiLock = false;
    if (this.paintedLockIds.length > 1) {
      const count = Math.min(this.missilesReady, this.paintedLockIds.length);
      for (let i = 0; i < count; i++) {
        this.fireHomingMissile(this.paintedLockIds[i], false, (i - (count - 1) / 2) * 2.5);
      }
    } else {
      this.fireHomingMissile(this.paintedLockIds[0] ?? this.primaryLockId);
    }
    this.paintedLockIds = [];
  }

  private damageEnemy(enemy: EnemyEntity, amount: number): void {
    if (!enemy.alive || enemy.invulnerable) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.07;
    this.shotsHit++;
    this.sound.playHitmarker(this.combo);

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private triggerFlash(x: number, y: number, z: number, hexColor: number, intensity: number): void {
    this.flashLight.position.set(x, y, z);
    this.flashLight.color.setHex(hexColor);
    this.flashIntensity = Math.max(this.flashIntensity, intensity);
    this.flashLight.intensity = this.flashIntensity;
  }

  private killEnemy(enemy: EnemyEntity): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.dying = true;
    const isGroundWreck =
      enemy.kind === 'battle_tank' ||
      enemy.kind === 'mlrs_launcher' ||
      enemy.kind === 'aa_bunker' ||
      enemy.kind === 'fuel_tank' ||
      enemy.kind === 'convoy_truck';
    enemy.dyingTimer = enemy.kind === 'bandit' ? 0.95 : enemy.kind === 'gunboat' ? 1.25 : isGroundWreck ? 6.5 : 0.4;

    this.combo++;
    this.comboTimer = 4.5;
    const pts = calculateKillScore(enemy.points, this.combo, this.difficulty);
    this.score += pts;
    this.ultCharge = Math.min(100, this.ultCharge + (enemy.kind.startsWith('boss') ? 26 : 16));

    if (enemy.kind === 'bandit') this.banditsSplashed++;
    if (enemy.isPrimaryObjective) this.targetsDestroyed++;

    this.hitstopTimer = enemy.kind.startsWith('boss') || enemy.kind === 'bridge_span' ? 0.065 : 0.038;
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.42);
    this.sound.playExplosion(true);
    this.triggerFlash(enemy.x, enemy.y + 4, enemy.z, 0xff7b00, 14);
    this.spawnBurst(enemy.x, enemy.y, enemy.z, 26, 0xff7b00, 34);
    this.spawnBurst(enemy.x, enemy.y + 2, enemy.z, 14, 0xfef08a, 20);
    this.spawnShockwave(
      enemy.x,
      Math.max(WATER_LEVEL + 1.2, enemy.y),
      enemy.z,
      enemy.kind.startsWith('boss') || enemy.kind === 'bridge_span' ? 32 : 18,
      enemy.kind === 'fuel_tank' ? 0xf97316 : 0xfbbf24,
      0.55,
    );

    // Emit live tactical killfeed event
    const targetName = this.formatKillfeedTarget(enemy.kind);
    const feedAccent: KillfeedAccent =
      enemy.kind.startsWith('boss')
        ? 'phase'
        : enemy.kind === 'bridge_span' || enemy.kind === 'radar_dome'
          ? 'objective'
          : 'kill';
    this.pushKillfeed(`Target Destroyed: ${targetName}`, feedAccent, `+${pts}`);
    if (this.combo >= 2) {
      const baseOnly = calculateKillScore(enemy.points, 0, this.difficulty);
      const bonusPts = Math.max(50, pts - baseOnly);
      this.pushKillfeed(`Ace Rank Bonus: x${this.combo}`, 'bonus', `+${bonusPts}`);
    }

    let calloutText = `${enemy.label} +${pts}`;
    if (enemy.kind === 'bridge_span') {
      const span = this.world.bridgeSpans.find((s) => s.id === enemy.id);
      if (span) span.collapsed = true;
      calloutText = `BRIDGE COLLAPSED! +${pts}`;
      this.world.triggerWaterRipple(enemy.x, enemy.z);
    } else if (enemy.kind === 'fuel_tank') {
      calloutText = `FUEL BLAST! +${pts}`;
      // Chain detonation!
      const fuelTanks = this.enemies
        .filter((e) => e.kind === 'fuel_tank')
        .map((e) => ({ id: e.id, x: e.x, z: e.z, alive: e.alive }));
      const chainIds = getChainDetonationTargets(enemy.id, fuelTanks, 64);
      if (chainIds.length > 0) {
        this.pushKillfeed('Chain Detonation: Fuel Depot', 'objective');
      }
      for (const cid of chainIds) {
        const victim = this.enemies.find((e) => e.id === cid && e.alive);
        if (victim) {
          window.setTimeout(() => {
            if (this.gameState === 'playing' && victim.alive) {
              this.damageEnemy(victim, 999);
            }
          }, 190 + Math.random() * 140);
        }
      }
    } else if (enemy.kind === 'boss_turret' || enemy.kind === 'boss_pylon' || enemy.kind === 'boss_core') {
      this.updateBossPhases();
    }

    this.addCallout(calloutText, enemy.x, enemy.y + 8, enemy.z, '#fde047');

    if (Math.random() < 0.45 || enemy.kind.startsWith('boss')) {
      this.postRadio(this.pilot.callsign, this.pilot.quips.kill, false);
    }

    // Check mission completion
    const status = evaluateMissionState({
      hull: this.hull,
      targetsDestroyed: this.targetsDestroyed,
      targetsTotal: this.targetsTotal,
      mode: this.mode,
    });
    if (status === 'victory') {
      this.finishRun(true);
    }
    this.emitHudSnapshot();
  }

  private updateBossPhases(): void {
    if (!this.bossRig) return;
    const turretsAlive = this.enemies.some((e) => e.kind === 'boss_turret' && e.alive);
    const pylonsAlive = this.enemies.some((e) => e.kind === 'boss_pylon' && e.alive);

    if (!turretsAlive && this.bossPhase === 1) {
      this.bossPhase = 2;
      for (const e of this.enemies) {
        if (e.kind === 'boss_pylon') e.invulnerable = false;
      }
      this.postRadio(
        this.pilot.callsign,
        'Phase 2! Dreadnought deck turrets destroyed—strike the glowing Shield Pylons!',
        true,
      );
      this.pushKillfeed('Boss Phase Break: Shield Pylons', 'phase');
      this.addCallout('PHASE 2: SHIELD PYLONS', 0, 26, -150, '#38bdf8');
    } else if (!turretsAlive && !pylonsAlive && this.bossPhase === 2) {
      this.bossPhase = 3;
      this.bossRig.shieldDome.visible = false;
      const core = this.enemies.find((e) => e.kind === 'boss_core');
      if (core) core.invulnerable = false;
      this.postRadio(
        this.pilot.callsign,
        'Phase 3! Dreadnought shield collapsed—finish the exposed Core Reactor!',
        true,
      );
      this.pushKillfeed('Boss Shield Down: Core Exposed', 'phase');
      this.addCallout('SHIELD DOWN: STRIKE CORE!', 0, 28, -150, '#f97316');
    }
  }

  private damagePlayer(amount: number, fromX: number, fromZ: number): void {
    if (this.gameState !== 'playing' || this.pendingDefeat) return;
    // Barrel roll i-frames or Aegis dome blocks damage!
    if (this.flight.barrelRollTimer > 0.1 || this.aegisActiveSec > 0) {
      this.addCallout(this.aegisActiveSec > 0 ? 'AEGIS BLOCKED' : 'EVADED', this.flight.x, this.flight.y + 4, this.flight.z, '#34d399');
      return;
    }

    const mult = DIFFICULTY_TUNING[this.difficulty].enemyDamageMult * (this.overdriveActiveSec > 0 ? 0.5 : 1);
    const dmg = Math.max(2, Math.round(amount * mult));
    this.hull = Math.max(0, this.hull - dmg);
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.55);
    this.sound.playDamage();

    // Directional damage indicator angle relative to player facing
    const dx = fromX - this.flight.x;
    const dz = fromZ - this.flight.z;
    const worldAngle = Math.atan2(dx, -dz);
    this.damageArcAngle = normalizeAngle(worldAngle + this.flight.yaw);
    this.damageArcTimer = 0.75;

    this.postRadio(this.pilot.callsign, this.pilot.quips.hurt, true);

    if (this.hull <= 0) {
      this.pendingDefeat = true;
      this.defeatDelayTimer = 0.55;
      this.sound.playExplosion(true);
      this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 32, 0xef4444, 30);
    }
    this.emitHudSnapshot();
  }

  private finishRun(victory: boolean): void {
    this.clearInputs();
    this.sound.setFlightActive(false);
    if (victory) {
      this.sound.playVictory();
      this.postRadio(this.pilot.callsign, this.pilot.quips.victory, false);
    }

    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_SCORE_KEY) || '0') || 0;
      if (this.score > best) {
        best = this.score;
        localStorage.setItem(BEST_SCORE_KEY, String(best));
      }
    } catch {
      best = Math.max(best, this.score);
    }

    const accuracyPct = this.shotsFired > 0 ? Math.min(100, Math.round((this.shotsHit / this.shotsFired) * 100)) : 0;
    const hullPct = Math.round((this.hull / Math.max(1, this.maxHull)) * 100);
    const mission = MISSIONS[this.missionIndex];

    const summary: RunSummary = {
      victory,
      missionCode: this.mode === 'campaign' ? mission.code : this.mode.toUpperCase(),
      missionTitle: this.mode === 'campaign' ? mission.title : this.mode === 'endless' ? `WAVE ${this.wave}` : 'FREE FLIGHT',
      pilotId: this.pilot.id,
      score: this.score,
      bestScore: best,
      rank: computeRunRank(victory, hullPct, this.elapsedSec, accuracyPct),
      elapsedSec: Math.round(this.elapsedSec),
      targetsDestroyed: this.targetsDestroyed,
      targetsTotal: this.targetsTotal,
      banditsSplashed: this.banditsSplashed,
      accuracyPct,
      hullRemainingPct: hullPct,
      mode: this.mode,
      missionIndex: this.missionIndex,
    };

    this.setGameState('gameover');
    this.callbacks.onRunEnd(summary);
  }

  private spawnBurst(x: number, y: number, z: number, count: number, hexColor: number, speed: number, sizeScale = 1.0): void {
    _color.setHex(hexColor);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.35) * Math.PI;
      const spd = speed * (0.35 + Math.random() * 0.75);
      p.vx = Math.cos(theta) * Math.cos(phi) * spd;
      p.vy = Math.sin(phi) * spd + 5;
      p.vz = Math.sin(theta) * Math.cos(phi) * spd;
      p.age = 0;
      p.maxAge = 0.38 + Math.random() * 0.55;
      p.size = (1.0 + Math.random() * 1.9) * sizeScale;
      p.r = _color.r;
      p.g = _color.g;
      p.b = _color.b;
      p.isSmoke = false;
    }
  }

  private spawnSmokePuff(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    hexColor: number,
    size: number,
    maxAge: number,
    isSmoke = true,
  ): void {
    _color.setHex(hexColor);
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.maxAge = maxAge;
    p.size = size;
    p.r = _color.r;
    p.g = _color.g;
    p.b = _color.b;
    p.isSmoke = isSmoke;
    p.isExhaust = false;
  }

  private spawnExhaustWake(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    intensity: number,
  ): void {
    // High-energy blue-cyan / white-hot supersonic Mach plasma mote streaming down the wake
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    const isBlueCore = Math.random() < 0.78;
    _color.setHex(isBlueCore ? (Math.random() < 0.55 ? 0xbae6fd : 0x38bdf8) : 0xfbbf24);
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx * (1.0 + Math.random() * 0.22) + (Math.random() - 0.5) * 2.2;
    p.vy = vy * (1.0 + Math.random() * 0.22) + (Math.random() - 0.5) * 2.2;
    p.vz = vz * (1.0 + Math.random() * 0.22) + (Math.random() - 0.5) * 2.2;
    p.age = 0;
    p.maxAge = 0.09 + Math.random() * 0.08;
    p.size = (0.14 + Math.random() * 0.14) * (0.55 + 0.65 * intensity);
    p.r = _color.r;
    p.g = _color.g;
    p.b = _color.b;
    p.isSmoke = false;
    p.isExhaust = true;
  }

  private spawnShockwave(
    x: number,
    y: number,
    z: number,
    maxRadius: number,
    hexColor: number,
    duration = 0.5,
  ): void {
    let slot = this.shockwaves.find((s) => !s.active);
    if (!slot) slot = this.shockwaves[0];
    slot.active = true;
    slot.age = 0;
    slot.maxAge = duration;
    slot.maxRadius = maxRadius;
    slot.mat.color.setHex(hexColor);
    slot.mat.opacity = 0.88;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(1.2);
    slot.mesh.visible = true;
  }

  private addCallout(text: string, x: number, y: number, z: number, color: string): void {
    this.callouts.push({ text, worldX: x, worldY: y, worldZ: z, color, age: 0, maxAge: 1.55 });
    if (this.callouts.length > 8) this.callouts.shift();
  }

  // =========================================================================
  // MAIN SIMULATION & RENDER LOOP (with Software-WebGL afterDraw pacing)
  // =========================================================================
  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.stepScene(dt);
    this.renderer.render(this.scene, this.camera);
    this.renderHudCanvas();

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private stepScene(dt: number): void {
    // Ocean, clouds, lighthouse, searchlights always animate softly
    this.world.oceanMat.uniforms.uTime.value += dt;
    this.world.oceanMat.uniforms.uRippleAge.value = Math.min(
      10,
      this.world.oceanMat.uniforms.uRippleAge.value + dt,
    );
    this.world.cloudsGroup.rotation.y += dt * 0.0022;
    this.world.lighthouseBeacon.rotation.y += dt * 1.1;

    this.world.searchlights.forEach((sl, idx) => {
      if (sl.visible) {
        sl.rotation.y = Math.sin(this.elapsedSec * 0.7 + idx * 2.1) * 1.1;
      }
    });

    if (this.gameState === 'title') {
      // Live World Camera Tour sweeping over the archipelago, red truss bridge, and harbour!
      this.tourAngle += dt * 0.14;
      const camX = Math.sin(this.tourAngle) * 185;
      const camZ = 95 + Math.cos(this.tourAngle) * 115;
      const camY = 58 + Math.sin(this.tourAngle * 1.7) * 10;
      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(0, 14, -28);

      // Gentle idle animation on player aircraft cruising near carrier
      this.playerRig.root.position.set(Math.sin(this.tourAngle * 2) * 18, 34, 105);
      this.playerRig.root.rotation.set(0, Math.cos(this.tourAngle * 2) * 0.2, -Math.cos(this.tourAngle * 2) * 0.25);
      this.playerRig.mainRotor.rotation.y += dt * 22;
      this.playerRig.tailRotor.rotation.x += dt * 30;
      this.afterburnerTimeSec += dt;
      this.playerRig.afterburnerUniforms.uTime.value = this.afterburnerTimeSec;
      this.playerRig.afterburnerUniforms.uBoost.value = 0.28;
      this.playerRig.afterburnerLight.intensity = 3.2;
      return;
    }

    if (this.gameState === 'paused' || this.gameState === 'gameover') {
      return;
    }

    // Active Gameplay!
    if (this.pendingDefeat) {
      this.defeatDelayTimer -= dt;
      this.stepParticles(dt);
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.4);
      if (this.defeatDelayTimer <= 0) {
        this.pendingDefeat = false;
        this.finishRun(false);
      }
      return;
    }

    // Hitstop pauses simulation physics briefly while shake & hit flashes continue
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.5);
      return;
    }

    this.elapsedSec += dt;
    ROCKET_PLUME_UNIFORMS.uTime.value = this.elapsedSec;
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.8);
    if (this.collisionInvulnTimer > 0) this.collisionInvulnTimer = Math.max(0, this.collisionInvulnTimer - dt);
    if (this.damageArcTimer > 0) this.damageArcTimer = Math.max(0, this.damageArcTimer - dt);
    if (this.radioTimer > 0) this.radioTimer = Math.max(0, this.radioTimer - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.killfeed.length > 0) {
      const prevLen = this.killfeed.length;
      this.killfeed = stepKillfeedEntries(this.killfeed, dt);
      if (this.killfeed.length !== prevLen) {
        this.emitHudSnapshot();
      }
    }

    // Timers & cooldowns
    if (this.vulcanCooldown > 0) this.vulcanCooldown = Math.max(0, this.vulcanCooldown - dt);
    if (this.ultActiveSec > 0) this.ultActiveSec = Math.max(0, this.ultActiveSec - dt);
    if (this.overdriveActiveSec > 0) this.overdriveActiveSec = Math.max(0, this.overdriveActiveSec - dt);
    if (this.aegisActiveSec > 0) {
      this.aegisActiveSec = Math.max(0, this.aegisActiveSec - dt);
      (this.playerRig.aegisShield.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
      if (this.aegisActiveSec <= 0) this.playerRig.aegisShield.visible = false;
    }

    if (this.missilesReady < this.maxMissiles) {
      this.missileReloadTimer += dt;
      if (this.missileReloadTimer >= 2.2) {
        this.missileReloadTimer = 0;
        this.missilesReady++;
      }
    }
    if (this.bombsReady < this.maxBombs) {
      this.bombReloadTimer += dt;
      if (this.bombReloadTimer >= 3.2) {
        this.bombReloadTimer = 0;
        this.bombsReady++;
      }
    }
    if (this.flaresReady < this.maxFlares) {
      this.flareReloadTimer += dt;
      if (this.flareReloadTimer >= 5.0) {
        this.flareReloadTimer = 0;
        this.flaresReady++;
      }
    }

    // Passive slight ult trickle in combat
    this.ultCharge = Math.min(100, this.ultCharge + dt * 1.8);

    // Gather unified input (keyboard + touch + gamepad) with brief control stagger after hard impacts
    const rawInput = this.sampleFlightInput();
    if (this.controlStaggerTimer > 0) {
      this.controlStaggerTimer = Math.max(0, this.controlStaggerTimer - dt);
    }
    const authority = this.controlStaggerTimer > 0 ? 0.32 : 1.0;
    const input = {
      turn: rawInput.turn * authority,
      pitch: rawInput.pitch * authority,
      throttle: rawInput.throttle,
      boost: rawInput.boost && this.controlStaggerTimer <= 0,
      driftOrStrafe: rawInput.driftOrStrafe,
    };

    this.flight = stepAircraftFlight(
      this.flight,
      input,
      {
        airframe: this.airframe,
        thrustStat: this.pilot.stats.thrust,
        overdriveActive: this.overdriveActiveSec > 0,
      },
      dt,
    );

    // Integrate damped rigid-body collision recoil impulse & rotational tumble torque
    if (Math.abs(this.impactVx) > 0.05 || Math.abs(this.impactVy) > 0.05 || Math.abs(this.impactVz) > 0.05) {
      this.flight.x += this.impactVx * dt;
      this.flight.y += this.impactVy * dt;
      this.flight.z += this.impactVz * dt;
      const linDrag = Math.exp(-4.2 * dt);
      this.impactVx *= linDrag;
      this.impactVy *= linDrag;
      this.impactVz *= linDrag;
    }
    if (Math.abs(this.spinRollVel) > 0.02 || Math.abs(this.spinPitchVel) > 0.02 || Math.abs(this.spinYawVel) > 0.02) {
      this.flight.roll = Math.max(-1.65, Math.min(1.65, this.flight.roll + this.spinRollVel * dt));
      this.flight.pitch = Math.max(-0.72, Math.min(0.72, this.flight.pitch + this.spinPitchVel * dt));
      this.flight.yaw = normalizeAngle(this.flight.yaw + this.spinYawVel * dt);
      const angDamp = Math.exp(-5.0 * dt);
      this.spinRollVel *= angDamp;
      this.spinPitchVel *= angDamp;
      this.spinYawVel *= angDamp;
    }

    // Resolve real rigid-body 3D world collisions (split bridge deck/truss/girders, piers, carrier, towers, terrain slam)
    this.resolvePlayerWorldCollisions();

    // Sync player 3D rig
    this.playerRig.root.position.set(this.flight.x, this.flight.y, this.flight.z);
    this.playerRig.root.rotation.order = 'YXZ';
    this.playerRig.root.rotation.set(this.flight.pitch, this.flight.yaw, this.flight.roll);

    // Decay dynamic muzzle/explosion PointLight smoothly
    if (this.flashIntensity > 0.01) {
      this.flashIntensity *= Math.exp(-18 * dt);
      this.flashLight.intensity = this.flashIntensity;
    }

    if (this.airframe === 'gunship') {
      this.playerRig.mainRotor.rotation.y += dt * 28;
      this.playerRig.tailRotor.rotation.x += dt * 36;
      this.playerRig.machCone.visible = false;
      this.playerRig.afterburnerLight.intensity = 0;
    } else {
      const boostingNow = input.boost || this.overdriveActiveSec > 0;
      const ab = computeAfterburnerTelemetry({
        boosting: input.boost,
        overdriveActive: this.overdriveActiveSec > 0,
        speed: this.flight.speed,
        boostRemaining: this.flight.boost,
        prevIntensity: this.afterburnerIntensity,
        timeSec: this.elapsedSec,
        dt,
      });
      this.afterburnerIntensity = ab.intensity;
      this.playerRig.afterburnerUniforms.uTime.value = this.elapsedSec;
      this.playerRig.afterburnerUniforms.uBoost.value = ab.intensity;

      for (const plume of this.playerRig.afterburners) {
        plume.scale.set(ab.plumeRadiusScale, ab.plumeRadiusScale, ab.plumeLengthScale);
      }
      for (const shroud of this.playerRig.heatShrouds) {
        shroud.visible = ab.heatStrength > 0.05;
        shroud.scale.set(
          0.86 + ab.intensity * 0.42,
          0.86 + ab.intensity * 0.42,
          0.65 + ab.intensity * 0.95,
        );
      }

      // Dynamic afterburner light spill across vertical tail fins, stabilators & aft fuselage
      this.playerRig.afterburnerLight.intensity = ab.lightIntensity * 1.35;
      this.playerRig.afterburnerLight.color.setRGB(ab.lightR, ab.lightG, ab.lightB);
      this.playerRig.coreDiscMat.color.setRGB(
        0.92 - ab.intensity * 0.14,
        0.93 + ab.intensity * 0.05,
        1.0,
      );
      this.playerRig.ringGlowMat.color.setRGB(
        1.0,
        0.58 + ab.intensity * 0.24,
        0.22 + ab.intensity * 0.36,
      );

      // Emit twin-nozzle blue-core Mach plasma sparks
      this.afterburnerWakeAccum += dt;
      const wakeInterval = boostingNow ? 0.018 : 0.055;
      if (this.afterburnerWakeAccum >= wakeInterval) {
        this.afterburnerWakeAccum = 0;
        this.playerRig.root.updateMatrixWorld();
        const fwd = this.getPlayerForward(_v1);
        const exhaustSpeed = 38 + ab.intensity * 54;
        for (const sx of [-0.82, 0.82]) {
          _v2.set(sx, -0.05, 6.45).applyMatrix4(this.playerRig.root.matrixWorld);
          this.spawnExhaustWake(
            _v2.x,
            _v2.y,
            _v2.z,
            -fwd.x * exhaustSpeed,
            -fwd.y * exhaustSpeed,
            -fwd.z * exhaustSpeed,
            ab.intensity,
          );
        }
      }

      // Prandtl-Glauert supersonic Mach vapor cone around aft wings at high speed
      const machMat = this.playerRig.machCone.material as THREE.ShaderMaterial;
      const machTargetOpacity = boostingNow || this.flight.speed > 78 ? 0.16 : 0.0;
      const curOp = machMat.uniforms.uOpacity.value as number;
      const nextOp = curOp + (machTargetOpacity - curOp) * (1 - Math.exp(-8 * dt));
      machMat.uniforms.uOpacity.value = nextOp;
      this.playerRig.machCone.visible = nextOp > 0.015;
      if (this.playerRig.machCone.visible) {
        const pulse = 0.96 + Math.random() * 0.08;
        this.playerRig.machCone.scale.set(pulse, pulse, 0.94 + Math.random() * 0.14);
      }

      // Crisp high-G wingtip vapor vortex trails during hard banks or afterburner boost
      this.wingtipTrailAccum += dt;
      if ((Math.abs(this.flight.roll) > 0.34 || boostingNow) && this.wingtipTrailAccum >= 0.032) {
        this.wingtipTrailAccum = 0;
        const rx = Math.cos(this.flight.yaw) * Math.cos(this.flight.roll);
        const ry = Math.sin(this.flight.roll);
        const rz = -Math.sin(this.flight.yaw) * Math.cos(this.flight.roll);
        const span = 7.15;
        for (const side of [-1, 1]) {
          this.spawnSmokePuff(
            this.flight.x + rx * span * side,
            this.flight.y + ry * span * side,
            this.flight.z + rz * span * side,
            0,
            0.35,
            0,
            0xe2e8f0,
            0.22,
            0.42,
            true,
          );
        }
      }
    }

    // Realistic low-altitude jet/rotor downwash sea spray or desert dust kickup (< 15m AGL)
    this.groundEffectAccum += dt;
    const terrainFloor = Math.max(WATER_LEVEL, getTerrainHeight(this.flight.x, this.flight.z));
    if (this.flight.y - terrainFloor < 15 && this.groundEffectAccum >= 0.065) {
      this.groundEffectAccum = 0;
      const overWater = terrainFloor <= WATER_LEVEL + 0.15;
      for (const side of [-1, 1]) {
        this.spawnSmokePuff(
          this.flight.x + side * (2.5 + Math.random() * 2.5),
          terrainFloor + 0.55,
          this.flight.z + (Math.random() - 0.5) * 4,
          side * (4 + Math.random() * 4),
          3.2 + Math.random() * 2.4,
          0,
          overWater ? 0xe0f2fe : 0xb8a37e,
          overWater ? 0.72 : 0.85,
          0.48,
          true,
        );
      }
    }

    // Update engine synth sound
    this.sound.updateEngine(this.flight.speed / 65, input.boost || this.overdriveActiveSec > 0, this.airframe);

    // Continuous Vulcan fire
    if (this.mouseLeft || this.keys.has('Space') || this.touchFiring) {
      this.fireVulcan();
    }

    // Target lock-on & Macross multi-lock painting
    this.updateTargeting(dt);

    // Step wingmen, enemies, bridge collapse, projectiles, shockwaves, particles
    this.stepWingmen(dt);
    this.stepEnemies(dt);
    this.stepBridgeCollapse(dt);
    this.stepProjectiles(dt);
    this.stepShockwaves(dt);
    this.stepParticles(dt);
    this.stepCallouts(dt);

    // Endless mode wave escalation
    if (this.mode === 'endless') {
      const aliveHostiles = this.enemies.filter((e) => e.alive).length;
      if (aliveHostiles === 0) {
        this.endlessSpawnTimer += dt;
        if (this.endlessSpawnTimer >= 2.0) {
          this.endlessSpawnTimer = 0;
          this.wave++;
          this.spawnEndlessWave(this.wave, DIFFICULTY_TUNING[this.difficulty].enemyHpMult);
        }
      }
    }

    // Update damped camera
    this.updateCamera(dt, input.boost || this.overdriveActiveSec > 0);

    // Throttle React HUD updates (~10Hz)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private resolvePlayerWorldCollisions(): void {
    const aircraftRadius = this.airframe === 'jet' ? 4.4 : 4.9;
    let collided = false;
    let hitLabel = 'Structure';
    let hitBridgeSpanId: string | null = null;
    let sumNx = 0;
    let sumNy = 0;
    let sumNz = 0;
    let totalPushX = 0;
    let totalPushZ = 0;

    // 1. Static world obstacles (West Harbour towers, cranes, Bridge concrete piers, Allied Carrier deck/island)
    for (const obs of this.world.obstacles) {
      const res = resolveSphereAABBCollision(this.flight.x, this.flight.y, this.flight.z, aircraftRadius, obs);
      if (res.hit) {
        this.flight.x += res.pushX;
        this.flight.y += res.pushY;
        this.flight.z += res.pushZ;
        sumNx += res.nx;
        sumNy += res.ny;
        sumNz += res.nz;
        totalPushX += res.pushX;
        totalPushZ += res.pushZ;
        hitLabel =
          obs.kind === 'building'
            ? 'Harbour Tower'
            : obs.kind === 'crane'
              ? 'Harbour Crane'
              : obs.kind === 'carrier'
                ? 'Carrier Superstructure'
                : obs.kind === 'bridge_pier'
                  ? 'Bridge Pier'
                  : 'Bridge Truss';
        collided = true;
      }
    }

    // 2. Realistic Split Red Truss Bridge Colliders per intact span:
    //    - Roadway Deck Slab (allows flying UNDER the bridge cleanly between piers!)
    //    - Overhead Steel Truss Roof Beams (allows threading through the bridge tunnel if skillful!)
    //    - North & South Side Steel Girders (clipping side steel induces real wing-strike roll spin!)
    for (const span of this.world.bridgeSpans) {
      if (span.collapsed) continue;
      const halfSpan = 28.5;
      const parts: { label: string; box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } }[] = [
        {
          label: 'Bridge Deck',
          box: {
            minX: span.x - halfSpan,
            maxX: span.x + halfSpan,
            minY: BRIDGE_DECK_Y - 1.4,
            maxY: BRIDGE_DECK_Y + 0.9,
            minZ: BRIDGE_Z - 6.4,
            maxZ: BRIDGE_Z + 6.4,
          },
        },
        {
          label: 'Bridge Overhead Truss',
          box: {
            minX: span.x - halfSpan,
            maxX: span.x + halfSpan,
            minY: BRIDGE_DECK_Y + 8.4,
            maxY: BRIDGE_DECK_Y + 10.4,
            minZ: BRIDGE_Z - 6.4,
            maxZ: BRIDGE_Z + 6.4,
          },
        },
        {
          label: 'Bridge Steel Girder',
          box: {
            minX: span.x - halfSpan,
            maxX: span.x + halfSpan,
            minY: BRIDGE_DECK_Y + 0.6,
            maxY: BRIDGE_DECK_Y + 9.4,
            minZ: BRIDGE_Z - 6.8,
            maxZ: BRIDGE_Z - 5.1,
          },
        },
        {
          label: 'Bridge Steel Girder',
          box: {
            minX: span.x - halfSpan,
            maxX: span.x + halfSpan,
            minY: BRIDGE_DECK_Y + 0.6,
            maxY: BRIDGE_DECK_Y + 9.4,
            minZ: BRIDGE_Z + 5.1,
            maxZ: BRIDGE_Z + 6.8,
          },
        },
      ];

      for (const part of parts) {
        const res = resolveSphereAABBCollision(this.flight.x, this.flight.y, this.flight.z, aircraftRadius, part.box);
        if (res.hit) {
          this.flight.x += res.pushX;
          this.flight.y += res.pushY;
          this.flight.z += res.pushZ;
          sumNx += res.nx;
          sumNy += res.ny;
          sumNz += res.nz;
          totalPushX += res.pushX;
          totalPushZ += res.pushZ;
          hitLabel = part.label;
          hitBridgeSpanId = span.id;
          collided = true;
        }
      }
    }

    // 3. High-speed Terrain / Ocean Surface Slam Check
    const groundY = Math.max(WATER_LEVEL, getTerrainHeight(this.flight.x, this.flight.z));
    if (!collided && this.flight.y <= groundY + 6.0 && this.flight.pitch < -0.22 && this.collisionInvulnTimer <= 0) {
      collided = true;
      sumNx = 0;
      sumNy = 1;
      sumNz = 0;
      hitLabel = groundY <= WATER_LEVEL + 0.15 ? 'Ocean Surface' : 'Coastal Terrain';
      if (groundY <= WATER_LEVEL + 0.15) {
        this.world.triggerWaterRipple(this.flight.x, this.flight.z);
        this.spawnBurst(this.flight.x, 1.2, this.flight.z, 22, 0xe0f2fe, 28, 0.75);
      }
    }

    if (collided) {
      const fwd = this.getPlayerForward(_v1);
      const vx = fwd.x * this.flight.speed + this.impactVx;
      const vy = fwd.y * this.flight.speed + this.impactVy;
      const vz = fwd.z * this.flight.speed + this.impactVz;

      const impact = computeAircraftImpactPhysics({
        vx,
        vy,
        vz,
        yaw: this.flight.yaw,
        pitch: this.flight.pitch,
        nx: sumNx,
        ny: sumNy,
        nz: sumNz,
        airframe: this.airframe,
      });

      this.flight.speed = impact.newSpeed;
      this.flight.yaw = impact.newYaw;
      this.flight.pitch = impact.newPitch;
      this.impactVx = impact.impulseVx;
      this.impactVy = impact.impulseVy;
      this.impactVz = impact.impulseVz;
      this.spinRollVel = impact.spinRollVel;
      this.spinPitchVel = impact.spinPitchVel;
      this.spinYawVel = impact.spinYawVel;
      this.controlStaggerTimer = impact.severity === 'crash' ? 0.68 : impact.severity === 'bounce' ? 0.36 : 0.14;

      if (impact.severity === 'crash') {
        this.hitstopTimer = 0.055;
        this.shakeTrauma = 1.0;
        this.sound.playExplosion(true);
        this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 30, 0xff5a1f, 34, 0.9);
        this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 16, 0xfef08a, 24, 0.65);
        this.spawnShockwave(this.flight.x, this.flight.y, this.flight.z, 22, 0xff5a1f, 0.5);
      } else if (impact.severity === 'bounce') {
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.72);
        this.sound.playExplosion(false);
        this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 18, 0xfbbf24, 24, 0.65);
        this.spawnShockwave(this.flight.x, this.flight.y, this.flight.z, 13, 0xf97316, 0.38);
      } else {
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.4);
        this.spawnBurst(this.flight.x, this.flight.y, this.flight.z, 10, 0xfef08a, 18, 0.45);
      }

      // Deal kinetic ram damage to destructible bridge spans on hard hits!
      if (hitBridgeSpanId && impact.closingSpeed > 26) {
        const spanEnemy = this.enemies.find((e) => e.id === hitBridgeSpanId && e.alive);
        if (spanEnemy) {
          this.damageEnemy(spanEnemy, Math.round(impact.closingSpeed * 1.15));
        }
      }

      if (this.collisionInvulnTimer <= 0) {
        this.collisionInvulnTimer = impact.severity === 'crash' ? 0.85 : 0.55;
        this.damagePlayer(impact.damage, this.flight.x - totalPushX, this.flight.z - totalPushZ);
        const prefix =
          impact.severity === 'crash'
            ? 'Critical Crash'
            : impact.severity === 'bounce'
              ? 'Hard Impact'
              : 'Hull Scrape';
        this.pushKillfeed(`${prefix}: ${hitLabel} (-${impact.damage} HP)`, 'warning', undefined, 4.2);
      }
    }

    // 4. Mid-air dogfight collision against enemy Bandit jets
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'bandit') continue;
      const dx = this.flight.x - e.x;
      const dy = this.flight.y - e.y;
      const dz = this.flight.z - e.z;
      const dist = Math.hypot(dx, dy, dz);
      const minSep = aircraftRadius + 5.8;
      if (dist < minSep && dist > 0.01) {
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const sep = (minSep - dist) * 0.65;
        this.flight.x += nx * sep;
        this.flight.y += ny * sep;
        this.flight.z += nz * sep;
        e.x -= nx * sep;
        e.y -= ny * sep;
        e.z -= nz * sep;
        this.impactVx += nx * 24;
        this.impactVy += ny * 16;
        this.impactVz += nz * 24;
        this.spinRollVel += 4.2;
        this.spawnBurst((this.flight.x + e.x) * 0.5, (this.flight.y + e.y) * 0.5, (this.flight.z + e.z) * 0.5, 18, 0xffa629, 26, 0.75);
        if (this.collisionInvulnTimer <= 0) {
          this.collisionInvulnTimer = 0.65;
          this.damageEnemy(e, 65);
          this.damagePlayer(20, e.x, e.z);
          this.pushKillfeed('Mid-Air Collision: Bandit Jet', 'warning', undefined, 3.8);
        }
      }
    }
  }

  private sampleFlightInput(): {
    turn: number;
    pitch: number;
    throttle: number;
    boost: boolean;
    driftOrStrafe: boolean;
  } {
    let turn = this.touchMoveX;
    let pitch = this.touchMoveY;
    let throttle = 0;
    let boost = this.touchBoosting;
    let driftOrStrafe = false;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) turn -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) turn += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pitch += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pitch -= 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) boost = true;
    if (this.keys.has('KeyZ') || this.keys.has('ControlLeft')) driftOrStrafe = true;
    if (this.keys.has('KeyG')) throttle -= 1;

    // Optional Gamepad polling
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads?.[0];
    if (pad) {
      if (Math.abs(pad.axes[0]) > 0.18) turn += pad.axes[0];
      if (Math.abs(pad.axes[1]) > 0.18) pitch -= pad.axes[1];
      if (pad.buttons[0]?.pressed || pad.buttons[7]?.pressed) this.fireVulcan();
      if (pad.buttons[1]?.pressed) boost = true;
    }

    return {
      turn: Math.max(-1, Math.min(1, turn)),
      pitch: Math.max(-1, Math.min(1, pitch)),
      throttle,
      boost,
      driftOrStrafe,
    };
  }

  private updateTargeting(dt: number): void {
    const fwd = this.getPlayerForward(_v1);
    const candidates = this.enemies
      .filter((e) => e.alive && !e.invulnerable)
      .map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        z: e.z,
        alive: e.alive,
        priority: e.isPrimaryObjective ? 2 : 0,
      }));

    const locks = selectLockTargets(this.flight, fwd, candidates, 860, 0.72, 4);
    const prevPrimary = this.primaryLockId;
    this.primaryLockId = locks[0] ?? null;
    if (this.primaryLockId && this.primaryLockId !== prevPrimary) {
      this.sound.playLockBeep();
    }

    if (this.paintingMultiLock) {
      this.paintTimer += dt;
      const desired = Math.min(this.missilesReady, Math.max(1, Math.floor(this.paintTimer / 0.18) + 1));
      const newLocks = locks.slice(0, desired);
      if (newLocks.length > this.paintedLockIds.length) {
        this.sound.playLockBeep();
      }
      this.paintedLockIds = newLocks;
    }
  }

  private stepWingmen(dt: number): void {
    if (this.wingmen.length === 0) return;
    this.wingmenTimer -= dt;
    if (this.wingmenTimer <= 0) {
      this.clearWingmen();
      return;
    }
    const rightX = Math.cos(this.flight.yaw);
    const rightZ = -Math.sin(this.flight.yaw);

    for (const w of this.wingmen) {
      const targetX = this.flight.x + rightX * w.side * 15;
      const targetY = this.flight.y + 2.5;
      const targetZ = this.flight.z + rightZ * w.side * 15 + 5;
      const k = 1 - Math.exp(-5.5 * dt);
      w.x += (targetX - w.x) * k;
      w.y += (targetY - w.y) * k;
      w.z += (targetZ - w.z) * k;
      w.yaw = this.flight.yaw;
      w.mesh.position.set(w.x, w.y, w.z);
      w.mesh.rotation.set(this.flight.pitch, w.yaw, this.flight.roll * 0.8);

      w.fireTimer -= dt;
      if (w.fireTimer <= 0) {
        w.fireTimer = 0.45;
        // Pick nearest enemy
        let best: EnemyEntity | null = null;
        let bestD = 320 * 320;
        for (const e of this.enemies) {
          if (!e.alive || e.invulnerable) continue;
          const d2 = (e.x - w.x) ** 2 + (e.y - w.y) ** 2 + (e.z - w.z) ** 2;
          if (d2 < bestD) {
            bestD = d2;
            best = e;
          }
        }
        if (best) {
          _v2.set(best.x - w.x, best.y - w.y, best.z - w.z).normalize();
          this.spawnProjectile({
            friendly: true,
            kind: 'vulcan',
            x: w.x,
            y: w.y,
            z: w.z,
            vx: _v2.x * 230,
            vy: _v2.y * 230,
            vz: _v2.z * 230,
            maxAge: 1.5,
            damage: 22,
            targetId: null,
            color: 0x06b6d4,
          });
        }
      }
    }
  }

  private stepEnemies(dt: number): void {
    const fireRateMult = DIFFICULTY_TUNING[this.difficulty].enemyFireRateMult;
    let activeAttackers = 0;

    for (const e of this.enemies) {
      if (e.dying) {
        e.dyingTimer -= dt;
        if (e.kind === 'bandit') {
          // Fiery spiral crash KO animation
          e.x += e.vx * dt * 0.7;
          e.y -= 28 * dt;
          e.z += e.vz * dt * 0.7;
          e.roll += dt * 9.5;
          e.pitch = -0.55;
          e.mesh.position.set(e.x, e.y, e.z);
          e.mesh.rotation.set(e.pitch, e.yaw, e.roll);
          if (Math.random() < 0.45) this.spawnBurst(e.x, e.y, e.z, 2, 0xff6b2b, 8);
        } else if (e.kind === 'gunboat') {
          // Capsize & sink KO animation
          e.mesh.position.y -= 4.5 * dt;
          e.mesh.rotation.z += dt * 1.1;
          e.mesh.rotation.x += dt * 0.35;
        } else if (
          e.kind === 'battle_tank' ||
          e.kind === 'mlrs_launcher' ||
          e.kind === 'aa_bunker' ||
          e.kind === 'fuel_tank' ||
          e.kind === 'convoy_truck'
        ) {
          // Ground warfare wreck: scorch-tilt and emit rising dark battle-smoke plume
          e.mesh.rotation.z = 0.14;
          e.mesh.rotation.x = -0.08;
          if (Math.random() < 0.28) {
            this.spawnSmokePuff(
              e.x + (Math.random() - 0.5) * 3,
              e.y + 1.5,
              e.z + (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 2.5,
              8.5 + Math.random() * 4.5,
              (Math.random() - 0.5) * 2.5,
              Math.random() < 0.25 ? 0x475569 : 0x1e293b,
              1.45,
              1.65,
              true,
            );
          }
        }
        if (e.dyingTimer <= 0) {
          e.dying = false;
          if (e.kind !== 'bridge_span') {
            e.mesh.visible = false;
          }
          if (e.kind === 'bandit') {
            this.spawnBurst(e.x, Math.max(2, e.y), e.z, 18, 0xff7b00, 24);
          }
        }
        continue;
      }

      if (!e.alive) continue;

      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.mesh.scale.setScalar(e.hitFlash > 0 ? 1.07 : 1.0);
      }

      if (e.kind === 'radar_dome' && e.dish) {
        e.dish.rotation.y += dt * 2.2;
      } else if (e.kind === 'convoy_truck') {
        e.x += e.vx * dt;
        if (e.x > 82) e.x = -82;
        e.mesh.position.set(e.x, BRIDGE_DECK_Y + 0.85, BRIDGE_Z);
      } else if (e.kind === 'gunboat') {
        e.patrolAngle += dt * 0.24;
        const nx = e.patrolCenterX + Math.cos(e.patrolAngle) * e.patrolRx;
        const nz = e.patrolCenterZ + Math.sin(e.patrolAngle) * e.patrolRz;
        const dx = nx - e.x;
        const dz = nz - e.z;
        e.vx = dx / dt;
        e.vz = dz / dt;
        e.x = nx;
        e.z = nz;
        e.yaw = Math.atan2(-dx, -dz);
        e.mesh.position.set(e.x, 0, e.z);
        e.mesh.rotation.y = e.yaw;

        e.fireCooldown -= dt * fireRateMult;
        const distToPlayer = Math.hypot(this.flight.x - e.x, this.flight.z - e.z);
        if (e.fireCooldown <= 0 && distToPlayer < 520 && activeAttackers < 5) {
          e.fireCooldown = 2.3 + Math.random() * 1.1;
          activeAttackers++;
          // Stealth Corvettes fire both 76mm deck cannon tracers and anti-air missiles
          if (Math.random() < 0.38) {
            this.fireEnemyProjectile(e, 'enemy_sam', 94, 15);
            this.spawnSmokePuff(e.x, e.y + 4, e.z, 0, 5, 0, 0xe2e8f0, 0.6, 0.45, true);
          } else {
            this.fireEnemyProjectile(e, 'enemy_bullet', 155, 9);
          }
        }
      } else if (e.kind === 'battle_tank') {
        // Patrol smoothly across wide rolling armored tank plains & track player with 120mm turret
        e.patrolAngle += dt * 0.14;
        const nx = e.patrolCenterX + Math.cos(e.patrolAngle) * e.patrolRx;
        const nz = e.patrolCenterZ + Math.sin(e.patrolAngle) * e.patrolRz;
        const dx = nx - e.x;
        const dz = nz - e.z;
        const gndY = Math.max(QUAY_HEIGHT, getTerrainHeight(nx, nz));
        e.vx = dx / dt;
        e.vz = dz / dt;
        e.x = nx;
        e.z = nz;
        e.y = gndY + 2.4;
        e.yaw = Math.atan2(-dx, -dz);
        e.mesh.position.set(e.x, gndY, e.z);
        e.mesh.rotation.y = e.yaw;

        // Rotate turret smoothly toward player aircraft
        if (e.turret) {
          const toPlayerYaw = Math.atan2(-(this.flight.x - e.x), -(this.flight.z - e.z));
          e.turret.rotation.y = normalizeAngle(toPlayerYaw - e.yaw);
        }

        // Kick up subtle tan armored tread dust
        if (Math.random() < 0.14) {
          this.spawnSmokePuff(e.x, gndY + 0.8, e.z, -e.vx * 0.2, 1.5, -e.vz * 0.2, 0xc2b280, 0.48, 0.55, true);
        }

        e.fireCooldown -= dt * fireRateMult;
        const distToPlayer = Math.hypot(this.flight.x - e.x, this.flight.z - e.z);
        if (e.fireCooldown <= 0 && distToPlayer < 560 && activeAttackers < 5) {
          e.fireCooldown = 2.1 + Math.random() * 1.1;
          activeAttackers++;
          // Fire fiery 120mm cannon tracer + muzzle blast
          this.fireEnemyProjectile(e, 'enemy_bullet', 180, 12);
          this.spawnBurst(e.x, gndY + 3.8, e.z, 5, 0xfbbf24, 14, 0.45);
        }
      } else if (e.kind === 'mlrs_launcher') {
        // Rotate 6-tube missile pod toward player & launch long-range smoke-trailed tactical missiles!
        if (e.turret) {
          const toPlayerYaw = Math.atan2(-(this.flight.x - e.x), -(this.flight.z - e.z));
          e.turret.rotation.y = normalizeAngle(toPlayerYaw - e.yaw);
        }
        e.fireCooldown -= dt * fireRateMult;
        const distToPlayer = Math.hypot(this.flight.x - e.x, this.flight.z - e.z);
        if (e.fireCooldown <= 0 && distToPlayer < 740 && activeAttackers < 5) {
          e.fireCooldown = 3.8 + Math.random() * 1.6;
          activeAttackers++;
          this.fireEnemyProjectile(e, 'enemy_sam', 98, 16);
          this.spawnSmokePuff(e.x, e.y + 3.0, e.z, 0, 6, 0, 0xe2e8f0, 0.72, 0.52, true);
          this.spawnBurst(e.x, e.y + 2.8, e.z, 6, 0xff7b00, 16, 0.48);
        }
      } else if (e.kind === 'aa_bunker' || (e.kind === 'boss_turret' && !e.invulnerable)) {
        e.fireCooldown -= dt * fireRateMult;
        const distToPlayer = Math.hypot(this.flight.x - e.x, this.flight.z - e.z);
        if (e.fireCooldown <= 0 && distToPlayer < 580 && activeAttackers < 5) {
          e.fireCooldown = e.kind === 'boss_turret' ? 3.0 : 3.8 + Math.random() * 1.4;
          activeAttackers++;
          this.fireEnemyProjectile(e, 'enemy_sam', 94, 16);
          this.spawnSmokePuff(e.x, e.y + 3.0, e.z, 0, 5, 0, 0xe2e8f0, 0.65, 0.46, true);
        }
      } else if (e.kind === 'bandit') {
        // 3-State Dogfight FSM: intercept -> attack -> break
        const dx = this.flight.x - e.x;
        const dy = this.flight.y - e.y;
        const dz = this.flight.z - e.z;
        const dist = Math.hypot(dx, dy, dz);

        e.aiTimer -= dt;
        if (e.aiState === 'intercept' && dist < 340) {
          e.aiState = 'attack';
          e.aiTimer = 3.4;
        } else if (e.aiState === 'attack' && (dist < 72 || e.aiTimer <= 0)) {
          e.aiState = 'break';
          e.aiTimer = 2.8;
        } else if (e.aiState === 'break' && e.aiTimer <= 0) {
          e.aiState = 'intercept';
          e.aiTimer = 4.2;
        }

        let desiredYaw = Math.atan2(-dx, -dz);
        let desiredY = Math.max(28, Math.min(165, this.flight.y + 10));
        if (e.aiState === 'break') {
          desiredYaw = normalizeAngle(desiredYaw + Math.PI * 0.72);
          desiredY = 92;
        }

        const yawDiff = normalizeAngle(desiredYaw - e.yaw);
        e.yaw = normalizeAngle(e.yaw + Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), dt * 1.55));
        e.roll += (-Math.sign(yawDiff) * 0.65 - e.roll) * (1 - Math.exp(-5 * dt));

        const spd = e.aiState === 'break' ? 66 : 56;
        e.vx = -Math.sin(e.yaw) * spd;
        e.vz = -Math.cos(e.yaw) * spd;
        e.vy = (desiredY - e.y) * 1.2;

        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.z += e.vz * dt;
        // Keep inside expanded 3200x3200m combined-arms warzone
        e.x = Math.max(-1360, Math.min(1360, e.x));
        e.z = Math.max(-1360, Math.min(1120, e.z));
        const gnd = Math.max(WATER_LEVEL, getTerrainHeight(e.x, e.z));
        if (e.y < gnd + 16) e.y = gnd + 16;

        e.mesh.position.set(e.x, e.y, e.z);
        e.mesh.rotation.order = 'YXZ';
        e.mesh.rotation.set(Math.atan2(e.vy, spd) * 0.4, e.yaw, e.roll);

        e.fireCooldown -= dt * fireRateMult;
        if (e.aiState === 'attack' && e.fireCooldown <= 0 && dist < 380 && Math.abs(yawDiff) < 0.48 && activeAttackers < 5) {
          e.fireCooldown = 1.65 + Math.random() * 0.9;
          activeAttackers++;
          this.fireEnemyProjectile(e, Math.random() < 0.32 ? 'enemy_sam' : 'enemy_bullet', 165, 11);
        }
      }
    }

    // Pulse Titan Boss core & shield
    if (this.bossRig) {
      this.bossRig.coreMesh.rotation.y += dt * 1.4;
      if (this.bossRig.shieldDome.visible) {
        this.bossRig.shieldDome.rotation.y -= dt * 0.6;
      }
    }
  }

  private fireEnemyProjectile(
    e: EnemyEntity,
    kind: 'enemy_bullet' | 'enemy_sam',
    speed: number,
    damage: number,
  ): void {
    _v2.set(this.flight.x - e.x, this.flight.y - e.y, this.flight.z - e.z).normalize();
    this.spawnProjectile({
      friendly: false,
      kind,
      x: e.x,
      y: e.y + 1.5,
      z: e.z,
      vx: _v2.x * speed,
      vy: _v2.y * speed,
      vz: _v2.z * speed,
      maxAge: kind === 'enemy_sam' ? 6.2 : 2.8,
      damage,
      targetId: kind === 'enemy_sam' ? 'player' : null,
      color: kind === 'enemy_sam' ? 0xff2a55 : 0xff6b2b,
    });
  }

  private stepBridgeCollapse(dt: number): void {
    for (const span of this.world.bridgeSpans) {
      if (span.collapsed && span.mesh.visible) {
        span.collapseTimer += dt;
        span.mesh.position.y -= dt * (10 + span.collapseTimer * 18);
        span.mesh.rotation.z += dt * 0.45;
        span.mesh.rotation.x += dt * 0.22;
        if (span.mesh.position.y < -12) {
          span.mesh.visible = false;
        }
      }
    }
  }

  private stepProjectiles(dt: number): void {
    let incomingSam = false;
    const playerFwd = this.getPlayerForward(_v1);
    const pVx = playerFwd.x * this.flight.speed;
    const pVy = playerFwd.y * this.flight.speed;
    const pVz = playerFwd.z * this.flight.speed;

    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      if (p.kind === 'bomb') {
        p.vy -= 38 * dt;
      } else if (p.kind === 'vulcan' || p.kind === 'enemy_bullet') {
        // Authentic subtle 20mm/30mm ballistic gravity arc & aerodynamic drag
        p.vy -= 11.5 * dt;
      } else if (p.kind === 'flare') {
        p.vy -= 14 * dt;
        if (Math.random() < 0.7) {
          this.spawnSmokePuff(p.x, p.y, p.z, 0, 1.5, 0, 0xfef9c3, 0.85, 0.35, true);
        }
      } else if (p.kind === 'missile') {
        const target = p.targetId
          ? this.enemies.find((e) => e.id === p.targetId && e.alive && !e.invulnerable) ?? null
          : null;
        const kin = stepRocketPhysics(
          {
            x: p.x,
            y: p.y,
            z: p.z,
            vx: p.vx,
            vy: p.vy,
            vz: p.vz,
            age: p.age,
            target: target
              ? { x: target.x, y: target.y, z: target.z, vx: target.vx, vy: target.vy, vz: target.vz }
              : null,
            maxSpeed: 198,
            accel: 165,
            turnRate: 7.4,
            weaveSeed: p.weaveSeed,
          },
          dt,
        );
        p.vx = kin.vx;
        p.vy = kin.vy;
        p.vz = kin.vz;

        // Flickering solid-propellant rocket plume + continuous swept contrail ribbon
        if (p.rig) {
          const ignited = p.age >= 0.1;
          const flick = ignited ? 0.92 + Math.random() * 0.72 : 0.22;
          p.rig.flame.scale.set(0.94 + Math.random() * 0.22, 0.94 + Math.random() * 0.22, flick);
          p.rig.coreGlow.scale.setScalar(ignited ? 0.88 + Math.random() * 0.42 : 0.2);
        }
        const invSpd = 1 / Math.max(1, kin.speed);
        const tailOffset = 2.4;
        const curTailX = p.x - p.vx * invSpd * tailOffset;
        const curTailY = p.y - p.vy * invSpd * tailOffset;
        const curTailZ = p.z - p.vz * invSpd * tailOffset;
        const prevTailX = p.prevX - p.vx * invSpd * tailOffset;
        const prevTailY = p.prevY - p.vy * invSpd * tailOffset;
        const prevTailZ = p.prevZ - p.vz * invSpd * tailOffset;
        const segLen = Math.hypot(curTailX - prevTailX, curTailY - prevTailY, curTailZ - prevTailZ);
        const steps = Math.min(4, Math.max(1, Math.ceil(segLen / 2.6)));
        for (let s = 0; s < steps; s++) {
          const frac = (s + 0.5) / steps;
          this.spawnSmokePuff(
            prevTailX + (curTailX - prevTailX) * frac + (Math.random() - 0.5) * 0.18,
            prevTailY + (curTailY - prevTailY) * frac + (Math.random() - 0.5) * 0.18,
            prevTailZ + (curTailZ - prevTailZ) * frac + (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 2.0,
            0.85 + Math.random() * 0.95,
            (Math.random() - 0.5) * 2.0,
            s % 2 === 0 ? 0xe2e8f0 : 0xcbd5e1,
            0.40 + Math.random() * 0.20,
            0.72,
            true,
          );
        }
        if (p.age >= 0.1) {
          this.spawnSmokePuff(
            curTailX,
            curTailY,
            curTailZ,
            -p.vx * 0.08,
            -p.vy * 0.08,
            -p.vz * 0.08,
            0xffa629,
            0.22,
            0.10,
            false,
          );
        }
      } else if (p.kind === 'enemy_sam') {
        const homing = p.targetId === 'player';
        if (homing) incomingSam = true;
        const kin = stepRocketPhysics(
          {
            x: p.x,
            y: p.y,
            z: p.z,
            vx: p.vx,
            vy: p.vy,
            vz: p.vz,
            age: p.age + 0.15,
            target: homing
              ? { x: this.flight.x, y: this.flight.y, z: this.flight.z, vx: pVx, vy: pVy, vz: pVz }
              : null,
            maxSpeed: 108,
            accel: 78,
            turnRate: 3.1,
            weaveSeed: p.weaveSeed,
          },
          dt,
        );
        p.vx = kin.vx;
        p.vy = kin.vy;
        p.vz = kin.vz;

        if (p.rig) {
          const flick = 0.85 + Math.random() * 0.7;
          p.rig.flame.scale.set(1, 1, flick);
          p.rig.coreGlow.scale.setScalar(0.85 + Math.random() * 0.4);
        }
        const invSpd = 1 / Math.max(1, kin.speed);
        const tailOffset = 2.3;
        const curTailX = p.x - p.vx * invSpd * tailOffset;
        const curTailY = p.y - p.vy * invSpd * tailOffset;
        const curTailZ = p.z - p.vz * invSpd * tailOffset;
        const prevTailX = p.prevX - p.vx * invSpd * tailOffset;
        const prevTailY = p.prevY - p.vy * invSpd * tailOffset;
        const prevTailZ = p.prevZ - p.vz * invSpd * tailOffset;
        const segLen = Math.hypot(curTailX - prevTailX, curTailY - prevTailY, curTailZ - prevTailZ);
        const steps = Math.min(3, Math.max(1, Math.ceil(segLen / 2.8)));
        for (let s = 0; s < steps; s++) {
          const frac = (s + 0.5) / steps;
          this.spawnSmokePuff(
            prevTailX + (curTailX - prevTailX) * frac,
            prevTailY + (curTailY - prevTailY) * frac,
            prevTailZ + (curTailZ - prevTailZ) * frac,
            (Math.random() - 0.5) * 1.4,
            0.9,
            (Math.random() - 0.5) * 1.4,
            0xfecaca,
            0.38,
            0.62,
            true,
          );
        }
        this.spawnSmokePuff(curTailX, curTailY, curTailZ, 0, 0, 0, 0xff3b30, 0.24, 0.11, false);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      if (p.rig && (p.kind === 'missile' || p.kind === 'enemy_sam')) {
        p.mesh.rotateZ(p.age * 7.5);
      }

      // Ground / water impact check
      const groundY = Math.max(WATER_LEVEL, getTerrainHeight(p.x, p.z));
      if (p.y <= groundY) {
        if (p.kind === 'bomb') {
          this.sound.playExplosion(true);
          this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.35);
          if (groundY <= WATER_LEVEL + 0.2) {
            this.world.triggerWaterRipple(p.x, p.z);
            this.spawnBurst(p.x, 1, p.z, 22, 0xe0f2fe, 26);
            this.spawnShockwave(p.x, 1.1, p.z, 26, 0x38bdf8, 0.55);
          } else {
            this.spawnBurst(p.x, groundY + 1, p.z, 24, 0xff7b00, 28);
            this.spawnShockwave(p.x, groundY + 1.2, p.z, 28, 0xf97316, 0.55);
          }
          // Bomb splash damage (radius 36m)
          for (const e of this.enemies) {
            if (!e.alive || e.invulnerable) continue;
            const d = Math.hypot(e.x - p.x, e.y - groundY, e.z - p.z);
            if (d <= 36 + e.radius) {
              this.damageEnemy(e, p.damage);
            }
          }
        } else if (p.kind === 'missile' || p.kind === 'enemy_sam') {
          this.sound.playExplosion(false);
          if (groundY <= WATER_LEVEL + 0.2) {
            this.world.triggerWaterRipple(p.x, p.z);
            this.spawnBurst(p.x, 1, p.z, 18, 0xe0f2fe, 22);
            this.spawnShockwave(p.x, 1.1, p.z, 14, 0x38bdf8, 0.42);
          } else {
            this.spawnBurst(p.x, groundY + 1, p.z, 16, 0xf97316, 20);
            this.spawnShockwave(p.x, groundY + 1.1, p.z, 14, 0xfbbf24, 0.42);
          }
        } else if (p.kind === 'vulcan' || p.kind === 'enemy_bullet') {
          // Realistic 20mm bullet splash on ocean or dust impact on terrain
          if (groundY <= WATER_LEVEL + 0.2) {
            this.spawnBurst(p.x, WATER_LEVEL + 0.35, p.z, 4, 0xe0f2fe, 11, 0.35);
          } else {
            this.spawnBurst(p.x, groundY + 0.35, p.z, 4, 0xd6c7a3, 10, 0.35);
          }
        }
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Swept solid world obstacle impact (buildings, cranes, bridge piers)
      if (p.kind !== 'flare') {
        let hitObstacle = false;
        for (const obs of this.world.obstacles) {
          if (segmentAABBIntersect(p.prevX, p.prevY, p.prevZ, p.x, p.y, p.z, obs, 0.6)) {
            hitObstacle = true;
            break;
          }
        }
        if (hitObstacle) {
          if (p.kind === 'missile' || p.kind === 'bomb' || p.kind === 'enemy_sam') {
            this.sound.playExplosion(false);
            this.spawnBurst(p.x, p.y, p.z, 16, 0xff8c1a, 22);
            this.spawnShockwave(p.x, p.y, p.z, 13, 0xfbbf24, 0.4);
          } else {
            this.spawnBurst(p.x, p.y, p.z, 4, 0xfef08a, 14, 0.55);
          }
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      }

      // Swept Continuous Collision Checks (Zero Tunneling!)
      if (p.friendly && p.kind !== 'flare') {
        for (const e of this.enemies) {
          if (!e.alive || e.invulnerable) continue;
          const hitR = e.radius + (p.kind === 'missile' ? 5.2 : p.kind === 'bomb' ? 8.0 : 2.6);
          if (segmentSphereIntersect(p.prevX, p.prevY, p.prevZ, p.x, p.y, p.z, e.x, e.y, e.z, hitR)) {
            this.damageEnemy(e, p.damage);
            if (p.kind === 'missile' || p.kind === 'bomb') {
              this.spawnBurst(p.x, p.y, p.z, 20, 0xff7b00, 26);
              this.spawnBurst(p.x, p.y, p.z, 10, 0xfef08a, 16);
              this.spawnShockwave(p.x, Math.max(WATER_LEVEL + 1, p.y), p.z, p.kind === 'bomb' ? 24 : 15, 0xfbbf24, 0.45);
              // Concussive splash radius for rockets & bombs
              const splashR = p.kind === 'bomb' ? 32 : 16;
              for (const other of this.enemies) {
                if (other.id === e.id || !other.alive || other.invulnerable) continue;
                const sd = Math.hypot(other.x - p.x, other.y - p.y, other.z - p.z);
                if (sd <= splashR + other.radius) {
                  this.damageEnemy(other, p.damage * 0.45);
                }
              }
            } else {
              this.spawnBurst(p.x, p.y, p.z, 5, 0xfef08a, 16, 0.7);
            }
            p.active = false;
            p.mesh.visible = false;
            break;
          }
        }
      } else if (!p.friendly) {
        const hitR = p.kind === 'enemy_sam' ? 6.8 : 5.2;
        if (segmentSphereIntersect(p.prevX, p.prevY, p.prevZ, p.x, p.y, p.z, this.flight.x, this.flight.y, this.flight.z, hitR)) {
          this.damagePlayer(p.damage, p.prevX, p.prevZ);
          if (p.kind === 'enemy_sam') {
            this.spawnShockwave(p.x, p.y, p.z, 12, 0xef4444, 0.38);
          }
          p.active = false;
          p.mesh.visible = false;
        }
      }
    }

    if (incomingSam) {
      const now = performance.now();
      if (now - this.lastSamBeep > 550) {
        this.lastSamBeep = now;
        this.sound.playSamWarning();
      }
    }
  }

  private stepShockwaves(dt: number): void {
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }
      const t = sw.age / sw.maxAge;
      const eased = 1 - (1 - t) * (1 - t);
      const radius = 1.2 + eased * sw.maxRadius;
      sw.mesh.scale.setScalar(radius);
      sw.mat.opacity = Math.max(0, (1 - t) * 0.85);
    }
  }

  private stepParticles(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyActive = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.isSmoke) {
        // Volumetric smoke drifts gently upward and expands slightly before dissipating
        p.vx *= 1 - 1.4 * dt;
        p.vz *= 1 - 1.4 * dt;
        p.vy += 1.2 * dt;
      } else if (p.isExhaust) {
        // Supersonic exhaust plasma streaks straight back along jet wake with air drag
        const drag = Math.max(0, 1 - 2.6 * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.vz *= drag;
      } else {
        p.vy -= 12 * dt;
      }
      const life = 1 - p.age / p.maxAge;
      const sc = p.isSmoke
        ? p.size * (0.65 + (1 - life) * 1.15) * Math.min(1, life * 2.2)
        : p.size * life;
      _v3.set(p.x, p.y, p.z);
      _scale.set(sc, sc, sc);
      _mat4.compose(_v3, _quat.identity(), _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      _color.setRGB(p.r, p.g, p.b);
      this.particleMesh.setColorAt(i, _color);
    }
    if (anyActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private stepCallouts(dt: number): void {
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      this.callouts[i].age += dt;
      this.callouts[i].worldY += dt * 7;
      if (this.callouts[i].age >= this.callouts[i].maxAge) {
        this.callouts.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number, boosting: boolean): void {
    const fwd = this.getPlayerForward(_v1);
    const shake = this.shakeTrauma * this.shakeTrauma;
    const sx = (Math.random() - 0.5) * shake * 2.2;
    const sy = (Math.random() - 0.5) * shake * 2.2;

    const speedBonusFov = Math.max(0, Math.min(8, (this.flight.speed - 55) * 0.16));
    const targetFov = this.cameraMode === 'cockpit' ? 74 : boosting ? 73 : 60 + speedBonusFov;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
    this.camera.updateProjectionMatrix();

    if (this.cameraMode === 'cockpit') {
      this.playerRig.root.visible = false;
      this.camera.position.set(
        this.flight.x + fwd.x * 2.2 + sx * 0.25,
        this.flight.y + 1.2 + sy * 0.25,
        this.flight.z + fwd.z * 2.2,
      );
      _v2.set(
        this.flight.x + fwd.x * 120,
        this.flight.y + fwd.y * 120,
        this.flight.z + fwd.z * 120,
      );
      this.camera.up.set(Math.sin(this.flight.roll) * 0.45, Math.cos(this.flight.roll * 0.45), 0).normalize();
      this.camera.lookAt(_v2);
    } else if (this.cameraMode === 'topdown') {
      this.playerRig.root.visible = true;
      this.camera.up.copy(_up);
      const desiredX = this.flight.x + fwd.x * 22;
      const desiredY = this.flight.y + 130;
      const desiredZ = this.flight.z + fwd.z * 22 + 52;
      const k = 1 - Math.exp(-6 * dt);
      this.camera.position.lerp(_v2.set(desiredX + sx, desiredY + sy, desiredZ), k);
      this.camera.lookAt(this.flight.x + fwd.x * 26, this.flight.y, this.flight.z + fwd.z * 26);
    } else {
      // Cinematic AAA Chase Camera (frames aircraft cleanly in lower third over wide coastal panorama)
      this.playerRig.root.visible = true;
      const targetCamRoll = this.flight.roll * 0.13;
      this.camRollCurrent += (targetCamRoll - this.camRollCurrent) * (1 - Math.exp(-6.5 * dt));
      this.camera.up.set(-Math.sin(this.camRollCurrent), Math.cos(this.camRollCurrent), 0).normalize();

      const backDist = (this.airframe === 'jet' ? 21.5 : 23.5) + (boosting ? 2.2 : 0);
      const upDist = this.airframe === 'jet' ? 5.6 : 7.4;
      const rightX = Math.cos(this.flight.yaw);
      const rightZ = -Math.sin(this.flight.yaw);
      const lateralLag = Math.sin(this.flight.roll) * 3.1;

      const desiredX = this.flight.x - fwd.x * backDist + rightX * lateralLag;
      const desiredY = Math.max(WATER_LEVEL + 4, this.flight.y - fwd.y * backDist + upDist);
      const desiredZ = this.flight.z - fwd.z * backDist + rightZ * lateralLag;
      const k = 1 - Math.exp(-8.8 * dt);
      this.camera.position.lerp(_v2.set(desiredX + sx, desiredY + sy, desiredZ), k);
      this.camera.lookAt(
        this.flight.x + fwd.x * 74,
        this.flight.y + fwd.y * 58 + 2.8,
        this.flight.z + fwd.z * 74,
      );
    }
  }

  // =========================================================================
  // NATIVE HD CANVAS 2D TACTICAL HUD PROJECTION & MINI-RADAR
  // =========================================================================
  private renderHudCanvas(): void {
    const ctx = this.hudCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.gameState !== 'playing') return;

    const w = this.width;
    const h = this.height;

    // 1. First-person Cockpit canopy frame & pitch ladder
    if (this.cameraMode === 'cockpit') {
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.78);
      ctx.lineTo(w * 0.22, h * 0.14);
      ctx.lineTo(w * 0.78, h * 0.14);
      ctx.lineTo(w, h * 0.78);
      ctx.stroke();

      // Pitch ladder lines
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
      ctx.lineWidth = 1.5;
      const pitchPx = this.flight.pitch * 180;
      for (let deg = -20; deg <= 20; deg += 10) {
        const ly = h * 0.5 + deg * 4 + pitchPx;
        if (ly < h * 0.22 || ly > h * 0.78) continue;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 64, ly);
        ctx.lineTo(w * 0.5 - 28, ly);
        ctx.moveTo(w * 0.5 + 28, ly);
        ctx.lineTo(w * 0.5 + 64, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Clean Military Dual-Arc Central Targeting Reticle + Speed / Altitude Indicators
    const fwd = this.getPlayerForward(_v1);
    const cxHud = w * 0.5;
    const cyHud = h * 0.48;
    const arcRadius = Math.min(w, h) * 0.165;

    ctx.save();
    // Subtle outer curved speed/altitude brackets (matching sleek military HUD)
    const drawHudArc = (side: -1 | 1) => {
      const startAng = side === 1 ? -0.78 : Math.PI - 0.78;
      const endAng = side === 1 ? 0.78 : Math.PI + 0.78;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(cxHud, cyHud, arcRadius, startAng, endAng);
      ctx.stroke();

      // Bold inner tape segment near horizontal center
      const midStart = side === 1 ? -0.26 : Math.PI - 0.26;
      const midEnd = side === 1 ? 0.26 : Math.PI + 0.26;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(cxHud, cyHud, arcRadius - 1.5, midStart, midEnd);
      ctx.stroke();

      // Fine graduated tick marks along arc
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.lineWidth = 1;
      for (let t = -3; t <= 3; t++) {
        if (t === 0) continue;
        const a = (side === 1 ? 0 : Math.PI) + t * 0.21;
        ctx.beginPath();
        ctx.moveTo(cxHud + Math.cos(a) * (arcRadius - 5), cyHud + Math.sin(a) * (arcRadius - 5));
        ctx.lineTo(cxHud + Math.cos(a) * (arcRadius + 1), cyHud + Math.sin(a) * (arcRadius + 1));
        ctx.stroke();
      }

      // Crisp green-amber center pitch index marker
      const zeroAng = side === 1 ? 0 : Math.PI;
      ctx.strokeStyle = this.primaryLockId ? '#ff7847' : '#86efac';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cxHud + Math.cos(zeroAng) * (arcRadius - 10), cyHud + Math.sin(zeroAng) * (arcRadius - 10));
      ctx.lineTo(cxHud + Math.cos(zeroAng) * (arcRadius + 4), cyHud + Math.sin(zeroAng) * (arcRadius + 4));
      ctx.stroke();
    };
    drawHudArc(-1);
    drawHudArc(1);

    // Left Readout: SPD (kt)
    const spdKnots = Math.round(this.flight.speed * 7.8);
    const altM = Math.round(this.flight.y);
    const leftTextX = cxHud - arcRadius - 22;
    const rightTextX = cxHud + arcRadius + 22;

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SPD', leftTextX, cyHud - 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText(`${spdKnots} `, leftTextX - 14, cyHud + 11);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.68)';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('kt', leftTextX, cyHud + 11);

    // Right Readout: ALT (m)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ALT', rightTextX, cyHud - 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    const altStr = altM.toLocaleString('en-US');
    const altW = ctx.measureText(altStr).width;
    ctx.fillText(altStr, rightTextX, cyHud + 11);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.68)';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(' m', rightTextX + altW + 2, cyHud + 11);

    // Center Boresight Crosshair projected along aircraft nose
    _v2.set(
      this.flight.x + fwd.x * 160,
      this.flight.y + fwd.y * 160,
      this.flight.z + fwd.z * 160,
    ).project(this.camera);

    const rx = _v2.z >= -1 && _v2.z <= 1 ? (_v2.x * 0.5 + 0.5) * w : cxHud;
    const ry = _v2.z >= -1 && _v2.z <= 1 ? (-_v2.y * 0.5 + 0.5) * h : cyHud;

    ctx.strokeStyle = this.primaryLockId ? 'rgba(255, 120, 71, 0.92)' : 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(rx, ry, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rx - 28, ry);
    ctx.lineTo(rx - 14, ry);
    ctx.moveTo(rx + 14, ry);
    ctx.lineTo(rx + 28, ry);
    ctx.moveTo(rx, ry - 26);
    ctx.lineTo(rx, ry - 14);
    ctx.moveTo(rx, ry + 14);
    ctx.lineTo(rx, ry + 26);
    ctx.stroke();
    ctx.restore();

    // 3. CCIP Ballistic Bomb Impact Ground Reticle (subtle orange dashed oval)
    if (this.bombsReady > 0 && this.flight.y > 16) {
      const ccip = computeCCIPImpact(
        this.flight.x,
        this.flight.y - 2,
        this.flight.z,
        fwd.x * this.flight.speed * 0.92,
        fwd.y * this.flight.speed * 0.5 - 4,
        fwd.z * this.flight.speed * 0.92,
      );
      _v2.set(ccip.x, ccip.y + 0.8, ccip.z).project(this.camera);
      if (_v2.z >= -1 && _v2.z <= 1) {
        const bx = (_v2.x * 0.5 + 0.5) * w;
        const by = (-_v2.y * 0.5 + 0.5) * h;
        if (bx > 40 && bx < w - 40 && by > 40 && by < h - 40) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 120, 71, 0.55)';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.ellipse(bx, by, 14, 7.5, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 4. Contextual 3D Enemy Targeting (Full red bracket + badge on locked/damaged/close primary threats only — zero clutter!)
    const sortedEnemies = this.enemies
      .filter((e) => e.alive && !e.invulnerable)
      .sort((a, b) => {
        const aPri = a.id === this.primaryLockId ? 2 : this.paintedLockIds.includes(a.id) ? 1 : 0;
        const bPri = b.id === this.primaryLockId ? 2 : this.paintedLockIds.includes(b.id) ? 1 : 0;
        if (aPri !== bPri) return bPri - aPri;
        const da = Math.hypot(a.x - this.flight.x, a.y - this.flight.y, a.z - this.flight.z);
        const db = Math.hypot(b.x - this.flight.x, b.y - this.flight.y, b.z - this.flight.z);
        return da - db;
      });

    for (const e of sortedEnemies) {
      _v2.set(e.x, e.y, e.z).project(this.camera);
      if (_v2.z < -1 || _v2.z > 1) continue;

      const sx = (_v2.x * 0.5 + 0.5) * w;
      const sy = (-_v2.y * 0.5 + 0.5) * h;
      if (sx < 24 || sx > w - 24 || sy < 24 || sy > h - 24) continue;

      const dist = Math.round(Math.hypot(e.x - this.flight.x, e.y - this.flight.y, e.z - this.flight.z));
      const isPrimary = e.id === this.primaryLockId;
      const paintIndex = this.paintedLockIds.indexOf(e.id);
      const isDamaged = e.hp < e.maxHp;

      ctx.save();
      if (isPrimary || paintIndex >= 0) {
        // Prominent clean red military target lock bracket + compact distance pill
        const boxSize = isPrimary ? 15 : 13;
        const c = 5;
        ctx.strokeStyle = paintIndex >= 0 && !isPrimary ? '#ff7847' : '#ef4444';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(sx - boxSize, sy - boxSize + c);
        ctx.lineTo(sx - boxSize, sy - boxSize);
        ctx.lineTo(sx - boxSize + c, sy - boxSize);
        ctx.moveTo(sx + boxSize - c, sy - boxSize);
        ctx.lineTo(sx + boxSize, sy - boxSize);
        ctx.lineTo(sx + boxSize, sy - boxSize + c);
        ctx.moveTo(sx - boxSize, sy + boxSize - c);
        ctx.lineTo(sx - boxSize, sy + boxSize);
        ctx.lineTo(sx - boxSize + c, sy + boxSize);
        ctx.moveTo(sx + boxSize - c, sy + boxSize);
        ctx.lineTo(sx + boxSize, sy + boxSize);
        ctx.lineTo(sx + boxSize, sy + boxSize - c);
        ctx.stroke();

        // Compact dark glass tag centered cleanly above bracket (matching reference SAM-1 / 1.2 km)
        const distLabel = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`;
        const tagText = paintIndex >= 0 ? `MSL ${paintIndex + 1} · ${e.label}` : e.label;
        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        const pillW = Math.max(54, ctx.measureText(tagText).width + 14);
        const pillX = sx + boxSize + 6;
        const pillY = sy - boxSize - 14;
        ctx.fillStyle = 'rgba(127, 29, 29, 0.85)';
        ctx.fillRect(pillX, pillY, pillW, 16);
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, 16);
        ctx.fillStyle = '#fee2e2';
        ctx.textAlign = 'left';
        ctx.fillText(tagText, pillX + 6, pillY + 11.5);

        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(distLabel, pillX + 4, pillY + 28);

        if (isDamaged) {
          const hpPct = Math.max(0, e.hp / Math.max(1, e.maxHp));
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.fillRect(sx - 14, sy + boxSize + 5, 28, 3);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(sx - 14, sy + boxSize + 5, 28 * hpPct, 3);
        }

        // Subtle lead pip for moving primary Bandit or Corvette
        if (isPrimary && (e.kind === 'bandit' || e.kind === 'gunboat')) {
          const leadT = Math.min(0.85, dist / 245);
          _v3.set(e.x + e.vx * leadT, e.y + e.vy * leadT, e.z + e.vz * leadT).project(this.camera);
          if (_v3.z >= -1 && _v3.z <= 1) {
            const lx = (_v3.x * 0.5 + 0.5) * w;
            const ly = (-_v3.y * 0.5 + 0.5) * h;
            ctx.strokeStyle = 'rgba(255, 180, 120, 0.85)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(lx, ly, 6, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else if (dist < 480) {
        // Minimal subtle diamond marker on unlocked nearby targets (zero text spam)
        const r = 4.5;
        ctx.strokeStyle = e.isPrimaryObjective ? 'rgba(255, 145, 77, 0.65)' : 'rgba(255, 255, 255, 0.32)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
        ctx.stroke();
        if (isDamaged) {
          const hpPct = Math.max(0, e.hp / Math.max(1, e.maxHp));
          ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
          ctx.fillRect(sx - 11, sy + 7, 22, 2.5);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(sx - 11, sy + 7, 22 * hpPct, 2.5);
        }
      }
      ctx.restore();
    }

    // 5. Incoming SAM 3D Chevrons (contextual red alert only when missile airborne)
    for (const p of this.projectiles) {
      if (!p.active || p.friendly || p.kind !== 'enemy_sam') continue;
      _v2.set(p.x, p.y, p.z).project(this.camera);
      if (_v2.z < -1 || _v2.z > 1) continue;
      const mx = Math.max(40, Math.min(w - 40, (_v2.x * 0.5 + 0.5) * w));
      const my = Math.max(40, Math.min(h - 40, (-_v2.y * 0.5 + 0.5) * h));
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(mx, my - 10);
      ctx.lineTo(mx + 9, my + 7);
      ctx.lineTo(mx - 9, my + 7);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#fca5a5';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SAM', mx, my - 14);
      ctx.restore();
    }

    // 6. Floating combat hit/destruction callouts (brief & clean)
    for (const c of this.callouts) {
      _v2.set(c.worldX, c.worldY, c.worldZ).project(this.camera);
      if (_v2.z < -1 || _v2.z > 1) continue;
      const cx = (_v2.x * 0.5 + 0.5) * w;
      const cy = (-_v2.y * 0.5 + 0.5) * h;
      const alpha = Math.max(0, 1 - c.age / c.maxAge);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 12px "Oxanium", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(c.text, cx, cy);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, cx, cy);
      ctx.restore();
    }

    // 7. Directional red damage arc
    if (this.damageArcTimer > 0) {
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(this.damageArcAngle - Math.PI / 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.9, this.damageArcTimer * 1.25)})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.25, -0.42, 0.42);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Low-HP subtle peripheral vignette
    if (this.hull / Math.max(1, this.maxHull) < 0.32) {
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.65);
      grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      grad.addColorStop(1, 'rgba(220, 38, 38, 0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 8b. Subtle peripheral speed-rush streaks during supersonic boost
    if (this.flight.speed > 78 || this.overdriveActiveSec > 0) {
      const intensity = Math.min(1, Math.max(0, (this.flight.speed - 78) / 36));
      const tNow = performance.now() * 0.015;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.06 + intensity * 0.11).toFixed(3)})`;
      ctx.lineWidth = 1.0;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + Math.sin(tNow * 0.08 + i) * 0.04;
        const inner = Math.min(w, h) * (0.45 + ((i * 37 + Math.floor(tNow)) % 5) * 0.03);
        const outer = Math.max(w, h) * 0.72;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 + Math.cos(angle) * inner, h * 0.5 + Math.sin(angle) * inner);
        ctx.lineTo(w * 0.5 + Math.cos(angle) * outer, h * 0.5 + Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 9. Circular Top-Down Archipelago Minimap (Bottom-Left)
    const radarR = w < 640 ? 54 : 68;
    const radarX = radarR + (w < 640 ? 16 : 24);
    const radarY = w < 768 ? h - radarR - 148 : h - radarR - 22;
    this.renderMiniRadar(ctx, radarX, radarY, radarR);
  }

  private renderMiniRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Draw baked terrain & road map
    ctx.drawImage(this.world.radarMapCanvas, cx - radius, cy - radius, radius * 2, radius * 2);

    // Subtle dark edge vignette inside radar circle
    const radShade = ctx.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius);
    radShade.addColorStop(0, 'rgba(0,0,0,0)');
    radShade.addColorStop(1, 'rgba(6,10,18,0.45)');
    ctx.fillStyle = radShade;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Subtle radar crosshair lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.52, 0, Math.PI * 2);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    const toRadar = (wx: number, wz: number): [number, number] => [
      cx + (wx / WORLD_HALF_SIZE) * radius,
      cy + (wz / WORLD_HALF_SIZE) * radius,
    ];

    // Enemies as crisp red triangles (or gold square for boss)
    for (const e of this.enemies) {
      if (!e.alive || e.invulnerable) continue;
      const [ex, ey] = toRadar(e.x, e.z);
      ctx.fillStyle = e.kind.startsWith('boss') ? '#f59e0b' : '#ef4444';
      const s = e.kind.startsWith('boss') ? 4.4 : 3.6;
      ctx.beginPath();
      ctx.moveTo(ex, ey - s);
      ctx.lineTo(ex + s * 0.88, ey + s * 0.75);
      ctx.lineTo(ex - s * 0.88, ey + s * 0.75);
      ctx.closePath();
      ctx.fill();
    }

    // White player aircraft chevron + subtle view cone
    const [px, py] = toRadar(this.flight.x, this.flight.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.flight.yaw);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, -22);
    ctx.lineTo(9, -22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Crisp minimalist outer bezel ring + centered N badge
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(10, 15, 24, 0.9)';
    ctx.fillRect(cx - 8, cy - radius - 6, 16, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - radius + 3);
    ctx.restore();
  }

  private emitHudSnapshot(): void {
    const mission = MISSIONS[this.missionIndex];
    const incomingSam = this.projectiles.some((p) => p.active && !p.friendly && p.kind === 'enemy_sam');
    const hostilesRemaining = this.enemies.filter((e) => e.alive).length;

    let bossName: string | null = null;
    let bossHpPct = 0;
    if (this.bossRig) {
      const bossParts = this.enemies.filter((e) => e.kind.startsWith('boss_'));
      const curHp = bossParts.reduce((acc, e) => acc + Math.max(0, e.hp), 0);
      const maxHp = bossParts.reduce((acc, e) => acc + e.maxHp, 0);
      if (curHp > 0) {
        bossName = `TITAN DREADNOUGHT · PHASE ${this.bossPhase}/3`;
        bossHpPct = Math.round((curHp / Math.max(1, maxHp)) * 100);
      }
    }

    const heading = ((Math.round((-this.flight.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const objectiveText =
      this.mode === 'campaign'
        ? this.targetsTotal > 0
          ? `${mission.subtitle} (${this.targetsDestroyed}/${this.targetsTotal})`
          : mission.subtitle
        : this.mode === 'endless'
          ? `Eliminate hostile wave ${this.wave} (${hostilesRemaining} active)`
          : 'Patrol the coastal airspace';

    this.callbacks.onHudUpdate({
      hull: Math.round(this.hull),
      maxHull: Math.round(this.maxHull),
      boost: Math.round(this.flight.boost),
      maxBoost: 100,
      speedKnots: Math.round(this.flight.speed * 7.8),
      altitudeM: Math.round(this.flight.y),
      headingDeg: heading,
      score: this.score,
      combo: this.combo,
      missilesReady: this.missilesReady,
      maxMissiles: this.maxMissiles,
      missileCooldownPct: Math.round((this.missileReloadTimer / 2.2) * 100),
      bombsReady: this.bombsReady,
      maxBombs: this.maxBombs,
      flaresReady: this.flaresReady,
      maxFlares: this.maxFlares,
      flareCooldownPct: Math.round((this.flareReloadTimer / 5.0) * 100),
      ultCharge: Math.round(this.ultCharge),
      ultActiveSec: Number(this.ultActiveSec.toFixed(1)),
      airframe: this.airframe,
      cameraMode: this.cameraMode,
      weatherMood: this.weatherMood,
      missionLabel:
        this.mode === 'campaign'
          ? `${mission.code}: ${mission.title}`
          : this.mode === 'endless'
            ? `ENDLESS · WAVE ${this.wave}`
            : 'FREE FLIGHT',
      missionTitle:
        this.mode === 'campaign'
          ? mission.title
          : this.mode === 'endless'
            ? `WAVE ${this.wave}`
            : 'FREE FLIGHT',
      objectiveText,
      targetsDestroyed: this.targetsDestroyed,
      targetsTotal: this.targetsTotal,
      hostilesRemaining,
      incomingSam,
      bossName,
      bossPhase: this.bossPhase,
      bossHpPct,
      radioText: this.radioText,
      radioSpeaker: this.radioSpeaker,
      radioAlert: this.radioAlert,
      radioActive: this.radioTimer > 0,
      elapsedSec: Math.round(this.elapsedSec),
      wave: this.wave,
      killfeed: this.killfeed,
    });
  }

  public dispose(): void {
    this.disposed = true;
    const win = window as unknown as Record<string, unknown>;
    if (win.__skybreakerStep) delete win.__skybreakerStep;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.clearInputs);
    document.removeEventListener('visibilitychange', this.clearInputs);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.sound.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
