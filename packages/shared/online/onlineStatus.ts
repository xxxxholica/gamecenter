/// <reference types="vite/client" />
import type { PublicStatus } from './core';

/** 公開ステータスの取得先(読み取り専用の軽いHTTP。全ゲームの開催状況をまとめて返す)。VITE_ONLINE_STATUS で上書き可。 */
function statusUrl(): string {
  const env = import.meta.env?.VITE_ONLINE_STATUS as string | undefined;
  if (env) return env;
  if (import.meta.env?.DEV) return `http://${location.hostname}:8787/online-status`;
  return '/online-status';
}

/**
 * そのゲームのオンライン対戦が開かれているか。WebSocket には接続しない(通常のプレイヤーがサーバーに負荷をかけないため)。
 * 取得できない/閉鎖中は null。モード選択や、満員・対戦中の空き待ちで呼ぶ。
 */
export async function fetchOnlineStatus(game: string, timeoutMs = 3000): Promise<PublicStatus | null> {
  const games = await fetchAllOnlineStatuses(timeoutMs);
  const s = Object.hasOwn(games, game) ? games[game] : undefined;
  return s && s.open === true ? s : null;
}

/**
 * 全ゲームのオンライン対戦開催状況を取得する。
 * 各ゲームの公開ステータス（open, players, max, phase等）のマップを返す。
 */
export async function fetchAllOnlineStatuses(timeoutMs = 3000): Promise<Record<string, PublicStatus>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(statusUrl(), { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return {};
    const all = (await res.json()) as { games?: Record<string, PublicStatus> };
    return all.games && typeof all.games === 'object' ? all.games : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

