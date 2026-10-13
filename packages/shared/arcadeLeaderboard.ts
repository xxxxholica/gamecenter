// アーケード共通ランキング管理基盤(ブラウザ側)。ランキングはサーバー(/api/leaderboard...)に保存する。
// 型・ゲーム定義・順位判定などの純粋ロジックは arcadeLeaderboardCore.ts(サーバーと共有)。
// 通信は同一オリジンの相対パス。失敗しても例外は投げず、取得は「記録なし」、登録は rank=-1 を返す(ゲームの進行を止めない)。
import {
  DEV_NAME,
  GAME_LEADERBOARD_DEFS,
  LEADERBOARD_MAX_ENTRIES,
  isValidAdminRole,
  isValidAdminRoleName,
  leaderboardBoardKey,
  padEmptyEntries,
  rankForScore,
  sanitizeLeaderboardExtra,
  sanitizeLeaderboardName,
} from './arcadeLeaderboardCore.ts';
import type { GameLeaderboardDef, LeaderboardEntry } from './arcadeLeaderboardCore.ts';
import { trackScoreSubmit } from './arcadeAnalytics.ts';

export * from './arcadeLeaderboardCore.ts';

const API = '/api';
const TIMEOUT_MS = 8000;

function safeTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/** loadAllLeaderboards の結果のキー */
export const getLeaderboardKey = leaderboardBoardKey;

const boardPath = (slug: string, variantId?: string) =>
  `${API}/leaderboard/${encodeURIComponent(slug)}${variantId ? `/${encodeURIComponent(variantId)}` : ''}`;

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const jsonBody = body === undefined ? undefined : JSON.stringify(body);
  // Safari/ブラウザの keepalive クォータ(約64KB)未満なら keepalive を有効化し、ページ遷移・iframe破棄時の切断を防ぐ
  const canKeepalive = method === 'POST' && jsonBody !== undefined && jsonBody.length < 60 * 1024;

  const doFetch = (keepalive: boolean) =>
    fetch(path, {
      method,
      headers: jsonBody === undefined ? undefined : { 'content-type': 'application/json' },
      body: jsonBody,
      cache: 'no-store',
      keepalive: keepalive ? true : undefined,
      signal: safeTimeoutSignal(TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await doFetch(canKeepalive);
  } catch (err) {
    if (canKeepalive) {
      // keepalive クォータ超過等の例外時は通常 fetch で再試行
      res = await doFetch(false);
    } else {
      throw err;
    }
  }

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
    .map((item, idx) => {
      const rawRole = (item as any)?.role;
      const role = isValidAdminRole(rawRole) ? rawRole : undefined;
      const rawName = (item as any)?.name;
      const dev = (item as any)?.dev === true ? true : undefined;

      // 管理者が印・ロールを付けた記録は、「好きな名前（ロール）」または DEV_NAME をそのまま使う
      const isAdminNamed =
        (role && typeof rawName === 'string' && isValidAdminRoleName(rawName, role)) ||
        (dev === true && rawName === DEV_NAME);

      return {
        id: typeof item.id === 'string' ? item.id : undefined,
        hasGhost: item.hasGhost === true ? true : undefined,
        rank: idx + 1,
        name: isAdminNamed ? rawName : sanitizeLeaderboardName(rawName),
        score: item.score,
        formattedScore: typeof item.formattedScore === 'string' ? item.formattedScore.slice(0, 40) : def.formatScore(item.score),
        date: typeof item.date === 'string' ? item.date.slice(0, 10) : '',
        extra: typeof item.extra === 'string' ? Array.from(item.extra).slice(0, 30).join('') : undefined,   // 素のまま(HTMLに入れる側が escapeHtml する)
        cleared: item.cleared === true ? true : undefined,
        dev: dev ?? (role === '開発者' ? true : undefined),
        role,
      };
    });
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
export async function loadLeaderboard(slug: string, variantId?: string, minCount = 5): Promise<LeaderboardEntry[]> {
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
  minCount = 5,
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

// ===== プレイチケット =====
// スコアの申告には、サーバーが発行した使い切りの札(チケット)が要る。サーバーは発行からの経過時間を自分の時計で測り、
// 「起動してすぐ高得点」のような申告を断る。札は、ゲームのページを開いた時点と、スコアを送るたびに取り直す。
let ticketSlug: string | null = null;
let ticketPromise: Promise<string | null> | null = null;

async function fetchTicket(slug: string): Promise<string | null> {
  try {
    const data = await request('POST', `${API}/ticket/${encodeURIComponent(slug)}`, {});
    return typeof data?.ticket === 'string' ? data.ticket : null;
  } catch {
    return null;
  }
}

/** このゲームのプレイ開始として、チケットを取っておく(ゲームのページが開いた時に自動で呼ばれる) */
export function beginLeaderboardRun(slug: string): void {
  const def = GAME_LEADERBOARD_DEFS[slug];
  if (!def || !def.hasScore) return;
  ticketSlug = slug;
  ticketPromise = fetchTicket(slug);
}

// ゲームのページ(/games/<slug>/)として開かれた時だけ、自動でチケットを取る(ハブ・テストでは何もしない)。
if (typeof window !== 'undefined' && typeof window.location?.pathname === 'string') {
  const m = /\/games\/([\w-]+)\/?/.exec(window.location.pathname);
  if (m) beginLeaderboardRun(m[1]);
}

// ===== 匿名名の予約 =====
// 登録ウィンドウを出したときに、サーバーで匿名名(匿名A…)を1つ予約する。使われなければ破棄する。
// 予約の札は、そのあとの saveLeaderboardScore が自動で添える(各ゲームの呼び出しは変えなくてよい)。
let anonToken: string | null = null;

/** 匿名名を予約する。失敗(通信エラー・予約の上限)は null(名前なしで登録すればサーバーが採番する) */
export async function reserveAnonName(): Promise<{ token: string; name: string } | null> {
  try {
    const data = await request('POST', `${API}/anon-name/reserve`, {});
    if (typeof data?.token !== 'string' || typeof data?.name !== 'string') return null;
    anonToken = data.token;
    return { token: data.token, name: data.name };
  } catch {
    return null;
  }
}

/** 使われなかった予約を破棄する(ページを離れるときにも送れるよう keepalive) */
export function releaseAnonName(token: string): void {
  if (anonToken === token) anonToken = null;
  try {
    void fetch(`${API}/anon-name/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* 通信できなくても、サーバー側で期限が来れば破棄される */ }
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
  // 札は1回きり: 使うために取り出し、次のプレイ用の札をすぐ取りに行く(取れなかった場合はここで取る)
  const pending = ticketSlug === slug ? ticketPromise : null;
  ticketPromise = null;
  const token = anonToken;   // 予約した匿名名の札は、この登録で使い切る(サーバーが使う・破棄するのどちらでも)
  anonToken = null;
  try {
    const ticket = (pending ? await pending : null) ?? (await fetchTicket(slug));
    const data = await request('POST', boardPath(slug, variantId), {
      name: sanitizeLeaderboardName(name),
      score,
      extra: sanitizeLeaderboardExtra(extra),
      cleared: options.cleared === true ? true : undefined,
      ghost: options.ghost,
      ticket: ticket ?? undefined,
      anonToken: token ?? undefined,
    });
    const list = padEmptyEntries(def, normalizeEntries(def, data.entries), 5);
    const rank = typeof data.rank === 'number' && data.rank > 0 ? data.rank : -1;
    trackScoreSubmit(slug, {
      score,
      formattedScore: typeof def.formatScore === 'function' ? def.formatScore(score) : String(score),
      cleared: options.cleared === true,
      rank,
    });
    return { rank, list };
  } catch (e) {
    console.warn('Failed to save leaderboard', e);
    return { rank: -1, list: [] };
  } finally {
    if (ticketSlug === slug) ticketPromise = fetchTicket(slug);
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
