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
