// プレイ中・メニュー中のBGM(Web Audio で作るので、音源ファイルは要らない)。
// 4小節(C - Am - F - G)を繰り返す。メニューは静かなアルペジオとパッド、プレイ中はそこにドラムとメロディが加わる。
import { createWhiteNoiseBuffer, syncStepSequencer } from '../../../shared/audioUtils';
import { hasServerClockSync, sharedServerNow } from '../../../shared/online/onlineStatus';

export type BgmScene = 'menu' | 'play';

const BPM = 112;
const STEP = 60 / BPM / 4;             // 16分音符の長さ(秒)
const LOOKAHEAD = 0.14;                // 先に予約しておく時間(秒)
const MASTER = 0.45;

// 和音: 根音(MIDI)と、第3音までの半音数
const CHORDS: { root: number; third: number }[] = [
  { root: 48, third: 4 }, // C
  { root: 45, third: 3 }, // Am
  { root: 41, third: 4 }, // F
  { root: 43, third: 4 }, // G
];
// メロディ(8分音符 × 8 × 4小節。null は休み)。C のペンタトニックを中心にした、控えめな旋律
const LEAD: (number | null)[][] = [
  [79, null, 76, null, 79, 81, 79, null],
  [81, null, 79, null, 76, null, 74, 76],
  [84, null, 81, null, 79, null, 81, 79],
  [74, null, 76, 79, null, 76, 74, null],
];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private scene: BgmScene = 'menu';
  private nextTime = 0;
  private step = 0;
  private anchorMs = 0;
  private syncEnabled = false;
  private serverNowFn: (() => number) | null = null;
  private syncFadeTimer: number | null = null;
  public lastSyncDriftSec = 0;

  constructor(private readonly getContext: () => AudioContext | null) {}

  private get canSync(): boolean {
    return this.syncEnabled && (this.serverNowFn !== null || hasServerClockSync());
  }

  private serverNow(): number {
    return this.serverNowFn ? this.serverNowFn() : sharedServerNow();
  }

  /** 最初の操作のあとに呼ぶ(ブラウザは操作の前には音を出せない)。音を出す準備をして、鳴らし始める */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = this.getContext();
    if (!ctx) return;
    this.ctx = ctx;
    this.noise = createWhiteNoiseBuffer(ctx, 1);
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(ctx.destination);
    this.nextTime = this.canSync ? 0 : ctx.currentTime + 0.1;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /**
   * オンライン待機画面・対戦中のサーバー時刻同期の有効/無効を切り替える。
   * タイトル・モード選択からオンライン待機画面へ入った時は、再生中のBGMをフェードアウトしてから
   * 同期位置に合わせ、フェードインで入れ替える。
   */
  setOnlineSync(enabled: boolean, anchorMs = 0, serverNowFn?: () => number): void {
    if (serverNowFn) this.serverNowFn = serverNowFn;
    const cleanAnchor = Number.isFinite(anchorMs) ? anchorMs : 0;
    if (!enabled) {
      if (this.syncFadeTimer !== null) {
        window.clearTimeout(this.syncFadeTimer);
        this.syncFadeTimer = null;
      }
      this.syncEnabled = false;
      this.anchorMs = 0;
      if (this.ctx && this.master) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(MASTER, now);
      }
      return;
    }
    if (this.syncEnabled) {
      if (this.anchorMs !== cleanAnchor) {
        this.anchorMs = cleanAnchor;
        this.nextTime = 0;
      }
      return;
    }
    if (this.ctx && this.ctx.state === 'running' && this.master) {
      if (this.syncFadeTimer !== null) {
        window.clearTimeout(this.syncFadeTimer);
        this.syncFadeTimer = null;
      }
      const fadeSec = 0.38;
      const now = this.ctx.currentTime;
      const curGain = Math.max(0.0001, this.master.gain.value || MASTER);
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(curGain, now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      this.syncFadeTimer = window.setTimeout(() => {
        this.syncFadeTimer = null;
        this.syncEnabled = true;
        this.anchorMs = cleanAnchor;
        this.nextTime = 0;
        this.tick();
        if (this.ctx && this.master) {
          const t = this.ctx.currentTime;
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(0.0001, t);
          this.master.gain.linearRampToValueAtTime(MASTER, t + fadeSec);
        }
      }, Math.round(fadeSec * 1000) + 10);
      return;
    }
    this.syncEnabled = true;
    this.anchorMs = cleanAnchor;
    this.nextTime = 0;
  }

  setScene(scene: BgmScene): void {
    this.scene = scene;
  }

  /** 毎フレーム呼ぶ。少し先までノートを予約する(25ms の setInterval にすると、Windows の Chrome で他の setTimeout の起きる時刻が最大 16ms 揺れて入力遅延が跳ねる) */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') { this.nextTime = this.canSync ? 0 : ctx.currentTime + 0.1; return; }
    if (this.canSync) {
      const sync = syncStepSequencer(
        ctx.currentTime,
        this.nextTime,
        this.step,
        this.serverNow(),
        STEP,
        64,
        this.anchorMs,
        0.04,
      );
      this.step = sync.step;
      this.nextTime = sync.nextTime;
      this.lastSyncDriftSec = sync.driftSec;
    } else if (this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += STEP;
    }
  }

  private note(time: number, freq: number, dur: number, type: OscillatorType, vol: number, cutoff = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let out: AudioNode = osc;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      osc.connect(f);
      out = f;
    }
    out.connect(gain).connect(this.master!);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private hit(time: number, kind: 'kick' | 'snare' | 'hat'): void {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      osc.connect(gain).connect(this.master!);
      osc.start(time);
      osc.stop(time + 0.18);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = kind === 'snare' ? 1500 : 7000;
    const gain = ctx.createGain();
    const dur = kind === 'snare' ? 0.14 : 0.04;
    gain.gain.setValueAtTime(kind === 'snare' ? 0.28 : 0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(gain).connect(this.master!);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  /** 16分音符1つぶんを鳴らす(step は 0〜63 = 4小節) */
  private play(step: number, time: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];
    const tones = [chord.root + 12, chord.root + 12 + chord.third, chord.root + 19, chord.root + 24];
    const playing = this.scene === 'play';

    // パッド: 小節の頭に、和音を長く
    if (s === 0) for (const m of [chord.root + 12, chord.root + 12 + chord.third, chord.root + 19]) this.note(time, hz(m), STEP * 15, 'sawtooth', playing ? 0.025 : 0.035, 900);
    // ベース: 8分音符。根音と1オクターブ上を交互に
    if (s % 2 === 0) this.note(time, hz(s % 4 === 2 ? chord.root : chord.root - 12 + (s % 8 === 6 ? 7 : 0)), STEP * 1.8, 'triangle', 0.16);
    // アルペジオ: メニューは8分、プレイ中は16分
    if (playing || s % 2 === 0) {
      const idx = [0, 1, 2, 3, 2, 1, 2, 1][(playing ? s : s / 2) % 8];
      this.note(time, hz(tones[idx]), STEP * (playing ? 1.4 : 2.6), 'square', playing ? 0.035 : 0.03, 2400);
    }
    if (!playing) return;
    // ドラム
    if (s % 4 === 0) this.hit(time, 'kick');
    if (s === 4 || s === 12) this.hit(time, 'snare');
    if (s % 2 === 0) this.hit(time, 'hat');
    // メロディ(8分音符)
    if (s % 2 === 0) {
      const m = LEAD[bar][s / 2];
      if (m !== null) this.note(time, hz(m), STEP * 3, 'triangle', 0.12);
    }
  }
}
