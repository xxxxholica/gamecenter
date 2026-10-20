// ベンチマーク計測の、ブラウザに依存しない部分(統計とスパイク原因の推定)。
// 計測そのもの(rAF・WebGL のフック、オーバーレイ)は arcadeBench.ts。

export const BENCH_STORAGE_KEY = 'gamecenter_bench';

/** URL の ?bench=1 / ?bench=0 を、同一オリジンで共有される localStorage に記録する(ハブ経由の iframe でも有効にするため)。 */
export function applyBenchFlagFromUrl(): void {
  try {
    if (typeof window === 'undefined') return;
    const v = new URLSearchParams(window.location.search).get('bench');
    if (v === '1') window.localStorage.setItem(BENCH_STORAGE_KEY, '1');
    else if (v === '0') window.localStorage.removeItem(BENCH_STORAGE_KEY);
  } catch { /* localStorage が使えない環境では無効のまま */ }
}

export function isBenchEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    applyBenchFlagFromUrl();
    return window.localStorage.getItem(BENCH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 計測の対象になる「場面」ひとつ分。各ゲームが declareBenchTargets() で申告し、bench-all.mjs が全部を順に開く。
 * 例: 「峠ダウンヒル × dragon_b × 夜のレース」。
 */
export interface BenchTarget {
  /** 結果のキー(ゲーム内で一意。ファイル名にもなるので英数字と - _ だけ) */
  id: string;
  /** 人が読む名前 */
  label: string;
  /** 開くときに URL へ足すパラメータ。ゲームはこれを benchParam() で読んで、その場面から始める */
  params: Record<string, string>;
  /** 場面の種類(race / garage / title など)。結果を種類ごとにまとめるのに使う */
  kind?: string;
  /**
   * 操作の出し方。
   *  - 'self': ゲーム自身が自動で動く(オートパイロットなど)。スクリプトはキーを送らない
   *  - 'random': スクリプトが固定シードのランダム入力を送る(既定)
   *  - 'idle': 何も押さない(タイトルやメニューなど、見ているだけの場面)
   */
  input?: 'self' | 'random' | 'idle';
  /** 計測する秒数。省略時はスクリプトの --duration */
  seconds?: number;
}

/** 結果のキーに使えない文字を - に置き換える。 */
export function benchSafeId(id: string): string {
  return id.replace(/[^\w-]+/g, '-');
}

/** 場面を開く URL。bench=1 を必ず付ける。 */
export function benchTargetUrl(base: string, slug: string, target: BenchTarget): string {
  const q = new URLSearchParams({ bench: '1' });
  for (const [k, v] of Object.entries(target.params)) if (k !== 'bench') q.set(k, v);
  return `${base.replace(/\/$/, '')}/games/${slug}/?${q.toString()}`;
}

/** 昇順にソート済みの配列から百分位を取る。 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface FrameSummary {
  frames: number;
  durationSec: number;
  avgFps: number;
  /** 中央値のフレーム間隔(ほぼ画面のリフレッシュ周期) */
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** 中央値の2倍以上かかったフレームの割合 */
  hitchRate: number;
  /** 1%ロー FPS(最悪1%のフレームの平均から出す) */
  onePercentLowFps: number;
}

const round = (n: number, digits = 2): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

export function summarizeFrames(intervals: readonly number[]): FrameSummary {
  const n = intervals.length;
  if (n === 0) {
    return { frames: 0, durationSec: 0, avgFps: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, hitchRate: 0, onePercentLowFps: 0 };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((s, v) => s + v, 0);
  const median = percentile(sorted, 50);
  const worstCount = Math.max(1, Math.floor(n * 0.01));
  const worstAvg = sorted.slice(n - worstCount).reduce((s, v) => s + v, 0) / worstCount;
  const hitches = intervals.filter((v) => v > median * 2).length;
  return {
    frames: n,
    durationSec: round(total / 1000, 1),
    avgFps: round(total > 0 ? (n / total) * 1000 : 0, 1),
    medianMs: round(median),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted[n - 1]),
    hitchRate: round(hitches / n, 4),
    onePercentLowFps: round(worstAvg > 0 ? 1000 / worstAvg : 0, 1),
  };
}

export interface LatencySummary {
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export function summarizeLatency(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: round(percentile(sorted, 50), 1),
    p95Ms: round(percentile(sorted, 95), 1),
    maxMs: round(sorted[sorted.length - 1] ?? 0, 1),
  };
}

/**
 * 入力が届いてから、それが画面に出るまでの時間を数える(ゲームは毎フレームの最初に入力の状態を読む前提)。
 * フレーム A の開始より前に届いた入力は、A の処理で読まれ、A の描画が次のフレームの開始(=次の垂直同期)に画面に出る。
 * つまり「届いた時刻 → 読んだフレームの次のフレームの開始」。重いフレームやメインスレッドの占有で待たされた分も入る。
 */
export class InputLatencyTracker {
  private waiting: number[] = [];
  private inFrame: number[] = [];

  /** 入力が届いた(時刻は performance.now() と同じ基準) */
  arrive(t: number): void {
    this.waiting.push(t);
  }

  /** フレームが始まった。前のフレームで読んだ入力の遅延(ms)を返し、ここまでに届いた入力をこのフレームで読んだことにする */
  onFrame(ts: number): number[] {
    const done = this.inFrame.map((t) => Math.max(0, ts - t));
    this.inFrame = this.waiting;
    this.waiting = [];
    return done;
  }

  /** 途中で計測できなくなった(タブが隠れたなど)。待っている入力は数えない */
  clear(): void {
    this.waiting = [];
    this.inFrame = [];
  }
}

/**
 * モニターより遅いリフレッシュレート(60Hz など)の再現。モニターのフレームごとに take() を呼び、
 * hz の区切りを過ぎた最初のフレームなら、その区切りの時刻を返す(それ以外は null。そのフレームではゲームを動かさない)。
 * ゲームの処理が終わったら finish() に処理の時間を渡す。垂直同期と同じく、処理が終わったあとの最初の区切りが次のフレームになる
 * (区切りから処理を始めたとみなす。モニターのフレームの細かさの分だけ、実際に始めるのは区切りより少し遅れるため)。
 * ゲームの外の処理(タイマーなど)や GPU で次のモニターのフレームが遅れたときも、過ぎてしまった区切りは飛ばす。
 *
 * モニターが hz と同じくらい(60Hz のモニターで 60Hz を再現するなど)のときは、最初のフレームを基準にした区切りを使わない。
 * 実際のモニターの周期はわずかにずれる(59.998Hz など)うえ、最初のフレームの時刻も刻みから少しずれるので、
 * モニターのフレームが区切りの少し手前に来続けると、1 フレームおきに「区切りの前」とみなされ、描けているのに 30fps に見える。
 * そのため、モニターのフレームの間隔を測り、hz の周期に近ければ、前に渡したフレームからの経過を周期で丸めた数だけ区切りを進める。
 */
export class RefreshSlots {
  private readonly period: number;
  private readonly toleranceMs: number;
  private anchor = -1;
  private last = -Infinity;
  private earliest = -Infinity;
  private prevNow = -1;
  private lastTakenNow = -1;
  private readonly gaps: number[] = [];   // 直近のモニターのフレームの間隔

  /** toleranceMs: 区切りに届いた・間に合ったとみなす誤差(時刻の丸めなど) */
  constructor(hz: number, toleranceMs = 1) {
    this.period = 1000 / hz;
    this.toleranceMs = toleranceMs;
  }

  /**
   * モニターの周期が hz の周期に近いか(間隔の短いほうから 1/4 の値で判断。数が少ないうちは近くないとみなす)。
   * 中央値では足りない: Safari は rAF が 0〜2ms おきに続けて来ることがあり、それが混ざっていても中央値は周期に近くなる。
   * 近いとみなすと、その短い間隔でも区切りを 1 つ進めるので、渡す時刻が実際より先へ進み(最大 267ms)、
   * 最初のフレームを基準にした区切りに戻ったとき、実際の時刻が追いつくまでゲームにフレームを渡せない(165〜299ms)。
   */
  private monitorMatchesHz(): boolean {
    if (this.gaps.length < 16) return false;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    return sorted[sorted.length >> 2] > this.period * 0.75;
  }

  take(now: number): number | null {
    if (this.prevNow >= 0 && now > this.prevNow) {
      this.gaps.push(now - this.prevNow);
      if (this.gaps.length > 32) this.gaps.shift();
    }
    this.prevNow = now;
    if (this.anchor < 0) this.anchor = now;
    const slot = this.lastTakenNow >= 0 && this.monitorMatchesHz()
      ? this.last + Math.max(1, Math.round((now - this.lastTakenNow) / this.period))
      : Math.floor((now - this.anchor + this.toleranceMs) / this.period);
    if (slot <= this.last || slot < this.earliest) return null;
    this.last = slot;
    this.lastTakenNow = now;
    return this.anchor + slot * this.period;
  }

  /** 直前に take() で渡したフレームの処理に workMs かかった */
  finish(workMs: number): void {
    this.earliest = this.last + Math.max(1, Math.ceil((workMs - this.toleranceMs) / this.period));
  }
}

/** 合否の基準(60Hz で、プレイ中の区間)。README の「ベンチマーク」参照 */
export const ACCEPTANCE = {
  onePercentLowFps: 55,
  p99Ms: 20,
  maxMs: 50,
  inputP95Ms: 50,
  inputMaxMs: 100,
  /** 読み込み中の、1回の停止の長さ */
  loadMaxFrameMs: 1000,
} as const;

/** 合否を決める値。読み込みの区間がない場面は loadMaxFrameMs を null にする */
export interface AcceptanceMetrics {
  onePercentLowFps: number;
  p99Ms: number;
  maxMs: number;
  /** プレイ中の、シェーダのコンパイルとテクスチャ・バッファの転送によるスパイクの回数 */
  compileUploadSpikes: number;
  inputP95Ms: number;
  inputMaxMs: number;
  loadMaxFrameMs: number | null;
}

export interface AcceptanceResult {
  pass: boolean;
  /** 合格だが、どれかの値が基準まで 10% 以内(1%low は 57.5fps 未満)。測り直して確かめる */
  borderline: boolean;
  /** 不合格の項目(例: 「p99 24.1ms > 20」) */
  failures: string[];
}

export function judgeAcceptance(m: AcceptanceMetrics): AcceptanceResult {
  const failures: string[] = [];
  let borderline = false;
  // 1%low は 60fps より上にならないので、「すれすれ」は 10% ではなく、基準と 60fps の中間まで(57.5fps 未満)
  const atLeast = (label: string, v: number, min: number, unit: string) => {
    if (v < min) failures.push(`${label} ${v}${unit} < ${min}`);
    else if (v < (min + 60) / 2) borderline = true;
  };
  const atMost = (label: string, v: number, max: number, unit: string) => {
    if (v > max) failures.push(`${label} ${v}${unit} > ${max}`);
    else if (v > max * 0.9) borderline = true;
  };
  atLeast('1%low', m.onePercentLowFps, ACCEPTANCE.onePercentLowFps, 'fps');
  atMost('p99', m.p99Ms, ACCEPTANCE.p99Ms, 'ms');
  atMost('最長', m.maxMs, ACCEPTANCE.maxMs, 'ms');
  if (m.compileUploadSpikes > 0) failures.push(`シェーダ・転送のスパイク ${m.compileUploadSpikes}回`);
  atMost('入力 p95', m.inputP95Ms, ACCEPTANCE.inputP95Ms, 'ms');
  atMost('入力 最大', m.inputMaxMs, ACCEPTANCE.inputMaxMs, 'ms');
  if (m.loadMaxFrameMs !== null) atMost('読込の停止', m.loadMaxFrameMs, ACCEPTANCE.loadMaxFrameMs, 'ms');
  return { pass: failures.length === 0, borderline: failures.length === 0 && borderline, failures };
}

/** 何回か測った値を、項目ごとの中央値にまとめる(基準すれすれ・不合格の場面は3回測って中央値で判定する) */
export function medianMetrics(runs: readonly AcceptanceMetrics[]): AcceptanceMetrics {
  const med = (values: number[]) => {
    const v = [...values].sort((x, y) => x - y);
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : round((v[mid - 1] + v[mid]) / 2, 2);
  };
  const pick = (k: Exclude<keyof AcceptanceMetrics, 'loadMaxFrameMs'>) => med(runs.map((m) => m[k]));
  const loads = runs.map((m) => m.loadMaxFrameMs).filter((v): v is number => v !== null);
  return {
    onePercentLowFps: pick('onePercentLowFps'),
    p99Ms: pick('p99Ms'),
    maxMs: pick('maxMs'),
    compileUploadSpikes: pick('compileUploadSpikes'),
    inputP95Ms: pick('inputP95Ms'),
    inputMaxMs: pick('inputMaxMs'),
    loadMaxFrameMs: loads.length ? med(loads) : null,
  };
}

/** カクつき(スパイク)とみなすフレーム間隔。60Hz なら約30ms、144Hz なら25ms。 */
export function spikeThresholdMs(medianMs: number): number {
  return Math.max(25, medianMs * 1.8);
}

export type SpikeCause =
  | 'shader-compile'
  | 'texture-buffer-upload'
  | 'gc-suspect'
  | 'gl-call-stall'
  | 'js-cpu'
  | 'idle-wait';

/** 1フレームの内訳。単位はすべて ms(heapDropMb だけ MB)。 */
export interface SpikeSample {
  intervalMs: number;
  /** requestAnimationFrame のコールバックに使った時間の合計(WebGL 呼び出しを含む) */
  jsMs: number;
  /** WebGL 呼び出しにかかった時間の合計 */
  glMs: number;
  compileMs: number;
  uploadMs: number;
  /** 前フレームからの JS ヒープの減少量(増加なら 0)。Chromium のみ取れる */
  heapDropMb: number;
}

/**
 * スパイクの原因を、内訳から推定する(確定ではなく手がかり)。
 *  - shader-compile / texture-buffer-upload: WebGL 呼び出しの中で時間を使った → 初回シェーダ、テクスチャ・バッファ転送
 *  - gc-suspect: ヒープが急に減った → ガベージコレクション
 *  - gl-call-stall: 上以外の WebGL 呼び出しが重い → readPixels などの同期待ち、ドライバの詰まり
 *  - js-cpu: ゲームの JS 自体が重い → コード側の問題
 *  - idle-wait: JS も WebGL 呼び出しも軽いのにフレームが遅れた → GPU の処理待ち、ブラウザの合成、OS・他プロセスの負荷(コード側ではない可能性が高い)
 */
export function classifySpike(s: SpikeSample): SpikeCause {
  if (s.compileMs >= 4) return 'shader-compile';
  if (s.uploadMs >= 4) return 'texture-buffer-upload';
  if (s.heapDropMb >= 2) return 'gc-suspect';
  if (s.glMs >= s.intervalMs * 0.4) return 'gl-call-stall';
  if (s.jsMs >= s.intervalMs * 0.6) return 'js-cpu';
  return 'idle-wait';
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;
const DISCRETE_GPU = /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc a\d/i;
const INTEGRATED_GPU = /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega/i;

export type GpuClass = 'discrete' | 'integrated' | 'software' | 'unknown';

/** WebGL の renderer 文字列から GPU の種類を推定する。ノート PC で内蔵 GPU に落ちている場合を見つけるため。 */
export function classifyGpu(renderer: string | undefined): GpuClass {
  if (!renderer) return 'unknown';
  if (SOFTWARE_GPU.test(renderer)) return 'software';
  if (DISCRETE_GPU.test(renderer)) return 'discrete';
  if (INTEGRATED_GPU.test(renderer)) return 'integrated';
  return 'unknown';
}
