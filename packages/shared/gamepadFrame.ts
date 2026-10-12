// ゲームパッドの共有の読み取り。navigator.getGamepads() は呼ぶたびに配列と Gamepad オブジェクトを作り直すうえ、
// ハブ・共通モジュール(戻る操作・操作ガイド・タイトル・自動リターン・計測)・ゲーム本体が、それぞれ毎フレーム呼んでいた。
// ここで、ごく短い間(同じフレームの中)は同じ結果を返す。パッドの状態は1フレームの間は変わらないので、挙動は同じ。

/** この時間(ms)以内の呼び出しは、前回の結果を返す。60〜240Hz の1フレームより短く、同じフレームの呼び出しだけをまとめる */
const SAME_FRAME_MS = 3;
const EMPTY: ReadonlyArray<Gamepad | null> = [];

let cached: ReadonlyArray<Gamepad | null> = EMPTY;
let cachedAt = -Infinity;

export function readGamepads(): ReadonlyArray<Gamepad | null> {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return EMPTY;
  const now = performance.now();
  if (now - cachedAt < SAME_FRAME_MS) return cached;
  try {
    cached = navigator.getGamepads();
  } catch {
    cached = EMPTY;                       // 権限ポリシーなどで読めない環境
  }
  cachedAt = now;
  return cached;
}
