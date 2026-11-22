export type AirframeType = 'jet' | 'gunship';

export type WeatherMood = 'sunset' | 'storm' | 'night';

export type CameraMode = 'chase' | 'topdown' | 'cockpit';

export type Difficulty = 'easy' | 'normal' | 'ace';

export type GameMode = 'campaign' | 'endless' | 'freeflight';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type PilotId = 'valkyrie' | 'monsoon' | 'sunburst' | 'frostbite' | 'ironclad';

export type UltimateType =
  | 'salvo_4x'
  | 'carpet_6x'
  | 'mach_overdrive'
  | 'wingmen_2x'
  | 'aegis_dome';

export interface PilotConfig {
  id: PilotId;
  callsign: string;
  name: string;
  role: string;
  ultimateLabel: string;
  ultimateDesc: string;
  ultimateType: UltimateType;
  portraitUrl: string;
  accentHex: string;
  liveryHex: number;
  stats: {
    thrust: number; // 1..10
    strike: number; // 1..10
    shield: number; // 1..10
  };
  quips: {
    launch: string;
    kill: string;
    ultimate: string;
    hurt: string;
    victory: string;
  };
}

export type EnemyKind =
  | 'bandit'
  | 'gunboat'
  | 'aa_bunker'
  | 'battle_tank'
  | 'mlrs_launcher'
  | 'fuel_tank'
  | 'bridge_span'
  | 'radar_dome'
  | 'convoy_truck'
  | 'boss_turret'
  | 'boss_pylon'
  | 'boss_core';

export interface MissionConfig {
  id: number;
  code: string;
  title: string;
  subtitle: string;
  mood: WeatherMood;
  briefing: string;
  banditCount: number;
  gunboatCount: number;
  aaCount: number;
  tankCount: number;
  mlrsCount: number;
  hasFuelDepot: boolean;
  hasBridgeTarget: boolean;
  hasConvoy: boolean;
  hasRadarArray: boolean;
  hasBoss: boolean;
  hasSearchlights: boolean;
}

export interface WorldObstacleAABB {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind: 'building' | 'crane' | 'bridge_pier' | 'bridge_span' | 'carrier';
}

export type KillfeedAccent = 'kill' | 'bonus' | 'objective' | 'phase' | 'counter' | 'warning';

export interface KillfeedEntry {
  id: string;
  headline: string;
  pointsText?: string;
  accent: KillfeedAccent;
  age: number;
  ttl: number;
}

export interface HudSnapshot {
  hull: number;
  maxHull: number;
  boost: number;
  maxBoost: number;
  speedKnots: number;
  altitudeM: number;
  headingDeg: number;
  score: number;
  combo: number;
  missilesReady: number;
  maxMissiles: number;
  missileCooldownPct: number;
  bombsReady: number;
  maxBombs: number;
  flaresReady: number;
  maxFlares: number;
  flareCooldownPct: number;
  ultCharge: number; // 0..100
  ultActiveSec: number;
  airframe: AirframeType;
  cameraMode: CameraMode;
  weatherMood: WeatherMood;
  missionLabel: string;
  missionTitle: string;
  objectiveText: string;
  targetsDestroyed: number;
  targetsTotal: number;
  hostilesRemaining: number;
  incomingSam: boolean;
  bossName: string | null;
  bossPhase: number;
  bossHpPct: number;
  radioText: string;
  radioSpeaker: string;
  radioAlert: boolean;
  radioActive: boolean;
  killfeed: KillfeedEntry[];
  elapsedSec: number;
  wave: number;
}

export interface RunSummary {
  victory: boolean;
  missionCode: string;
  missionTitle: string;
  pilotId: PilotId;
  score: number;
  bestScore: number;
  rank: 'S' | 'A' | 'B' | 'C';
  elapsedSec: number;
  targetsDestroyed: number;
  targetsTotal: number;
  banditsSplashed: number;
  accuracyPct: number;
  hullRemainingPct: number;
  mode: GameMode;
  missionIndex: number;
}

export interface LaunchOptions {
  pilotId: PilotId;
  airframe: AirframeType;
  missionIndex: number;
  difficulty: Difficulty;
  mode: GameMode;
}
