export interface RankingEntry {
  rank: number;
  score: number; // 偏差値 (e.g. 72.5)
  title: string; // 称号 (e.g. "神のギリギリ", "安全第一")
  date: string;
}

// 旧版はダミー記録が届かない点数・存在しない称号だったので、保存キーを変えて古い保存データを引き継がない
const STORAGE_KEY = 'extreme_arcade_ranking_v2';

// 初期のダミー記録。称号はゲームが実際に出すもの(game.ts の結果判定)と同じ5種類に揃える。
// 偏差値は 50 + ((平均 - 60) / 40) * 25 なので、全種目満点(平均100)でも75.0が上限。ダミーはその手前に収める。
const DEFAULT_RANKINGS: RankingEntry[] = [
  { rank: 1, score: 72.5, title: '神のギリギリ', date: '2026/09/08' },
  { rank: 2, score: 66.0, title: '限界チャレンジャー', date: '2026/09/08' },
  { rank: 3, score: 57.5, title: '安全第一', date: '2026/09/08' },
  { rank: 4, score: 44.0, title: 'チキン野郎', date: '2026/09/08' },
  { rank: 5, score: 30.0, title: '大惨事常習犯', date: '2026/09/08' },
];

export class RankingManager {
  static getRankings(): RankingEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_RANKINGS;
  }

  static addScore(score: number, title: string): number {
    const list = this.getRankings();
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    list.push({ rank: 0, score, title, date: today });
    // Sort descending by score
    list.sort((a, b) => b.score - a.score);
    // Keep top 5
    const top5 = list.slice(0, 5).map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(top5));
    } catch {
      // ignore
    }

    // Return new rank if in top 5, or -1
    const entered = top5.findIndex((item) => item.score === score && item.title === title);
    return entered >= 0 ? entered + 1 : -1;
  }
}
