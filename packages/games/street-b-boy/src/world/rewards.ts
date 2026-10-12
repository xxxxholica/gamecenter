// ライフとクリアボーナスの設定(three.js などに依存しない。テストから読めるように stage.ts から分けてある)。

/** はじめに持っているライフ(残機) */
export const INITIAL_LIVES = 5;

/**
 * ステージクリアのボーナス点(ステージが進むほど大きくなる。最終ステージのクリアが最大)。
 * 別にタイムボーナス(残り秒 × 100)が付く。ステージ数を変えたら、ここも合わせる(stage.ts の FINAL_STAGE)。
 */
export const STAGE_CLEAR_BONUS: Readonly<Record<number, number>> = {
  1: 3_000,
  2: 5_000,
  3: 8_000,
  4: 12_000,
  5: 20_000,
};

/** ステージ番号に対するクリアボーナス。表にない番号(想定外)は、いちばん先のステージの値 */
export function stageClearBonus(stage: number): number {
  const last = Math.max(...Object.keys(STAGE_CLEAR_BONUS).map(Number));
  return STAGE_CLEAR_BONUS[stage] ?? STAGE_CLEAR_BONUS[last];
}
