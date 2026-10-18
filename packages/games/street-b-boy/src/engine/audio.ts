import { createWhiteNoiseBuffer } from '../../../../shared/audioUtils';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける

const midiToHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** 天国の曲: 8小節(1小節=16ステップ)でループする。ハ長調で、C → G → Am → F → C → G → F → G と昇っていく */
const HEAVEN_LOOP_STEPS = 128;
const HEAVEN_CHORDS: { bass: number; pad: number[] }[] = [
  { bass: 36, pad: [55, 60, 64, 67] },   // C
  { bass: 31, pad: [50, 55, 59, 62] },   // G
  { bass: 33, pad: [52, 57, 60, 64] },   // Am
  { bass: 29, pad: [53, 57, 60, 65] },   // F
  { bass: 36, pad: [55, 60, 64, 67] },   // C
  { bass: 31, pad: [50, 55, 59, 62] },   // G
  { bass: 29, pad: [53, 57, 60, 65] },   // F
  { bass: 31, pad: [50, 55, 59, 62] },   // G
];
/** コーラスの旋律: [開始ステップ, MIDIノート, 長さ(16分音符の数)] */
const HEAVEN_MELODY: [number, number, number][] = [
  [0, 79, 8], [8, 76, 4], [12, 79, 4],
  [16, 74, 8], [24, 79, 4], [28, 83, 4],
  [32, 81, 8], [40, 79, 4], [44, 76, 4],
  [48, 77, 8], [56, 81, 4], [60, 84, 4],
  [64, 84, 8], [72, 83, 4], [76, 79, 4],
  [80, 79, 6], [86, 81, 2], [88, 83, 8],
  [96, 81, 8], [104, 79, 4], [108, 77, 4],
  [112, 74, 8], [120, 79, 4], [124, 83, 4],
];

export class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isBgmPlaying: boolean = false;
  private isGoldMode: boolean = false;
  /** BGMの種類。street=ブーンバップ / heaven=コーラスとハープの天国の曲(FINAL STAGE) */
  private bgmStyle: 'street' | 'heaven' = 'street';
  /** 天国の曲の音を通す出力(ドライ+リバーブ)。最初に使うときに作る */
  private heavenBus: GainNode | null = null;

  private stepIndex: number = 0;
  private nextNoteTime: number = 0;
  private tempo: number = 96; // 96 BPM classic 90s Boom-Bap
  private baseTempo: number = 96;
  private timerId: number | null = null;

  // Sound synthesis noise buffer for snares & scratches
  private noiseBuffer: AudioBuffer | null = null;
  private lastLaserWarningTime: number = 0;
  private lastGeyserTime: number = 0;

  constructor() {
    // AudioContext is initialized on first user gesture
  }

  public init(): void {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    this.noiseBuffer = createWhiteNoiseBuffer(this.ctx, 2);
  }

  public startBgm(): void {
    this.init();
    if (this.isBgmPlaying) return;
    this.isBgmPlaying = true;
    this.stepIndex = 0;
    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.scheduleLoop();
    }
  }

  public stopBgm(): void {
    this.isBgmPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public setGoldMode(active: boolean): void {
    this.isGoldMode = active;
    this.tempo = active ? this.baseTempo * 1.5 : this.baseTempo; // Fast frantic tempo during invincibility!
  }

  /** ステージごとのBGMテンポ(BPM)を設定する */
  public setBaseTempo(bpm: number): void {
    this.baseTempo = bpm;
    this.tempo = this.isGoldMode ? bpm * 1.5 : bpm;
  }

  /** BGMの種類を切り替える。次の startBgm から有効 */
  public setBgmStyle(style: 'street' | 'heaven'): void {
    this.bgmStyle = style;
  }

  private scheduleLoop = (): void => {
    if (!this.isBgmPlaying || !this.ctx) return;

    const secondsPer16th = (60 / this.tempo) / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.stepIndex, this.nextNoteTime);
      this.stepIndex = (this.stepIndex + 1) % (this.bgmStyle === 'heaven' ? HEAVEN_LOOP_STEPS : 32); // street: 2 bars of 16 steps / heaven: 8 bars
      this.nextNoteTime += secondsPer16th;
    }

    this.timerId = window.setTimeout(this.scheduleLoop, 35);
  };

  private playStep(step: number, time: number): void {
    if (!this.ctx || this.isMuted) return;
    if (this.bgmStyle === 'heaven') {
      this.playHeavenStep(step, time);
      return;
    }

    // Classic Boom-Bap / Breakbeat pattern
    // Kick on steps 0, 8, 10, 24, 26
    const kickSteps = [0, 8, 10, 18, 24, 26];
    if (kickSteps.includes(step)) {
      this.triggerKick(time);
    }

    // Snare on 4, 12, 20, 28 (the 2 and 4 beats)
    const snareSteps = [4, 12, 20, 28];
    if (snareSteps.includes(step)) {
      this.triggerSnare(time);
    }

    // Hi-Hats every even 16th with swing / accent
    if (step % 2 === 0) {
      const openHat = (step === 6 || step === 22);
      this.triggerHat(time, openHat);
    }

    // Turntable Scratch sound on occasional groove steps
    if (step === 14 || step === 30) {
      this.triggerScratch(time);
    }

    // Funky Sub-Bassline (Key: F Minor / Eb / Db hip-hop groove)
    // F1=43.65Hz, Ab1=51.91Hz, Bb1=58.27Hz, C2=65.41Hz, Eb1=38.89Hz
    const bassline: Record<number, number> = {
      0: 43.65, // F
      3: 43.65,
      6: 51.91, // Ab
      8: 58.27, // Bb
      12: 58.27,
      14: 65.41, // C
      16: 38.89, // Eb
      19: 38.89,
      22: 43.65, // F
      24: 51.91, // Ab
      28: 43.65
    };

    if (bassline[step]) {
      const baseFreq = bassline[step];
      const freq = this.isGoldMode ? baseFreq * 1.5 : baseFreq;
      this.triggerBass(time, freq);
    }

    // Synth Lead / Stabs for Gold mode or Title
    if (this.isGoldMode) {
      // Frantic high arpeggio
      const goldMelody = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50, 783.99];
      const pitch = goldMelody[step % goldMelody.length];
      this.triggerLead(time, pitch);
    } else if (step === 0 || step === 16) {
      // Warm chord stab
      this.triggerChords(time, step === 0 ? [174.61, 207.65, 261.63] : [155.56, 196.00, 233.08]);
    }
  }

  // --- HEAVEN BGM (FINAL STAGE): コーラスとハープの、天に昇るような曲 ---

  /** 天国の曲の出力を作る: 音量を整え、そのまま(ドライ)と長い残響(リバーブ)の両方へ送る */
  private getHeavenBus(): GainNode {
    if (this.heavenBus || !this.ctx) return this.heavenBus as GainNode;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.7;

    // 残響: 減衰するノイズから作った約3秒のインパルス応答(大聖堂のような響き)
    const seconds = 3.0;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (audioRandom() * 2 - 1) * Math.pow(1 - i / length, 2.4);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;

    bus.connect(ctx.destination);
    bus.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);
    this.heavenBus = bus;
    return bus;
  }

  private playHeavenStep(step: number, time: number): void {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chord = HEAVEN_CHORDS[bar];
    const gold = this.isGoldMode;

    // 1. コーラスの和音: 小節のはじめに、全員で長く伸ばして歌う
    if (inBar === 0) {
      const dur = (60 / this.tempo) * 4 * 0.98;
      chord.pad.forEach((m, i) => this.triggerChoirVoice(time, midiToHz(m), dur, 0.05, i * 0.012));
    }

    // 2. コーラスの旋律(高い声で、和音の上を歌う)
    for (const [start, midi, len] of HEAVEN_MELODY) {
      if (start === step) {
        const dur = (60 / this.tempo / 4) * len * 0.96;
        this.triggerChoirVoice(time, midiToHz(midi), dur, 0.075, 0);
        this.triggerChoirVoice(time, midiToHz(midi - 12), dur, 0.035, 0.01);
      }
    }

    // 3. ハープのアルペジオ: 8分音符ごとに、和音の音を上り下りする
    if (inBar % 2 === 0) {
      const tones = [chord.pad[0], chord.pad[1], chord.pad[2], chord.pad[3], chord.pad[1] + 12];
      const order = [0, 1, 2, 3, 4, 3, 2, 1];
      const note = tones[order[(inBar / 2) % order.length]] + 12;
      this.triggerHarp(time, midiToHz(note), gold ? 0.2 : 0.16);
    }

    // 4. 深い低音と、やわらかいティンパニ(拍の頭を支える)
    if (inBar === 0 || inBar === 8) {
      this.triggerHeavenBass(time, midiToHz(chord.bass), (60 / this.tempo) * 2 * 0.95);
    }
    if (inBar % 4 === 0) {
      this.triggerTimpani(time, inBar === 0 ? 0.42 : 0.26);
    }

    // 5. 鈴の輝き(2小節ごとの頭に、高い鐘が鳴る)と、ささやかなタンバリン
    if (step % 32 === 0) {
      this.triggerBell(time, midiToHz(HEAVEN_MELODY[0][1] + 24), 0.06);
      this.triggerBell(time + 0.09, midiToHz(HEAVEN_MELODY[0][1] + 28), 0.04);
    }
    if (inBar % 4 === 2) {
      this.triggerShimmer(time, 0.06);
    }
  }

  /** 「あー」と歌うコーラスの1声: 2本の少しずれたのこぎり波を、母音(a)のフォルマントで響かせ、ゆるいビブラートをかける */
  private triggerChoirVoice(time: number, freq: number, dur: number, volume: number, delay: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.getHeavenBus();
    const start = time + delay;
    const end = start + dur;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(volume, start + Math.min(0.35, dur * 0.4));   // ゆっくり立ち上がる
    env.gain.setValueAtTime(volume, Math.max(start + 0.4, end - 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.45);                     // 長い余韻
    env.connect(out);

    // 母音「あ」のフォルマント(口の共鳴): 700 / 1100 / 2500 Hz
    const formants: [number, number, number][] = [[700, 5, 1.0], [1100, 6, 0.55], [2500, 8, 0.25]];
    const sum = ctx.createGain();
    for (const [hz, q, g] of formants) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = hz;
      f.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = g;
      sum.connect(f);
      f.connect(fg);
      fg.connect(env);
    }

    // ビブラート(5.4Hz、ごく浅く)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.4;
    lfoGain.gain.value = 9;   // cent
    lfo.connect(lfoGain);

    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      lfoGain.connect(osc.detune);
      osc.connect(sum);
      osc.start(start);
      osc.stop(end + 0.5);
    }
    lfo.start(start);
    lfo.stop(end + 0.5);
  }

  /** ハープの1音: 正弦波に倍音をひとつ重ね、はじいたあとすぐ減衰する */
  private triggerHarp(time: number, freq: number, volume: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.getHeavenBus();
    for (const [mult, g] of [[1, 1], [2, 0.35]] as [number, number][]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult === 1 ? 'triangle' : 'sine';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(volume * g, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 1.15);
    }
  }

  /** 低音: やわらかい正弦波(重く響かせすぎない) */
  private triggerHeavenBass(time: number, freq: number, dur: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.32, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  /** ティンパニ: 低い太鼓。拍の頭を支えて、追われている緊張感を保つ */
  private triggerTimpani(time: number, volume: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.getHeavenBus();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(58, time + 0.18);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    osc.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  /** 鐘: 高い正弦波の倍音を重ねて、長く響かせる */
  private triggerBell(time: number, freq: number, volume: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.getHeavenBus();
    for (const [mult, g] of [[1, 1], [2.76, 0.4], [5.4, 0.18]] as [number, number][]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(volume * g, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 2.3);
    }
  }

  /** きらめき(タンバリンのような、短く細かい高音) */
  private triggerShimmer(time: number, volume: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getHeavenBus());
    noise.start(time);
    noise.stop(time + 0.08);
  }

  // --- INSTRUMENT SYNTHESIS ---

  private triggerKick(time: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.12);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  private triggerSnare(time: number): void {
    if (!this.ctx || !this.noiseBuffer) return;

    // Noise component
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // Body tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);

    oscGain.gain.setValueAtTime(0.3, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + 0.18);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  private triggerHat(time: number, open: boolean): void {
    if (!this.ctx || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(9000, time);
    filter.Q.setValueAtTime(3.0, time);

    const gain = this.ctx.createGain();
    const duration = open ? 0.18 : 0.04;
    gain.gain.setValueAtTime(open ? 0.25 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + duration);
  }

  private triggerBass(time: number, freq: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, time);
    filter.frequency.exponentialRampToValueAtTime(120, time + 0.2);

    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  private triggerLead(time: number, freq: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.1);
  }

  private triggerChords(time: number, freqs: number[]): void {
    if (!this.ctx) return;
    freqs.forEach((f) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);

      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.5);
    });
  }

  private triggerScratch(time: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.frequency.linearRampToValueAtTime(2800, time + 0.06);
    filter.frequency.linearRampToValueAtTime(800, time + 0.12);
    filter.Q.setValueAtTime(5.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + 0.14);
  }

  // --- SOUND EFFECTS (SFX) ---

  public playJump(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playStomp(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playSpin(): void {
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    filter.Q.setValueAtTime(4.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.3);
  }

  public playSmash(): void {
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.25);
  }

  public playCoin(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Dual retro ping
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(987.77 * 1.5, now);
    osc2.frequency.setValueAtTime(1318.51 * 1.5, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  }

  public playPowerup(): void {
    this.init();
    if (!this.ctx) return;
    const notes = [330, 392, 493, 587, 659, 784, 987];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  public playHurt(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** 時間切れSE: 耳障りにならないよう柔らかく控えめな音量で鳴らすレトロ警告トーン */
  public playTimeUp(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(250, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.35);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playClear(): void {
    this.init();
    if (!this.ctx) return;
    const chordSeq = [
      { freqs: [261.63, 329.63, 392.00], duration: 0.15 },
      { freqs: [293.66, 369.99, 440.00], duration: 0.15 },
      { freqs: [329.63, 415.30, 493.88], duration: 0.15 },
      { freqs: [392.00, 493.88, 587.33], duration: 0.4 },
      { freqs: [523.25, 659.25, 783.99, 1046.50], duration: 1.2 }
    ];

    let t = this.ctx.currentTime;
    chordSeq.forEach((chord) => {
      chord.freqs.forEach((freq) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + chord.duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + chord.duration);
      });
      t += chord.duration;
    });
  }

  public playGrind(): void {
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.Q.setValueAtTime(6.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.12);
  }

  public playSubwoofer(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);

    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playGeyser(): void {
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGeyserTime < 0.35) return;
    this.lastGeyserTime = now;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(1100, now + 0.12);
    filter.frequency.linearRampToValueAtTime(550, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.35);
  }

  public playLaserWarning(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLaserWarningTime < 0.6) return;
    this.lastLaserWarningTime = now;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playShoot(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playDeflect(): void {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(2400, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }
}
