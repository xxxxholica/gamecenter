// ============================================================
// Web Audio API Synthesized Arcade Sound Engine
// Zero external assets needed, pure retro arcade sound effects
// ============================================================

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  public init(): void {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Coin / Credit sound
  public playCoin(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1975.53, now + 0.08); // B6

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  }

  // Game Start Jingle
  public playStartJingle(): void {
    if (!this.ctx || !this.masterGain) return;
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.08;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // Multiplier / Credit INCREASE (Positive Gate)
  public playCreditUp(isSuper: boolean = false): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const chords = isSuper ? [523.25, 659.25, 783.99, 1046.50, 1318.51] : [587.33, 739.99, 880.00, 1174.66];

    chords.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.05;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  // Credit DECREASE (Negative Gate)
  public playCreditDown(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Harsh buzzer
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.35);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.4);

    // Noise burst
    this.playNoise(0.25, 0.3);
  }

  // Noise generator helper (for explosions, hits, screams)
  private playNoise(duration: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  // Obstacle crash sound
  public playObstacleCrash(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);

    this.playNoise(0.15, 0.35);
  }

  // Formation shift sound
  public playFormationShift(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Boss Warning Siren
  public playBossAlarm(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.25);
    osc.frequency.linearRampToValueAtTime(400, now + 0.5);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.55);
  }

  // Rocket Launch (Shoot Student at Boss)
  public playShootRocket(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Catapult / Flight Launch Sound
  public playCatapultLaunch(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Sub thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.6);

    // Whistle whoosh
    const whoosh = this.ctx.createOscillator();
    const wGain = this.ctx.createGain();
    whoosh.type = 'triangle';
    whoosh.frequency.setValueAtTime(250, now);
    whoosh.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
    wGain.gain.setValueAtTime(0.4, now);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    whoosh.connect(wGain);
    wGain.connect(this.masterGain);
    whoosh.start(now);
    whoosh.stop(now + 0.45);

    this.playNoise(0.5, 0.6);
  }

  // Body Bounce Sound
  public playBounce(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Multiplier Line Crossing Ping
  public playMultiplierDing(pitchFreq: number = 880): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchFreq, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Boss Wall Impact
  public playWallImpact(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.18);

    this.playNoise(0.12, 0.4);
  }

  // Boss Wall Destroyed (Epic Explosion)
  public playWallBreak(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Sub-bass thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(25, now + 1.2);
    subGain.gain.setValueAtTime(0.8, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 1.2);

    // Big explosion noise
    this.playNoise(1.5, 0.7);
  }

  // Clear Fanfare (卒業確定)
  public playVictoryFanfare(): void {
    if (!this.ctx || !this.masterGain) return;
    // Triumphant arcade fanfare notes
    const melody = [
      { f: 523.25, t: 0.0, d: 0.15 }, // C5
      { f: 523.25, t: 0.15, d: 0.15 },
      { f: 523.25, t: 0.3, d: 0.15 },
      { f: 659.25, t: 0.45, d: 0.3 },  // E5
      { f: 783.99, t: 0.75, d: 0.2 },  // G5
      { f: 659.25, t: 0.95, d: 0.15 }, // E5
      { f: 1046.50, t: 1.1, d: 0.8 },  // C6
    ];

    melody.forEach(m => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + m.t;

      osc.type = 'square';
      osc.frequency.setValueAtTime(m.f, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + m.d);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + m.d);
    });
  }

  // Game Over Sad Jingle (留年決定)
  public playGameOverJingle(): void {
    if (!this.ctx || !this.masterGain) return;
    const melody = [
      { f: 440.00, t: 0.0, d: 0.3 }, // A4
      { f: 415.30, t: 0.3, d: 0.3 }, // G#4
      { f: 392.00, t: 0.6, d: 0.3 }, // G4
      { f: 369.99, t: 0.9, d: 0.8 }, // F#4 (dissonant despair)
    ];

    melody.forEach(m => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + m.t;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(m.f, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + m.d);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + m.d);
    });
  }

  // Procedural Arcade Running BGM
  private bgmInterval: number | null = null;
  private bgmStep: number = 0;
  private bgmGain: GainNode | null = null;

  public startRunningBgm(): void {
    this.stopBgm();
    if (!this.ctx || !this.masterGain) return;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    this.bgmStep = 0;
    // 165 BPM (16th notes = ~91ms) High-speed arcade bass riff
    const baseFreqs = [110, 110, 130.81, 110, 146.83, 110, 164.81, 146.83];

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      const note = baseFreqs[this.bgmStep % baseFreqs.length];
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(note, t);

      // Bass envelope
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(g);
      g.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + 0.08);

      // Hi-hat noise on every other 16th note
      if (this.bgmStep % 2 === 1) {
        this.playHiHat(t);
      }

      this.bgmStep++;
    }, 91);
  }

  // Boss Battle Fast Urgency BGM
  public startBossBgm(): void {
    this.stopBgm();
    if (!this.ctx || !this.masterGain) return;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    this.bgmStep = 0;
    // 170 BPM (16th notes = ~88ms) intense D-minor alarm bass
    const bossFreqs = [146.83, 155.56, 146.83, 174.61, 146.83, 196.00, 174.61, 155.56];

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      const note = bossFreqs[this.bgmStep % bossFreqs.length];
      osc.type = 'square';
      osc.frequency.setValueAtTime(note, t);

      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(g);
      g.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + 0.08);

      if (this.bgmStep % 2 === 0) {
        this.playHiHat(t);
      }

      this.bgmStep++;
    }, 88);
  }

  private playHiHat(t: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(3500, t);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.connect(g);
    g.connect(this.bgmGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  public stopBgm(): void {
    if (this.bgmInterval !== null) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

export const sound = new SoundEngine();

