/// <reference types="vite/client" />
import type { PublicStatus } from './core';

const CLOCK_WINDOW = 12;
const sharedSamples: { rtt: number; offset: number }[] = [];
let sharedOffset = 0;

/**
 * サーバー時刻のサンプル(HTTP /online-status または WebSocket hello)を記録し、
 * 直近サンプルのうち最もRTTが小さかったオフセットを採用する。
 */
export function recordServerClockSample(rtt: number, serverNowMs: number, clientNowMs = Date.now()): void {
  if (!Number.isFinite(rtt) || rtt < 0 || !Number.isFinite(serverNowMs)) return;
  const offset = serverNowMs + rtt / 2 - clientNowMs;
  sharedSamples.push({ rtt, offset });
  if (sharedSamples.length > CLOCK_WINDOW) sharedSamples.shift();
  sharedOffset = sharedSamples.reduce((best, x) => (x.rtt < best.rtt ? x : best)).offset;
}

/** 共有のサーバー推定時刻(ms)。WebSocket 接続前の待機画面でも /online-status の結果から時計が合う。 */
export function sharedServerNow(clientNowMs = Date.now()): number {
  return clientNowMs + sharedOffset;
}

/** 1回以上サーバーと時計合わせが済んでいるか。 */
export function hasServerClockSync(): boolean {
  return sharedSamples.length > 0;
}

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
    const t0 = Date.now();
    const res = await fetch(statusUrl(), { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return {};
    const all = (await res.json()) as { now?: number; games?: Record<string, PublicStatus> };
    const t1 = Date.now();
    if (typeof all.now === 'number' && Number.isFinite(all.now)) {
      // HTTPはWebSocketフレームよりわずかにオーバーヘッドがあるため+5msの下駄を履かせ、WebSocket接続後はWSサンプルを優先させる
      recordServerClockSample(t1 - t0 + 5, all.now, t1);
    }
    return all.games && typeof all.games === 'object' ? all.games : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

