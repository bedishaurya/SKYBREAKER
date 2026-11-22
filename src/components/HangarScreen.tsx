import React from 'react';
import { MISSIONS, PILOTS, getPilotById } from '../game/config';
import type { AirframeType, Difficulty, GameMode, PilotId } from '../game/types';

interface HangarScreenProps {
  selectedPilot: PilotId;
  selectedMission: number;
  selectedAirframe: AirframeType;
  selectedDifficulty: Difficulty;
  selectedMode: GameMode;
  onSelectPilot: (id: PilotId) => void;
  onSelectMission: (idx: number) => void;
  onSelectAirframe: (af: AirframeType) => void;
  onSelectDifficulty: (d: Difficulty) => void;
  onSelectMode: (m: GameMode) => void;
  onLaunch: () => void;
  onOpenHelp: () => void;
}

export const HangarScreen: React.FC<HangarScreenProps> = ({
  selectedPilot,
  selectedMission,
  selectedAirframe,
  selectedDifficulty,
  selectedMode,
  onSelectPilot,
  onSelectMission,
  onSelectAirframe,
  onSelectDifficulty,
  onSelectMode,
  onLaunch,
  onOpenHelp,
}) => {
  const mission = MISSIONS[selectedMission] ?? MISSIONS[0];
  const activePilot = getPilotById(selectedPilot);

  const launchLabel =
    selectedMode === 'campaign'
      ? `Launch ${mission.code}`
      : selectedMode === 'endless'
        ? 'Launch Endless'
        : 'Launch Free Flight';

  const launchSub =
    selectedMode === 'campaign'
      ? mission.title
      : selectedMode === 'endless'
        ? 'Wave Survival'
        : 'Open Warzone';

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between overflow-hidden pointer-events-none select-none">
      {/* Subtle Top & Bottom Edge Gradients so UI stays legible without hiding the 3D scene */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-24 bg-gradient-to-b from-[#060910]/80 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#060910]/90 to-transparent"
        aria-hidden="true"
      />

      {/* TOP BAR */}
      <header className="relative z-10 shrink-0 flex items-center justify-between gap-4 px-5 sm:px-7 py-3 pointer-events-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <svg viewBox="0 0 40 32" className="w-7 h-5 shrink-0" aria-hidden="true">
            <polygon
              points="20,1 39,21 31,23 24,16 24,29 30,31 10,31 16,29 16,16 9,23 1,21"
              fill="#ff5a1f"
            />
            <polygon points="20,6 24,15 16,15" fill="#fff7ed" />
          </svg>
          <h1 className="font-display text-lg sm:text-xl font-extrabold tracking-[0.16em] text-white whitespace-nowrap">
            SKYBREAKER
          </h1>
        </div>

        <nav className="flex items-center gap-5 sm:gap-7" aria-label="Game Mode" role="tablist">
          {(
            [
              { id: 'campaign', label: 'Campaign' },
              { id: 'endless', label: 'Endless' },
              { id: 'freeflight', label: 'Free Flight' },
            ] as { id: GameMode; label: string }[]
          ).map((tab) => {
            const active = selectedMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectMode(tab.id)}
                className={`relative py-1 text-xs sm:text-sm font-semibold tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'text-white' : 'text-slate-300/75 hover:text-white'
                }`}
              >
                {tab.label}
                {active && <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[#ff5a1f]" />}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onOpenHelp}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-100 border border-white/15 bg-[#0b101a]/80 hover:border-white/35 hover:bg-[#141c2b] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Controls
        </button>
      </header>

      {/* MIDDLE STAGE: Redesigned AAA Left Missions Card matching reference */}
      <div className="relative z-10 flex-1 min-h-0 flex items-center px-5 sm:px-7 py-1.5 overflow-hidden">
        <aside className="w-full max-w-[404px] max-h-full overflow-y-auto pointer-events-auto rounded-2xl bg-[#0d121c]/88 border border-white/14 px-4 py-3.5 flex flex-col gap-2.5 shadow-[0_22px_56px_rgba(0,0,0,0.65)]">
          {selectedMode === 'campaign' ? (
            <>
              {/* Panel Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 20 20" className="w-4 h-4 text-white/85 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="10" cy="10" r="6" />
                    <circle cx="10" cy="10" r="2" fill="currentColor" />
                    <path d="M10 1.5V4M10 16v2.5M1.5 10H4M16 10h2.5" strokeLinecap="round" />
                  </svg>
                  <h2 className="font-display text-sm font-bold tracking-[0.1em] text-white uppercase">
                    Missions
                  </h2>
                </div>
                <span className="font-mono-num text-xs font-medium text-slate-300">
                  {String(selectedMission + 1).padStart(2, '0')} / 0{MISSIONS.length}
                </span>
              </div>

              {/* Mission List with Scenic Thumbnails */}
              <div className="flex flex-col gap-1.5" role="tablist" aria-label="Campaign Missions">
                {MISSIONS.map((m, idx) => {
                  const active = selectedMission === idx;
                  return (
                    <button
                      key={m.code}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onSelectMission(idx)}
                      className={`w-full text-left px-2 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                        active
                          ? 'border-[#ff8a2b] bg-gradient-to-r from-[#3a1f0f]/88 via-[#26160c]/88 to-[#161a24]/88 shadow-[0_0_16px_rgba(255,138,43,0.22)] text-white'
                          : 'border-white/7 bg-[#121824]/75 hover:border-white/22 hover:bg-[#171f2e]/85 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <MissionThumbnail index={idx} />
                        <span
                          className={`font-mono-num text-[11px] font-bold shrink-0 w-5 ${
                            active ? 'text-[#ff8f3a]' : 'text-slate-400'
                          }`}
                        >
                          {m.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-[12px] font-bold tracking-wide leading-tight truncate text-white">
                            {m.title}
                          </div>
                          <div className="text-[10.5px] text-slate-400 leading-tight truncate mt-0.5">
                            {m.subtitle}
                          </div>
                        </div>
                      </div>
                      {active ? (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-[#ff8f3a] shrink-0 mr-1" fill="currentColor" aria-hidden="true">
                          <polygon points="2,1.5 10.5,6 2,10.5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-500 shrink-0 mr-1" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path d="M4.5 2.5L8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Briefing with Orange Left Bar */}
              <div className="flex items-stretch gap-2.5 pt-0.5">
                <span className="w-[3px] rounded-full bg-[#ff7847] shrink-0" aria-hidden="true" />
                <p className="text-[11px] leading-snug text-slate-200/90 line-clamp-2">
                  {mission.briefing}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5 py-1">
              <h2 className="font-display text-sm font-bold tracking-wide text-white uppercase">
                {selectedMode === 'endless' ? 'Endless Air Superiority' : 'Coastal Free Flight'}
              </h2>
              <div className="flex items-stretch gap-2.5">
                <span className="w-[3px] rounded-full bg-[#ff7847] shrink-0" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-slate-200/90">
                  {selectedMode === 'endless'
                    ? 'Intercept escalating combined-arms waves across land and sea. Chain hits for Ace Rank multipliers.'
                    : 'Fly freely over the 3.2km coastal warzone, test supersonic flight, and switch aircraft mid-air.'}
                </p>
              </div>
            </div>
          )}

          {/* Aircraft Selector Cards */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
              <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-slate-300" fill="currentColor" aria-hidden="true">
                <path d="M10 2L12 8.5L18.5 12V14L12 12L11.5 16L14 18V19L10 18L6 19V18L8.5 16L8 12L1.5 14V12L8 8.5L10 2Z" />
              </svg>
              <span>Aircraft</span>
            </div>
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Aircraft"
            >
              <button
                type="button"
                onClick={() => onSelectAirframe('jet')}
                className={`relative flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border transition-all cursor-pointer ${
                  selectedAirframe === 'jet'
                    ? 'border-[#ff8a2b] bg-gradient-to-b from-[#4a2611]/85 to-[#26150b]/90 text-white shadow-[0_0_14px_rgba(255,138,43,0.22)]'
                    : 'border-white/12 bg-[#121824]/80 text-slate-200 hover:border-white/28'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg viewBox="0 0 44 26" className="w-8 h-5 shrink-0" aria-hidden="true">
                    <path d="M40 7L24 13L18 3L14 4L16 12L6 14L3 11L1 12L4 16L1 20L3 21L7 17L17 17L16 23L20 22L25 16L40 9L43 7H40Z" fill="#cbd5e1" />
                    <path d="M27 10L34 8L31 11L27 10Z" fill="#f59e0b" />
                  </svg>
                  <span className="text-[11px] font-semibold truncate">VX-44 Falcon</span>
                </div>
                {selectedAirframe === 'jet' && (
                  <span className="w-4 h-4 rounded-full bg-[#ff7828] text-[#0b0e14] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M2.5 6.2L5 8.6L9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectAirframe('gunship')}
                className={`relative flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border transition-all cursor-pointer ${
                  selectedAirframe === 'gunship'
                    ? 'border-[#ff8a2b] bg-gradient-to-b from-[#4a2611]/85 to-[#26150b]/90 text-white shadow-[0_0_14px_rgba(255,138,43,0.22)]'
                    : 'border-white/12 bg-[#121824]/80 text-slate-200 hover:border-white/28'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg viewBox="0 0 44 26" className="w-8 h-5 shrink-0" aria-hidden="true">
                    <path d="M36 12L25 10L22 5H14L16 10L5 13L3 9H1L3 15L14 17L24 17L36 15L41 13L36 12Z" fill="#94a3b8" />
                    <ellipse cx="19" cy="4.5" rx="12" ry="1.4" fill="#cbd5e1" opacity="0.85" />
                    <path d="M26 11L32 12L28 14L26 11Z" fill="#38bdf8" />
                  </svg>
                  <span className="text-[11px] font-semibold truncate">AH-88 Kestrel</span>
                </div>
                {selectedAirframe === 'gunship' && (
                  <span className="w-4 h-4 rounded-full bg-[#ff7828] text-[#0b0e14] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M2.5 6.2L5 8.6L9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-slate-300" fill="currentColor" aria-hidden="true">
                <rect x="2" y="10" width="2.5" height="4" rx="0.5" />
                <rect x="6.5" y="6.5" width="2.5" height="7.5" rx="0.5" />
                <rect x="11" y="3" width="2.5" height="11" rx="0.5" />
              </svg>
              <span>Difficulty</span>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label="Difficulty"
            >
              {(['easy', 'normal', 'ace'] as Difficulty[]).map((d) => {
                const active = selectedDifficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onSelectDifficulty(d)}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-semibold capitalize transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'border-[#ff8a2b] bg-gradient-to-b from-[#693211]/88 to-[#3b1b09]/92 text-white shadow-[0_0_14px_rgba(255,138,43,0.24)]'
                        : 'border-white/12 bg-[#121824]/80 text-slate-300 hover:border-white/28 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* CENTERED LAUNCH CTA: Positioned cleanly in horizontal center above footer, clear of corner overlays */}
      <div className="relative z-10 shrink-0 flex justify-center px-5 pb-3 pointer-events-none">
        <button
          type="button"
          data-start="true"
          onClick={onLaunch}
          className="pointer-events-auto px-8 py-3 rounded-xl bg-[#ff5a1f] hover:bg-[#ff733d] active:translate-y-px text-white transition-all cursor-pointer shrink-0 shadow-[0_10px_32px_rgba(255,90,31,0.45)] ring-1 ring-white/25 flex items-center gap-3.5"
        >
          <div className="text-left leading-tight">
            <div className="font-display text-base font-extrabold tracking-wider uppercase whitespace-nowrap">
              {launchLabel}
            </div>
            <div className="text-[11px] font-mono-num text-orange-100/95 whitespace-nowrap">
              {launchSub}
            </div>
          </div>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
            <polygon points="3,2 14,8 3,14" />
          </svg>
        </button>
      </div>

      {/* BOTTOM BAR: Centered 5-Pilot Roster + Active Pilot Callout */}
      <footer className="relative z-10 shrink-0 px-5 sm:px-7 py-3 bg-[#070a11]/88 border-t border-white/10 pointer-events-auto flex flex-wrap items-center justify-center gap-4">
        {/* 5 Pilot Tiles */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full" role="radiogroup" aria-label="Select Ace Pilot">
          {PILOTS.map((p) => {
            const active = selectedPilot === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectPilot(p.id)}
                className={`flex items-center gap-2 pr-3 pl-1.5 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#141c2c] border-[#ff5a1f] text-white'
                    : 'bg-[#0b101a]/75 border-white/10 text-slate-300 hover:border-white/30 hover:text-white'
                }`}
              >
                <div className="relative w-9 h-9 rounded-md shrink-0 bg-[#060910] overflow-hidden border border-white/15">
                  <img
                    src={p.portraitUrl}
                    alt={p.callsign}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover pixelated"
                  />
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5"
                    style={{ backgroundColor: p.accentHex }}
                  />
                </div>
                <div className="text-left leading-tight">
                  <div className="font-display text-xs font-bold tracking-wider">{p.callsign}</div>
                  <div className="text-[10px] text-slate-400 font-mono-num">{p.ultimateLabel}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Concise Active Pilot Details */}
        <div className="hidden xl:flex flex-col text-left max-w-[260px] pl-3 border-l border-white/10">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-white">{activePilot.name}</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span className="font-mono-num text-[11px] text-[#ff7847] font-bold">
              {activePilot.ultimateLabel}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {activePilot.ultimateDesc}
          </div>
        </div>
      </footer>
    </div>
  );
};

function MissionThumbnail({ index }: { index: number }) {
  if (index === 0) {
    // M1: Dawn Recon - Sunrise mountains & coastal strait
    return (
      <svg viewBox="0 0 72 34" className="w-[66px] h-[32px] rounded-md shrink-0 border border-white/15" aria-hidden="true">
        <defs>
          <linearGradient id="m1Sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#355078" />
            <stop offset="60%" stopColor="#9c6a6b" />
            <stop offset="100%" stopColor="#f5b46e" />
          </linearGradient>
        </defs>
        <rect width="72" height="34" fill="url(#m1Sky)" />
        <circle cx="51" cy="14" r="6" fill="#ffebc2" />
        <path d="M0 24L14 14L28 21L42 15L58 22L72 17V34H0Z" fill="#2c3e35" />
        <path d="M0 28L18 22L36 27L55 23L72 26V34H0Z" fill="#123d5e" />
        <path d="M36 27L55 24L50 34H29Z" fill="#f5b46e" opacity="0.45" />
      </svg>
    );
  }
  if (index === 1) {
    // M2: Iron Bridgehead - Red truss bridge over blue strait
    return (
      <svg viewBox="0 0 72 34" className="w-[66px] h-[32px] rounded-md shrink-0 border border-white/15" aria-hidden="true">
        <defs>
          <linearGradient id="m2Sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#365c91" />
            <stop offset="100%" stopColor="#f29b6c" />
          </linearGradient>
        </defs>
        <rect width="72" height="34" fill="url(#m2Sky)" />
        <path d="M0 21L18 11L35 19L53 10L72 18V34H0Z" fill="#32463a" />
        <rect x="0" y="21" width="72" height="13" fill="#104975" />
        <rect x="4" y="17" width="64" height="3.5" fill="#dc2626" />
        <path d="M6 17L12 20L18 17L24 20L30 17L36 20L42 17L48 20L54 17L60 20L66 17" stroke="#f87171" strokeWidth="1" fill="none" />
        <rect x="16" y="20.5" width="3" height="10" fill="#475569" />
        <rect x="52" y="20.5" width="3" height="10" fill="#475569" />
      </svg>
    );
  }
  if (index === 2) {
    // M3: Autumn Ridge - Storm/dusk forested ridge
    return (
      <svg viewBox="0 0 72 34" className="w-[66px] h-[32px] rounded-md shrink-0 border border-white/15" aria-hidden="true">
        <defs>
          <linearGradient id="m3Sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c3e58" />
            <stop offset="70%" stopColor="#756978" />
            <stop offset="100%" stopColor="#e6a26c" />
          </linearGradient>
        </defs>
        <rect width="72" height="34" fill="url(#m3Sky)" />
        <circle cx="24" cy="17" r="4.5" fill="#fde68a" opacity="0.85" />
        <path d="M0 22L22 14L44 20L72 11V34H0Z" fill="#3a4c32" />
        <path d="M0 28L12 19L24 26L38 17L56 24L72 19V34H0Z" fill="#23331e" />
      </svg>
    );
  }
  if (index === 3) {
    // M4: Twilight Harbour - Night harbour ships & searchlights
    return (
      <svg viewBox="0 0 72 34" className="w-[66px] h-[32px] rounded-md shrink-0 border border-white/15" aria-hidden="true">
        <defs>
          <linearGradient id="m4Sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#091124" />
            <stop offset="100%" stopColor="#263f6b" />
          </linearGradient>
        </defs>
        <rect width="72" height="34" fill="url(#m4Sky)" />
        <polygon points="18,24 8,0 16,0" fill="#bae6fd" opacity="0.18" />
        <polygon points="56,24 64,0 52,0" fill="#bae6fd" opacity="0.16" />
        <rect x="6" y="13" width="6" height="11" fill="#1e293b" />
        <rect x="14" y="10" width="7" height="14" fill="#334155" />
        <rect x="0" y="23" width="72" height="11" fill="#0b2847" />
        <path d="M32 23L36 18H48L53 23Z" fill="#475569" />
        <rect x="40" y="14" width="4" height="4" fill="#64748b" />
      </svg>
    );
  }
  // M5: Titan Dreadnought - Super-carrier silhouette at sea
  return (
    <svg viewBox="0 0 72 34" className="w-[66px] h-[32px] rounded-md shrink-0 border border-white/15" aria-hidden="true">
      <defs>
        <linearGradient id="m5Sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e1a32" />
          <stop offset="100%" stopColor="#355078" />
        </linearGradient>
      </defs>
      <rect width="72" height="34" fill="url(#m5Sky)" />
      <rect x="0" y="22" width="72" height="12" fill="#0d2f52" />
      <path d="M12 24L16 19H56L61 24Z" fill="#334155" />
      <rect x="26" y="12" width="14" height="7" fill="#475569" />
      <rect x="31" y="7" width="4" height="5" fill="#64748b" />
      <rect x="29" y="14" width="2" height="1.5" fill="#f59e0b" />
      <rect x="35" y="14" width="2" height="1.5" fill="#f59e0b" />
    </svg>
  );
}
