export interface RankingEntry {
  rank: number;
  score: number; // 偏差値 (e.g. 85.4)
  title: string; // 称号 (e.g. "神の領域", "鋼の心臓")
  date: string;
}

const STORAGE_KEY = 'extreme_arcade_ranking';

const DEFAULT_RANKINGS: RankingEntry[] = [
  { rank: 1, score: 86.8, title: '鋼の心臓', date: '2026/09/08' },
  { rank: 2, score: 79.4, title: '限界チャレンジャー', date: '2026/09/08' },
  { rank: 3, score: 72.1, title: '勝負師', date: '2026/09/08' },
  { rank: 4, score: 65.5, title: '命知らず', date: '2026/09/08' },
  { rank: 5, score: 58.0, title: '安全第一', date: '2026/09/08' },
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
