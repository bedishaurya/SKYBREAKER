import React, { useState } from 'react';
import { MISSIONS, PILOTS, getPilotById } from '../game/config';
import type { CameraMode, RunSummary, WeatherMood } from '../game/types';

interface PauseModalProps {
  missionLabel: string;
  cameraMode: CameraMode;
  weatherMood: WeatherMood;
  touchMode: 'auto' | 'on' | 'off';
  onCycleTouchMode: () => void;
  onResume: () => void;
  onRestart: () => void;
  onHangar: () => void;
  onCycleCamera: () => void;
  onCycleWeather: () => void;
  onOpenHelp: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  missionLabel,
  cameraMode,
  weatherMood,
  touchMode,
  onCycleTouchMode,
  onResume,
  onRestart,
  onHangar,
  onCycleCamera,
  onCycleWeather,
  onOpenHelp,
}) => {
  const camLabel = cameraMode === 'chase' ? 'Chase' : cameraMode === 'topdown' ? 'Top' : 'FPV';
  const weatherLabel =
    weatherMood === 'sunset' ? 'Sunset' : weatherMood === 'storm' ? 'Storm' : 'Night';
  const touchLabel = touchMode === 'auto' ? 'Auto' : touchMode === 'on' ? 'On' : 'Off';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#05080f]/78 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        className="w-full max-w-sm border border-white/16 bg-[#090d14] p-6 text-center shadow-2xl aero-cut"
      >
        <div className="text-[11px] font-mono-num text-[#ff7847] tracking-widest uppercase">
          {missionLabel}
        </div>
        <h2 id="pause-title" className="font-display text-2xl font-extrabold tracking-wider text-white mt-1.5">
          Flight Paused
        </h2>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={onCycleCamera}
            className="px-2 py-2 border border-white/12 bg-[#0f1522] hover:border-[#ff7847]/60 hover:bg-[#172033] text-slate-200 text-[11px] font-mono-num cursor-pointer transition-colors"
          >
            <div className="text-[9px] text-slate-400">CAMERA [C]</div>
            <div className="font-bold text-white mt-0.5">{camLabel}</div>
          </button>
          <button
            type="button"
            onClick={onCycleWeather}
            className="px-2 py-2 border border-white/12 bg-[#0f1522] hover:border-[#ff7847]/60 hover:bg-[#172033] text-slate-200 text-[11px] font-mono-num cursor-pointer transition-colors"
          >
            <div className="text-[9px] text-slate-400">WEATHER [N]</div>
            <div className="font-bold text-white mt-0.5">{weatherLabel}</div>
          </button>
          <button
            type="button"
            onClick={onCycleTouchMode}
            className="px-2 py-2 border border-white/12 bg-[#0f1522] hover:border-[#ff7847]/60 hover:bg-[#172033] text-slate-200 text-[11px] font-mono-num cursor-pointer transition-colors"
          >
            <div className="text-[9px] text-slate-400">TOUCH HUD</div>
            <div className="font-bold text-[#38bdf8] mt-0.5">{touchLabel}</div>
          </button>
          <button
            type="button"
            onClick={onOpenHelp}
            className="px-2 py-2 border border-white/12 bg-[#0f1522] hover:border-[#ff7847]/60 hover:bg-[#172033] text-slate-200 text-[11px] font-mono-num cursor-pointer transition-colors"
          >
            <div className="text-[9px] text-slate-400">MANUAL</div>
            <div className="font-bold text-[#ff7847] mt-0.5">Controls [?]</div>
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-[#ff5a1f] hover:bg-[#ff733d] text-white font-display font-bold text-sm tracking-wider uppercase cursor-pointer aero-cut-sm"
          >
            Resume Flight
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 border border-white/16 bg-[#111827] hover:bg-[#1a2438] text-slate-100 font-semibold text-sm tracking-wide cursor-pointer"
          >
            Restart Sortie
          </button>
          <button
            type="button"
            onClick={onHangar}
            className="w-full py-2.5 border border-white/10 bg-[#0b101a] hover:bg-[#131b2c] text-slate-300 font-semibold text-sm tracking-wide cursor-pointer"
          >
            Return to Hangar
          </button>
        </div>
      </div>
    </div>
  );
};

interface DebriefModalProps {
  summary: RunSummary;
  onReplay: () => void;
  onNextMission: () => void;
  onHangar: () => void;
}

export const DebriefModal: React.FC<DebriefModalProps> = ({
  summary,
  onReplay,
  onNextMission,
  onHangar,
}) => {
  const pilot = getPilotById(summary.pilotId);
  const hasNextMission =
    summary.victory && summary.mode === 'campaign' && summary.missionIndex < MISSIONS.length - 1;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#05080f]/78 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="debrief-title"
        className={`w-full max-w-md border bg-[#090d14] p-6 shadow-2xl aero-cut ${
          summary.victory ? 'border-[#ff5a1f]/80' : 'border-rose-500/80'
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3.5">
            <img
              src={pilot.portraitUrl}
              alt={pilot.callsign}
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-cover pixelated border border-white/20"
            />
            <div>
              <div className="text-[11px] font-mono-num text-slate-400">
                {summary.missionCode} · {summary.missionTitle}
              </div>
              <h2
                id="debrief-title"
                className={`font-display text-xl font-extrabold tracking-wider mt-0.5 ${
                  summary.victory ? 'text-white' : 'text-rose-400'
                }`}
              >
                {summary.victory ? 'Mission Clear' : 'Aircraft Down'}
              </h2>
            </div>
          </div>

          <div className="text-center border border-white/14 bg-[#0e1420] px-3.5 py-1.5 aero-cut-sm">
            <div className="text-[9px] font-mono-num text-slate-400">RANK</div>
            <div className="font-display text-2xl font-extrabold text-[#ff7847] leading-none mt-0.5">
              {summary.rank}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 my-5 font-mono-num">
          <MetricTile label="SCORE" value={String(summary.score)} sub={`BEST ${summary.bestScore}`} />
          <MetricTile
            label="OBJECTIVES"
            value={summary.targetsTotal > 0 ? `${summary.targetsDestroyed}/${summary.targetsTotal}` : `${summary.banditsSplashed}`}
            sub={`${summary.banditsSplashed} BANDITS`}
          />
          <MetricTile
            label="TIME"
            value={`${Math.floor(summary.elapsedSec / 60)}:${String(summary.elapsedSec % 60).padStart(2, '0')}`}
            sub={`ACC ${summary.accuracyPct}%`}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          {hasNextMission ? (
            <button
              type="button"
              data-start="true"
              onClick={onNextMission}
              className="flex-1 py-2.5 bg-[#ff5a1f] hover:bg-[#ff733d] text-white font-display font-bold text-xs sm:text-sm tracking-wider uppercase cursor-pointer aero-cut-sm"
            >
              Next Mission
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onReplay}
              className="flex-1 py-2.5 bg-[#ff5a1f] hover:bg-[#ff733d] text-white font-display font-bold text-xs sm:text-sm tracking-wider uppercase cursor-pointer aero-cut-sm"
            >
              {summary.victory ? 'Play Again' : 'Try Again'}
            </button>
          )}
          <button
            type="button"
            onClick={onHangar}
            className="px-5 py-2.5 border border-white/16 bg-[#111827] hover:bg-[#1a2438] text-slate-100 font-semibold text-xs sm:text-sm tracking-wide cursor-pointer"
          >
            Hangar
          </button>
        </div>
      </div>
    </div>
  );
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-white/10 bg-[#0d131f] p-2.5 text-center">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-base font-bold text-white mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const [tab, setTab] = useState<'controls' | 'pilots'>('controls');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#05080f]/78 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="w-full max-w-xl border border-white/16 bg-[#090d14] shadow-2xl overflow-hidden aero-cut"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#0d131f]">
          <h2 id="help-title" className="font-display text-base font-extrabold tracking-wider text-white">
            Flight Manual
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold border border-white/16 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="flex border-b border-white/10 bg-[#0b101a]">
          <button
            type="button"
            onClick={() => setTab('controls')}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide cursor-pointer transition-colors ${
              tab === 'controls'
                ? 'bg-[#141d2e] text-white border-b-2 border-[#ff5a1f]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Flight &amp; Combat Controls
          </button>
          <button
            type="button"
            onClick={() => setTab('pilots')}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide cursor-pointer transition-colors ${
              tab === 'pilots'
                ? 'bg-[#141d2e] text-white border-b-2 border-[#ff5a1f]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Squadron &amp; Ultimates
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto text-xs text-slate-200 space-y-2.5">
          {tab === 'controls' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono-num">
                <ControlRow keys="W / S / ↑ / ↓" desc="Pitch aircraft up or down" />
                <ControlRow keys="A / D / ← / →" desc="Bank & turn (double-tap for Barrel Roll)" />
                <ControlRow keys="LMB / Space" desc="Fire twin Vulcan cannons" />
                <ControlRow keys="RMB / E" desc="Tap Homing Missile · Hold for 4× Multi-Lock" />
                <ControlRow keys="B" desc="Drop CCIP ground/naval bomb" />
                <ControlRow keys="Shift" desc="Afterburner Boost" />
                <ControlRow keys="Z / Ctrl" desc="High-G Drift (Jet) / Lateral Strafe (Gunship)" />
                <ControlRow keys="F / R" desc="Deploy Decoy Flares / Evasive Barrel Roll" />
                <ControlRow keys="U / Q" desc="Trigger Pilot Signature Ultimate at 100%" />
                <ControlRow keys="X / C / N" desc="Swap Jet↔Gunship · Camera · Weather Mood" />
              </div>
              <div className="border-t border-white/10 pt-2.5">
                <div className="text-[10px] font-display font-bold tracking-wider text-[#38bdf8] uppercase mb-2">
                  Mobile Touch Controls
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono-num">
                  <ControlRow keys="Left Stick" desc="360° analog flight stick for pitch & bank steering" />
                  <ControlRow keys="FIRE / AB" desc="Hold FIRE for Vulcan cannons · Hold AB for Afterburner" />
                  <ControlRow keys="MSL" desc="Tap Homing Missile · Hold to paint 4× Multi-Lock" />
                  <ControlRow keys="BOMB / FLR / ROLL / ULT / SWAP" desc="Drop bombs, flares, barrel roll, ultimate & airframe swap" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {PILOTS.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 border border-white/10 bg-[#0d131f]">
                  <img
                    src={p.portraitUrl}
                    alt={p.callsign}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 object-cover pixelated border border-white/20 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[#ff7847]">
                      {p.callsign} <span className="font-ui text-slate-300 font-normal">· {p.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      <strong className="text-white">{p.ultimateLabel}:</strong> {p.ultimateDesc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function ControlRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="p-2.5 border border-white/10 bg-[#0d131f]">
      <div className="font-bold text-[#ff7847]">{keys}</div>
      <div className="text-[11px] text-slate-300 mt-0.5 font-ui">{desc}</div>
    </div>
  );
}
