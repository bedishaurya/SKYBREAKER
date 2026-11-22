import React, { useEffect, useRef, useState } from 'react';
import { getPilotById } from '../game/config';
import { computeVirtualStickAxis } from '../game/rules';
import type { HudSnapshot, PilotId } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  pilotId: PilotId;
  muted: boolean;
  touchMode: 'auto' | 'on' | 'off';
  onSwapAirframe: () => void;
  onCycleCamera: () => void;
  onCycleWeather: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenHelp: () => void;
  onFireMissile: () => void;
  onDropBomb: () => void;
  onDeployFlares: () => void;
  onActivateUlt: () => void;
  onBarrelRoll: () => void;
  onTouchStick: (x: number, y: number) => void;
  onTouchFire: (active: boolean) => void;
  onTouchBoost: (active: boolean) => void;
  onTouchMissileHold: (active: boolean) => void;
  onTouchDrift: (active: boolean) => void;
}

const COMPASS_LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

function shortestAngleDiff(targetDeg: number, currentDeg: number): number {
  let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  pilotId,
  muted,
  touchMode,
  onSwapAirframe,
  onToggleMute,
  onPause,
  onFireMissile,
  onDropBomb,
  onDeployFlares,
  onActivateUlt,
  onBarrelRoll,
  onTouchStick,
  onTouchFire,
  onTouchBoost,
  onTouchMissileHold,
  onTouchDrift,
}) => {
  const pilot = getPilotById(pilotId);
  const hullPct = Math.max(0, Math.min(100, Math.round((hud.hull / Math.max(1, hud.maxHull)) * 100)));

  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
    coarse:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0),
  }));

  useEffect(() => {
    const syncViewport = () => {
      setViewport((prev) => ({
        w: window.innerWidth,
        h: window.innerHeight,
        coarse:
          prev.coarse ||
          Boolean(window.matchMedia?.('(pointer: coarse)').matches) ||
          (navigator.maxTouchPoints ?? 0) > 0,
      }));
    };
    const markTouch = () => {
      setViewport((prev) => (prev.coarse ? prev : { ...prev, coarse: true }));
    };
    window.addEventListener('resize', syncViewport);
    window.addEventListener('touchstart', markTouch, { passive: true, once: true });
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('touchstart', markTouch);
    };
  }, []);

  const isNarrowOrShort = viewport.w < 960 || viewport.h < 520;
  const showTouchHud =
    touchMode === 'on' ? true : touchMode === 'off' ? false : viewport.coarse || isNarrowOrShort;
  const useMobileCompactHud = showTouchHud;

  // Delayed trailing ghost damage bar
  const [ghostHullPct, setGhostHullPct] = useState(hullPct);
  useEffect(() => {
    if (hullPct > ghostHullPct) {
      setGhostHullPct(hullPct);
      return;
    }
    const id = window.setTimeout(() => setGhostHullPct(hullPct), 380);
    return () => clearTimeout(id);
  }, [hullPct, ghostHullPct]);

  const blurClick = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    fn();
  };

  // Build visible compass ticks within +-95 deg of current heading
  const compassTicks: Array<{ deg: number; offsetPx: number; label?: string; major: boolean }> = [];
  const pxPerDeg = 2.05;
  for (let deg = 0; deg < 360; deg += 15) {
    const diff = shortestAngleDiff(deg, hud.headingDeg);
    if (Math.abs(diff) <= 92) {
      const label = COMPASS_LABELS[deg];
      compassTicks.push({
        deg,
        offsetPx: diff * pxPerDeg,
        label,
        major: Boolean(label),
      });
    }
  }

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none px-3 py-2.5 sm:px-6 sm:py-5 flex flex-col justify-between">
      {/* TOP BAR: Mission Header Left | Compass Tape Center | Sortie Pill + Utility Right */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        {/* Top-Left: Slanted Crest + SKYBREAKER Title + Clean Gradient Objective Strip */}
        <div className="flex flex-col items-start gap-1.5 sm:gap-2.5 max-w-[205px] sm:max-w-[360px]">
          <div className="flex items-center gap-2 pl-0.5">
            <svg viewBox="0 0 36 30" className="w-6 h-5 sm:w-8 sm:h-7 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] shrink-0" fill="currentColor">
              <path d="M18 3L21 12L35 7L24 17L26 26L18 20L10 26L12 17L1 7L15 12L18 3Z" />
            </svg>
            <div>
              <div className="font-display italic text-[14px] sm:text-[19px] font-extrabold tracking-[0.12em] text-white leading-none drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">
                SKYBREAKER
              </div>
              <div className="hidden sm:block text-[9px] font-semibold tracking-[0.26em] text-white/75 uppercase mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                3D FLIGHT COMBAT
              </div>
            </div>
          </div>

          {/* Translucent right-fading dark mission card */}
          <div
            className="w-full pl-2.5 sm:pl-3 pr-4 sm:pr-8 py-1.5 sm:py-2 border-l-2 border-[#ff7847] rounded-r-sm"
            style={{
              background:
                'linear-gradient(90deg, rgba(10,14,22,0.78) 0%, rgba(10,14,22,0.52) 68%, rgba(10,14,22,0) 100%)',
            }}
          >
            <div className="font-display text-[10px] sm:text-xs font-bold tracking-[0.12em] text-[#ff8f4d] uppercase leading-tight truncate">
              {hud.missionTitle}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10.5px] sm:text-[12px] text-slate-100 mt-0.5 sm:mt-1 leading-snug">
              <span
                className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[2px] border flex items-center justify-center shrink-0 ${
                  hud.targetsTotal > 0 && hud.targetsDestroyed >= hud.targetsTotal
                    ? 'border-[#ff7847] bg-[#ff7847]/30 text-white'
                    : 'border-white/55'
                }`}
                aria-hidden="true"
              >
                {hud.targetsTotal > 0 && hud.targetsDestroyed >= hud.targetsTotal && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6.5L4.5 9L10 3" />
                  </svg>
                )}
              </span>
              <span className="truncate">{hud.objectiveText}</span>
            </div>
          </div>

          {/* Compact Mobile Hull & Boost Telemetry Strip (keeps bottom edge clear for touch flight stick & thumb cluster) */}
          {useMobileCompactHud && (
            <div
              className="w-[178px] pl-2.5 pr-3 py-1.5 rounded-r border-l-2 border-white/25 space-y-1"
              style={{
                background:
                  'linear-gradient(90deg, rgba(10,14,22,0.78) 0%, rgba(10,14,22,0.45) 85%, rgba(10,14,22,0) 100%)',
              }}
            >
              <div className="flex items-center justify-between text-[9px] font-mono-num">
                <span className="font-display font-bold tracking-wider text-white/90" data-testid="hud-airframe">
                  {hud.airframe === 'jet' ? 'VX-44' : 'AH-88'}
                </span>
                <span className={hullPct < 35 ? 'text-rose-400 font-bold' : 'text-emerald-300 font-semibold'}>
                  HULL {hullPct}%
                </span>
              </div>
              <div className="relative h-[4px] bg-black/70 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-rose-400/75 transition-all duration-300"
                  style={{ width: `${ghostHullPct}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-100 ${
                    hullPct < 35 ? 'bg-rose-500' : 'bg-[#22c55e]'
                  }`}
                  style={{ width: `${hullPct}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-mono-num text-sky-300/90">AB</span>
                <div className="flex-1 h-[3px] bg-black/70 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#38bdf8] rounded-full transition-all duration-100"
                    style={{ width: `${hud.boost}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Contextual Radio Toast (renders ONLY while active radioTimer > 0) */}
          {hud.radioActive && (
            <div
              className={`w-full pl-2.5 pr-3 py-1 rounded-r-sm border-l-2 transition-opacity duration-200 ${
                hud.radioAlert ? 'border-rose-500' : 'border-white/35'
              } ${viewport.h < 520 ? 'hidden' : ''}`}
              style={{
                background:
                  'linear-gradient(90deg, rgba(10,14,22,0.72) 0%, rgba(10,14,22,0.38) 78%, rgba(10,14,22,0) 100%)',
              }}
            >
              <div className="flex items-baseline gap-1.5 text-[9.5px] sm:text-[10px] font-mono-num leading-snug">
                <span className={hud.radioAlert ? 'text-rose-400 font-bold shrink-0' : 'text-[#ff8f4d] font-bold shrink-0'}>
                  {hud.radioSpeaker}
                </span>
                <span className="text-white/35 shrink-0">·</span>
                <span className="text-slate-100 line-clamp-2">{hud.radioText}</span>
              </div>
            </div>
          )}
        </div>

        {/* Top-Center: Sleek Horizontal Compass Tape (desktop wide screens) + Contextual Threat / Boss Alerts */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          {!useMobileCompactHud && viewport.w >= 960 && viewport.h >= 520 && (
            <div className="relative w-[360px] h-8 overflow-hidden">
            {/* Soft edge fade mask */}
            <div
              className="absolute inset-x-0 top-2.5 h-[1px]"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 25%, rgba(255,255,255,0.28) 75%, rgba(255,255,255,0) 100%)',
              }}
            />
            {/* Center fixed gold needle */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0.5 w-[1.5px] h-3 bg-[#fbbf24]" />

            {compassTicks.map((tick) => {
              const fade = Math.max(0.08, 1 - Math.abs(tick.offsetPx) / 182);
              const isNorth = tick.label === 'N';
              return (
                <div
                  key={tick.deg}
                  className="absolute top-2.5 -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `calc(50% + ${tick.offsetPx}px)`, opacity: fade }}
                >
                  <div className={tick.major ? 'w-[1px] h-2 bg-white/55' : 'w-[1px] h-1.5 bg-white/28'} />
                  {tick.label && (
                    <span
                      className={`text-[11px] font-mono-num tracking-wider mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
                        isNorth ? 'text-[#fbbf24] font-bold' : 'text-white/85 font-semibold'
                      }`}
                    >
                      {tick.label}
                    </span>
                  )}
                </div>
              );
            })}
            </div>
          )}

          {/* Contextual Boss HP Bar (only on M5) */}
          {hud.bossName && (
            <div className="w-44 sm:w-72 rounded-full border border-rose-500/60 bg-[#140a0e]/82 px-3 py-1">
              <div className="flex justify-between text-[9px] sm:text-[10px] font-mono-num font-bold text-rose-300">
                <span className="truncate">{hud.bossName}</span>
                <span>{hud.bossHpPct}%</span>
              </div>
              <div className="h-1 bg-black/60 rounded-full mt-0.5 overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{ width: `${hud.bossHpPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Contextual Incoming Missile Alert */}
          {hud.incomingSam && (
            <div className="px-3 py-1 rounded-full bg-rose-600/90 border border-rose-300/80 text-white font-display text-[10px] sm:text-[11px] font-bold tracking-[0.14em] whitespace-nowrap">
              {useMobileCompactHud ? 'SAM INBOUND · TAP FLR' : 'MISSILE INBOUND · FLARES [F]'}
            </div>
          )}
        </div>

        {/* Top-Right: Single Compact Progress Pill + Minimal Circular Audio/Pause Buttons */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <div className="flex items-center gap-2 h-8 px-2.5 sm:px-3.5 rounded-full border border-white/16 bg-[#0b0f18]/78 text-[11px] sm:text-xs shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
              {!useMobileCompactHud && (
                <>
                  <span className="hidden lg:inline font-display font-bold text-[#f59e0b] whitespace-nowrap">
                    {hud.missionLabel}
                  </span>
                  <span className="hidden lg:inline text-white/25" aria-hidden="true">|</span>
                </>
              )}
              {hud.targetsTotal > 0 ? (
                <span className="font-mono-num font-semibold text-white whitespace-nowrap">
                  {hud.targetsDestroyed}/{hud.targetsTotal}
                </span>
              ) : (
                <span className="font-mono-num font-semibold text-rose-300 whitespace-nowrap">
                  {hud.hostilesRemaining}
                </span>
              )}
              <svg viewBox="0 0 16 16" className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="8" cy="8" r="5" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                <path d="M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5" />
              </svg>
              <span
                className="font-mono-num text-[11px] text-white/75 pl-1 border-l border-white/15 whitespace-nowrap"
                data-testid="hud-score"
              >
                {hud.score}
                {hud.combo > 1 && <span className="ml-1 text-[#ff8f4d] font-bold">×{hud.combo}</span>}
              </span>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
              title="Mute [M]"
              onClick={blurClick(onToggleMute)}
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/18 bg-[#0b0f18]/78 hover:border-white/40 hover:bg-[#151c2c] text-white/90 transition-colors cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {muted ? (
                  <path d="M23 9l-6 6M17 9l6 6" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 010 7" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Game [P]"
              title="Pause [P]"
              onClick={blurClick(onPause)}
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/18 bg-[#0b0f18]/78 hover:border-white/40 hover:bg-[#151c2c] text-white/90 transition-colors cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <rect x="7" y="5" width="3.5" height="14" rx="0.5" />
                <rect x="13.5" y="5" width="3.5" height="14" rx="0.5" />
              </svg>
            </button>
          </div>

          {/* Contextual Tactical Killfeed (capped cleanly to 2-3 slim lines) */}
          {hud.killfeed.length > 0 && (
            <div
              data-testid="tactical-killfeed"
              aria-live="polite"
              className="w-44 sm:w-64 flex flex-col items-end gap-1 pointer-events-none mt-0.5"
            >
              {hud.killfeed.slice(0, useMobileCompactHud ? 2 : 3).map((entry) => {
                const remaining = Math.max(0, entry.ttl - entry.age);
                const opacity = Math.min(1, remaining < 1.0 ? Math.max(0.15, remaining) : 1);
                const tagColor =
                  entry.accent === 'bonus' || entry.accent === 'objective'
                    ? 'text-[#ff8f4d]'
                    : entry.accent === 'warning' || entry.accent === 'phase'
                      ? 'text-rose-400'
                      : 'text-white/80';

                return (
                  <div
                    key={entry.id}
                    data-testid="killfeed-item"
                    style={{ opacity }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-[#0b0f18]/72 border border-white/10 text-[10px] sm:text-[11px] transition-opacity duration-150"
                  >
                    <span className={`font-medium truncate ${tagColor}`}>{entry.headline}</span>
                    {entry.pointsText && (
                      <span className="font-mono-num font-bold text-[#ff8f4d] shrink-0">
                        {entry.pointsText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP BOTTOM ROW: Bottom-Left reserved for circular minimap canvas | Weapon Bar Center | Jet Telemetry Right */}
      {!useMobileCompactHud && (
        <div className="flex items-end justify-between gap-3">
          {/* Spacer preserving open frame above bottom-left canvas radar */}
          <div className="hidden md:block w-44 shrink-0" />

          {/* Bottom-Center: Compact Angled Weapon Selection Strip */}
          <div className="mx-auto md:mx-0 flex items-center gap-2 pointer-events-auto pb-0.5">
            <WeaponPill
              label="MSL"
              count={`${hud.missilesReady}/${hud.maxMissiles}`}
              active={hud.missilesReady > 0}
              highlighted={hud.missilesReady > 0}
              title="Homing Missile [RMB / E]"
              onClick={blurClick(onFireMissile)}
              icon={
                <svg viewBox="0 0 28 16" className="w-6 h-3.5" fill="currentColor">
                  <path d="M3 8L7 5.5H20L26 8L20 10.5H7L3 8ZM2 5L6 8L2 11V5ZM13 3L16 5.5H12L13 3ZM13 13L16 10.5H12L13 13Z" />
                </svg>
              }
            />
            <WeaponPill
              label="BOMB"
              count={`${hud.bombsReady}/${hud.maxBombs}`}
              active={hud.bombsReady > 0}
              title="CCIP Bomb [B]"
              onClick={blurClick(onDropBomb)}
              icon={
                <svg viewBox="0 0 28 16" className="w-6 h-3.5" fill="currentColor">
                  <path d="M5 8C5 5.6 8 4.5 13 4.5H19L24 8L19 11.5H13C8 11.5 5 10.4 5 8ZM2 5L5.5 6.8V9.2L2 11V5Z" />
                </svg>
              }
            />
            <WeaponPill
              label="FLARE"
              count={`${hud.flaresReady}/${hud.maxFlares}`}
              active={hud.flaresReady > 0}
              title="Deploy Flares [F]"
              onClick={blurClick(onDeployFlares)}
              icon={
                <svg viewBox="0 0 24 16" className="w-5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 13L5 4M12 13L12 2M12 13L19 4" strokeLinecap="round" />
                  <circle cx="5" cy="4" r="1.2" fill="currentColor" />
                  <circle cx="12" cy="2.5" r="1.2" fill="currentColor" />
                  <circle cx="19" cy="4" r="1.2" fill="currentColor" />
                </svg>
              }
            />

            {/* Compact ULT & SWAP micro-pills matching HUD simplicity */}
            <button
              type="button"
              tabIndex={-1}
              title={`${pilot.ultimateLabel} [U / Q]`}
              onClick={blurClick(onActivateUlt)}
              className={`hidden sm:flex flex-col items-center justify-center px-2.5 h-[44px] rounded border text-[10px] font-mono-num transition-colors cursor-pointer ${
                hud.ultCharge >= 100
                  ? 'border-[#ff7847] bg-[#29130a]/85 text-[#ffb38a]'
                  : 'border-white/14 bg-[#0b0f18]/72 text-white/70 hover:border-white/30'
              }`}
            >
              <span className="font-display font-bold text-[9px] tracking-wider">ULT</span>
              <span className="font-bold">
                {hud.ultActiveSec > 0 ? `${hud.ultActiveSec}s` : `${hud.ultCharge}%`}
              </span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              title="Swap Airframe [X]"
              onClick={blurClick(onSwapAirframe)}
              className="hidden sm:flex flex-col items-center justify-center px-2.5 h-[44px] rounded border border-white/14 bg-[#0b0f18]/72 hover:border-white/32 text-white/75 text-[10px] font-mono-num transition-colors cursor-pointer"
            >
              <span className="font-display font-bold text-[9px] tracking-wider">SWAP</span>
              <span className="font-bold text-white/90">{hud.airframe === 'jet' ? 'JET' : 'GUN'}</span>
            </button>
          </div>

          {/* Bottom-Right: Minimalist Airframe Silhouette + Hull & Boost Bars */}
          <div
            className="flex items-center gap-3.5 pl-4 pr-2.5 py-2 rounded-lg border border-white/10"
            style={{
              background:
                'linear-gradient(270deg, rgba(10,14,22,0.72) 0%, rgba(10,14,22,0.46) 72%, rgba(10,14,22,0.18) 100%)',
            }}
          >
            {/* Crisp Wireframe Aircraft SVG Silhouette */}
            <div className="hidden sm:flex items-center justify-center w-13 h-13 text-white/85 shrink-0">
              {hud.airframe === 'jet' ? (
                <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path
                    d="M32 6L36 22L56 38L56 44L37 39L36 48L44 55L44 58L32 54L20 58L20 55L28 48L27 39L8 44L8 38L28 22L32 6Z"
                    strokeLinejoin="round"
                  />
                  <path d="M32 14V26" strokeOpacity="0.6" />
                </svg>
              ) : (
                <svg viewBox="0 0 64 64" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path
                    d="M32 8L37 22L54 27L54 33L38 35L35 54L43 58H21L29 54L26 35L10 33L10 27L27 22L32 8Z"
                    strokeLinejoin="round"
                  />
                  <circle cx="14" cy="24" r="6" strokeOpacity="0.7" />
                  <circle cx="50" cy="24" r="6" strokeOpacity="0.7" />
                </svg>
              )}
            </div>

            {/* Hull & Boost Telemetry */}
            <div className="w-40 sm:w-44 space-y-2">
              <div
                className="font-display text-xs font-bold tracking-[0.14em] text-white uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
                data-testid="hud-airframe"
              >
                {hud.airframe === 'jet' ? 'VX-44 FALCON' : 'AH-88 KESTREL'}
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono-num leading-none mb-1">
                  <span className="text-white/75 tracking-wider">HULL</span>
                  <span className={hullPct < 35 ? 'text-rose-400 font-bold' : 'text-white font-semibold'}>
                    {hud.hull} / {hud.maxHull}
                  </span>
                </div>
                <div className="relative h-[4px] bg-black/70 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-rose-400/75 transition-all duration-300"
                    style={{ width: `${ghostHullPct}%` }}
                  />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-100 ${
                      hullPct < 35 ? 'bg-rose-500' : 'bg-[#22c55e]'
                    }`}
                    style={{ width: `${hullPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono-num leading-none mb-1">
                  <span className="text-white/75 tracking-wider">BOOST</span>
                  <span className="text-white font-semibold">{hud.boost}%</span>
                </div>
                <div className="h-[4px] bg-black/70 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#38bdf8] rounded-full transition-all duration-100"
                    style={{ width: `${hud.boost}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE / TOUCH FLIGHT CONTROLS (Auto on touch screens & mobile viewports, or forced ON via Pause menu) */}
      {showTouchHud && (
        <div
          data-testid="mobile-touch-controls"
          className="fixed inset-x-3.5 bottom-3.5 z-20 flex items-end justify-between pointer-events-none touch-none"
        >
          {/* Left Thumb: 360° Analog Flight Stick + Drift/Strafe micro-button */}
          <div className="flex flex-col items-start gap-2 pointer-events-auto touch-none">
            <TouchTapBtn
              label={hud.airframe === 'gunship' ? 'STRAFE' : 'DRIFT'}
              onHold={onTouchDrift}
              ariaLabel="High-G Drift or Lateral Strafe"
            />
            <VirtualFlightStick onChange={onTouchStick} />
          </div>

          {/* Right Thumb: Tactical Ability Row + Primary Combat Triad (BOOST / MSL / FIRE) */}
          <div className="flex flex-col items-end gap-2 pointer-events-auto touch-none">
            <div className="flex items-center gap-1.5">
              <TouchActionPill
                label="BOMB"
                sub={String(hud.bombsReady)}
                disabled={hud.bombsReady <= 0}
                onPress={onDropBomb}
                ariaLabel="Drop Bomb"
              />
              <TouchActionPill
                label="FLR"
                sub={String(hud.flaresReady)}
                disabled={hud.flaresReady <= 0}
                urgent={hud.incomingSam && hud.flaresReady > 0}
                onPress={onDeployFlares}
                ariaLabel="Deploy Flares"
              />
              <TouchActionPill
                label="ROLL"
                sub="DODGE"
                onPress={onBarrelRoll}
                ariaLabel="Barrel Roll"
              />
              <TouchActionPill
                label="ULT"
                sub={hud.ultActiveSec > 0 ? `${hud.ultActiveSec}s` : `${hud.ultCharge}%`}
                ready={hud.ultCharge >= 100 || hud.ultActiveSec > 0}
                onPress={onActivateUlt}
                ariaLabel="Activate Pilot Ultimate"
              />
              <TouchActionPill
                label="SWAP"
                sub={hud.airframe === 'jet' ? 'JET' : 'GUN'}
                onPress={onSwapAirframe}
                ariaLabel="Swap Airframe"
              />
            </div>

            <div className="flex items-end gap-2">
              <TouchHoldCircle
                label="AB"
                sub={`${hud.boost}%`}
                tone="cyan"
                size="sm"
                onHold={onTouchBoost}
                ariaLabel="Afterburner Boost"
              />
              <TouchHoldCircle
                label="MSL"
                sub={`${hud.missilesReady}/${hud.maxMissiles}`}
                tone={hud.missilesReady > 0 ? 'amber' : 'muted'}
                size="md"
                onHold={onTouchMissileHold}
                ariaLabel="Homing Missile — Tap or Hold to Multi-Lock"
              />
              <TouchHoldCircle
                label="FIRE"
                sub="GUN"
                tone="orange"
                size="lg"
                onHold={onTouchFire}
                ariaLabel="Fire Vulcan Cannons"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function VirtualFlightStick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const updateFromClient = (clientX: number, clientY: number, isDown: boolean) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.38);
    const axis = computeVirtualStickAxis(clientX - cx, clientY - cy, maxR, 0.12);
    setKnob({ x: axis.knobX, y: axis.knobY, active: isDown });
    onChange(axis.turn, axis.pitch);
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0, active: false });
    onChange(0, 0);
  };

  return (
    <div
      ref={padRef}
      role="slider"
      aria-label="Flight Control Stick"
      aria-valuetext={`Turn ${knob.x.toFixed(0)} Pitch ${(-knob.y).toFixed(0)}`}
      data-testid="touch-flight-stick"
      onPointerDown={(e) => {
        e.preventDefault();
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointer events in tests may not have an active native capture ID
        }
        updateFromClient(e.clientX, e.clientY, true);
      }}
      onPointerMove={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        updateFromClient(e.clientX, e.clientY, true);
      }}
      onPointerUp={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        resetStick();
      }}
      onPointerCancel={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        resetStick();
      }}
      className={`relative w-[118px] h-[118px] rounded-full border transition-colors touch-none select-none flex items-center justify-center ${
        knob.active
          ? 'border-[#ff8a2b]/85 bg-[#0d1422]/80 shadow-[0_0_22px_rgba(255,120,71,0.28)]'
          : 'border-white/25 bg-[#090d14]/72 shadow-[0_6px_20px_rgba(0,0,0,0.45)]'
      }`}
    >
      {/* Crosshair & Cardinal Flight Guides */}
      <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute inset-x-4 h-px bg-white/14" />
      <div className="pointer-events-none absolute inset-y-4 w-px bg-white/14" />
      <span className="pointer-events-none absolute top-1.5 text-[8px] font-mono-num text-white/45">CLIMB</span>
      <span className="pointer-events-none absolute bottom-1.5 text-[8px] font-mono-num text-white/45">DIVE</span>

      {/* Movable Thumb Puck */}
      <div
        className={`pointer-events-none w-11 h-11 rounded-full border transition-transform duration-75 flex items-center justify-center ${
          knob.active
            ? 'border-[#ffb38a] bg-[#ff5a1f]/85 shadow-[0_0_14px_rgba(255,90,31,0.65)]'
            : 'border-white/45 bg-slate-800/88'
        }`}
        style={{
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-white/90" />
      </div>
    </div>
  );
}

function TouchTapBtn({
  label,
  onHold,
  ariaLabel,
}: {
  label: string;
  onHold: (active: boolean) => void;
  ariaLabel: string;
}) {
  const [pressed, setPressed] = useState(false);
  const setHold = (val: boolean) => {
    setPressed(val);
    onHold(val);
  };
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        setHold(true);
      }}
      onPointerUp={() => setHold(false)}
      onPointerLeave={() => setHold(false)}
      onPointerCancel={() => setHold(false)}
      className={`px-3 py-1 rounded-full border text-[10px] font-display font-bold tracking-wider touch-none transition-colors ${
        pressed
          ? 'border-[#38bdf8] bg-[#0ea5e9]/35 text-white'
          : 'border-white/22 bg-[#090d14]/80 text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function TouchActionPill({
  label,
  sub,
  disabled,
  ready,
  urgent,
  onPress,
  ariaLabel,
}: {
  label: string;
  sub: string;
  disabled?: boolean;
  ready?: boolean;
  urgent?: boolean;
  onPress: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.blur();
        onPress();
      }}
      className={`min-w-[40px] h-[40px] px-1.5 rounded-lg border flex flex-col items-center justify-center leading-none touch-none transition-colors ${
        urgent
          ? 'border-rose-400 bg-rose-600/90 text-white shadow-[0_0_14px_rgba(244,63,94,0.65)]'
          : ready
            ? 'border-[#ff8a2b] bg-[#ff5a1f]/90 text-white shadow-[0_0_12px_rgba(255,90,31,0.5)]'
            : disabled
              ? 'border-white/10 bg-[#080b12]/65 text-white/35'
              : 'border-white/22 bg-[#090d14]/84 text-slate-100 active:bg-white/20'
      }`}
    >
      <span className="font-display font-bold text-[9px] tracking-wider">{label}</span>
      <span className="font-mono-num text-[9px] font-semibold mt-0.5 opacity-90">{sub}</span>
    </button>
  );
}

function TouchHoldCircle({
  label,
  sub,
  tone,
  size,
  onHold,
  ariaLabel,
}: {
  label: string;
  sub: string;
  tone: 'orange' | 'amber' | 'cyan' | 'muted';
  size: 'sm' | 'md' | 'lg';
  onHold: (active: boolean) => void;
  ariaLabel: string;
}) {
  const [pressed, setPressed] = useState(false);
  const pointerIdRef = useRef<number | null>(null);

  const dims =
    size === 'lg'
      ? 'w-[68px] h-[68px]'
      : size === 'md'
        ? 'w-[56px] h-[56px]'
        : 'w-[50px] h-[50px]';

  const palette =
    tone === 'orange'
      ? pressed
        ? 'border-white bg-[#ff733d] text-white shadow-[0_0_24px_rgba(255,90,31,0.75)] scale-95'
        : 'border-[#ffb38a]/80 bg-[#ff5a1f]/92 text-white shadow-[0_6px_20px_rgba(255,90,31,0.45)]'
      : tone === 'amber'
        ? pressed
          ? 'border-white bg-[#f59e0b] text-[#090d14] scale-95'
          : 'border-[#f59e0b]/85 bg-[#26180a]/88 text-[#fbbf24] shadow-[0_4px_16px_rgba(245,158,11,0.3)]'
        : tone === 'cyan'
          ? pressed
            ? 'border-white bg-[#0ea5e9] text-white scale-95'
            : 'border-[#38bdf8]/75 bg-[#0b1b29]/86 text-[#7dd3fc]'
          : 'border-white/15 bg-[#090d14]/70 text-white/40';

  const endHold = () => {
    if (pointerIdRef.current === null && !pressed) return;
    pointerIdRef.current = null;
    setPressed(false);
    onHold(false);
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.blur();
        pointerIdRef.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointer events in tests may omit capture id
        }
        setPressed(true);
        onHold(true);
      }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      className={`${dims} rounded-full border-2 flex flex-col items-center justify-center leading-tight touch-none transition-all ${palette}`}
    >
      <span className="font-display font-extrabold text-[11px] tracking-wider">{label}</span>
      <span className="font-mono-num text-[9px] font-semibold opacity-90">{sub}</span>
    </button>
  );
}

function WeaponPill({
  label,
  count,
  active,
  highlighted,
  title,
  icon,
  onClick,
}: {
  label: string;
  count: string;
  active: boolean;
  highlighted?: boolean;
  title: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      onClick={onClick}
      className={`group flex flex-col items-center justify-center min-w-[82px] sm:min-w-[92px] h-[44px] px-3 rounded border transition-colors cursor-pointer -skew-x-12 ${
        highlighted
          ? 'border-[#f59e0b]/90 bg-[#1d140c]/84 text-white shadow-[0_0_12px_rgba(245,158,11,0.22)]'
          : active
            ? 'border-white/22 bg-[#0b0f18]/78 hover:border-white/40 text-white/90'
            : 'border-white/10 bg-[#080b12]/65 text-white/40'
      }`}
    >
      <div className="skew-x-12 flex flex-col items-center">
        <div className={highlighted ? 'text-white' : 'text-white/85'}>{icon}</div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono-num leading-none mt-1">
          <span className={`font-display font-bold tracking-wider ${highlighted ? 'text-[#fbbf24]' : 'text-white/80'}`}>
            {label}
          </span>
          <span className="text-white/90 font-semibold">{count}</span>
        </div>
      </div>
    </button>
  );
}
