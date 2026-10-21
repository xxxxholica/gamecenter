// ============================================================
// Ranking: 取得単位(壁に着いた時の人数 × 到達倍率)の上位5件をサーバーに保存する
// ============================================================

import { saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';

export class RankingStore {
  /** 記録を追加して保存し、今回の順位(0始まり)を返す。圏外なら -1 */
  static async add(score: number, name = 'ゲスト'): Promise<number> {
    const res = await saveLeaderboardScore('tani-runner-124', score, name);
    return res.rank > 0 ? res.rank - 1 : -1;
  }
}
