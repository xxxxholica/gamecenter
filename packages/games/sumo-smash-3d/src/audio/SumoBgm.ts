/**
 * 相撲BGM(外部の音声ファイルなし、Web Audio で合成)。
 * 都節(D E♭ G A B♭)の和風の音階に、太鼓・三味線風の弾き音・尺八風の笛を重ねる。
 *  - menu: ゆったりした琴風のアルペジオと尺八の旋律、静かな太鼓
 *  - battle: 速い太鼓と低音、三味線風のリフ。calm にすると太鼓と低音だけ(仕切りや決着の間)
 */

import { createWhiteNoiseBuffer, syncStepSequencer } from '../../../../shared/audioUtils';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける
import { hasServerClockSync, sharedServerNow } from '../../../../shared/online/onlineStatus';

export type BgmTrack = 'menu' | 'battle';

// 都節の音階(周波数 Hz)。D3 を基準にして、各オクターブに展開する
const D3 = 146.83;
const SCALE_SEMITONES = [0, 1, 5, 7, 8]; // D, E♭, G, A, B♭

function note(degree: number, octave = 0): number {
  const n = ((degree % 5) + 5) % 5;
  const oct = Math.floor(degree / 5) + octave;
  return D3 * Math.pow(2, (SCALE_SEMITONES[n] + oct * 12) / 12);
}

export class SumoBgm {
  private ctx: AudioContext;
  private out: GainNode;
  private fadeGain: GainNode;
  private noiseBuffer: AudioBuffer;

  private track: BgmTrack = 'menu';
  private calm: boolean = false;
  private running: boolean = false;
  private timer: number | null = null;
  private nextTime: number = 0;
  private step: number = 0;
  private loop: number = 0;
  private syncEnabled: boolean = false;
  private anchorMs: number = 0;
  private serverNowFn: (() => number) | null = null;
  private syncFadeTimer: number | null = null;
  public lastSyncDriftSec: number = 0;

  constructor(ctx: AudioContext, out: GainNode) {
    this.ctx = ctx;
    this.fadeGain = ctx.createGain();
    this.fadeGain.gain.value = 1.0;
    this.fadeGain.connect(out);
    this.out = this.fadeGain;

    // ノイズ(太鼓の打面・笛の息づかい用)を1回だけ作っておく
    this.noiseBuffer = createWhiteNoiseBuffer(ctx, 1.0);
  }

  public setOnlineSync(enabled: boolean, anchorMs: number = 0, serverNowFn?: () => number) {
    if (!enabled) {
      if (this.syncFadeTimer !== null) {
        clearTimeout(this.syncFadeTimer);
        this.syncFadeTimer = null;
      }
      this.syncEnabled = false;
      this.anchorMs = 0;
      this.serverNowFn = null;
      const t = this.ctx.currentTime;
      this.fadeGain.gain.cancelScheduledValues(t);
      this.fadeGain.gain.setValueAtTime(Math.max(0.0001, this.fadeGain.gain.value), t);
      this.fadeGain.gain.exponentialRampToValueAtTime(1.0, t + 0.15);
      return;
    }

    this.serverNowFn = serverNowFn ?? null;
    const cleanAnchor = Number.isFinite(anchorMs) ? anchorMs : 0;

    if (!this.syncEnabled) {
      if (this.running && this.ctx.state === 'running') {
        if (this.syncFadeTimer !== null) clearTimeout(this.syncFadeTimer);
        const t = this.ctx.currentTime;
        const cur = Math.max(0.0001, this.fadeGain.gain.value);
        this.fadeGain.gain.cancelScheduledValues(t);
        this.fadeGain.gain.setValueAtTime(cur, t);
        this.fadeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        this.syncFadeTimer = window.setTimeout(() => {
          this.syncFadeTimer = null;
          this.syncEnabled = true;
          this.anchorMs = cleanAnchor;
          this.nextTime = 0;
          this.schedule();
          const t2 = this.ctx.currentTime;
          this.fadeGain.gain.cancelScheduledValues(t2);
          this.fadeGain.gain.setValueAtTime(0.0001, t2);
          this.fadeGain.gain.exponentialRampToValueAtTime(1.0, t2 + 0.38);
        }, 390);
      } else {
        this.syncEnabled = true;
        this.anchorMs = cleanAnchor;
        this.nextTime = 0;
      }
    } else if (this.anchorMs !== cleanAnchor) {
      this.anchorMs = cleanAnchor;
      this.nextTime = 0;
    }
  }

  public setAnchor(anchorMs: number) {
    if (!Number.isFinite(anchorMs)) return;
    if (this.anchorMs !== anchorMs) {
      this.anchorMs = anchorMs;
      this.nextTime = 0;
    }
  }

  private get canSync(): boolean {
    return this.syncEnabled && (this.serverNowFn !== null || hasServerClockSync());
  }

  public start(track: BgmTrack) {
    if (this.running && this.track === track) return;
    this.track = track;
    this.step = 0;
    this.loop = 0;
    this.nextTime = this.canSync ? 0 : this.ctx.currentTime + 0.08;
    if (!this.running) {
      this.running = true;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    this.schedule();
  }

  public stop() {
    this.running = false;
    if (this.syncFadeTimer !== null) {
      clearTimeout(this.syncFadeTimer);
      this.syncFadeTimer = null;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setCalm(calm: boolean) {
    this.calm = calm;
  }

  private get stepSec(): number {
    // 16分音符の長さ。menu は 84BPM、battle は 148BPM
    return 60 / (this.track === 'battle' ? 148 : 84) / 4;
  }

  private schedule() {
    if (!this.running) return;
    if (this.ctx.state !== 'running') {
      this.nextTime = this.canSync ? 0 : this.ctx.currentTime + 0.08;
      return;
    }
    if (this.canSync) {
      const serverNow = this.serverNowFn ? this.serverNowFn() : sharedServerNow();
      const totalStep = (this.loop % 2) * 32 + this.step;
      const sync = syncStepSequencer(
        this.ctx.currentTime,
        this.nextTime,
        totalStep,
        serverNow,
        this.stepSec,
        64,
        this.anchorMs,
        0.04,
      );
      this.step = sync.step % 32;
      this.loop = Math.floor(sync.step / 32) % 2;
      this.nextTime = sync.nextTime;
      this.lastSyncDriftSec = sync.driftSec;
    } else if (this.nextTime < this.ctx.currentTime - 0.3) {
      // ブラウザがタブを止めている間にたまった分は捨てる(一気に鳴らさない)
      this.nextTime = this.ctx.currentTime + 0.05;
    }
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (this.track === 'battle') this.playBattleStep(this.step, this.nextTime);
      else this.playMenuStep(this.step, this.nextTime);
      this.nextTime += this.stepSec;
      this.step++;
      if (this.step >= 32) {
        this.step = 0;
        this.loop = (this.loop + 1) % 2;
      }
    }
  }

  // ---------------------------------------------------------------
  // 楽器
  // ---------------------------------------------------------------

  /** 太鼓(ドン): 低い音程が落ちていく胴鳴りに、打面のノイズ */
  private don(t: number, vol: number, low = 1) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130 * low, t);
    osc.frequency.exponentialRampToValueAtTime(48 * low, t + 0.22);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.4);
    this.noise(t, 0.05, vol * 0.55, 1400, 'lowpass');
  }

  /** 締太鼓・拍子木のような高い打音(カッ) */
  private ka(t: number, vol: number) {
    this.noise(t, 0.045, vol, 3200, 'bandpass');
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  private noise(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, audioRandom() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** 三味線風の弾き音: のこぎり波に、すぐ閉じるローパス */
  private pluck(t: number, freq: number, vol: number, dur = 0.22) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    f.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f).connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 琴風: 三角波と正弦波を重ねた、澄んだ減衰音 */
  private koto(t: number, freq: number, vol: number) {
    for (const [type, mul, v] of [['triangle', 1, 1], ['sine', 2, 0.35]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * mul;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(g).connect(this.out);
      osc.start(t);
      osc.stop(t + 0.95);
    }
  }

  /** 尺八風: ゆっくり立ち上がる正弦波に、ビブラートと息のノイズ */
  private flute(t: number, freq: number, dur: number, vol: number) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.985, t);
    osc.frequency.linearRampToValueAtTime(freq, t + 0.12);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = freq * 0.012;
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.18);
    g.gain.setValueAtTime(vol, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.noise(t, dur, vol * 0.18, 2400, 'bandpass');
  }

  /** 低音(ドローン): 三角波で土台を支える */
  private bass(t: number, freq: number, dur: number, vol: number) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------
  // 曲(32ステップ = 2小節の繰り返し)
  // ---------------------------------------------------------------

  private static readonly BATTLE_DON = [
    1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1,
  ];
  private static readonly BATTLE_KA = [
    0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0,
  ];
  // 三味線風のリフ(音階の度数。null は休み)
  private static readonly BATTLE_RIFF: Array<number | null> = [
    5, null, null, 6, 7, null, 8, null, 9, null, 8, null, 7, null, 6, null,
    5, null, null, 6, 7, null, 9, null, 10, null, 9, null, 7, null, 6, 5,
  ];

  private playBattleStep(s: number, t: number) {
    const calm = this.calm;
    const vol = calm ? 0.55 : 1;

    if (calm) {
      // 仕切り・決着の間: 小節の頭にだけ太鼓、低音を静かに
      if (s % 16 === 0) this.don(t, 0.5 * vol, 0.9);
      if (s % 16 === 0) this.bass(t, note(0, -1), 1.2, 0.16);
      if (s % 16 === 8) this.ka(t, 0.12);
      return;
    }

    if (SumoBgm.BATTLE_DON[s]) this.don(t, 0.7, s % 8 === 0 ? 1 : 1.1);
    if (SumoBgm.BATTLE_KA[s]) this.ka(t, 0.16);

    // 低音: 4拍ごとに根音、後半の小節は五度へ
    if (s % 4 === 0) this.bass(t, note(s >= 16 && s % 8 === 0 ? 3 : 0, -1), 0.45, 0.2);

    // 三味線風のリフ。2周目からは1オクターブ上に重ねて盛り上げる
    const deg = SumoBgm.BATTLE_RIFF[s];
    if (deg !== null && deg !== undefined) {
      this.pluck(t, note(deg), 0.16);
      if (this.loop % 2 === 1) this.pluck(t, note(deg + 5), 0.07, 0.16);
    }
  }

  // 琴風のアルペジオ(度数)
  private static readonly MENU_KOTO: Array<number | null> = [
    0, null, 2, null, 3, null, 2, null, 4, null, 3, null, 2, null, null, null,
    0, null, 3, null, 4, null, 5, null, 4, null, 3, null, 2, null, 0, null,
  ];

  private playMenuStep(s: number, t: number) {
    // 静かな太鼓: 小節の頭と半ば
    if (s % 16 === 0) this.don(t, 0.32, 0.85);
    if (s % 16 === 8) this.ka(t, 0.06);

    const k = SumoBgm.MENU_KOTO[s];
    if (k !== null && k !== undefined) this.koto(t, note(k + 5), 0.1);

    if (s % 16 === 0) this.bass(t, note(0, -1), 2.4, 0.13);

    // 尺八風の旋律: 2周に1回、ゆっくりした音を3つ
    if (this.loop % 2 === 0) {
      const sec = this.stepSec;
      if (s === 0) this.flute(t, note(5), sec * 6, 0.09);
      if (s === 8) this.flute(t, note(7), sec * 7, 0.09);
      if (s === 16) this.flute(t, note(8), sec * 5, 0.09);
      if (s === 22) this.flute(t, note(7), sec * 9, 0.09);
    }
  }
}
