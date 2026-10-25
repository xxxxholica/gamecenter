import { createWhiteNoiseBuffer } from '../../../../shared/audioUtils';
/**
 * Procedural EDM BGM Synthesizer using Web Audio API
 * High-energy 160 BPM Electro-Pop / Arcade EDM generator
 * Dynamically switches between Normal, Boss, Climax (Last 1 Min), and Victory modes.
 */
export type BgmTrack = 'NORMAL' | 'BOSS' | 'CLIMAX' | 'VICTORY' | 'NONE';

export class SynthBgm {
  private ctx: AudioContext;
  private bgmGain: GainNode;
  private isPlaying: boolean = false;
  private currentTrack: BgmTrack = 'NONE';
  private snareBuffer: AudioBuffer;
  private hiHatBuffer: AudioBuffer;

  // Music sequencer state
  private bpm: number = 160;
  private currentStep: number = 0;
  private nextStepTime: number = 0;
  private scheduleAheadTime: number = 0.15; // seconds

  // Musical scales (MIDI note frequencies)
  // F minor pentatonic / cyber electro scale: F3, Ab3, Bb3, C4, Eb4, F4, G4, Ab4, Bb4, C5
  private readonly notesFm = [
    174.61, // F3 (0)
    207.65, // Ab3 (1)
    233.08, // Bb3 (2)
    261.63, // C4 (3)
    311.13, // Eb4 (4)
    349.23, // F4 (5)
    392.00, // G4 (6)
    415.30, // Ab4 (7)
    466.16, // Bb4 (8)
    523.25, // C5 (9)
    622.25, // Eb5 (10)
    698.46, // F5 (11)
  ];

  // Boss scale: D minor / Phrygian aggressive
  private readonly notesDm = [
    146.83, // D3
    155.56, // Eb3
    174.61, // F3
    196.00, // G3
    220.00, // A3
    233.08, // Bb3
    261.63, // C4
    293.66, // D4
    349.23, // F4
    440.00, // A4
  ];

  constructor(ctx: AudioContext, bgmGain: GainNode) {
    this.ctx = ctx;
    this.bgmGain = bgmGain;
    this.snareBuffer = createWhiteNoiseBuffer(ctx, 0.1, (_t, p) => Math.exp(-p / 0.3));
    this.hiHatBuffer = createWhiteNoiseBuffer(ctx, 0.04, (_t, p) => Math.exp(-p / 0.2));
  }

  start(track: BgmTrack = 'NORMAL') {
    if (track === this.currentTrack && this.isPlaying) return;
    this.stop();
    this.isPlaying = true;
    this.currentTrack = track;
    this.currentStep = 0;
    this.bpm = track === 'CLIMAX' ? 175 : track === 'BOSS' ? 165 : 160;
    this.nextStepTime = this.ctx.currentTime + 0.05;

    // 25ms の setInterval にすると、Windows の Chrome で他の setTimeout の起きる時刻が最大 16ms 揺れて入力遅延が跳ねるため、毎フレームの tick() で先読み予約する
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    this.currentTrack = 'NONE';
  }

  setTrack(track: BgmTrack) {
    if (this.currentTrack === track) return;
    if (track === 'NONE') {
      this.stop();
    } else {
      this.start(track);
    }
  }

  /** 毎フレーム呼ぶ。少し先(scheduleAheadTime = 150ms)までノートを予約する */
  tick() {
    if (!this.isPlaying) return;
    if (this.nextStepTime < this.ctx.currentTime) {
      this.nextStepTime = this.ctx.currentTime + 0.05;
    }
    this.scheduler();
  }

  private scheduler() {
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPer16th = secondsPerBeat * 0.25;
    this.nextStepTime += secondsPer16th;
    this.currentStep = (this.currentStep + 1) % 64; // 4-bar loop (16 steps * 4)
  }

  private scheduleStep(step: number, time: number) {
    if (this.currentTrack === 'VICTORY') {
      this.playVictoryStep(step, time);
      return;
    }

    const isBoss = this.currentTrack === 'BOSS';
    const isClimax = this.currentTrack === 'CLIMAX';

    // 1. Kick Drum (Strong punchy 4-on-the-floor EDM kick)
    // Plays on beats 0, 4, 8, 12 in every measure
    const beat16 = step % 16;
    const isKick = beat16 === 0 || beat16 === 4 || beat16 === 8 || beat16 === 12;
    const isBuildUp = isClimax && (step >= 48);

    if (isKick || (isBuildUp && step % 2 === 0)) {
      this.triggerKick(time, isClimax ? 1.2 : 1.0);
    }

    // 2. Offbeat Hi-hat & Snare
    // Snare on 4 and 12 (beat 2 and 4)
    if (beat16 === 4 || beat16 === 12) {
      this.triggerSnare(time, isBoss ? 0.9 : 0.7);
    }
    // Hi-hat on every off-beat 16th
    if (beat16 % 2 === 1 || isClimax) {
      this.triggerHiHat(time, beat16 % 4 === 2 ? 0.25 : 0.12);
    }

    // 3. Bassline
    if (isBoss) {
      this.triggerBossBass(step, time);
    } else {
      this.triggerEdmBass(step, time, isClimax);
    }

    // 4. Lead Arpeggio & Melodic Hook
    if (isBoss) {
      this.triggerBossLead(step, time);
    } else {
      this.triggerEdmLead(step, time, isClimax);
    }
  }

  // --- Drum Elements ---
  private triggerKick(time: number, power: number = 1.0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    gain.gain.setValueAtTime(0.35 * power, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + 0.14);
  }

  private triggerSnare(time: number, vol: number = 0.6) {
    // Noise snap
    const buffer = this.snareBuffer;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18 * vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    noise.start(time);

    // Body tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.06);
    oscGain.gain.setValueAtTime(0.15 * vol, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private triggerHiHat(time: number, vol: number = 0.15) {
    const buffer = this.hiHatBuffer;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    noise.start(time);
  }

  // --- Synth Basslines ---
  private triggerEdmBass(step: number, time: number, isClimax: boolean) {
    // Rolling 16th-note sub bass (Fm progression: F -> Ab -> Bb -> C)
    const bar = Math.floor(step / 16);
    const rootNotes = [174.61, 207.65, 233.08, 174.61]; // F3, Ab3, Bb3, F3
    const baseFreq = rootNotes[bar % 4] * 0.5; // F2 range

    // Pulsing rhythm
    const beat16 = step % 16;
    if (beat16 % 2 === 0 || isClimax) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = isClimax ? 'sawtooth' : 'sawtooth';
      const octJump = beat16 % 4 === 2 ? 1.5 : 1.0;
      osc.frequency.setValueAtTime(baseFreq * octJump, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isClimax ? 1200 : 700, time);
      filter.frequency.exponentialRampToValueAtTime(200, time + 0.09);

      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + 0.09);
    }
  }

  private triggerBossBass(step: number, time: number) {
    // Heavy detuned saw bass
    const bar = Math.floor(step / 16);
    const rootNotes = [146.83, 146.83, 155.56, 174.61]; // D, D, Eb, F
    const freq = rootNotes[bar % 4] * 0.5;

    const beat16 = step % 16;
    if (beat16 === 0 || beat16 === 3 || beat16 === 6 || beat16 === 10 || beat16 === 12) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, time);
      filter.frequency.exponentialRampToValueAtTime(300, time + 0.12);

      gain.gain.setValueAtTime(0.28, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + 0.12);
    }
  }

  // --- Lead Synths & Arpeggios ---
  private triggerEdmLead(step: number, time: number, isClimax: boolean) {
    // 16th-note bright electro arpeggio pattern
    const arpPattern = [0, 3, 5, 7, 9, 7, 5, 3, 0, 5, 7, 11, 9, 7, 5, 3];
    const noteIdx = arpPattern[step % 16];
    const freq = this.notesFm[noteIdx % this.notesFm.length];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    const dur = 0.07;
    gain.gain.setValueAtTime(isClimax ? 0.09 : 0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + dur);
  }

  private triggerBossLead(step: number, time: number) {
    // Urgent alarm melody
    const beat = step % 16;
    if (beat === 0 || beat === 2 || beat === 4 || beat === 7 || beat === 11 || beat === 14) {
      const bossPattern = [0, 2, 4, 7, 5, 3];
      const noteIdx = bossPattern[(step % 6)];
      const freq = this.notesDm[noteIdx] * 2;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(time);
      osc.stop(time + 0.1);
    }
  }

  private playVictoryStep(step: number, time: number) {
    // 8-step celebratory fanfare
    const fanfareNotes = [
      523.25, 523.25, 523.25, 659.25, 783.99, 1046.5, 0, 1318.51
    ];
    if (step < fanfareNotes.length) {
      const freq = fanfareNotes[step];
      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(time);
        osc.stop(time + 0.35);
      }
    }
  }
}
