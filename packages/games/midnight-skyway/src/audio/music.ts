// BGM: public/bgm の音源ファイルをストリーミング再生する。曲が終わるとプールの中から別の曲をランダムに選んで続ける
// (同じ曲は連続させない)。走行中は速度・ブースト・コースの進み具合に合わせて、音のこもり・きらめき・音量が変わる。
import type { AudioEngine } from './engine';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける

interface Track {
  id: string;
  name: string;
  pool: 'menu' | 'race';
  src: string;
  /** 曲ごとの音量の補正 */
  gain: number;
}

/** BGM全体の基準の音量(engine の musicBus の初期値と同じ) */
const BUS_BASE = 0.8;
const BGM_DIR = `${import.meta.env.BASE_URL}bgm/`;
const TRACKS: Track[] = [
  { id: 'redline', name: 'Redline', pool: 'race', src: 'redline.mp3', gain: 1 },
  { id: 'apex-lead', name: 'Apex Lead', pool: 'race', src: 'apex-lead.mp3', gain: 1 },
  { id: 'pavement-burn', name: 'PAVEMENT BURN', pool: 'race', src: 'pavement-burn.mp3', gain: 1 },
  { id: 'touge-ronin', name: 'Touge Ronin', pool: 'race', src: 'touge-ronin.mp3', gain: 1 },
  { id: 'cosmic-drift', name: 'Cosmic Drift', pool: 'menu', src: 'cosmic-drift.mp3', gain: 1 },
];

/** 再生中の曲(ストリーミング再生なので、長い曲でもメモリを食わない) */
interface Run {
  name: string;
  out: GainNode;
  el: HTMLAudioElement;
  /** 走行中の速度で開閉する */
  tone: BiquadFilterNode;
  /** ブーストで高域を持ち上げる */
  sparkle: BiquadFilterNode;
}

export class Bgm {
  private pool: 'menu' | 'race' | null = null;
  private run: Run | null = null;
  /** 走行中の(速度, ブースト)。null ならレース外で、フィルターは全開 */
  private drive: { speed: number; boost: number } | null = null;
  private lastId = '';
  private duckLevel = 1;
  private shuffleQueues: { menu: Track[]; race: Track[] } = { menu: [], race: [] };
  /** 対戦用: 全員で同じ曲を流す時の、レース用の曲の番号(曲が終わるたびに次の番号へ進む)。null なら従来どおりランダム */
  private syncIndex: number | null = null;
  /** 次に曲を始める時の、曲の途中から始める位置(秒) */
  private syncOffset = 0;
  private syncTimer = 0;

  constructor(private readonly eng: AudioEngine) {}

  private getNextTrack(pool: 'menu' | 'race'): Track | null {
    let queue = this.shuffleQueues[pool];
    if (!queue || queue.length === 0) {
      const candidates = TRACKS.filter((t) => t.pool === pool);
      if (candidates.length === 0) return null;
      // フィッシャー・イェーツ シャッフルで完全ランダム順序を生成
      const shuffled = [...candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(audioRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // 直前に流れた曲と同じ曲が先頭になった場合は別の曲と入れ替え
      if (shuffled.length > 1 && shuffled[0].id === this.lastId) {
        const swapIdx = 1 + Math.floor(audioRandom() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
      }
      queue = shuffled;
      this.shuffleQueues[pool] = queue;
    }
    return queue.shift() ?? null;
  }

  /** 指定したプールの曲を流す。forceChangeがtrueの場合は同一プールでも即座に別曲へランダム切り替え */
  public play(pool: 'menu' | 'race', forceChange: boolean = false): void {
    this.syncIndex = null;
    window.clearTimeout(this.syncTimer);
    if (this.pool === pool && !forceChange && this.run) return;
    if (pool === 'menu') this.drive = null;
    this.pool = pool;
    this.fadeOutRun(0.6);
    this.eng.whenRunning(() => this.startNext());
  }

  /** BGMを止める(対戦のロード中など、曲を流さない間) */
  public stop(): void {
    this.syncIndex = null;
    window.clearTimeout(this.syncTimer);
    this.pool = null;
    this.fadeOutRun(0.4);
  }

  /**
   * 対戦用: 全員で同じ曲を、同じ位置から流す。trackIndex は全員で同じ番号(レース用の曲の中の何番目か)、
   * startAtMs はこの端末の時計(performance.now)で曲の頭を鳴らす時刻。すでに過ぎていれば、過ぎた分だけ曲の途中から始める。
   */
  public playSynced(trackIndex: number, startAtMs: number): void {
    window.clearTimeout(this.syncTimer);
    this.pool = 'race';
    this.fadeOutRun(0.3);
    const begin = () => {
      this.syncIndex = trackIndex;
      this.syncOffset = Math.max(0, (performance.now() - startAtMs) / 1000);
      this.eng.whenRunning(() => this.startNext());
    };
    const wait = startAtMs - performance.now();
    if (wait > 0) this.syncTimer = window.setTimeout(begin, wait);
    else begin();
  }

  /** BGMだけを下げる(1で通常)。ポーズ・リザルトで使う */
  public duck(level: number, timeConstant = 0.25): void {
    this.duckLevel = level;
    this.eng.musicDuck.gain.setTargetAtTime(level, this.eng.ctx.currentTime, timeConstant);
  }

  /**
   * 走行中の速度(0〜1)・ブースト(0〜1)・コースの進み具合(0〜1)を伝える。
   * 遅いうちは高音をこもらせ、速くなるほど開き、ブーストで高域がきらめく。ゴールが近づくほど音量が上がる。
   * null を渡すとすべて元に戻す(メニュー・ポーズ・コース外)。
   */
  public setDrive(speed: number | null, boost = 0, progress: number | null = null): void {
    this.drive = speed === null ? null : { speed, boost };
    const t = this.eng.ctx.currentTime;
    const bus = progress === null ? BUS_BASE : BUS_BASE * (0.78 + 0.62 * Math.pow(Math.min(1, Math.max(0, progress)), 1.3));
    this.eng.musicBus.gain.setTargetAtTime(bus, t, 0.5);
    const r = this.run;
    if (!r) return;
    const open = speed === null ? 1 : 0.35 + 0.65 * Math.min(1, speed * 1.4);
    r.tone.frequency.setTargetAtTime(1800 * Math.pow(20000 / 1800, open), t, 0.2);
    r.sparkle.gain.setTargetAtTime(speed === null ? 0 : boost * 4, t, 0.15);
  }

  private startNext(): void {
    if (this.run || !this.pool) return;
    let track: Track | null;
    let offset = 0;
    if (this.syncIndex !== null) {
      const races = TRACKS.filter((t) => t.pool === 'race');
      track = races.length ? races[((Math.floor(this.syncIndex) % races.length) + races.length) % races.length] : null;
      this.syncIndex += 1;                         // 次の曲は、全員同じ番号の次
      offset = this.syncOffset;
      this.syncOffset = 0;
    } else {
      track = this.getNextTrack(this.pool);
    }
    if (!track) return;
    this.lastId = track.id;

    const ctx = this.eng.ctx;
    const el = new Audio(BGM_DIR + track.src);
    el.preload = 'auto';
    if (offset > 0.05) {
      // 途中から始める(読み込みが済んで、位置を動かせるようになってから)
      el.addEventListener('loadedmetadata', () => { if (offset < el.duration) el.currentTime = offset; }, { once: true });
    }
    const src = ctx.createMediaElementSource(el);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 20000;
    tone.Q.value = 0.5;
    const sparkle = ctx.createBiquadFilter();
    sparkle.type = 'highshelf';
    sparkle.frequency.value = 4500;
    sparkle.gain.value = 0;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(track.gain, ctx.currentTime, 0.25);
    src.connect(tone);
    tone.connect(sparkle);
    sparkle.connect(out);
    out.connect(this.eng.musicDuck);
    this.eng.musicDuck.gain.value = this.duckLevel;

    const run: Run = { name: track.name, out, el, tone, sparkle };
    this.run = run;
    this.setDrive(this.drive?.speed ?? null, this.drive?.boost ?? 0, null);
    el.addEventListener('ended', () => {
      if (this.run !== run) return;
      this.fadeOutRun(0.5);
      this.startNext();
    });
    // 読み込みに失敗したら、この曲は飛ばして次へ
    el.addEventListener('error', () => {
      if (this.run !== run) return;
      this.fadeOutRun(0.1);
      this.startNext();
    });
    void el.play().catch(() => { /* 自動再生の制限などは whenRunning の後なので、ここでは握りつぶす */ });
  }

  private fadeOutRun(seconds: number): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    const ctx = this.eng.ctx;
    r.out.gain.cancelScheduledValues(ctx.currentTime);
    r.out.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    window.setTimeout(() => { r.el.pause(); r.el.removeAttribute('src'); r.el.load(); r.out.disconnect(); }, (seconds + 1) * 1000);
  }
}
