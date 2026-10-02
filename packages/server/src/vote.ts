// 「固定 > 多数決 > 抽選」の決定ルール。主催者が固定していればそれ、していなければ参加者の希望の最多(同数はその中から抽選)、
// 希望が1つもなければ全体から抽選。skyway のコース、えんにち射的のモードで共通。
export const RANDOM = 'random';

/** 希望の集計(選択肢 → 人数)。null(希望なし)は数えない。 */
export function tally(choices: (string | null | undefined)[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const c of choices) if (c) v[c] = (v[c] ?? 0) + 1;
  return v;
}

export function decide(fixed: string, ids: string[], votes: Record<string, number>, rand: () => number = Math.random): string {
  if (fixed !== RANDOM) return fixed;
  const max = Math.max(0, ...ids.map((id) => votes[id] ?? 0));
  const pool = max > 0 ? ids.filter((id) => (votes[id] ?? 0) === max) : ids;
  return pool[Math.floor(rand() * pool.length)];
}
