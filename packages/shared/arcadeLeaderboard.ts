// アーケード共通ランキング管理基盤
// 各ゲームおよびホーム画面(hub)で同一のlocalStorageキーとデータ構造を共有する

export interface LeaderboardEntry {
  rank: number;
  name: string;      // カタカナ最大5文字 (記録なしの場合は「記録なし」)
  score: number;     // 比較用スコア数値(タイムアタックはミリ秒)
  formattedScore: string; // 表示用文字列 (例: "0 pts", "0 単位", "00:00.000", "0 pt")
  date: string;      // YYYY/MM/DD
  extra?: string;    // 称号やマシン名など
  /** ステージを最後までクリアした記録か。ホームのランキングで、名前の右に ★ を付けて表示する */
  cleared?: boolean;
}

export interface LeaderboardVariant {
  id: string;        // 例: "tokyo_skyway", "elementary"
  label: string;     // 表示名 例: "STAGE01", "小学生"
}

export interface GameLeaderboardDef {
  slug: string;
  hasScore: boolean;
  scoreOrder: 'desc' | 'asc'; // desc: 高い方が上位, asc: 低い方(タイム等)が上位
  unit: string;
  formatScore: (score: number) => string;
  variants?: LeaderboardVariant[];
}

function padZero(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

/** HTML特殊文字をエスケープして XSS (Cross-Site Scripting) を防止する */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 簡易NGワード（公序良俗・卑猥・差別用語の主要パターン）
const NG_WORD_REGEX = /^(シネ|コロス|キチガイ|バカ|アホ|カス|シネヨ|レイプ|チンコ|マンコ|ペニス|セックス|オメコ)$/i;

/**
 * プレイヤー名を厳格に検証・サニタイズする (最大5文字)
 * 危険なHTML特殊文字、制御文字、不正な型を除去し、安全な文字列に正規化する。
 */
export function sanitizeLeaderboardName(rawName: unknown): string {
  if (typeof rawName !== 'string') return 'ゲスト';
  // 制御文字・危険記号（< > " ' & ` \ / など）および改行を除去
  const cleaned = rawName
    .replace(/[\u0000-\u001F\u007F-\u009F<>'"&`\\/]/g, '')
    .trim()
    .slice(0, 5);
  if (!cleaned) return 'ゲスト';
  if (NG_WORD_REGEX.test(cleaned)) {
    return 'ゲスト';
  }
  return cleaned;
}

export function formatTimeMs(ms: number): string {
  if (ms <= 0) return '00:00.000';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${padZero(m, 2)}:${padZero(s, 2)}.${padZero(millis, 3)}`;
}

export const GAME_LEADERBOARD_DEFS: Record<string, GameLeaderboardDef> = {
  'street-b-boy': {
    slug: 'street-b-boy',
    hasScore: true,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'ennichi-shateki': {
    slug: 'ennichi-shateki',
    hasScore: true,
    scoreOrder: 'desc',
    unit: 'g',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} g` : '0 g'),
  },
  'extreme-edge-arcade': {
    slug: 'extreme-edge-arcade',
    hasScore: true,
    scoreOrder: 'desc',
    unit: 'pt',
    formatScore: (score) => (score > 0 ? `${score.toFixed(1)} pt` : '0.0 pt'),
  },
  'tani-runner-124': {
    slug: 'tani-runner-124',
    hasScore: true,
    scoreOrder: 'desc',
    unit: '単位',
    formatScore: (score) => (score > 0 ? `${Math.floor(score)} 単位` : '0 単位'),
    variants: [
      { id: 'elementary', label: '小学生レベル' },
      { id: 'middle', label: '中学生レベル' },
      { id: 'kosen', label: '高専生レベル' },
    ],
  },
  'midnight-skyway': {
    slug: 'midnight-skyway',
    hasScore: true,
    scoreOrder: 'asc',
    unit: '',
    formatScore: (score) => formatTimeMs(score),
    variants: [
      { id: 'tokyo_skyway', label: '東京 丸の内スカイウェイ' },
      { id: 'helsinki_technical', label: 'ヘルシンキ ハーバーリッジ' },
      { id: 'tokyo_climb', label: '東京 スカイクライム' },
    ],
  },
  'school-corridor-runner': {
    slug: 'school-corridor-runner',
    hasScore: true,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'survivor-score-battle': {
    slug: 'survivor-score-battle',
    hasScore: true,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'phaser-fighter': {
    slug: 'phaser-fighter',
    hasScore: false,
    scoreOrder: 'desc',
    unit: 'pt',
    formatScore: () => '0 pt',
  },
};

const STORAGE_PREFIX = 'gamecenter:leaderboard:v2:';

export function getLeaderboardKey(slug: string, variantId?: string): string {
  return variantId ? `${STORAGE_PREFIX}${slug}:${variantId}` : `${STORAGE_PREFIX}${slug}`;
}

/** 保存済みの実スコアリストのみを取得する（モックや未記録は含まない） */
export function loadRawScores(slug: string, variantId?: string): LeaderboardEntry[] {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore) return [];

  const key = getLeaderboardKey(slug, variantId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (item) => item && typeof item.score === 'number' && item.score > 0 && item.name !== '記録なし',
          )
          .map((item) => ({
            ...item,
            name: sanitizeLeaderboardName(item.name),
            formattedScore:
              typeof item.formattedScore === 'string'
                ? escapeHtml(item.formattedScore)
                : def.formatScore(item.score),
            date: typeof item.date === 'string' ? item.date.slice(0, 10) : '',
            extra: typeof item.extra === 'string' ? escapeHtml(item.extra.slice(0, 30)) : undefined,
            cleared: item.cleared === true ? true : undefined,
          }));
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/** 表示用ランキングを取得する（実記録が minCount 未満の場合は「記録なし / 0pt」等のスロットで埋めて返す） */
export function loadLeaderboard(slug: string, variantId?: string, minCount = 3): LeaderboardEntry[] {
  const def = GAME_LEADERBOARD_DEFS[slug];
  const zeroFormatted = def ? def.formatScore(0) : '0 pt';

  // 対戦専用・スコアなしゲーム
  if (!def || !def.hasScore) {
    const emptyList: LeaderboardEntry[] = [];
    for (let i = 0; i < minCount; i++) {
      emptyList.push({
        rank: i + 1,
        name: '記録なし',
        score: 0,
        formattedScore: zeroFormatted,
        date: '',
      });
    }
    return emptyList;
  }

  const raw = loadRawScores(slug, variantId);
  const result: LeaderboardEntry[] = raw.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  for (let i = result.length; i < minCount; i++) {
    result.push({
      rank: i + 1,
      name: '記録なし',
      score: 0,
      formattedScore: zeroFormatted,
      date: '',
    });
  }

  return result;
}

/** ランキングボード(ハブ)に出るのは上位3位まで。4位以下は記録も名前登録もしない。 */
export const LEADERBOARD_MAX_ENTRIES = 3;

export function checkHighScore(
  slug: string,
  score: number,
  variantId?: string,
  maxEntries = LEADERBOARD_MAX_ENTRIES,
): { isRankIn: boolean; rank: number } {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore || score <= 0) return { isRankIn: false, rank: -1 };

  const currentList = loadRawScores(slug, variantId);
  const isAsc = def.scoreOrder === 'asc';

  // 比較ロジック: ascなら score < 他, descなら score > 他
  const isBetter = (a: number, b: number) => (isAsc ? a < b : a > b);

  let newRank = -1;
  for (let i = 0; i < currentList.length; i++) {
    if (isBetter(score, currentList[i].score)) {
      newRank = i + 1;
      break;
    }
  }

  if (newRank === -1 && currentList.length < maxEntries) {
    newRank = currentList.length + 1;
  }

  return {
    isRankIn: newRank > 0 && newRank <= maxEntries,
    rank: newRank,
  };
}

export interface SaveLeaderboardOptions {
  /** ステージを最後までクリアした記録なら true。ホームのランキングで、名前の右に ★ が付く */
  cleared?: boolean;
  maxEntries?: number;
}

export function saveLeaderboardScore(
  slug: string,
  score: number,
  name: string,
  variantId?: string,
  extra?: string,
  options: SaveLeaderboardOptions = {},
): { rank: number; list: LeaderboardEntry[] } {
  const maxEntries = options.maxEntries ?? LEADERBOARD_MAX_ENTRIES;
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore || score <= 0) return { rank: -1, list: [] };

  const list = loadRawScores(slug, variantId);
  const isAsc = def.scoreOrder === 'asc';
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');

  const safeName = sanitizeLeaderboardName(name);
  const newEntry: LeaderboardEntry = {
    rank: 0,
    name: safeName,
    score,
    formattedScore: def.formatScore(score),
    date: today,
    extra: typeof extra === 'string' ? escapeHtml(extra.slice(0, 30)) : undefined,
    cleared: options.cleared === true ? true : undefined,
  };

  list.push(newEntry);
  list.sort((a, b) => (isAsc ? a.score - b.score : b.score - a.score));

  const topRaw = list.slice(0, maxEntries).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  try {
    const key = getLeaderboardKey(slug, variantId);
    localStorage.setItem(key, JSON.stringify(topRaw));
  } catch (e) {
    console.warn('Failed to save leaderboard to localStorage', e);
  }

  const enteredRank =
    topRaw.findIndex((item) => item === newEntry || (item.score === score && item.name === newEntry.name)) + 1;
  return { rank: enteredRank > 0 ? enteredRank : -1, list: loadLeaderboard(slug, variantId, 3) };
}
