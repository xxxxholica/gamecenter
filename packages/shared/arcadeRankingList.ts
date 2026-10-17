// 結果画面に出すランキング表(見出し + 「順位・名前・スコア」の行)。見た目(.rank-head / .rank-row など)はゲームごとの CSS。
import type { LeaderboardEntry } from './arcadeLeaderboard';

/** box の中身をランキング表で描き直す。list が null の間は「読み込み中…」。highlightRank の行には .me を付ける */
export function renderRankingList(box: HTMLElement, list: LeaderboardEntry[] | null, highlightRank?: number): void {
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rank-head';
  head.textContent = 'ランキング';
  box.append(head);
  if (!list) {
    const row = document.createElement('div');
    row.className = 'rank-row empty';
    row.textContent = '読み込み中…';
    box.append(row);
    return;
  }
  for (const e of list) {
    const row = document.createElement('div');
    row.className = `rank-row r${e.rank}`;
    if (e.score <= 0) row.classList.add('empty');
    if (e.rank === highlightRank) row.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank-no';
    rank.textContent = `${e.rank}位`;
    const name = document.createElement('span');
    name.className = 'rank-name';
    name.textContent = e.name;
    const sc = document.createElement('span');
    sc.className = 'rank-score';
    sc.textContent = e.formattedScore;
    row.append(rank, name, sc);
    box.append(row);
  }
}
