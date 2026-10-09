// 管理用の制御チャネル(CLI用)。ローカルのUnixソケット(所有者のみ rw)だけで受け付ける。
// サーバー機にログインできる人(=主催者)だけが `npm run ctl` で開放/閉鎖/キックできる。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameStatus, OpenOptions } from './host.ts';
import type { SetRoleOptions } from './leaderboardStore.ts';
import type { AdminRole } from '../../shared/arcadeLeaderboardCore.ts';
import { RANDOM } from './vote.ts';

export const DEFAULT_SOCKET = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'control.sock');   // data/ はサービスが書き込める唯一の場所

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
  /** ランキングの枠('<ゲームid>' か '<ゲームid>:<バリアント>')の記録をすべて消す。消した件数。存在しない枠は null */
  clearBoard(board: string): number | null;
  /** 管理画面用: すべてのランキングの枠(空の枠も)と、その記録 */
  listBoards(): { board: string; slug: string; variant?: string; variantLabel?: string; entries: object[] }[];
  /** ランキングの枠の rank 位(1始まり)に、開発者の印を付ける・外す。変えたら true、すでにその状態なら false、存在しない枠・順位は null */
  setDev(board: string, rank: number, on: boolean): boolean | null;
  /** ランキングの枠の rank 位(1始まり)に、ロール(「開発者」「テスター」)と任意の名前を設定する・外す。変えたら true、すでにその状態なら false、存在しない枠・順位・無効な値は null */
  setRole(board: string, rank: number, opts: SetRoleOptions): boolean | null;
  /** ランキングの枠の rank 位(1始まり)を1件消す。消したら true、なければ false、存在しない枠は null */
  removeEntry(board: string, rank: number): boolean | null;
  /** アナリティクスサマリーの取得 */
  getAnalyticsSummary(): object;
  /** アナリティクスデータの項目別JSONエクスポート */
  exportAnalytics(type: string, gameId?: string): object;
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
  if (method === 'GET' && url.pathname === '/lb') return { code: 200, body: { boards: h.listBoards() } };
  if (method === 'POST' && url.pathname === '/lb-role') {
    const rank = Number(url.searchParams.get('rank'));
    const on = url.searchParams.get('on');
    if (!Number.isInteger(rank) || (on !== '1' && on !== '0')) return { code: 400, body: { error: 'bad_request' } };
    const board = url.searchParams.get('board') ?? '';
    if (on === '0') {
      const r = h.setRole(board, rank, { on: false });
      return r === null ? { code: 404, body: { error: 'not_found' } } : { code: 200, body: { changed: r } };
    }
    const name = url.searchParams.get('name') ?? '';
    const role = url.searchParams.get('role') as AdminRole;
    if (!name || !role) return { code: 400, body: { error: 'bad_request' } };
    const r = h.setRole(board, rank, { on: true, name, role });
    return r === null ? { code: 400, body: { error: 'invalid_role_or_name' } } : { code: 200, body: { changed: r } };
  }
  if (method === 'POST' && url.pathname === '/lb-dev') {
    const rank = Number(url.searchParams.get('rank'));
    const on = url.searchParams.get('on');
    if (!Number.isInteger(rank) || (on !== '1' && on !== '0')) return { code: 400, body: { error: 'bad_request' } };
    const name = url.searchParams.get('name');
    const role = url.searchParams.get('role') as AdminRole;
    if (on === '1' && name && role) {
      const r = h.setRole(url.searchParams.get('board') ?? '', rank, { on: true, name, role });
      return r === null ? { code: 400, body: { error: 'invalid_role_or_name' } } : { code: 200, body: { changed: r } };
    }
    const r = h.setDev(url.searchParams.get('board') ?? '', rank, on === '1');
    return r === null ? { code: 404, body: { error: 'not_found' } } : { code: 200, body: { changed: r } };
  }
  if (method === 'POST' && url.pathname === '/lb-clear') {
    const n = h.clearBoard(url.searchParams.get('board') ?? '');
    return n === null ? { code: 404, body: { error: 'unknown_board' } } : { code: 200, body: { cleared: n } };
  }
  if (method === 'POST' && url.pathname === '/lb-remove') {
    const rank = Number(url.searchParams.get('rank'));
    if (!Number.isInteger(rank)) return { code: 400, body: { error: 'bad_request' } };
    const r = h.removeEntry(url.searchParams.get('board') ?? '', rank);
    return r === null ? { code: 404, body: { error: 'unknown_board' } } : { code: r ? 200 : 404, body: { removed: r } };
  }
  if (method === 'GET' && url.pathname === '/analytics/summary') return { code: 200, body: h.getAnalyticsSummary() };
  if (method === 'GET' && url.pathname === '/analytics/export') {
    const type = url.searchParams.get('type') ?? 'all';
    const game = url.searchParams.get('game') || undefined;
    return { code: 200, body: h.exportAnalytics(type, game) };
  }
  return { code: 404, body: { error: 'not_found' } };
}

export function startControl(socketPath: string, h: ControlHandlers): http.Server {
  fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  try {
    fs.unlinkSync(socketPath);              // 前回の異常終了で残ったソケット
  } catch { /* なければ何もしない */ }
  const server = http.createServer((req, res) => {
    const url = safeUrl(req.url);
    const r = url ? handleAdminRequest(h, req.method ?? 'GET', url) : { code: 400, body: { error: 'bad_request' } };
    res.writeHead(r.code, { 'content-type': 'application/json' }).end(JSON.stringify(r.body));
  });
  // ソケットファイルは作られた瞬間から所有者専用にする(listen 後の chmod だけだと、その間は umask 次第で他ユーザーが繋げる)。
  // umask はプロセス全体に効くので、同期的に listen を始めた直後に元へ戻す(ソケットの作成は listen 呼び出し内で行われる)。
  const prevUmask = process.umask(0o177);
  try {
    server.listen(socketPath, () => {
      fs.chmodSync(socketPath, 0o600);      // 念のため明示する
    });
  } finally {
    process.umask(prevUmask);
  }
  return server;
}
