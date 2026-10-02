// オンライン対戦サーバー(複数ゲーム対応)。中継・集計のみを行い、物理は持たない。ゲームごとに対戦の場(ルーム)は1つ。
// 既定は「閉鎖」。主催者が開放している間だけ、誰でも参加できる(ゲームごとに別々に開放/閉鎖できる)。
// 管理操作は2経路: ①サーバー機上のUnixソケット(所有者のみ, npm run ctl) ②リバースプロキシの後ろに置く管理画面(admin.ts)。
// 接続: /online-ws?game=<ゲームid>、公開ステータス: /online-status(全ゲームの開催状況。個人情報なし)。
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { LIMITS, RateWindow } from './limits.ts';
import { startControl, safeUrl, DEFAULT_SOCKET, type ControlHandlers } from './control.ts';
import { startAdminWeb } from './admin.ts';
import { log } from './log.ts';
import { GameHost } from './host.ts';
import { GAME_FACTORIES } from './games/index.ts';
import type { Msg, Peer } from './engine.ts';

const PORT = Number(process.env.ONLINE_PORT ?? 8787);
const HOST = process.env.ONLINE_HOST ?? '127.0.0.1';
const WS_PATH = process.env.ONLINE_WS_PATH ?? '/online-ws';
const CONTROL_SOCKET = process.env.ONLINE_CONTROL_SOCKET ?? DEFAULT_SOCKET;
const ADMIN_PORT = Number(process.env.ONLINE_ADMIN_PORT ?? 8788);
const PROXY_SECRET = process.env.ONLINE_PROXY_SECRET;
const ADMIN_USER = process.env.ONLINE_ADMIN_USER;
const ADMIN_PASS = process.env.ONLINE_ADMIN_PASS;

const hosts = new Map<string, GameHost>();
for (const [id, make] of Object.entries(GAME_FACTORIES)) hosts.set(id, new GameHost(make()));

/** 再起動したら、必ず閉鎖から始まる(開放状態は保存しない)。起動時から開放しておく(開発用): ONLINE_START_OPEN=1 */
if (process.env.ONLINE_START_OPEN === '1') for (const h of hosts.values()) if (!h.open) h.setOpen(true);

const connectRate = new RateWindow(LIMITS.connectsPerMinPerIp, 60_000);
const connsByIp = new Map<string, number>();

interface Client extends Peer {
  ws: WebSocket;
  ip: string;
  host: GameHost;
  lastMsg: number;
  windowStart: number;
  windowCount: number;
}
const clients = new Set<Client>();
let nextId = 1;

/** id、または一意に決まる部分文字列(CLI・管理画面用)でゲームを探す。 */
function findHost(name: string): GameHost | null {
  const exact = hosts.get(name);
  if (exact) return exact;
  const part = [...hosts.values()].filter((h) => name && h.id.includes(name));
  return part.length === 1 ? part[0] : null;
}

// 公開の読み取り専用ステータス(ゲームが「オンライン対戦」を出すかの判定用)。個人情報は含まない。
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && safeUrl(req.url)?.pathname === '/online-status') {
    const games: Record<string, { open: boolean; players: number; max: number; phase: string }> = {};
    for (const h of hosts.values()) games[h.id] = { open: h.open, players: h.room.size, max: h.game.maxPlayers, phase: h.room.phase };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }).end(JSON.stringify({ games }));
    return;
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxPayloadBytes });

/** リバースプロキシ(ループバック)経由の時だけ X-Forwarded-For を信用する。 */
function clientIp(req: http.IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  const fwd = req.headers['x-forwarded-for'];
  if ((remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') && typeof fwd === 'string') {
    const ip = fwd.split(',')[0].trim();
    if (ip) return ip;
  }
  return remote;
}

/** 許可する Origin。環境変数 ONLINE_ALLOWED_ORIGINS(カンマ区切り。'*' で全許可=開発用)で上書きできる。 */
const ALLOWED_ORIGINS = (process.env.ONLINE_ALLOWED_ORIGINS ?? 'https://game.hinata.works,http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);
const originAllowed = (origin: string) => ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);

server.on('upgrade', (req, socket, head) => {
  const reject = (code: number) => {
    socket.write(`HTTP/1.1 ${code} X\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  const u = safeUrl(req.url);
  if (!u || u.pathname !== WS_PATH) return reject(404);
  const host = hosts.get(u.searchParams.get('game') ?? '');
  if (!host) return reject(404);
  // 他のサイトのページからの勝手な接続(CSWSH)を断る。ブラウザは必ず Origin を付ける(Origin 無し=ブラウザ以外はここでは許可)。
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin)) {
    log(`reject origin=${origin}`);
    return reject(403);
  }
  const ip = clientIp(req);
  if (!connectRate.hit(ip)) return reject(429);
  if (clients.size >= LIMITS.maxConnsTotal || (connsByIp.get(ip) ?? 0) >= LIMITS.maxConnsPerIp) return reject(503);
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip, host));
});

function onConnection(ws: WebSocket, ip: string, host: GameHost) {
  ws.on('error', () => ws.terminate());                    // 閉鎖中の早期 return より前に登録(不正フレームで未処理の error になってプロセスが落ちるのを防ぐ)
  // 閉鎖中は状態を伝えてすぐ切る。クライアント登録・ルーム・タイマーは一切作らない。
  if (!host.open) {
    ws.send(JSON.stringify({ t: 'status', open: false }), () => ws.close(4001, 'closed'));
    return;
  }
  const now = Date.now();
  const client: Client = {
    id: nextId++,
    ws,
    ip,
    host,
    lastMsg: now,
    windowStart: now,
    windowCount: 0,
    send: (msg: Msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    close: (code: number) => ws.close(code),
  };
  clients.add(client);
  host.clients.add(client);
  connsByIp.set(ip, (connsByIp.get(ip) ?? 0) + 1);
  log(`${host.id} connect id=${client.id} ip=${ip} clients=${clients.size}`);

  client.send({ t: 'status', open: true });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return ws.close(1003);
    const t = Date.now();
    if (t - client.windowStart >= 1000) {
      client.windowStart = t;
      client.windowCount = 0;
    }
    if (++client.windowCount > LIMITS.msgsPerSec) return ws.close(4008, 'rate');
    client.lastMsg = t;
    let msg: Msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg && typeof msg === 'object' && !Array.isArray(msg) && typeof msg.t === 'string') handle(client, msg);
  });
  ws.on('close', (code) => {
    log(`${host.id} disconnect id=${client.id} code=${code} clients=${clients.size - 1}`);
    host.room.leave(client.id);
    host.clients.delete(client);
    clients.delete(client);
    const n = (connsByIp.get(ip) ?? 1) - 1;
    if (n <= 0) connsByIp.delete(ip);
    else connsByIp.set(ip, n);
  });
}

function handle(c: Client, msg: Msg) {
  const host = c.host;
  if (msg.t === 'hello') {
    c.send({ t: 'hello', open: host.open, now: Date.now(), c: Number(msg.c) || 0 });
    return;
  }
  // 以降は開放中の一般操作のみ。
  if (!host.open) return;
  const room = host.room;
  switch (msg.t) {
    case 'join': {
      const r = room.join(c);
      if (r !== 'ok') c.send({ t: 'error', code: r });
      return;
    }
    case 'leave':
      room.leave(c.id);
      return;
    case 'loaded':
      room.setLoaded(c.id);
      return;
    case 'pref':
      room.handlePref(c.id, msg);
      return;
    default:
      room.handlePlay(c.id, msg);                           // state / finish / aim / fire など(ゲームが解釈する)
  }
}

// アイドル切断と、レート表の掃除。
setInterval(() => {
  const now = Date.now();
  connectRate.sweep(now);
  for (const c of clients) {
    if (now - c.lastMsg > LIMITS.idleTimeoutMs) {
      if (c.ws.readyState === c.ws.CLOSING || c.ws.readyState === c.ws.CLOSED) c.ws.terminate();
      else c.ws.close(4002, 'idle');
    }
  }
}, 5000);

const controlHandlers: ControlHandlers = {
  status: () => ({ games: [...hosts.values()].map((h) => h.status()), clients: clients.size }),
  open(game, opts) {
    const h = findHost(game);
    if (!h) return false;
    h.setOpen(true, opts);
    return true;
  },
  close(game) {
    if (game === 'all') {                                    // 緊急停止
      for (const h of hosts.values()) h.setOpen(false);
      return true;
    }
    const h = findHost(game);
    if (!h) return false;
    h.setOpen(false);
    return true;
  },
  kick(game, id) {
    return findHost(game)?.kick(id) ?? false;
  },
};
startControl(CONTROL_SOCKET, controlHandlers);
startAdminWeb(ADMIN_PORT, '127.0.0.1', PROXY_SECRET, ADMIN_USER, ADMIN_PASS, controlHandlers);

server.listen(PORT, HOST, () => {
  console.log(`[online] ws://${HOST}:${PORT}${WS_PATH}?game=<id> games=${[...hosts.keys()].join(',')} open=[${[...hosts.values()].filter((h) => h.open).map((h) => h.id).join(',')}]`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    for (const c of clients) c.ws.close(1001);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
