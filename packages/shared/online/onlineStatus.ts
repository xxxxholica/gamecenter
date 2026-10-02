/// <reference types="vite/client" />
import type { PublicStatus } from './core';

/** 公開ステータスの取得先(読み取り専用の軽いHTTP。全ゲームの開催状況をまとめて返す)。VITE_ONLINE_STATUS で上書き可。 */
function statusUrl(): string {
  const env = import.meta.env.VITE_ONLINE_STATUS as string | undefined;
  if (env) return env;
  if (import.meta.env.DEV) return `http://${location.hostname}:8787/online-status`;
  return '/online-status';
}

/**
 * そのゲームのオンライン対戦が開かれているか。WebSocket には接続しない(通常のプレイヤーがサーバーに負荷をかけないため)。
 * 取得できない/閉鎖中は null。STARTを押した時に1回だけ呼ぶ(定期的な問い合わせはしない)。
 */
export async function fetchOnlineStatus(game: string, timeoutMs = 3000): Promise<PublicStatus | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(statusUrl(), { cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const all = (await res.json()) as { games?: Record<string, PublicStatus> };
    const s = all.games?.[game];
    return s && s.open === true ? s : null;
  } catch {
    return null;
  }
}
