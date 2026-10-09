// ランキングのHTTP API(/api/...)。リバースプロキシが同一オリジンで中継する。
import type http from 'node:http';
import { RateWindow, num } from './limits.ts';
import { safeUrl } from './control.ts';
import { LeaderboardStore } from './leaderboardStore.ts';
import type { AnalyticsStore } from './analyticsStore.ts';
import { log } from './log.ts';

/** 本文の上限。ゴースト(数千サンプル)を含む登録が通る大きさ */
const MAX_BATCH_EVENTS = 50;
export const MAX_BODY_BYTES = 512 * 1024;
/** 会場の共有NATを考慮して、同一IPのPOSTは多めに許可する */
const postRate = new RateWindow(num('LEADERBOARD_POSTS_PER_MIN', 120), 60_000);
// アナリティクスはランキングと枠を分ける(会場の共有NATで全員が同じIPでも、ランキング保存を巻き込まず取りこぼさない)
const analyticsRate = new RateWindow(num('ANALYTICS_POSTS_PER_MIN', 1200), 60_000);
setInterval(() => { postRate.sweep(); analyticsRate.sweep(); }, 30_000).unref();

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

function send(res: http.ServerResponse, code: number, body: object) {
  res.writeHead(code, JSON_HEADERS).end(JSON.stringify(body));
}

/** 本文をJSONとして読む。大きすぎる・不正なJSONは null(res には応答済み)。 */
function readJson(req: http.IncomingMessage, res: http.ServerResponse): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    let done = false;
    const fail = (code: number, error: string) => {
      if (done) return;
      done = true;
      send(res, code, { error });
      req.resume();
      resolve(null);
    };
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) return fail(413, 'too_large');
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (v && typeof v === 'object' && !Array.isArray(v)) return resolve(v);
      } catch { /* 下で 400 */ }
      send(res, 400, { error: 'bad_request' });
      resolve(null);
    });
    req.on('error', () => fail(400, 'bad_request'));
  });
}

/** パスの1区間をデコードする。不正なパーセントエンコーディング(%だけ等)は null */
function decodeSegment(p: string): string | null {
  try {
    return decodeURIComponent(p);
  } catch {
    return null;
  }
}

/**
 * /api/ 以下を処理する。対象のパスなら true(応答済み)、そうでなければ false を返す。
 *   GET  /api/leaderboards
 *   GET  /api/leaderboard/:slug[/:variant]
 *   POST /api/leaderboard/:slug[/:variant]
 *   GET  /api/ghost/:slug/:variant/:id
 * どんな入力でも例外を外に出さない(HTTPサーバーの例外でプロセスが落ち、オンライン対戦まで止まらないように)。
 * POST は ブラウザ(Content-Type: application/json、許可された Origin)からだけ受け付け、他のサイトのページからの勝手な送信を断る。
 */
export function handleLeaderboardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ip: string,
  store: LeaderboardStore,
  originAllowed: (origin: string) => boolean,
  analytics?: AnalyticsStore,
): boolean {
  const url = safeUrl(req.url);
  if (!url || !url.pathname.startsWith('/api/')) return false;
  try {
    route(req, res, url, ip, store, originAllowed, analytics);
  } catch (e) {
    log(`leaderboard error: ${(e as Error).message}`);
    if (!res.headersSent) send(res, 500, { error: 'internal' });
    else res.end();
  }
  return true;
}

function route(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  ip: string,
  store: LeaderboardStore,
  originAllowed: (origin: string) => boolean,
  analytics?: AnalyticsStore,
): void {
  const decoded = url.pathname.split('/').slice(2).map(decodeSegment);
  if (decoded.some((p) => p === null)) return send(res, 400, { error: 'bad_request' });
  const parts = decoded as string[];
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    const origin = req.headers.origin;
    const allowOrigin = origin && (origin === 'null' || originAllowed(origin)) ? origin : '*';
    res.writeHead(204, {
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    }).end();
    return;
  }

  if (method === 'GET' && parts[0] === 'leaderboards' && parts.length === 1) {
    return send(res, 200, { boards: store.all() });
  }

  if (method === 'GET' && parts[0] === 'leaderboard' && (parts.length === 2 || parts.length === 3)) {
    const entries = store.list(parts[1], parts[2]);
    return entries ? send(res, 200, { entries }) : send(res, 404, { error: 'unknown_board' });
  }

  if (method === 'GET' && parts[0] === 'ghost' && parts.length === 4) {
    const ghost = store.ghost(parts[1], parts[2], parts[3]);
    return ghost ? send(res, 200, { ghost }) : send(res, 404, { error: 'not_found' });
  }

  if (method === 'POST' && parts[0] === 'leaderboard' && (parts.length === 2 || parts.length === 3)) {
    const origin = req.headers.origin;
    // Safari の sandboxed iframe / プライベートブラウズでの Origin: 'null' は許可する
    if (origin && origin !== 'null' && !originAllowed(origin)) return send(res, 403, { error: 'forbidden_origin' });
    // JSON以外(text/plain 等)は、他のサイトのフォーム・fetch が事前確認(preflight)なしで送れる形式なので受け付けない
    if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return send(res, 415, { error: 'unsupported_media_type' });
    if (!postRate.hit(ip)) return send(res, 429, { error: 'rate' });
    readJson(req, res).then((body) => {
      if (!body) return;
      const r = store.submit(parts[1], parts[2], body);
      if (!r.ok) return send(res, r.error === 'unknown_board' ? 404 : 400, { error: r.error });
      if (r.rank > 0) log(`leaderboard ${parts[1]}${parts[2] ? ':' + parts[2] : ''} rank=${r.rank} ip=${ip}`);
      send(res, 200, { rank: r.rank, entries: r.entries });
    }).catch((e: Error) => {
      log(`leaderboard error: ${e.message}`);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    });
    return;
  }

  if (method === 'POST' && parts[0] === 'analytics' && parts[1] === 'event' && parts.length === 2) {
    if (!analytics) return send(res, 503, { error: 'analytics_unavailable' });
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !originAllowed(origin)) return send(res, 403, { error: 'forbidden_origin' });
    if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return send(res, 415, { error: 'unsupported_media_type' });
    if (!analyticsRate.hit(ip)) return send(res, 429, { error: 'rate' });
    readJson(req, res).then((body) => {
      if (!body) return;
      // 再送キューからのまとめ送信 { events: [...] } と、従来の1件送信の両方を受ける
      const list: unknown[] = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH_EVENTS) : [body];
      let accepted = 0;
      let first: { ok: boolean; eventId: string } | undefined;
      for (const raw of list) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const b = raw as Record<string, unknown>;
        const type = typeof b.type === 'string' ? b.type.trim().slice(0, 64) : '';
        if (!type) continue;
        const r = analytics.recordEvent({
          sessionId: typeof b.sessionId === 'string' ? b.sessionId.trim().slice(0, 80) : '',
          type,
          gameId: typeof b.gameId === 'string' ? b.gameId.trim().slice(0, 64) : undefined,
          timestamp: typeof b.timestamp === 'string' ? b.timestamp : undefined,
          data: b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? (b.data as Record<string, unknown>) : undefined,
          device: b.device && typeof b.device === 'object' && !Array.isArray(b.device) ? (b.device as any) : undefined,
          referrer: typeof b.referrer === 'string' ? b.referrer.slice(0, 500) : undefined,
          clientEventId: typeof b.eventId === 'string' ? b.eventId : undefined,
        });
        accepted++;
        first ??= r;
      }
      if (accepted === 0) return send(res, 400, { error: 'bad_request' });
      send(res, 200, { ...first, accepted });
    }).catch((e: Error) => {
      log(`analytics error: ${e.message}`);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    });
    return;
  }

  send(res, 404, { error: 'not_found' });
}
