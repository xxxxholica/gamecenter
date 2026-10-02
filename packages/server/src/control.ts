// 管理用の制御チャネル(CLI用)。ローカルのUnixソケット(所有者のみ rw)だけで受け付ける。
// サーバー機にログインできる人(=主催者)だけが `npm run ctl` で開放/閉鎖/キックできる。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameStatus, OpenOptions } from './host.ts';
import { RANDOM } from './vote.ts';

export const DEFAULT_SOCKET = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'control.sock');

/** 開放時間のランダムは、この中(分)から開放した時に1回だけ選ぶ。 */
export const RANDOM_MINUTES = [60, 120, 180, 360];

/** 不正なURL(`GET http://[bad/` など)でも例外にならないURLパース。失敗は null。 */
export function safeUrl(raw: string | undefined): URL | null {
  try {
    return new URL(raw ?? '/', 'http://127.0.0.1');
  } catch {
    return null;
  }
}

export interface ServerStatus {
  games: GameStatus[];
  /** 全体の接続数 */
  clients: number;
}

export interface ControlHandlers {
  status(): ServerStatus;
  /** game は id または、一意に決まる部分文字列(例: skyway)。見つからなければ false */
  open(game: string, opts: OpenOptions): boolean;
  /** game='all' で全ゲームを閉鎖(緊急停止) */
  close(game: string): boolean;
  kick(game: string, id: number): boolean;
}

/**
 * /open?game=&minutes=&<設定のキー>=<値> を読む。minutes は 'random' も可(1・2・3・6時間から1回選ぶ)。
 * game 以外のキーは、すべてゲーム固有の設定として渡す(不正な値はゲーム側が無視する)。
 */
export function parseOpenOptions(url: URL, maxMinutes = 24 * 60): { game: string; opts: OpenOptions } {
  const raw = url.searchParams.get('minutes') ?? '0';
  const minutes = raw === RANDOM ? RANDOM_MINUTES[Math.floor(Math.random() * RANDOM_MINUTES.length)] : Number(raw);
  const config: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (k !== 'game' && k !== 'minutes') config[k] = v;
  return {
    game: url.searchParams.get('game') ?? '',
    opts: { minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, maxMinutes) : undefined, config },
  };
}

/** 管理操作(CLI・管理画面で共通)。レスポンスは { code, body }。 */
export function handleAdminRequest(h: ControlHandlers, method: string, url: URL): { code: number; body: object } {
  if (method === 'GET' && url.pathname === '/status') return { code: 200, body: h.status() };
  if (method === 'POST' && url.pathname === '/open') {
    const { game, opts } = parseOpenOptions(url);
    return h.open(game, opts) ? { code: 200, body: h.status() } : { code: 404, body: { error: 'unknown_game' } };
  }
  if (method === 'POST' && url.pathname === '/close') {
    return h.close(url.searchParams.get('game') ?? '') ? { code: 200, body: h.status() } : { code: 404, body: { error: 'unknown_game' } };
  }
  if (method === 'POST' && url.pathname === '/kick') {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id)) return { code: 400, body: { error: 'bad_request' } };
    return h.kick(url.searchParams.get('game') ?? '', id) ? { code: 200, body: h.status() } : { code: 404, body: { error: 'not_found' } };
  }
  return { code: 404, body: { error: 'not_found' } };
}

export function startControl(socketPath: string, h: ControlHandlers): http.Server {
  try {
    fs.unlinkSync(socketPath);              // 前回の異常終了で残ったソケット
  } catch { /* なければ何もしない */ }
  const server = http.createServer((req, res) => {
    const url = safeUrl(req.url);
    const r = url ? handleAdminRequest(h, req.method ?? 'GET', url) : { code: 400, body: { error: 'bad_request' } };
    res.writeHead(r.code, { 'content-type': 'application/json' }).end(JSON.stringify(r.body));
  });
  server.listen(socketPath, () => {
    fs.chmodSync(socketPath, 0o600);        // 所有ユーザーだけが接続できる
  });
  return server;
}
