// ============================================================
// Ranking: 取得単位(壁に着いた時の人数 × 到達倍率)の上位5件をブラウザに保存する
// ============================================================

export interface RankingEntry {
  score: number;
  date: string;
}

const STORAGE_KEY_PREFIX = 'tani_runner_ranking';

// レベルごとに別のランキング(数式の難しさが違うので、点数を比べられない)
function storageKey(level: string): string {
  return `${STORAGE_KEY_PREFIX}_${level}`;
}
const MAX_ENTRIES = 5;
const MIN_ROWS = 3;

export class RankingStore {
  static load(level: string): RankingEntry[] {
    try {
      const raw = localStorage.getItem(storageKey(level));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((e) => e && typeof e.score === 'number' && typeof e.date === 'string')
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  }

  /** 記録を追加して保存し、今回の順位(1始まり)を返す。圏外なら -1 */
  static add(score: number, level: string): number {
    const list = RankingStore.load(level);
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    const entry: RankingEntry = { score, date: today };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, MAX_ENTRIES);
    try {
      localStorage.setItem(storageKey(level), JSON.stringify(top));
    } catch {
      // 保存できない環境では、今回の表示だけに使う
    }
    return top.indexOf(entry);
  }

  /** ランキングを <ol> に描く。highlightIndex は今回の記録の位置(0始まり、なければ -1) */
  static render(listEl: HTMLElement | null, level: string, highlightIndex: number = -1): void {
    if (!listEl) return;
    const list = RankingStore.load(level);
    listEl.innerHTML = '';
    // 記録が少なくても(空でも)、最低3行は出す。空きは「---」
    const rows = Math.max(MIN_ROWS, list.length);
    for (let i = 0; i < rows; i++) {
      const li = document.createElement('li');
      li.textContent = i < list.length ? `${list[i].score}` : '---';
      if (i >= list.length) li.className = 'ranking-empty';
      if (i === highlightIndex) li.className = 'ranking-current';
      listEl.appendChild(li);
    }
  }
}
