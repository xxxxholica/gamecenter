// アーケード共通ランキング管理基盤(ブラウザ側)。ランキングはサーバー(/api/leaderboard...)に保存する。
// 型・ゲーム定義・順位判定などの純粋ロジックは arcadeLeaderboardCore.ts(サーバーと共有)。
// 通信は同一オリジンの相対パス。失敗しても例外は投げず、取得は「記録なし」、登録は rank=-1 を返す(ゲームの進行を止めない)。
import {
  DEV_NAME,
  GAME_LEADERBOARD_DEFS,
  LEADERBOARD_MAX_ENTRIES,
  leaderboardBoardKey,
  padEmptyEntries,
  rankForScore,
  sanitizeLeaderboardExtra,
  sanitizeLeaderboardName,
} from './arcadeLeaderboardCore.ts';
import type { GameLeaderboardDef, LeaderboardEntry } from './arcadeLeaderboardCore.ts';

export * from './arcadeLeaderboardCore.ts';

const API = '/api';
const TIMEOUT_MS = 5000;

/** loadAllLeaderboards の結果のキー */
export const getLeaderboardKey = leaderboardBoardKey;

const boardPath = (slug: string, variantId?: string) =>
  `${API}/leaderboard/${encodeURIComponent(slug)}${variantId ? `/${encodeURIComponent(variantId)}` : ''}`;

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

/**
 * サーバーの応答を、型と範囲が正しい形に整える(名前の再検証・件数・日付の長さ)。
 * 文字列は素のまま返す。HTML に入れる側(innerHTML)が、出力するときに escapeHtml する。textContent に入れる側はそのまま使える。
 */
function normalizeEntries(def: GameLeaderboardDef, list: unknown): LeaderboardEntry[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.score === 'number' && item.score > 0 && item.name !== '記録なし')
    .slice(0, LEADERBOARD_MAX_ENTRIES)
    .map((item, idx) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      hasGhost: item.hasGhost === true ? true : undefined,
      rank: idx + 1,
      // 開発者の印が付いた記録だけ、予約された名前をそのまま使う(プレイヤーの名前は DEV_NAME を拒否する)
      name: item.dev === true && item.name === DEV_NAME ? DEV_NAME : sanitizeLeaderboardName(item.name),
      score: item.score,
      formattedScore: typeof item.formattedScore === 'string' ? item.formattedScore.slice(0, 40) : def.formatScore(item.score),
      date: typeof item.date === 'string' ? item.date.slice(0, 10) : '',
      extra: typeof item.extra === 'string' ? Array.from(item.extra).slice(0, 30).join('') : undefined,   // 素のまま(HTMLに入れる側が escapeHtml する)
      cleared: item.cleared === true ? true : undefined,
      dev: item.dev === true ? true : undefined,
    }));
}

/** 保存済みの実スコアリスト(「記録なし」の枠は含まない)。通信に失敗したら例外 */
async function fetchRawScores(def: GameLeaderboardDef, slug: string, variantId?: string): Promise<LeaderboardEntry[]> {
  const data = await request('GET', boardPath(slug, variantId));
  return normalizeEntries(def, data.entries);
}

/** 保存済みの実スコアリストのみを取得する(「記録なし」の枠は含まない)。失敗時は空 */
export async function loadRawScores(slug: string, variantId?: string): Promise<LeaderboardEntry[]> {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore) return [];
  try {
    return await fetchRawScores(def, slug, variantId);
  } catch (e) {
    console.warn('Failed to load leaderboard', e);
    return [];
  }
}

/** 表示用ランキングを取得する(実記録が minCount 未満なら「記録なし」の枠で埋める) */
export async function loadLeaderboard(slug: string, variantId?: string, minCount = 3): Promise<LeaderboardEntry[]> {
  const def = GAME_LEADERBOARD_DEFS[slug];
  const raw = await loadRawScores(slug, variantId);
  return padEmptyEntries(def, raw, minCount);
}

/** 全ゲーム・全バリアントのランキングを1回で取得する(ハブ用)。キーは getLeaderboardKey(slug, variantId)。失敗時は空 */
export async function loadAllLeaderboards(): Promise<Record<string, LeaderboardEntry[]>> {
  try {
    const data = await request('GET', `${API}/leaderboards`);
    const out: Record<string, LeaderboardEntry[]> = {};
    for (const [key, list] of Object.entries<unknown>(data.boards ?? {})) {
      const def = GAME_LEADERBOARD_DEFS[key.split(':')[0]];
      if (def) out[key] = normalizeEntries(def, list);
    }
    return out;
  } catch (e) {
    console.warn('Failed to load leaderboards', e);
    return {};
  }
}

/**
 * 表示用ランキングと、今回のスコアが上位に入るかを1回の取得でまとめて返す(結果画面でランキング表も出すとき用)。
 * 通信に失敗したら「記録なし」の枠だけで、入らない扱い(サーバーに届かないなら、名前を入れさせても登録できない)。
 */
export async function loadLeaderboardAndCheck(
  slug: string,
  score: number,
  variantId?: string,
  minCount = 3,
  maxEntries = LEADERBOARD_MAX_ENTRIES,
): Promise<{ list: LeaderboardEntry[]; isRankIn: boolean; rank: number }> {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore) return { list: padEmptyEntries(def, [], minCount), isRankIn: false, rank: -1 };
  try {
    const raw = await fetchRawScores(def, slug, variantId);
    const rank = rankForScore(def, raw, score, maxEntries);
    return { list: padEmptyEntries(def, raw, minCount), isRankIn: rank > 0, rank };
  } catch (e) {
    console.warn('Failed to load leaderboard', e);
    return { list: padEmptyEntries(def, [], minCount), isRankIn: false, rank: -1 };
  }
}

/** 今回のスコアが上位に入るか(名前入力を出すかの判定)。通信に失敗したら入らない扱い */
export async function checkHighScore(
  slug: string,
  score: number,
  variantId?: string,
  maxEntries = LEADERBOARD_MAX_ENTRIES,
): Promise<{ isRankIn: boolean; rank: number }> {
  if (score <= 0) return { isRankIn: false, rank: -1 };
  const { isRankIn, rank } = await loadLeaderboardAndCheck(slug, score, variantId, 0, maxEntries);
  return { isRankIn, rank };
}

export interface SaveLeaderboardOptions {
  /** ステージを最後までクリアした記録なら true。ホームのランキングで、名前の右に ★ が付く */
  cleared?: boolean;
  /** midnight-skyway: 走行の軌跡(ゴースト)。上位に入ったときだけサーバーに保存される */
  ghost?: unknown;
}

/** 記録を登録する。rank は登録後の順位(圏外・失敗は -1)、list は更新後の表示用ランキング */
export async function saveLeaderboardScore(
  slug: string,
  score: number,
  name: string,
  variantId?: string,
  extra?: string,
  options: SaveLeaderboardOptions = {},
): Promise<{ rank: number; list: LeaderboardEntry[] }> {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore || score <= 0) return { rank: -1, list: [] };
  try {
    const data = await request('POST', boardPath(slug, variantId), {
      name: sanitizeLeaderboardName(name),
      score,
      extra: sanitizeLeaderboardExtra(extra),
      cleared: options.cleared === true ? true : undefined,
      ghost: options.ghost,
    });
    const list = padEmptyEntries(def, normalizeEntries(def, data.entries), 3);
    return { rank: typeof data.rank === 'number' && data.rank > 0 ? data.rank : -1, list };
  } catch (e) {
    console.warn('Failed to save leaderboard', e);
    return { rank: -1, list: [] };
  }
}

/** エントリidを指定してゴースト(走行の軌跡)を取得する。失敗は null */
export async function fetchGhost<T = unknown>(slug: string, variantId: string, id: string): Promise<T | null> {
  try {
    const data = await request('GET', `${API}/ghost/${encodeURIComponent(slug)}/${encodeURIComponent(variantId)}/${encodeURIComponent(id)}`);
    return (data.ghost ?? null) as T | null;
  } catch (e) {
    console.warn('Failed to load ghost', e);
    return null;
  }
}
