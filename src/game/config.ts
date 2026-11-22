import type { Difficulty, MissionConfig, PilotConfig, WeatherMood } from './types';

export const PILOTS: PilotConfig[] = [
  {
    id: 'valkyrie',
    callsign: 'VALKYRIE',
    name: 'Capt. Elena Vance',
    role: 'PRECISION STRIKE LEAD',
    ultimateLabel: '4× SALVO',
    ultimateDesc: 'Locks and fires 4 high-G homing micro-missiles simultaneously.',
    ultimateType: 'salvo_4x',
    portraitUrl: '/src/assets/images/pilot_valkyrie_1795182747712.jpg',
    accentHex: '#3b82f6',
    liveryHex: 0x2563eb,
    stats: { thrust: 8, strike: 9, shield: 7 },
    quips: {
      launch: 'Valkyrie airborne. Telemetry clean—painting primary targets.',
      kill: 'Direct impact. Moving to next vector.',
      ultimate: 'Fox Four! Unleashing precision quad salvo!',
      hurt: 'Hull grazed! Adjusting evasive vector.',
      victory: 'Strait airspace secured. Returning to carrier deck.',
    },
  },
  {
    id: 'monsoon',
    callsign: 'MONSOON',
    name: 'Cmdr. Kenji Sato',
    role: 'HEAVY ORDNANCE ACE',
    ultimateLabel: 'CARPET ×6',
    ultimateDesc: 'Deploys a 6-bomb saturation spread with massive splash damage.',
    ultimateType: 'carpet_6x',
    portraitUrl: '/src/assets/images/pilot_monsoon_1795182968743.jpg',
    accentHex: '#ef4444',
    liveryHex: 0xdc2626,
    stats: { thrust: 7, strike: 10, shield: 8 },
    quips: {
      launch: 'Monsoon on station. Bay doors armed and ready.',
      kill: 'Target erased from the map. Clean drop.',
      ultimate: 'Bombs away! Six-pack saturation run!',
      hurt: 'Taking flak! Holding steady on the line.',
      victory: 'All hostile infrastructure neutralized. Good sortie.',
    },
  },
  {
    id: 'sunburst',
    callsign: 'SUNBURST',
    name: 'Lt. Zara Al-Mansoor',
    role: 'SUPERSONIC INTERCEPTOR',
    ultimateLabel: 'MACH-3 BURST',
    ultimateDesc: '6s supersonic overdrive with doubled Vulcan fire rate & armor surge.',
    ultimateType: 'mach_overdrive',
    portraitUrl: '/src/assets/images/pilot_sunburst_1795182999502.jpg',
    accentHex: '#f59e0b',
    liveryHex: 0xf59e0b,
    stats: { thrust: 10, strike: 8, shield: 6 },
    quips: {
      launch: 'Afterburners hot! Try keeping up with Sunburst.',
      kill: 'Splash one! Barely broke a sweat.',
      ultimate: 'Punching Mach-3! Catch me if you can!',
      hurt: 'Whoa—close call! Rolling out of their sights.',
      victory: 'Record time! First round in the mess is on them.',
    },
  },
  {
    id: 'frostbite',
    callsign: 'FROSTBITE',
    name: 'Maj. Viktor Lindqvist',
    role: 'AUTONOMOUS DRONE LEAD',
    ultimateLabel: 'WINGMEN ×2',
    ultimateDesc: 'Launches 2 autonomous escort strike drones that hunt foes for 12s.',
    ultimateType: 'wingmen_2x',
    portraitUrl: '/src/assets/images/pilot_frostbite_1795182755539.jpg',
    accentHex: '#06b6d4',
    liveryHex: 0x06b6d4,
    stats: { thrust: 8, strike: 8, shield: 8 },
    quips: {
      launch: 'Frostbite online. Sensor net synchronized across the strait.',
      kill: 'Hostile signature terminated.',
      ultimate: 'Deploying twin autonomous wingmen. Engage at will.',
      hurt: 'Shield ripple detected. Compensating.',
      victory: 'Objective complete. Recalling telemetry drones.',
    },
  },
  {
    id: 'ironclad',
    callsign: 'IRONCLAD',
    name: 'Sgt. Marcus Okafor',
    role: 'ARMORED GUNSHIP VANGUARD',
    ultimateLabel: 'AEGIS DOME',
    ultimateDesc: 'Projects a 7s Fresnel hex barrier blocking fire and repairing 25% hull.',
    ultimateType: 'aegis_dome',
    portraitUrl: '/src/assets/images/pilot_ironclad_1795182740232.jpg',
    accentHex: '#10b981',
    liveryHex: 0x10b981,
    stats: { thrust: 6, strike: 8, shield: 10 },
    quips: {
      launch: 'Ironclad rolling in. Heavy armor checks green.',
      kill: 'Scrap metal! Keep the pressure on.',
      ultimate: 'Aegis hex dome up! Nothing gets through this hull!',
      hurt: 'Armor took the brunt. Still flying strong.',
      victory: 'Not a scratch we cannot buff out. Mission accomplished.',
    },
  },
];

export const MISSIONS: MissionConfig[] = [
  {
    id: 0,
    code: 'M1',
    title: 'DAWN RECON',
    subtitle: 'Combined Arms Coastline',
    mood: 'sunset',
    briefing:
      'Combined-arms strike across land and sea! Engage hostile Main Battle Tanks and Mobile MLRS missile launchers on the coastal plains, sink 2 Corvettes, down Bandits, and detonate the East Fuel Depot.',
    banditCount: 3,
    gunboatCount: 2,
    aaCount: 2,
    tankCount: 4,
    mlrsCount: 2,
    hasFuelDepot: true,
    hasBridgeTarget: false,
    hasConvoy: false,
    hasRadarArray: false,
    hasBoss: false,
    hasSearchlights: false,
  },
  {
    id: 1,
    code: 'M2',
    title: 'IRON BRIDGEHEAD',
    subtitle: 'Truss Bridge & Armored Push',
    mood: 'sunset',
    briefing:
      'Halt the armored offensive! Collapse the 3 spans of the Red Steel Truss Bridge, destroy the crossing convoy and patrolling Main Battle Tanks, silence MLRS missile batteries, and splash 3 Bandits.',
    banditCount: 3,
    gunboatCount: 2,
    aaCount: 2,
    tankCount: 5,
    mlrsCount: 2,
    hasFuelDepot: false,
    hasBridgeTarget: true,
    hasConvoy: true,
    hasRadarArray: false,
    hasBoss: false,
    hasSearchlights: false,
  },
  {
    id: 2,
    code: 'M3',
    title: 'AUTUMN RIDGE',
    subtitle: 'Radar Array & Armor Division',
    mood: 'storm',
    briefing:
      'Storm front over the mainland ridges! Blind the air-defense net by destroying both Alpine Radar Domes, wiping out the armored tank platoon and 3 Mobile MLRS launchers, and clearing 4 Bandits.',
    banditCount: 4,
    gunboatCount: 2,
    aaCount: 3,
    tankCount: 4,
    mlrsCount: 3,
    hasFuelDepot: false,
    hasBridgeTarget: false,
    hasConvoy: false,
    hasRadarArray: true,
    hasBoss: false,
    hasSearchlights: false,
  },
  {
    id: 3,
    code: 'M4',
    title: 'TWILIGHT HARBOUR',
    subtitle: 'Night Land-Sea Assault',
    mood: 'night',
    briefing:
      'Midnight raid under sweeping harbour searchlights! Evade heavy MLRS and SAM barrages, crush armored tanks along the coast, detonate the East Fuel Depot, sink 2 Corvettes, and down 4 night Bandits.',
    banditCount: 4,
    gunboatCount: 2,
    aaCount: 3,
    tankCount: 5,
    mlrsCount: 3,
    hasFuelDepot: true,
    hasBridgeTarget: false,
    hasConvoy: false,
    hasRadarArray: false,
    hasBoss: false,
    hasSearchlights: true,
  },
  {
    id: 4,
    code: 'M5',
    title: 'TITAN DREADNOUGHT',
    subtitle: 'Super-Carrier Boss Battle',
    mood: 'night',
    briefing:
      'Flagship alert! The 96m Titan Dreadnought has entered the Strait supported by coastal armor and missile batteries. Strip its 4 Deck Turrets, shatter its 2 Shield Pylons, and destroy the Core Reactor.',
    banditCount: 3,
    gunboatCount: 2,
    aaCount: 0,
    tankCount: 4,
    mlrsCount: 2,
    hasFuelDepot: false,
    hasBridgeTarget: false,
    hasConvoy: false,
    hasRadarArray: false,
    hasBoss: true,
    hasSearchlights: true,
  },
];

export const DIFFICULTY_TUNING: Record<
  Difficulty,
  {
    label: string;
    enemyDamageMult: number;
    enemyHpMult: number;
    enemyFireRateMult: number;
    playerHullBonus: number;
    scoreMult: number;
  }
> = {
  easy: {
    label: 'EASY',
    enemyDamageMult: 0.65,
    enemyHpMult: 0.85,
    enemyFireRateMult: 0.75,
    playerHullBonus: 90,
    scoreMult: 0.85,
  },
  normal: {
    label: 'NORMAL',
    enemyDamageMult: 1.0,
    enemyHpMult: 1.0,
    enemyFireRateMult: 1.0,
    playerHullBonus: 0,
    scoreMult: 1.0,
  },
  ace: {
    label: 'ACE',
    enemyDamageMult: 1.45,
    enemyHpMult: 1.25,
    enemyFireRateMult: 1.35,
    playerHullBonus: -45,
    scoreMult: 1.5,
  },
};

export interface WeatherPalette {
  name: string;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  waterShallow: number;
  waterDeep: number;
  cloudTint: number;
  nightFactor: number;
}

export const WEATHER_PALETTES: Record<WeatherMood, WeatherPalette> = {
  sunset: {
    name: 'SUNSET',
    skyTop: 0x324c72,
    skyMid: 0x736f8a,
    skyHorizon: 0xf4ae6e,
    fogColor: 0xcf9b7c,
    fogDensity: 0.00030,
    sunColor: 0xffd796,
    sunIntensity: 2.65,
    sunPos: [620, 155, -880],
    hemiSky: 0x9ec0e6,
    hemiGround: 0x5c4f40,
    hemiIntensity: 1.38,
    waterShallow: 0x2293b8,
    waterDeep: 0x104c7e,
    cloudTint: 0xffd9ad,
    nightFactor: 0.0,
  },
  storm: {
    name: 'STORM',
    skyTop: 0x182332,
    skyMid: 0x354659,
    skyHorizon: 0x627383,
    fogColor: 0x566778,
    fogDensity: 0.00046,
    sunColor: 0xd0dceb,
    sunIntensity: 1.5,
    sunPos: [440, 320, -700],
    hemiSky: 0x869cb2,
    hemiGround: 0x26313d,
    hemiIntensity: 0.88,
    waterShallow: 0x1e6f8c,
    waterDeep: 0x0d385c,
    cloudTint: 0x8d9fb2,
    nightFactor: 0.35,
  },
  night: {
    name: 'NIGHT',
    skyTop: 0x060b18,
    skyMid: 0x111d38,
    skyHorizon: 0x223454,
    fogColor: 0x15233e,
    fogDensity: 0.0004,
    sunColor: 0x9ec6ff,
    sunIntensity: 1.35,
    sunPos: [440, 320, -760],
    hemiSky: 0x486ba3,
    hemiGround: 0x0f182a,
    hemiIntensity: 0.82,
    waterShallow: 0x125775,
    waterDeep: 0x072645,
    cloudTint: 0x4b6284,
    nightFactor: 1.0,
  },
};

export function getPilotById(id: string): PilotConfig {
  return PILOTS.find((p) => p.id === id) ?? PILOTS[0];
}
