// ===========================================================
//  サウンド（Web Audio API で全て合成）
// ===========================================================

import { createWhiteNoiseBuffer } from '../../../shared/audioUtils';
import { audioRandom } from '../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private bgmBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private bgmOn = false;
  private nextNote = 0;
  private step = 0;
  tempo = 112;

  /** ユーザー操作のタイミングで呼ぶ */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = 0.32;
    this.bgmBus.connect(this.master);
    this.noiseBuf = createWhiteNoiseBuffer(this.ctx, 1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, bus?: GainNode) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, audioRandom() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** 爆弾の爆発：ドンという低音と、破片が飛ぶバリバリという音 */
  explosion() {
    this.noise(0.7, 0.8, 800, 0.7, 0, 'lowpass');
    this.noise(0.3, 0.45, 2600, 0.8);
    this.noise(0.5, 0.25, 5200, 0.6, 0.04, 'highpass');
    this.tone(160, 0.55, 'sawtooth', 0.26, 36);
    this.tone(78, 0.8, 'sine', 0.5, 24);
  }

  /** プレイヤーが力尽きたときの大爆発：重い低音が長く尾を引き、あとから破片が降る */
  bigExplosion() {
    this.noise(1.3, 1, 600, 0.6, 0, 'lowpass');
    this.noise(0.5, 0.6, 2200, 0.8);
    this.noise(0.9, 0.35, 4800, 0.6, 0.05, 'highpass');
    this.tone(120, 1.0, 'sawtooth', 0.34, 28);
    this.tone(58, 1.5, 'sine', 0.65, 18);
    this.noise(0.8, 0.3, 300, 0.7, 0.35, 'lowpass');
    for (let i = 0; i < 8; i++) this.tone(1400 + audioRandom() * 1800, 0.08, 'square', 0.04, 500, 0.3 + audioRandom() * 0.9);
  }

  /** メニューの選択移動 */
  menuMove() {
    this.tone(420, 0.04, 'square', 0.04);
  }

  /** メニューの決定 */
  menuSelect() {
    this.tone(660, 0.07, 'square', 0.06);
    this.tone(990, 0.1, 'square', 0.05, undefined, 0.06);
  }

  dig(hard: boolean) {
    if (hard) {
      this.tone(220, 0.08, 'square', 0.12, 140);
      this.noise(0.07, 0.35, 2400, 2);
    } else {
      this.noise(0.06, 0.3, 1200, 1.2);
      this.tone(160, 0.06, 'triangle', 0.2, 90);
    }
  }

  brk(count: number) {
    const n = Math.min(count, 12);
    this.noise(0.18 + n * 0.015, 0.45, 700, 0.8);
    this.tone(320, 0.12, 'triangle', 0.22, 120);
    if (count >= 4) this.tone(520, 0.18, 'sine', 0.12, 880, 0.04);
  }

  pop(chain: number) {
    const base = 440 * Math.pow(1.122, Math.min(chain, 10));
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * Math.pow(2, s / 12), 0.16, 'square', 0.08, undefined, i * 0.05));
    this.noise(0.25, 0.25, 3000, 0.7);
  }

  /** 黒曜石を叩いたときの金属音 */
  clank() {
    this.tone(1760, 0.22, 'square', 0.06, 1400);
    this.tone(2637, 0.3, 'sine', 0.08, 2200);
    this.tone(180, 0.08, 'triangle', 0.15, 120);
    this.noise(0.05, 0.3, 4000, 3);
  }

  /** ハートを取ったとき（1UP） */
  oneUp() {
    [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.14, 'square', 0.07, undefined, i * 0.06));
    this.tone(1320, 0.4, 'sine', 0.1, undefined, 0.36);
  }

  capsule() {
    [0, 5, 9, 14].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.12, 'sine', 0.16, undefined, i * 0.045));
    this.noise(0.3, 0.1, 6000, 0.5, 0, 'highpass');
  }

  land(size: number) {
    this.noise(0.22, Math.min(0.15 + size * 0.04, 0.5), 180, 0.9, 0, 'lowpass');
    this.tone(90, 0.18, 'sine', 0.25, 45);
  }

  playerLand() {
    this.tone(120, 0.07, 'sine', 0.12, 70);
  }

  shake() {
    this.noise(0.12, 0.08, 400, 3);
  }

  crush() {
    this.noise(0.6, 0.7, 260, 0.6, 0, 'lowpass');
    this.tone(200, 0.6, 'sawtooth', 0.25, 40);
  }

  suffocate() {
    [0, -3, -6, -12].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.25, 'triangle', 0.18, undefined, i * 0.18));
  }

  warn() {
    this.tone(880, 0.09, 'square', 0.07);
    this.tone(660, 0.09, 'square', 0.07, undefined, 0.11);
  }

  layer() {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.22, 'square', 0.07, undefined, i * 0.07));
  }

  gameOver() {
    [12, 7, 3, 0, -5].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.35, 'triangle', 0.18, undefined, i * 0.2));
  }

  clear() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), i === seq.length - 1 ? 0.9 : 0.16, 'square', 0.09, undefined, i * 0.11));
    [0, 4, 7].forEach((n) => this.tone(262 * Math.pow(2, n / 12), 1.2, 'triangle', 0.12, undefined, 0.9));
    this.noise(0.8, 0.15, 5000, 0.5, 0.9, 'highpass');
  }

  start() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.12, 'square', 0.08, undefined, i * 0.06));
  }

  // ---------------- BGM（簡易シーケンサ） ----------------
  startBgm() {
    if (!this.ctx) return;
    this.bgmOn = true;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
  }
  stopBgm() {
    this.bgmOn = false;
  }

  /** 毎フレーム呼ぶ。少し先までノートを予約する */
  tick() {
    const c = this.ctx;
    if (!c || !this.bgmOn) return;
    const stepDur = 60 / this.tempo / 4;
    // Am - F - C - G 風の地下っぽい進行
    const roots = [45, 41, 48, 43];
    const arp = [0, 7, 12, 15, 12, 7, 3, 7];
    while (this.nextNote < c.currentTime + 0.15) {
      const bar = Math.floor(this.step / 16) % 4;
      const s = this.step % 16;
      const root = roots[bar];
      const delay = this.nextNote - c.currentTime;
      if (s % 4 === 0) this.tone(midi(root - 12), stepDur * 3.2, 'triangle', 0.5, undefined, delay, this.bgmBus);
      if (s % 2 === 0) this.tone(midi(root + 12 + arp[(s / 2) % 8]), stepDur * 1.6, 'square', 0.07, undefined, delay, this.bgmBus);
      if (s % 4 === 2) this.hat(delay);
      if (s === 0 || s === 8 || s === 11) this.kick(delay);
      this.nextNote += stepDur;
      this.step++;
    }
  }

  private kick(delay: number) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.bgmBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(delay: number) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(this.bgmBus);
    s.start(t, audioRandom() * 0.5);
    s.stop(t + 0.05);
  }
}

function midi(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}
