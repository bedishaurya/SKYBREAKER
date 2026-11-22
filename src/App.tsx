import { useCallback, useEffect, useRef, useState } from 'react';
import { MISSIONS } from './game/config';
import { SkybreakerEngine } from './game/engine';
import type {
  AirframeType,
  Difficulty,
  GameMode,
  GameState,
  HudSnapshot,
  PilotId,
  RunSummary,
} from './game/types';
import { HangarScreen } from './components/HangarScreen';
import { GameHud } from './components/GameHud';
import { DebriefModal, HelpModal, PauseModal } from './components/Modals';

const INITIAL_HUD: HudSnapshot = {
  hull: 354,
  maxHull: 354,
  boost: 100,
  maxBoost: 100,
  speedKnots: 450,
  altitudeM: 42,
  headingDeg: 0,
  score: 0,
  combo: 0,
  missilesReady: 4,
  maxMissiles: 4,
  missileCooldownPct: 0,
  bombsReady: 4,
  maxBombs: 4,
  flaresReady: 3,
  maxFlares: 3,
  flareCooldownPct: 0,
  ultCharge: 40,
  ultActiveSec: 0,
  airframe: 'jet',
  cameraMode: 'chase',
  weatherMood: 'sunset',
  missionLabel: 'M1: DAWN RECON',
  missionTitle: 'DAWN RECON',
  objectiveText: 'Combined Arms Coastline',
  targetsDestroyed: 0,
  targetsTotal: 11,
  hostilesRemaining: 11,
  incomingSam: false,
  bossName: null,
  bossPhase: 0,
  bossHpPct: 0,
  radioText: 'Select your pilot, airframe, and sortie to launch.',
  radioSpeaker: 'VALKYRIE',
  radioAlert: false,
  radioActive: false,
  elapsedSec: 0,
  wave: 1,
  killfeed: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SkybreakerEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touchMode, setTouchMode] = useState<'auto' | 'on' | 'off'>('auto');

  // Hangar selections
  const [selectedPilot, setSelectedPilot] = useState<PilotId>('valkyrie');
  const [selectedMission, setSelectedMission] = useState(0);
  const [selectedAirframe, setSelectedAirframe] = useState<AirframeType>('jet');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');
  const [selectedMode, setSelectedMode] = useState<GameMode>('campaign');

  // Keep latest selection in refs for Enter/Space shortcut & ?autostart=1
  const selectionRef = useRef({
    pilotId: selectedPilot,
    missionIndex: selectedMission,
    airframe: selectedAirframe,
    difficulty: selectedDifficulty,
    mode: selectedMode,
  });
  selectionRef.current = {
    pilotId: selectedPilot,
    missionIndex: selectedMission,
    airframe: selectedAirframe,
    difficulty: selectedDifficulty,
    mode: selectedMode,
  };

  const launchCurrentSortie = useCallback((overrideMissionIdx?: number) => {
    const sel = selectionRef.current;
    const mIdx = overrideMissionIdx !== undefined ? overrideMissionIdx : sel.missionIndex;
    if (overrideMissionIdx !== undefined) {
      setSelectedMission(overrideMissionIdx);
    }
    setShowHelp(false);
    setRunSummary(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.launchSortie({
      pilotId: sel.pilotId,
      airframe: sel.airframe,
      missionIndex: mIdx,
      difficulty: sel.difficulty,
      mode: sel.mode,
    });
  }, []);

  // Mount Three.js engine once (never torn down by React HUD updates)
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    const hudCanvasEl = hudCanvasRef.current;
    if (!mountEl || !hudCanvasEl) return;

    const engine = new SkybreakerEngine(mountEl, hudCanvasEl, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onStateChange: (nextState) => setGameState(nextState),
      onRunEnd: (summary) => setRunSummary(summary),
    });
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.launchSortie({
        pilotId: 'valkyrie',
        airframe: 'jet',
        missionIndex: 0,
        difficulty: 'normal',
        mode: 'campaign',
      });
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Live preview of pilot livery / airframe / mission weather in Hangar
  useEffect(() => {
    if (gameState !== 'title') return;
    const mood = selectedMode === 'campaign' ? (MISSIONS[selectedMission]?.mood ?? 'sunset') : 'sunset';
    engineRef.current?.previewPilotAndAirframe(selectedPilot, selectedAirframe, mood);
  }, [gameState, selectedPilot, selectedAirframe, selectedMission, selectedMode]);

  // Title-to-Start keyboard handshake (Enter / Space)
  useEffect(() => {
    if (gameState !== 'title' || showHelp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        // Don't hijack Space if user just focused a non-start button
        if (e.code === 'Space' && document.activeElement?.tagName === 'BUTTON' &&
            !(document.activeElement as HTMLElement).dataset.start) {
          return;
        }
        e.preventDefault();
        launchCurrentSortie();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState, showHelp, launchCurrentSortie]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#080d18]">
      {/* Isolated WebGL 3D Canvas Container */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-viewport"
        className="fixed inset-0 w-full h-full"
      />

      {/* Native HD Canvas 2D Tactical Reticle, Lock-on Brackets & Mini-Radar Layer */}
      <canvas
        ref={hudCanvasRef}
        data-testid="hud-canvas"
        className="fixed inset-0 w-full h-full pointer-events-none z-[5]"
      />

      {/* Title / Hangar Screen */}
      {gameState === 'title' && (
        <HangarScreen
          selectedPilot={selectedPilot}
          selectedMission={selectedMission}
          selectedAirframe={selectedAirframe}
          selectedDifficulty={selectedDifficulty}
          selectedMode={selectedMode}
          onSelectPilot={setSelectedPilot}
          onSelectMission={setSelectedMission}
          onSelectAirframe={setSelectedAirframe}
          onSelectDifficulty={setSelectedDifficulty}
          onSelectMode={setSelectedMode}
          onLaunch={() => launchCurrentSortie()}
          onOpenHelp={() => setShowHelp(true)}
        />
      )}

      {/* Active Gameplay HUD */}
      {gameState === 'playing' && (
        <GameHud
          hud={hud}
          pilotId={selectedPilot}
          muted={muted}
          touchMode={touchMode}
          onSwapAirframe={() => engineRef.current?.swapAirframe()}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onCycleWeather={() => engineRef.current?.cycleWeather()}
          onToggleMute={() => {
            if (engineRef.current) setMuted(engineRef.current.toggleMute());
          }}
          onPause={() => engineRef.current?.setPaused(true)}
          onOpenHelp={() => {
            engineRef.current?.setPaused(true);
            setShowHelp(true);
          }}
          onFireMissile={() => engineRef.current?.triggerMissileQuick()}
          onDropBomb={() => engineRef.current?.dropBomb()}
          onDeployFlares={() => engineRef.current?.deployFlares()}
          onActivateUlt={() => engineRef.current?.activateUltimate()}
          onBarrelRoll={() => engineRef.current?.triggerBarrelRoll(1)}
          onTouchStick={(x, y) => engineRef.current?.setTouchStick(x, y)}
          onTouchFire={(a) => engineRef.current?.setTouchFire(a)}
          onTouchBoost={(a) => engineRef.current?.setTouchBoost(a)}
          onTouchMissileHold={(a) => engineRef.current?.setTouchMissileHold(a)}
          onTouchDrift={(a) => engineRef.current?.setTouchDrift(a)}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && !showHelp && (
        <PauseModal
          missionLabel={hud.missionLabel}
          cameraMode={hud.cameraMode}
          weatherMood={hud.weatherMood}
          touchMode={touchMode}
          onCycleTouchMode={() =>
            setTouchMode((m) => (m === 'auto' ? 'on' : m === 'on' ? 'off' : 'auto'))
          }
          onResume={() => engineRef.current?.setPaused(false)}
          onRestart={() => launchCurrentSortie()}
          onHangar={() => engineRef.current?.returnToHangar()}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onCycleWeather={() => engineRef.current?.cycleWeather()}
          onOpenHelp={() => setShowHelp(true)}
        />
      )}

      {/* Victory / Defeat Debrief Modal */}
      {gameState === 'gameover' && runSummary && (
        <DebriefModal
          summary={runSummary}
          onReplay={() => launchCurrentSortie()}
          onNextMission={() => launchCurrentSortie(Math.min(MISSIONS.length - 1, runSummary.missionIndex + 1))}
          onHangar={() => engineRef.current?.returnToHangar()}
        />
      )}

      {/* 2-Tab Flight Manual Help Modal */}
      {showHelp && (
        <HelpModal
          onClose={() => {
            setShowHelp(false);
            if (gameState === 'paused') {
              engineRef.current?.setPaused(false);
            }
          }}
        />
      )}
    </main>
  );
}
