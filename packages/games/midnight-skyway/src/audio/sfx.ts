// 効果音: UI・カウントダウン・エンジン音・ドリフト音・衝突・ゴールなど。すべてWeb Audioで合成する。
import type { AudioEngine } from './engine';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける

const midiHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  private lastCrash = 0;
  private engine: {
    saw: OscillatorNode; square: OscillatorNode; filter: BiquadFilterNode; gain: GainNode;
    skidSrc: AudioBufferSourceNode; skidFilter: BiquadFilterNode; skidGain: GainNode;
    windSrc: AudioBufferSourceNode; windFilter: BiquadFilterNode; windGain: GainNode;
  } | null = null;
  private engineMuted = false;
  private rainLoop: { src: AudioBufferSourceNode; low: AudioBufferSourceNode; gain: GainNode } | null = null;

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

  /** 視点の切り替え。front: 前方の視点へ(上がる音) / back: 戻る(下がる音) / cycle: 三人称⇔運転席(2音) */
  public cameraSwitch(kind: 'front' | 'back' | 'cycle'): void {
    const t = this.ctx.currentTime;
    if (kind === 'cycle') {
      this.tone('square', 760, 760, t, 0.04, 0.09);
      this.tone('square', 1140, 1140, t + 0.045, 0.07, 0.09);
      return;
    }
    const up = kind === 'front';
    this.noiseHit(t, 0.12, 'bandpass', up ? 1400 : 4200, up ? 4200 : 1400, 0.14, 0.004);
    this.tone('triangle', up ? 620 : 940, up ? 940 : 620, t, 0.09, 0.12);
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

  /** 走行中の車の脇をかすめた時の風切り音 */
  public nearMiss(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.3, 'bandpass', 4200, 700, 0.14, 0.04);
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

  /** ゴールの瞬間(スローモーションに入る): 低い衝撃と、吸い込まれるような余韻 */
  public finishImpact(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.7, 'lowpass', 5200, 180, 0.55, 0.002);
    this.tone('sine', 110, 32, t, 0.9, 0.8);
    this.tone('triangle', 880, 220, t + 0.02, 0.6, 0.06);
  }

  /** タイムの数字が画面中央に打ち込まれる音 */
  public stamp(): void {
    const t = this.ctx.currentTime;
    this.tone('sine', 190, 70, t, 0.2, 0.55);
    this.noiseHit(t, 0.12, 'bandpass', 2400, 900, 0.3, 0.001);
  }

  /** ランキング入り(リザルトに順位が出る) */
  public rankIn(): void {
    const t = this.ctx.currentTime;
    [84, 88, 91, 96].forEach((n, i) => this.tone('triangle', midiHz(n), midiHz(n), t + i * 0.07, 0.4, 0.1));
  }

  public timeUp(): void {
    const t = this.ctx.currentTime;
    [67, 64, 60, 55].forEach((n, i) => this.tone('sawtooth', midiHz(n), midiHz(n) * 0.97, t + i * 0.2, 0.34, 0.11));
  }

  // ---------- 雨 ----------
  /** 雨音を鳴らし続ける(高域のさあっという音と、低域の遠い雨音の2層) */
  public startRain(): void {
    if (this.rainLoop || !this.eng.running) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.018, ctx.currentTime, 0.8);
    const src = this.eng.noiseSource(true);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 5200;
    bp.gain.value = 5;
    src.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    const low = this.eng.noiseSource(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.9;
    low.connect(lp);
    lp.connect(lowGain);
    lowGain.connect(gain);
    gain.connect(this.dest);
    src.start(0, this.eng.noiseOffset());
    low.start(0, this.eng.noiseOffset());
    this.rainLoop = { src, low, gain };
  }

  public stopRain(): void {
    const r = this.rainLoop;
    if (!r) return;
    this.rainLoop = null;
    r.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    window.setTimeout(() => { r.src.stop(); r.low.stop(); r.gain.disconnect(); }, 1500);
  }

  /** 遠雷 */
  public thunder(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 2.6, 'lowpass', 420, 70, 0.5, 0.25);
    this.noiseHit(t + 0.35, 1.8, 'lowpass', 240, 60, 0.35, 0.4);
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

    // 風切り音: 速いほど大きく、高くなる
    const windSrc = this.eng.noiseSource(true);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    windFilter.frequency.value = 500;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.dest);
    windSrc.start(0, this.eng.noiseOffset());

    this.engine = { saw, square, filter, gain, skidSrc, skidFilter, skidGain, windSrc, windFilter, windGain };
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

  /** 毎フレーム呼ぶ: 速度(0〜1)とブースト(0〜1)に合わせた風切り音 */
  public setWind(speed: number, boost: number): void {
    const e = this.engine;
    if (!e || this.engineMuted) return;
    const t = this.ctx.currentTime;
    const k = Math.pow(Math.min(1, Math.max(0, speed)), 2.2);
    e.windGain.gain.setTargetAtTime(0.005 + k * 0.04 + boost * 0.02, t, 0.1);
    e.windFilter.frequency.setTargetAtTime(380 + k * 1800 + boost * 700, t, 0.1);
  }

  /** 路肩の反射板(約32mごと)が脇を通り過ぎる音: 小さく短い「ヒュッ」。速いほど高く強い */
  public whoosh(speed: number): void {
    const k = Math.min(1, Math.max(0, speed));
    if (k < 0.25) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.16, 'bandpass', 1500 + k * 2200, 500, 0.008 + k * 0.02, 0.015);
  }

  /** 車とすれ違う音: 近いほど、相対速度が大きいほど強い。音程が下がる(ドップラー) */
  public passBy(relSpeed: number, closeness: number): void {
    const k = Math.min(1, Math.max(0, relSpeed / 60));
    const c = Math.min(1, Math.max(0, closeness));
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.42, 'bandpass', 2600 + k * 1600, 380, (0.02 + 0.055 * k) * (0.4 + 0.6 * c), 0.03);
    this.tone('sawtooth', 220 + k * 120, 90, t, 0.4, 0.012 * c);
  }

  /** ブースト開始: 吸気の音が高まり、低い衝撃が入る */
  public boostStart(): void {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.7, 'bandpass', 400, 4200, 0.08, 0.08);
    this.tone('sine', 120, 38, t, 0.45, 0.09);
    this.tone('sawtooth', 180, 520, t, 0.5, 0.02);
  }

  /** ブースト終了・アクセルを戻した時の、マフラーからの破裂音 */
  public backfire(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.noiseHit(t + i * 0.07 + audioRandom() * 0.03, 0.09, 'bandpass', 900 + audioRandom() * 600, 300, 0.06, 0.003);
    }
    this.tone('square', 150, 60, t, 0.1, 0.02);
  }

  /** ポーズ中などにエンジン音とスキール音を止める */
  public setEngineSuspended(suspended: boolean): void {
    this.engineMuted = suspended;
    const e = this.engine;
    if (!e || !suspended) return;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.04);
    e.skidGain.gain.setTargetAtTime(0, t, 0.04);
    e.windGain.gain.setTargetAtTime(0, t, 0.04);
  }

  // ---------- 対戦相手のエンジン音(距離で小さく、左右に振る) ----------
  private remoteEngines = new Map<number, { saw: OscillatorNode; square: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode }>();

  /**
   * 相手の車のエンジン音を毎フレーム更新する(なければ作る)。speedKmH: 相手の速度、dist: 自車からの距離(m)、
   * pan: 自車から見て左(-1)〜右(1)。遠い相手は無音にして止める。
   */
  public updateRemoteEngine(id: number, speedKmH: number, dist: number, pan: number): void {
    if (!this.eng.running) return;
    const MAX_DIST = 90;
    let e = this.remoteEngines.get(id);
    if (dist > MAX_DIST) {
      if (e) this.removeRemoteEngine(id);
      return;
    }
    const ctx = this.ctx;
    if (!e) {
      const saw = ctx.createOscillator();
      const square = ctx.createOscillator();
      saw.type = 'sawtooth';
      square.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2;
      const sq = ctx.createGain();
      sq.gain.value = 0.35;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pannerNode = ctx.createStereoPanner();
      saw.connect(filter);
      square.connect(sq);
      sq.connect(filter);
      filter.connect(gain);
      gain.connect(pannerNode);
      pannerNode.connect(this.dest);
      saw.start();
      square.start();
      e = { saw, square, filter, gain, pan: pannerNode };
      this.remoteEngines.set(id, e);
    }
    const t = ctx.currentTime;
    // 速度から、自車と同じ形で回転数を推定する(アイドリング〜全開)
    const r = Math.min(1, Math.max(0, speedKmH / 220));
    const f = 40 + r * 135;
    e.saw.frequency.setTargetAtTime(f, t, 0.05);
    e.square.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.filter.frequency.setTargetAtTime(350 + r * 1500, t, 0.08);
    const near = 1 - dist / MAX_DIST;
    const vol = this.engineMuted ? 0 : (0.05 + r * 0.09) * near * near;
    e.gain.gain.setTargetAtTime(vol, t, 0.08);
    e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
  }

  public removeRemoteEngine(id: number): void {
    const e = this.remoteEngines.get(id);
    if (!e) return;
    this.remoteEngines.delete(id);
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.saw.stop(t + 0.4);
    e.square.stop(t + 0.4);
  }

  public stopRemoteEngines(): void {
    for (const id of [...this.remoteEngines.keys()]) this.removeRemoteEngine(id);
  }

  public stopEngine(): void {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.skidGain.gain.setTargetAtTime(0, t, 0.05);
    e.windGain.gain.setTargetAtTime(0, t, 0.05);
    window.setTimeout(() => {
      e.windSrc.stop();
      e.windGain.disconnect();
      e.saw.stop();
      e.square.stop();
      e.skidSrc.stop();
      e.gain.disconnect();
      e.skidGain.disconnect();
    }, 400);
  }
}
