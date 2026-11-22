import type { AirframeType } from './types';

/**
 * 100% Procedural Web Audio API military synth & adaptive synthwave BGM engine.
 * Zero external MP3/WAV dependencies; uses a master DynamicsCompressorNode.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private rotorLfo: OscillatorNode | null = null;
  private rotorLfoGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private active = false;
  private bgmStep = 0;
  private bgmTimer: number | null = null;
  private lastVulcanTime = 0;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.14;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.52;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.22;

      this.bgmGain.connect(this.masterGain);
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      this.createNoiseBuffer();
      this.initEngineLoop();
    }

    if (this.ctx && (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')) {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Pink-ish noise for warm turbine roar
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.14) * 0.9));
    }
    this.noiseBuffer = buf;
  }

  private initEngineLoop(): void {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'bandpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.Q.value = 0.9;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    // Subtle LFO for gunship rotor chop modulation
    this.rotorLfo = this.ctx.createOscillator();
    this.rotorLfo.type = 'sine';
    this.rotorLfo.frequency.value = 13.5;

    this.rotorLfoGain = this.ctx.createGain();
    this.rotorLfoGain.gain.value = 0;

    this.rotorLfo.connect(this.rotorLfoGain);
    this.rotorLfoGain.connect(this.engineGain.gain);

    src.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    src.start();
    this.rotorLfo.start();
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.52, this.ctx.currentTime, 0.03);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setFlightActive(isActive: boolean): void {
    this.active = isActive;
    if (!isActive) {
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
      this.stopBgm();
    } else {
      this.unlock();
      this.startBgm();
    }
  }

  public updateEngine(speedNorm: number, boosting: boolean, airframe: AirframeType): void {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.rotorLfoGain || !this.active) return;
    const t = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1.5, speedNorm));
    if (airframe === 'jet') {
      const targetFreq = 220 + clamped * 440 + (boosting ? 280 : 0);
      const targetGain = 0.045 + clamped * 0.04 + (boosting ? 0.055 : 0);
      this.engineFilter.frequency.setTargetAtTime(targetFreq, t, 0.06);
      this.engineGain.gain.setTargetAtTime(targetGain, t, 0.06);
      this.rotorLfoGain.gain.setTargetAtTime(0, t, 0.06);
    } else {
      const targetFreq = 125 + clamped * 95;
      const targetGain = 0.075 + clamped * 0.02;
      this.engineFilter.frequency.setTargetAtTime(targetFreq, t, 0.06);
      this.engineGain.gain.setTargetAtTime(targetGain, t, 0.06);
      this.rotorLfoGain.gain.setTargetAtTime(0.038, t, 0.06);
    }
  }

  private startBgm(): void {
    if (this.bgmTimer !== null || !this.ctx) return;
    // 4-bar heroic retro synthwave progression (D minor -> Bb -> C -> A)
    const bassRoots = [73.42, 73.42, 58.27, 58.27, 65.41, 65.41, 55.0, 65.41];
    const arpOffsets = [1, 1.5, 2, 1.5, 2.378, 2, 1.5, 1.25];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain || !this.active || this.muted || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const barIdx = Math.floor(this.bgmStep / 8) % bassRoots.length;
      const stepInBar = this.bgmStep % 8;
      const root = bassRoots[barIdx];

      // Driving 8th-note synthwave bass
      const bass = this.ctx.createOscillator();
      const bFilter = this.ctx.createBiquadFilter();
      const bEnv = this.ctx.createGain();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(root * (stepInBar % 2 === 0 ? 1 : 2), t);
      bFilter.type = 'lowpass';
      bFilter.frequency.setValueAtTime(520, t);
      bFilter.frequency.exponentialRampToValueAtTime(140, t + 0.14);
      bEnv.gain.setValueAtTime(0.24, t);
      bEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      bass.connect(bFilter);
      bFilter.connect(bEnv);
      bEnv.connect(this.bgmGain);
      bass.start(t);
      bass.stop(t + 0.17);

      // Tactical arpeggio pulse on alternating steps
      if (stepInBar % 2 === 0) {
        const arp = this.ctx.createOscillator();
        const aEnv = this.ctx.createGain();
        arp.type = 'triangle';
        const mult = arpOffsets[stepInBar % arpOffsets.length];
        arp.frequency.setValueAtTime(root * 4 * mult, t);
        aEnv.gain.setValueAtTime(0.09, t);
        aEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        arp.connect(aEnv);
        aEnv.connect(this.bgmGain);
        arp.start(t);
        arp.stop(t + 0.15);
      }

      this.bgmStep = (this.bgmStep + 1) % 64;
    }, 185);
  }

  private stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private duckBgm(): void {
    if (!this.ctx || !this.bgmGain) return;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setValueAtTime(0.07, t);
    this.bgmGain.gain.linearRampToValueAtTime(0.22, t + 0.35);
  }

  public playVulcan(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastVulcanTime < 0.065) return;
    this.lastVulcanTime = now;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    const pitchVar = 0.92 + Math.random() * 0.16;
    osc.frequency.setValueAtTime(240 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.055);
    env.gain.setValueAtTime(0.11, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playMissile(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.32);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.24, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.35);
  }

  public playBombDrop(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);
    env.gain.setValueAtTime(0.12, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playHitmarker(combo = 0): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 980 + Math.min(combo, 8) * 90;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.045);
    env.gain.setValueAtTime(0.14, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playExplosion(heavy = false): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    if (heavy) this.duckBgm();

    // Sub-thump punch
    const sub = this.ctx.createOscillator();
    const subEnv = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(heavy ? 115 : 95, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + (heavy ? 0.55 : 0.32));
    subEnv.gain.setValueAtTime(heavy ? 0.42 : 0.26, now);
    subEnv.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.58 : 0.34));
    sub.connect(subEnv);
    subEnv.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + (heavy ? 0.6 : 0.36));

    // Noise blast
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(heavy ? 900 : 750, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + (heavy ? 0.65 : 0.38));
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(heavy ? 0.35 : 0.22, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.68 : 0.4));
    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);
    src.start(now);
    src.stop(now + (heavy ? 0.7 : 0.42));
  }

  public playLockBeep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1520, now);
    env.gain.setValueAtTime(0.075, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playFlare(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(620 + i * 140, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.05);
      env.gain.setValueAtTime(0.11, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  public playSwap(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
    env.gain.setValueAtTime(0.13, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playUltimate(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [293.66, 440, 587.33, 880];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      env.gain.setValueAtTime(0.12, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  public playSamWarning(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1120, now);
    osc.frequency.setValueAtTime(840, now + 0.07);
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playDamage(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.22);
    env.gain.setValueAtTime(0.28, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playVictory(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + i * 0.11;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, t);
      env.gain.setValueAtTime(0.18, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public dispose(): void {
    this.stopBgm();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
