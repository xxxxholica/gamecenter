import { createWhiteNoiseBuffer } from '../../../shared/audioUtils';
// Arcade Sound Synthesizer using Web Audio API

class SoundManager {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private pourNoiseNode: AudioNode | null = null;
  private pourGainNode: GainNode | null = null;

  // BGM states
  private isBgmPlaying = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmIntensity = 0; // 0.0 to 1.0 (approaching limit)
  private muted = false;

  init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      this.initialized = true;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1.0, this.ctx.currentTime);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Coin / Game Start
  playStart() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    
    // Dual tone chime
    [987.77, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.12, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.36);
    });
  }

  // Tension beep / countdown tick
  playTick(pitch = 880) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Big Fail Buzzer ("大惨事") - 音量を大幅に抑えて耳障りさを解消
  playFailBuzzer() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Soft low tone clash (ゲインを0.25から0.06へ低減)
    [110, 116.54, 73.4].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.8, now + 0.6);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.7);
    });

    // Sub rumble (ゲインを0.35から0.07へ低減)
    const noise = this.createNoiseBuffer(0.4);
    if (noise) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      noiseSource.start(now);
    }
  }

  // Success Fanfare / Chime
  /** volume: 音量倍率(1.0が標準)。種目ごとに大きさを調整したい時に使う */
  playSuccessChime(scorePercent: number, volume = 1.0) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const baseNotes = scorePercent >= 95 
      ? [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98] 
      : [440, 554.37, 659.25, 880];

    baseNotes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.14 * volume, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.5);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.55);
    });
  }

  // Explosion / Splat
  playExplosion() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const buffer = this.createNoiseBuffer(0.5);
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.5);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      source.start(now);
    }

    // Heavy bass impact
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  // Stage 1: Liquid Pouring Loop
  startPourSound() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain || this.pourNoiseNode) return;
    const now = ctx.currentTime;

    const buffer = this.createNoiseBuffer(2.0);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);

    this.pourNoiseNode = source;
    this.pourGainNode = gain;
  }

  stopPourSound() {
    if (this.pourGainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.pourGainNode.gain.linearRampToValueAtTime(0.001, now + 0.08);
      setTimeout(() => {
        if (this.pourNoiseNode) {
          try {
            (this.pourNoiseNode as AudioBufferSourceNode).stop();
            this.pourNoiseNode.disconnect();
          } catch {
            // ignore
          }
          this.pourNoiseNode = null;
        }
        this.pourGainNode = null;
      }, 100);
    }
  }

  // Mechanical alarm bell ringing - 音量を大幅に低減し(0.18->0.045)、耳障りな超高周波の刺さり感を和らげる
  playBellRing() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [1760, 2093, 2489].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.13);
    });
  }

  // Snap / Mechanical Click (Phone plug-in, clock stop, toaster lever)
  playClick(pitch = 1200) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  // ==========================================
  // Procedural Arcade BGM System
  // ==========================================

  startBgm() {
    if (this.isBgmPlaying) return;
    this.init();
    if (!this.ctx || !this.bgmGain) return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;
    this.bgmIntensity = 0;

    // BPM 136, 16th note step = ~110.3ms
    const stepDuration = (60 / 136) / 4;
    const scheduleNext = () => {
      if (!this.isBgmPlaying) return;
      this.playBgmStep();
      this.bgmStep = (this.bgmStep + 1) % 32;
      this.bgmTimer = window.setTimeout(scheduleNext, stepDuration * 1000);
    };

    scheduleNext();
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  setBgmIntensity(intensity: number) {
    // 0.0 (normal) to 1.0 (limit approaching danger)
    this.bgmIntensity = Math.max(0, Math.min(1, intensity));
  }

  private playBgmStep() {
    if (!this.ctx || !this.bgmGain || this.muted) return;
    const now = this.ctx.currentTime;
    const step16 = this.bgmStep % 16;
    const intensity = this.bgmIntensity;

    // 1. Kick (Beat 1, 2, 3, 4: steps 0, 4, 8, 12 + occasional syncopation on step 14)
    const isKick = step16 === 0 || step16 === 4 || step16 === 8 || step16 === 12 || (step16 === 14 && intensity > 0.5);
    if (isKick) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.08);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.1);
    }

    // 2. Snare / Clap (Beat 2, 4: steps 4, 12)
    if (step16 === 4 || step16 === 12) {
      const noise = this.createNoiseBuffer(0.08);
      if (noise) {
        const source = this.ctx.createBufferSource();
        source.buffer = noise;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(800, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);
        source.start(now);
      }
    }

    // 3. Hi-Hat (Every off-beat, or every 16th if high intensity)
    const isHat = (step16 % 2 === 1) || (intensity > 0.5);
    if (isHat) {
      const noise = this.createNoiseBuffer(0.03);
      if (noise) {
        const source = this.ctx.createBufferSource();
        source.buffer = noise;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6000, now);
        const gain = this.ctx.createGain();
        const hatGain = step16 % 4 === 2 ? 0.12 : 0.06;
        gain.gain.setValueAtTime(hatGain * (1 + intensity * 0.4), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (step16 % 4 === 2 ? 0.05 : 0.025));
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);
        source.start(now);
      }
    }

    // 4. Bassline (Cyber/Arcade rolling synth bass)
    // 32-step bass notes (Hz): D minor / F / G / A progression
    const bassScale = [
      73.42, 73.42, 146.83, 73.42,   // D2, D2, D3, D2
      87.31, 87.31, 146.83, 87.31,   // F2, F2, D3, F2
      98.00, 98.00, 196.00, 98.00,   // G2, G2, G3, G2
      110.0, 98.00, 87.31, 73.42,    // A2, G2, F2, D2
    ];
    const bassNote = bassScale[step16];
    if (bassNote > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassNote, now);

      filter.type = 'lowpass';
      // Cutoff increases with danger intensity
      const baseCutoff = 350 + intensity * 1500;
      filter.frequency.setValueAtTime(baseCutoff, now);
      filter.frequency.exponentialRampToValueAtTime(baseCutoff * 0.5, now + 0.09);
      filter.Q.setValueAtTime(2.5, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.11);
    }

    // 5. Arpeggio / High Pulse Tension (activates when tension rises)
    if (intensity > 0.35 && (step16 % 2 === 0)) {
      const arpNotes = [587.33, 698.46, 880.00, 1046.50]; // D5, F5, A5, C6
      const arpNote = arpNotes[(this.bgmStep / 2) % arpNotes.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(arpNote, now);
      gain.gain.setValueAtTime(0.04 * (intensity - 0.3) * 2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.065);
    }
  }

  private createNoiseBuffer(duration: number): AudioBuffer | null {
    if (!this.ctx) return null;
    return createWhiteNoiseBuffer(this.ctx, duration);
  }
}

export const sound = new SoundManager();
