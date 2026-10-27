// BGM: public/bgm の音源ファイルをストリーミング再生する。曲が終わるとプールの中から別の曲をランダムに選んで続ける
// (同じ曲は連続させない)。走行中は速度・ブースト・コースの進み具合に合わせて、音のこもり・きらめき・音量が変わる。
import type { AudioEngine } from './engine';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける
import { computeMediaSyncRate } from '../../../../shared/audioUtils';
import { hasServerClockSync, sharedServerNow } from '../../../../shared/online/onlineStatus';

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
  track: Track;
  out: GainNode;
  el: HTMLAudioElement;
  /** 走行中の速度で開閉する */
  tone: BiquadFilterNode;
  /** ブーストで高域を持ち上げる */
  sparkle: BiquadFilterNode;
  /** シーク時のマイクロフェード処理中か */
  seeking: boolean;
  /** フェードアウト破棄済みか */
  disposed: boolean;
}

export class Bgm {
  private pool: 'menu' | 'race' | null = null;
  private run: Run | null = null;
  /** 走行中の(速度, ブースト)。null ならレース外で、フィルターは全開 */
  private drive: { speed: number; boost: number } | null = null;
  private lastId = '';
  private shuffleQueues: { menu: Track[]; race: Track[] } = { menu: [], race: [] };
  /** 対戦用: 全員で同じ曲を流す時の、レース用の曲の番号(曲が終わるたびに次の番号へ進む)。null なら従来どおりランダム */
  private syncIndex: number | null = null;
  /** 次に曲を始める時の、曲の途中から始める位置(秒) */
  private syncOffset = 0;
  private syncTimer = 0;
  /** 現在の同期再生の基準となるサーバー時刻(ms)。null のとき menu はサーバー時計が同期済みなら 0 を基準にループ同期 */
  private syncAnchorServerMs: number | null = null;
  private serverNowFn: (() => number) | null = null;
  /** 対戦ロード中に事前デコード・バッファリングしておく Audio 要素 */
  private preloaded: { src: string; el: HTMLAudioElement } | null = null;
  /** 計測・診断用: 直近の同期ドリフト(秒) */
  public lastSyncDriftSec = 0;

  constructor(private readonly eng: AudioEngine) {
    window.setInterval(() => this.tickSyncPll(), 250);
  }

  private getRaceTrackBySeed(trackIndex: number): Track | null {
    const races = TRACKS.filter((t) => t.pool === 'race');
    if (races.length === 0) return null;
    return races[((Math.floor(trackIndex) % races.length) + races.length) % races.length];
  }

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
    this.syncAnchorServerMs = null;
    this.serverNowFn = null;
    window.clearTimeout(this.syncTimer);
    // メニュー曲は1曲(cosmic-drift)なので、すでに menu が再生中なら途切れさせない(待機画面との同期も維持する)
    if (this.pool === pool && this.run && (!forceChange || pool === 'menu')) return;
    if (pool === 'menu') this.drive = null;
    this.pool = pool;
    this.fadeOutRun(0.45);
    this.eng.whenRunning(() => this.startNext());
  }

  /** 再生中の曲を冒頭(0秒)に巻き戻す(チュートリアル終了後に本番カウントダウンへ入る時など) */
  public rewind(): void {
    if (this.run) {
      this.seekSmooth(this.run, 0);
    }
  }

  /** BGMを止める(対戦のロード中など、曲を流さない間) */
  public stop(): void {
    this.syncIndex = null;
    this.syncAnchorServerMs = null;
    this.serverNowFn = null;
    window.clearTimeout(this.syncTimer);
    this.pool = null;
    this.fadeOutRun(0.35);
  }

  /**
   * 対戦のステージ読み込み中に、これから鳴らすレース曲を事前にバッファリングしておく。
   * GO カウントダウン開始時のデコード遅延(50〜400ms)をなくす。
   */
  public preloadSynced(trackIndex: number): void {
    const track = this.getRaceTrackBySeed(trackIndex);
    if (!track) return;
    if (this.preloaded?.src === track.src) return;
    const el = new Audio(BGM_DIR + track.src);
    el.preload = 'auto';
    el.load();
    this.preloaded = { src: track.src, el };
  }

  /**
   * 対戦用: 全員で同じ曲を、同じ位置から流す。trackIndex は全員で同じ番号(レース用の曲の中の何番目か)、
   * startAtMs はこの端末の時計(performance.now)で曲の頭を鳴らす時刻。すでに過ぎていれば、過ぎた分だけ曲の途中から始める。
   */
  public playSynced(
    trackIndex: number,
    startAtMs: number,
    goAtServerMs?: number,
    serverNowFn?: () => number,
  ): void {
    window.clearTimeout(this.syncTimer);
    this.pool = 'race';
    this.fadeOutRun(0.25);
    this.preloadSynced(trackIndex);
    const nowPerf = performance.now();
    const resolvedServerNowFn = serverNowFn ?? (hasServerClockSync() ? sharedServerNow : null);
    this.serverNowFn = resolvedServerNowFn;
    this.syncAnchorServerMs =
      goAtServerMs ??
      (resolvedServerNowFn ? resolvedServerNowFn() + (startAtMs - nowPerf) : null);

    const begin = () => {
      this.syncIndex = trackIndex;
      if (this.syncAnchorServerMs !== null && this.serverNowFn) {
        this.syncOffset = Math.max(0, (this.serverNowFn() - this.syncAnchorServerMs) / 1000);
      } else {
        this.syncOffset = Math.max(0, (performance.now() - startAtMs) / 1000);
      }
      this.eng.whenRunning(() => this.startNext());
    };
    const wait = startAtMs - nowPerf;
    if (wait > 0) this.syncTimer = window.setTimeout(begin, wait);
    else begin();
  }

  /** BGMだけを下げる(1で通常)。ポーズ・リザルトで使う */
  public duck(level: number, timeConstant = 0.25): void {
    const t = this.eng.ctx.currentTime;
    const g = this.eng.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.setTargetAtTime(level, t, timeConstant);
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
    const isMenu = this.pool === 'menu';
    if (this.syncIndex !== null) {
      track = this.getRaceTrackBySeed(this.syncIndex);
      this.syncIndex += 1;                         // 次の曲は、全員同じ番号の次
      offset = this.syncOffset;
      this.syncOffset = 0;
    } else {
      track = this.getNextTrack(this.pool);
    }
    if (!track) return;
    this.lastId = track.id;

    const ctx = this.eng.ctx;
    let el: HTMLAudioElement;
    if (this.preloaded && this.preloaded.src === track.src) {
      el = this.preloaded.el;
      this.preloaded = null;
    } else {
      el = new Audio(BGM_DIR + track.src);
      el.preload = 'auto';
    }
    el.loop = isMenu;

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
    // 読み込み・初期シークが完了するまではゲインを 0 に保ち、デコーダ初期化やシーク時のポップノイズを防ぐ
    out.gain.setValueAtTime(0, ctx.currentTime);
    src.connect(tone);
    tone.connect(sparkle);
    sparkle.connect(out);
    out.connect(this.eng.musicDuck);

    const run: Run = { name: track.name, track, out, el, tone, sparkle, seeking: true, disposed: false };
    this.run = run;
    this.setDrive(this.drive?.speed ?? null, this.drive?.boost ?? 0, null);

    let fadedIn = false;
    const fadeIn = () => {
      if (fadedIn || run.disposed || this.run !== run) return;
      fadedIn = true;
      run.seeking = false;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(Math.max(0.0001, track.gain), t + 0.16);
    };

    const applyInitialPositionAndPlay = () => {
      if (run.disposed || this.run !== run) return;
      let targetOffset = offset;
      if (isMenu && hasServerClockSync() && Number.isFinite(el.duration) && el.duration > 0) {
        const elapsed = sharedServerNow() / 1000;
        targetOffset = ((elapsed % el.duration) + el.duration) % el.duration;
      } else if (this.syncAnchorServerMs !== null && this.serverNowFn) {
        targetOffset = Math.max(0, (this.serverNowFn() - this.syncAnchorServerMs) / 1000);
      }
      if (targetOffset > 0.02 && Number.isFinite(el.duration) && targetOffset < el.duration) {
        const onSeeked = () => {
          el.removeEventListener('seeked', onSeeked);
          void el.play().then(fadeIn).catch(() => fadeIn());
        };
        el.addEventListener('seeked', onSeeked, { once: true });
        try {
          el.currentTime = targetOffset;
        } catch {
          el.removeEventListener('seeked', onSeeked);
          void el.play().then(fadeIn).catch(() => fadeIn());
        }
      } else {
        void el.play().then(fadeIn).catch(() => fadeIn());
      }
    };

    if (el.readyState >= 1 && Number.isFinite(el.duration) && el.duration > 0) {
      applyInitialPositionAndPlay();
    } else {
      el.addEventListener('loadedmetadata', applyInitialPositionAndPlay, { once: true });
      // メタデータイベント前に play 可能な環境向けのフォールバック
      void el.play().catch(() => { /* loadedmetadata 側で再生開始する */ });
    }

    el.addEventListener('ended', () => {
      if (this.run !== run || isMenu) return;
      if (this.syncAnchorServerMs !== null && Number.isFinite(el.duration) && el.duration > 0) {
        this.syncAnchorServerMs += el.duration * 1000;
        if (this.serverNowFn) {
          this.syncOffset = Math.max(0, (this.serverNowFn() - this.syncAnchorServerMs) / 1000);
        }
      }
      this.fadeOutRun(0.45);
      this.startNext();
    });
    // 読み込みに失敗したら、この曲は飛ばして次へ
    el.addEventListener('error', () => {
      if (this.run !== run) return;
      this.fadeOutRun(0.1);
      this.startNext();
    });
  }

  /**
   * 再生中の曲を「ぶちっ」というクリックノイズなしで滑らかに指定位置へシークする。
   */
  private seekSmooth(run: Run, targetSec: number): void {
    if (run.disposed || run.seeking || this.run !== run) return;
    run.seeking = true;
    const ctx = this.eng.ctx;
    const t = ctx.currentTime;
    const curGain = Math.max(0.0001, run.out.gain.value);
    run.out.gain.cancelScheduledValues(t);
    run.out.gain.setValueAtTime(curGain, t);
    run.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    window.setTimeout(() => {
      if (run.disposed || this.run !== run) return;
      let done = false;
      const finish = () => {
        if (done || run.disposed || this.run !== run) return;
        done = true;
        run.el.removeEventListener('seeked', finish);
        run.el.playbackRate = 1.0;
        const t2 = ctx.currentTime;
        run.out.gain.cancelScheduledValues(t2);
        run.out.gain.setValueAtTime(0.0001, t2);
        run.out.gain.exponentialRampToValueAtTime(Math.max(0.0001, run.track.gain), t2 + 0.06);
        run.seeking = false;
      };
      run.el.addEventListener('seeked', finish, { once: true });
      window.setTimeout(finish, 90);
      try {
        const dur = run.el.duration;
        run.el.currentTime = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, targetSec), dur - 0.05) : Math.max(0, targetSec);
      } catch {
        finish();
      }
    }, 48);
  }

  /**
   * 待機画面(menu)およびオンライン対戦中(race)に、サーバー時刻とのズレを PLL (playbackRate 微調整) で継続補正する。
   */
  private tickSyncPll(): void {
    const r = this.run;
    if (!r || r.disposed || r.seeking || r.el.paused) return;
    const dur = r.el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;

    let serverNow: number | null = null;
    let anchorMs: number | null = null;
    let loop = false;

    if (this.pool === 'race' && this.syncAnchorServerMs !== null) {
      serverNow = this.serverNowFn ? this.serverNowFn() : hasServerClockSync() ? sharedServerNow() : null;
      anchorMs = this.syncAnchorServerMs;
      loop = false;
    } else if (this.pool === 'menu' && hasServerClockSync()) {
      serverNow = sharedServerNow();
      anchorMs = 0;
      loop = true;
    }

    if (serverNow === null || anchorMs === null) {
      if (r.el.playbackRate !== 1.0) r.el.playbackRate = 1.0;
      return;
    }

    const sync = computeMediaSyncRate(r.el.currentTime, serverNow, anchorMs, dur, loop);
    this.lastSyncDriftSec = sync.driftSec;

    if (sync.action === 'seek') {
      if (!loop && sync.targetSec >= dur - 0.1) return;
      this.seekSmooth(r, sync.targetSec);
    } else {
      if (Math.abs(r.el.playbackRate - sync.rate) > 0.0005) {
        r.el.playbackRate = sync.rate;
      }
    }
  }

  private fadeOutRun(seconds: number): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    r.disposed = true;
    const ctx = this.eng.ctx;
    const t = ctx.currentTime;
    const fadeSec = Math.max(0.04, seconds);
    const currentGain = Math.max(0.0001, r.out.gain.value);
    r.out.gain.cancelScheduledValues(t);
    r.out.gain.setValueAtTime(currentGain, t);
    r.out.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
    r.out.gain.setValueAtTime(0, t + fadeSec + 0.01);
    window.setTimeout(() => {
      r.el.pause();
      r.el.removeAttribute('src');
      r.el.load();
      r.out.disconnect();
    }, (fadeSec + 0.12) * 1000);
  }
}
