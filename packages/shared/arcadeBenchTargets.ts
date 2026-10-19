// ベンチマークの「場面」の申告と、場面指定で起動するための読み取り。
// 各ゲームは、ステージ・キャラクターなどの一覧(=ゲーム自身が持っているデータ)から BenchTarget を作って declareBenchTargets() で申告する。
// bench-all.mjs は申告された場面を全部、順番に開いて計測する。申告は ?bench=1 のときだけ有効で、通常のプレイでは何もしない。

import { isBenchEnabled, type BenchTarget } from './arcadeBenchCore';

type BenchWindow = Window & {
  __gcBenchScale?: number;
  __gcBenchTargets?: BenchTarget[];
  __gcBenchReady?: string | null;
  __gcBenchDone?: string | null;
};

/** ?bench=1 のときだけ、URL のパラメータ(stage=… など)を返す。通常のプレイでは常に null。 */
export function benchParam(name: string): string | null {
  if (typeof window === 'undefined' || !isBenchEnabled()) return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * bench-all.mjs --sweep の解像度の倍率(通常は 1)。--sweep はページの devicePixelRatio を 0.5 にして測るが、
 * devicePixelRatio を見ずに描画の解像度を固定しているゲームには効かない。そういうゲームは、固定の倍率にこれを掛ける。
 */
export function benchRenderScale(): number {
  if (typeof window === 'undefined' || !isBenchEnabled()) return 1;
  const scale = (window as BenchWindow).__gcBenchScale;
  return typeof scale === 'number' && scale > 0 && scale <= 1 ? scale : 1;
}

/** このゲームで計測できる場面の一覧を申告する。ゲームの起動時に1回呼ぶ。 */
export function declareBenchTargets(targets: readonly BenchTarget[]): void {
  if (typeof window === 'undefined' || !isBenchEnabled()) return;
  const ids = new Set<string>();
  for (const t of targets) {
    if (ids.has(t.id)) throw new Error(`bench target の id が重複: ${t.id}`);
    ids.add(t.id);
  }
  (window as BenchWindow).__gcBenchTargets = [...targets];
}

/**
 * 指定された場面に着いた(操作を受けられる・描画が始まった)ことを知らせる。
 * スクリプトはこれが来るまでを「読み込み」、来てからを「プレイ中」として、別々に集計する。
 */
export function benchReady(label = 'ready'): void {
  if (typeof window === 'undefined' || !isBenchEnabled()) return;
  (window as BenchWindow).__gcBenchReady = label;
  benchMark(label);
}

/** 場面をやりきった(1周した・クリアした・ゲームオーバーになった)ことを知らせる。スクリプトは、秒数の上限を待たずに計測を終える。 */
export function benchDone(label = 'done'): void {
  if (typeof window === 'undefined' || !isBenchEnabled()) return;
  (window as BenchWindow).__gcBenchDone = label;
  benchMark(label);
}

/** 場面の中の区切りを記録する(スパイクには「直前のマーク」が付く)。?bench=1 のときだけ。 */
export function benchMark(label: string): void {
  if (typeof window === 'undefined' || !isBenchEnabled()) return;
  (window as unknown as { __gcBenchMark?: (l: string) => void }).__gcBenchMark?.(label);
}
