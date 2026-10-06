// ============================================================
// Ranking: 取得単位(壁に着いた時の人数 × 到達倍率)の上位3件をサーバーに保存する
// ============================================================

import {
  loadLeaderboard,
  saveLeaderboardScore,
  LeaderboardEntry,
} from '../../../shared/arcadeLeaderboard';

export interface RankingEntry {
  score: number;
  name: string;
  date: string;
}

const MIN_ROWS = 3;

export class RankingStore {
  static load(level: string): Promise<LeaderboardEntry[]> {
    return loadLeaderboard('tani-runner-124', level);
  }

  /** 記録を追加して保存し、今回の順位(0始まり)を返す。圏外なら -1 */
  static async add(score: number, level: string, name = 'ゲスト'): Promise<number> {
    const res = await saveLeaderboardScore('tani-runner-124', score, name, level);
    return res.rank > 0 ? res.rank - 1 : -1;
  }

  /** ランキングを <ol> に描く。highlightIndex は今回の記録の位置(0始まり、なければ -1) */
  static async render(listEl: HTMLElement | null, level: string, highlightIndex: number = -1): Promise<void> {
    if (!listEl) return;
    const list = await RankingStore.load(level);
    listEl.innerHTML = '';
    const rows = Math.max(MIN_ROWS, list.length);
    for (let i = 0; i < rows; i++) {
      const li = document.createElement('li');
      if (i < list.length) {
        li.textContent = `${list[i].name}  ${list[i].score} 単位`;
      } else {
        li.textContent = '---';
        li.className = 'ranking-empty';
      }
      if (i === highlightIndex) li.className = 'ranking-current';
      listEl.appendChild(li);
    }
  }
}
