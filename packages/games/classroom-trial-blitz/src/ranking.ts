const STORAGE_KEY = 'classroom-trial-blitz-ranking';
const MAX_ENTRIES = 5;

export function loadRanking(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === 'number');
  } catch {
    // ignore corrupt storage
  }
  return [];
}

export function submitScore(score: number): number[] {
  const ranking = loadRanking();
  ranking.push(score);
  ranking.sort((a, b) => b - a);
  const top = ranking.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(top));
  } catch {
    // storage unavailable; ranking stays in-memory for this session only
  }
  return top;
}
