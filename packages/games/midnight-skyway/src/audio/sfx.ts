// 効果音: UI・カウントダウン・エンジン音・ドリフト音・衝突・ゴールなど。すべてWeb Audioで合成する。
import type { AudioEngine } from './engine';

const midiHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  private lastCrash = 0;
  private engine: {
    saw: OscillatorNode; square: OscillatorNode; filter: BiquadFilterNode; gain: GainNode;
    skidSrc: AudioBufferSourceNode; skidFilter: BiquadFilterNode; skidGain: GainNode;
  } | null = null;
  private engineMuted = false;

  constructor(private readonly eng: AudioEngine) {}

  private get ctx(): AudioContext { return this.eng.ctx; }
  private get dest(): AudioNode { return this.eng.sfxBus; }

  /** 短い音程つきの音。freqをfrom→toへ動かしながら鳴らす */
  private tone(type: OscillatorType, from: number, to: number, t: number, dur: number, vol: number, dest: AudioNode = this.dest): void {
    if (!this.eng.running) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, type: BiquadFilterType, from: number, to: number, vol: number, attack = 0.005): void {
    if (!this.eng.running) return;
    const src = this.eng.noiseSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    f.type = type;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.dest);
    src.start(t, this.eng.noiseOffset());
    src.stop(t + dur + 0.02);
  }

  // ---------- メニュー ----------
  public uiMove(): void {
    const t = this.ctx.currentTime;
    this.tone('triangle', 900, 1250, t, 0.06, 0.16);
  }

  public uiConfirm(): void {
    const t = this.ctx.currentTime;
    this.tone('square', midiHz(76), midiHz(76), t, 0.09, 0.09);
    this.tone('square', midiHz(83), midiHz(83), t + 0.07, 0.16, 0.09);
  }

  public uiBack(): void {
    const t = this.ctx.currentTime;
    this.tone('triangle', 900, 560, t, 0.11, 0.16);
  }

  public pause(open: boolean): void {
    const t = this.ctx.currentTime;
    this.tone('triangle', open ? 700 : 1000, open ? 1000 : 700, t, 0.1, 0.16);
  }

  // ---------- レース ----------
  public countdown(step: number | 'GO'): void {
    const t = this.ctx.currentTime;
    if (step === 'GO') {
      for (const n of [79, 83, 86]) this.tone('sawtooth', midiHz(n), midiHz(n), t, 0.7, 0.09);
      this.noiseHit(t, 0.45, 'highpass', 2000, 6000, 0.12);
    } else {
      this.tone('square', 660, 660, t, 0.16, 0.13);
    }
  }

  public gate(): void {
    const t = this.ctx.currentTime;
    this.tone('sine', midiHz(88), midiHz(88), t, 0.09, 0.16);
    this.tone('sine', midiHz(95), midiHz(95), t + 0.07, 0.24, 0.16);
  }

  public sector(): void {
    const t = this.ctx.currentTime;
    [72, 76, 79].forEach((n, i) => this.tone('triangle', midiHz(n), midiHz(n), t + i * 0.08, 0.2, 0.15));
  }

  public warning(): void {
    this.tone('square', 1000, 1000, this.ctx.currentTime, 0.07, 0.1);
  }

  public driftBanked(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.5, 'bandpass', 500, 5000, 0.2, 0.05);
    [79, 84, 88, 91].forEach((n, i) => this.tone('triangle', midiHz(n), midiHz(n), t + i * 0.05, 0.28, 0.13));
  }

  /** 衝突。impact: 0〜1 */
  public crash(impact: number): void {
    const t = this.ctx.currentTime;
    if (t - this.lastCrash < 0.3) return;
    this.lastCrash = t;
    const v = 0.3 + 0.7 * Math.min(1, Math.max(0, impact));
    this.noiseHit(t, 0.28, 'lowpass', 2600, 300, 0.5 * v, 0.002);
    this.tone('sine', 140, 40, t, 0.3, 0.7 * v);
  }

  public goal(): void {
    const t = this.ctx.currentTime;
    const seq: [number, number][] = [[72, 0], [76, 0.11], [79, 0.22], [84, 0.33], [79, 0.5], [84, 0.61], [88, 0.72]];
    for (const [n, dt] of seq) {
      this.tone('square', midiHz(n), midiHz(n), t + dt, 0.28, 0.09);
      this.tone('triangle', midiHz(n - 12), midiHz(n - 12), t + dt, 0.28, 0.14);
    }
    for (const n of [84, 88, 91]) this.tone('sawtooth', midiHz(n), midiHz(n), t + 0.9, 1.3, 0.07);
  }

  public timeUp(): void {
    const t = this.ctx.currentTime;
    [67, 64, 60, 55].forEach((n, i) => this.tone('sawtooth', midiHz(n), midiHz(n) * 0.97, t + i * 0.2, 0.34, 0.11));
  }

  // ---------- エンジン・ドリフト ----------
  public startEngine(): void {
    if (this.engine || !this.eng.running) return;
    const ctx = this.ctx;
    const saw = ctx.createOscillator();
    const square = ctx.createOscillator();
    saw.type = 'sawtooth';
    square.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const sq = ctx.createGain();
    sq.gain.value = 0.35;
    saw.connect(filter);
    square.connect(sq);
    sq.connect(filter);
    filter.connect(gain);
    gain.connect(this.dest);
    saw.start();
    square.start();

    const skidSrc = this.eng.noiseSource(true);
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.Q.value = 4;
    skidFilter.frequency.value = 1800;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(this.dest);
    skidSrc.start();

    this.engine = { saw, square, filter, gain, skidSrc, skidFilter, skidGain };
    this.engineMuted = false;
  }

  /** 毎フレーム呼ぶ: 回転数・速度・ドリフトに合わせて音を変える */
  public updateEngine(rpm: number, speedKmH: number, drifting: boolean): void {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const r = Math.min(1, Math.max(0, (rpm - 850) / 5650));
    const f = 40 + r * 135;
    e.saw.frequency.setTargetAtTime(f, t, 0.05);
    e.square.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.filter.frequency.setTargetAtTime(350 + r * 1500, t, 0.08);
    const vol = this.engineMuted ? 0 : 0.06 + r * 0.1;
    e.gain.gain.setTargetAtTime(vol, t, 0.08);
    const skid = drifting && !this.engineMuted ? 0.12 * Math.min(1, speedKmH / 80) : 0;
    e.skidGain.gain.setTargetAtTime(skid, t, 0.06);
    e.skidFilter.frequency.setTargetAtTime(1500 + speedKmH * 8, t, 0.1);
  }

  /** ポーズ中などにエンジン音とスキール音を止める */
  public setEngineSuspended(suspended: boolean): void {
    this.engineMuted = suspended;
    const e = this.engine;
    if (!e || !suspended) return;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.04);
    e.skidGain.gain.setTargetAtTime(0, t, 0.04);
  }

  public stopEngine(): void {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.skidGain.gain.setTargetAtTime(0, t, 0.05);
    window.setTimeout(() => {
      e.saw.stop();
      e.square.stop();
      e.skidSrc.stop();
      e.gain.disconnect();
      e.skidGain.disconnect();
    }, 400);
  }
}
