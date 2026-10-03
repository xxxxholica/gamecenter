import {
  loadLeaderboard,
  saveLeaderboardScore,
  LeaderboardEntry,
} from '../../../shared/arcadeLeaderboard';

export interface RankingEntry {
  rank: number;
  score: number; // 偏差値 (e.g. 72.5)
  title: string; // 称号 (e.g. "神のギリギリ", "安全第一")
  name: string;  // カタカナ5文字
  date: string;
}

export class RankingManager {
  static getRankings(): RankingEntry[] {
    const list: LeaderboardEntry[] = loadLeaderboard('extreme-edge-arcade');
    return list.map((item) => ({
      rank: item.rank,
      score: item.score,
      title: item.extra || '安全第一',
      name: item.name,
      date: item.date,
    }));
  }

  static addScore(score: number, title: string, name = 'ゲスト'): number {
    const res = saveLeaderboardScore('extreme-edge-arcade', score, name, undefined, title);
    return res.rank;
  }
}
