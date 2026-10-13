/**
 * Procedural Web Audio API sound synthesizer for arcade festival cork shooting.
 * 100% self-contained, zero external sound files.
 * Includes studio-grade master brickwall limiter, visibility-aware muting,
 * and concurrency throttling to eliminate any explosive audio spikes when switching screens.
 */

class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;
  private isMuted: boolean = false;
  private lastSoundTimes: { [key: string]: number } = {};
  private hasAttachedLifecycle: boolean = false;

  public init() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Brickwall Limiter to prevent clipping and volume spikes
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.limiter.knee.setValueAtTime(6, this.ctx.currentTime);
      this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
      this.limiter.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.limiter.release.setValueAtTime(0.12, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.65;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.28;
      this.bgmGain.connect(this.masterGain);

      // Audio Chain: Sound Nodes -> MasterGain -> Limiter -> Destination
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
    }

    if (!this.hasAttachedLifecycle) {
      this.hasAttachedLifecycle = true;

      // Unlock and resume Web Audio immediately on ANY user gesture
      const unlockAndResume = () => {
        this.ensureAudioActive();
      };

      ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach((evt) => {
        window.addEventListener(evt, unlockAndResume, { passive: true });
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pauseAll();
        } else {
          this.resumeAll();
        }
      });

      window.addEventListener('blur', () => {
        if (document.hidden) {
          this.pauseAll();
        }
      });

      window.addEventListener('focus', () => {
        this.resumeAll();
      });
    }

    if (this.ctx.state === 'suspended' && !document.hidden) {
      this.ctx.resume().catch(() => {});
    }
  }

  // Ensure audio is unmuted, active, and resumed whenever document is visible
  public ensureAudioActive() {
    if (document.hidden) return;
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.isMuted = false;
    if (this.masterGain && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(t);
        this.masterGain.gain.setValueAtTime(0.65, t);
      } catch (_) {
        this.masterGain.gain.value = 0.65;
      }
    }
  }

  // Mute audio synthesis when screen is hidden to prevent sound accumulation
  public pauseAll() {
    this.isMuted = true;
    if (this.masterGain && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(t);
        this.masterGain.gain.setValueAtTime(0, t);
      } catch (_) {}
    }
  }

  // Smoothly restore audio after returning to the screen
  public resumeAll() {
    if (!this.ctx) {
      this.init();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    // Flush throttle timers so return sounds don't stack
    const now = performance.now();
    for (const k of Object.keys(this.lastSoundTimes)) {
      this.lastSoundTimes[k] = now;
    }

    this.ensureAudioActive();
  }

  // Prevent multiple identical sounds from stacking and multiplying volume in a single frame
  private shouldThrottle(key: string, intervalMs: number): boolean {
    const now = performance.now();
    const last = this.lastSoundTimes[key] || 0;
    if (now - last < intervalMs) {
      return true;
    }
    this.lastSoundTimes[key] = now;
    return false;
  }

  // Cork rifle pop: "ポンッ"
  public playShoot(isExplosive = false) {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('shoot', 35)) return;

    const t = this.ctx.currentTime;

    if (isExplosive) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.18);
      return;
    }

    // High pressure air pop (noise burst)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.035);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1400, t);
    noiseFilter.Q.setValueAtTime(2.2, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);

    // Resonant barrel thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.07);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.55, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.10);
  }

  // Explosion sound for explosive bullets: "ドカーン"
  public playExplosion() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('explosion', 70)) return;

    const t = this.ctx.currentTime;

    // Sub-bass thump
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.45);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.65, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.6);

    // Fiery noise blast
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.40);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.38);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.58, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);

    // Crackle debris
    const crackle = this.ctx.createOscillator();
    crackle.type = 'sawtooth';
    crackle.frequency.setValueAtTime(280, t);
    crackle.frequency.linearRampToValueAtTime(60, t + 0.22);

    const crackleGain = this.ctx.createGain();
    crackleGain.gain.setValueAtTime(0.28, t);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

    crackle.connect(crackleGain);
    crackleGain.connect(this.masterGain);
    crackle.start(t);
    crackle.stop(t + 0.28);
  }

  // Combo chime: rises in pitch with combo count
  public playCombo(combo: number) {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const baseFreq = 440;
    const noteStep = Math.min(14, combo);
    const freq = baseFreq * Math.pow(2, noteStep / 12);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, t + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // Automatic prize restock sound
  public playRestock() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('restock', 50)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // Time extend fanfare
  public playTimeExtend() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('timeExtend', 80)) return;

    const t = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + idx * 0.05);

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.setValueAtTime(0.22, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22 + idx * 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + idx * 0.05);
      osc.stop(t + 0.25 + idx * 0.05);
    });
  }

  // Hit sound: wood ("コンッ") or metal ("カンッ")
  public playHit(isMetal = false, strength = 1.0) {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('hit', 25)) return;

    const t = this.ctx.currentTime;
    const intensity = Math.min(1.0, Math.max(0.25, strength));

    if (isMetal) {
      const freqs = [620, 1140, 1850];
      freqs.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime((0.25 / (idx + 1)) * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16 + idx * 0.06);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.55 * intensity, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.10);
    }
  }

  // Wobble creak / balance tension sound
  public playWobble() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('wobble', 45)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.linearRampToValueAtTime(220, t + 0.05);
    osc.frequency.linearRampToValueAtTime(140, t + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(550, t);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Prize falling off the shelf
  public playTopple(points: number) {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('topple', 40)) return;

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.28);

    if (points >= 1000) {
      this.playGrandPrizeFanfare();
    } else {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const noteOsc = this.ctx!.createOscillator();
        noteOsc.type = 'triangle';
        noteOsc.frequency.setValueAtTime(freq, t + 0.06 + idx * 0.06);

        const noteGain = this.ctx!.createGain();
        noteGain.gain.setValueAtTime(0.0, t);
        noteGain.gain.setValueAtTime(0.18, t + 0.06 + idx * 0.06);
        noteGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + idx * 0.06);

        noteOsc.connect(noteGain);
        noteGain.connect(this.masterGain!);
        noteOsc.start(t + 0.06 + idx * 0.06);
        noteOsc.stop(t + 0.30 + idx * 0.06);
      });
    }
  }

  // Grand prize toppled fanfare
  public playGrandPrizeFanfare() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('fanfare', 150)) return;

    const t = this.ctx.currentTime;
    const gongFreqs = [110, 220, 330];
    gongFreqs.forEach((f) => {
      const gong = this.ctx!.createOscillator();
      gong.type = 'sine';
      gong.frequency.setValueAtTime(f, t);
      const gGain = this.ctx!.createGain();
      gGain.gain.setValueAtTime(0.25, t);
      gGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      gong.connect(gGain);
      gGain.connect(this.masterGain!);
      gong.start(t);
      gong.stop(t + 1.5);
    });

    const fanfareNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    fanfareNotes.forEach((freq, idx) => {
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t + 0.12 + idx * 0.07);

      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.setValueAtTime(0.22, t + 0.12 + idx * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45 + idx * 0.07);

      o.connect(g);
      g.connect(this.masterGain!);
      o.start(t + 0.12 + idx * 0.07);
      o.stop(t + 0.5 + idx * 0.07);
    });
  }

  // Taiko Drum Beat: "ドン"
  public playTaiko() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('taiko', 80)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.28);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.68, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);

    const rim = this.ctx.createOscillator();
    rim.type = 'triangle';
    rim.frequency.setValueAtTime(580, t);
    rim.frequency.exponentialRampToValueAtTime(180, t + 0.04);

    const rimGain = this.ctx.createGain();
    rimGain.gain.setValueAtTime(0.32, t);
    rimGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    rim.connect(rimGain);
    rimGain.connect(this.masterGain);

    osc.start(t);
    rim.start(t);
    osc.stop(t + 0.42);
    rim.stop(t + 0.06);
  }

  // Countdown warning tick
  public playTick() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('tick', 60)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.04);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Balloon pop sound
  public playBalloonPop() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('balloon', 30)) return;

    const t = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.045);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.40, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Duck quack sound
  public playDuckQuack() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('duck', 30)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.linearRampToValueAtTime(320, t + 0.06);
    osc.frequency.linearRampToValueAtTime(380, t + 0.12);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, t);
    filter.Q.setValueAtTime(3.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // UFO hit sci-fi warble crash
  public playUFOHit() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.linearRampToValueAtTime(200, t + 0.35);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(28, t);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(150, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.45);
    osc.stop(t + 0.45);
  }

  // Time-up buzzer
  public playTimeUp() {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.5);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.42, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  // Clatter thud for prize falling onto results pile
  public playPrizePileDrop(pitchMod = 1.0) {
    if (this.isMuted || document.hidden) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.shouldThrottle('pileDrop', 30)) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const baseFreq = (220 + Math.random() * 60) * pitchMod;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.35, t + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.11);

    // Subtle wooden rattle tap
    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(750 * pitchMod, t);
    clickOsc.frequency.exponentialRampToValueAtTime(280, t + 0.035);
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.18, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(t);
    clickOsc.stop(t + 0.045);
  }

  // ==========================================
  // 祭囃子 (Matsuri Bayashi) Procedural BGM
  // ==========================================

  public startBgm() {
    if (this.isBgmPlaying) return;
    this.ensureAudioActive();
    if (!this.ctx || !this.bgmGain) return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // BPM 132, 16th note step = ~113.6ms
    const stepInterval = (60 / 132) / 4;

    const schedule = () => {
      if (!this.isBgmPlaying) return;
      this.playFestivalStep();
      this.bgmStep = (this.bgmStep + 1) % 64; // 4-bar phrase loop
      this.bgmTimer = window.setTimeout(schedule, stepInterval * 1000);
    };

    schedule();
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playFestivalStep() {
    if (!this.ctx || !this.bgmGain || this.isMuted || document.hidden) return;
    const t = this.ctx.currentTime;
    const step = this.bgmStep;
    const stepInBar = step % 16;

    // 1. 和太鼓 (Taiko Drums)
    // ドン (Low Taiko: steps 0, 3, 6, 8, 10, 14 etc.)
    const isDon = stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 10 || (stepInBar === 14 && step % 32 === 30);
    if (isDon) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.09);
      gain.gain.setValueAtTime(0.42, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(t);
      osc.stop(t + 0.13);
    }

    // カッ (Rim / Edge: steps 4, 12)
    const isKa = stepInBar === 4 || stepInBar === 12;
    if (isKa) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.04);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(t);
      osc.stop(t + 0.055);
    }

    // 2. 鉦 / チャンチキ (Atarigane: 16th notes syncopation)
    // チャン・チキ・チン・チキ
    const isKane = (step % 2 === 1) || (stepInBar === 0) || (stepInBar === 8);
    if (isKane) {
      const isAccent = stepInBar === 0 || stepInBar === 8;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(2637, t); // E7
      osc2.frequency.setValueAtTime(3520, t); // A7
      gain.gain.setValueAtTime(isAccent ? 0.09 : 0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isAccent ? 0.06 : 0.035));
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.bgmGain);
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.07);
      osc2.stop(t + 0.07);
    }

    // 3. 篠笛 (Shinobue Flute melody in Japanese pentatonic scale)
    // D4=293.66, F4=349.23, G4=392.00, A4=440.00, C5=523.25, D5=587.33, F5=698.46, A5=880.00
    const D4 = 293.66, F4 = 349.23, G4 = 392.00, A4 = 440.00, C5 = 523.25, D5 = 587.33, F5 = 698.46;
    const melody64 = [
      // Bar 1
      D5, 0, D5, F5,  G5(F5), 0, D5, 0,  F5, 0, G4, 0,  A4, 0, C5, 0,
      // Bar 2
      D5, 0, C5, 0,  A4, G4, F4, 0,  G4, 0, A4, 0,  D4, 0, 0, 0,
      // Bar 3
      F5, 0, F5, G4,  A4, 0, C5, 0,  D5, 0, F5, 0,  D5, 0, C5, 0,
      // Bar 4
      A4, 0, G4, F4,  D4, 0, F4, G4,  A4, 0, F4, 0,  D4, 0, 0, 0
    ];

    function G5(f: number) { return f; } // helper
    const noteFreq = melody64[step];
    if (noteFreq && noteFreq > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Warm pure flute tone
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, t);

      // Subtle vibrato
      const vibrato = this.ctx.createOscillator();
      const vibGain = this.ctx.createGain();
      vibrato.frequency.setValueAtTime(5.5, t);
      vibGain.gain.setValueAtTime(4.0, t);
      vibrato.connect(osc.frequency);
      vibrato.start(t);
      vibrato.stop(t + 0.22);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, t);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + 0.22);
    }
  }
}

export const sounds = new SoundSystem();
