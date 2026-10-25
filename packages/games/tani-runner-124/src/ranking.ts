// ============================================================
// Ranking: 取得単位(壁に着いた時の人数 × 到達倍率)の上位5件をサーバーに保存する
// ============================================================

import { saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';

export class RankingStore {
  /** 順位と登録結果を、共通の名前入力画面へ返す。 */
  static add(score: number, name = 'ゲスト') {
    return saveLeaderboardScore('tani-runner-124', score, name);
  }
}
