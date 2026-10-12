// WebSocket の接続管理: アップグレードの検査(Origin・IP・接続数)、1接続ごとのレート制限・メッセージ振り分け、死んだ接続の回収。
// ゲームの進行そのものは engine.ts(Room)と games/ が担う。
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { LIMITS, RateWindow, ipKey } from './limits.ts';
import { safeUrl } from './control.ts';
import { log } from './log.ts';
import type { GameHost } from './host.ts';
import type { Msg, Peer } from './engine.ts';

interface Client extends Peer {
  ws: WebSocket;
  ip: string;
  /** 回数制限・接続数の数え方に使う丸めた IP(IPv6 は /64) */
  key: string;
  host: GameHost;
  lastMsg: number;
  /** 直近の ping に pong が返ったか(返らないまま次の ping 時刻が来たら、死んだ接続として切る) */
  alive: boolean;
  windowStart: number;
  windowCount: number;
}

export interface ConnectionOptions {
  hosts: Map<string, GameHost>;
  wsPath: string;
  originAllowed: (origin: string) => boolean;
  clientIp: (req: http.IncomingMessage) => string;
}

export interface ConnectionManager {
  /** 全体の接続数 */
  count(): number;
  /** http サーバーの 'upgrade' イベントに渡す */
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void;
  /** アイドル・無応答の切断と、レート表の掃除(定期的に呼ぶ) */
  sweep(now?: number): void;
  /** サーバー停止時: すべての接続を閉じる */
  closeAll(code: number): void;
}

export function createConnectionManager(opts: ConnectionOptions): ConnectionManager {
  const { hosts, wsPath, originAllowed, clientIp } = opts;
  const maxPayload = Math.max(LIMITS.maxPayloadBytes, ...[...hosts.values()].map((h) => h.game.maxPayloadBytes ?? LIMITS.maxPayloadBytes));
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  const connectRate = new RateWindow(LIMITS.connectsPerMinPerIp, 60_000);
  const connsByIp = new Map<string, number>();
  const clients = new Set<Client>();
  let nextId = 1;

  function handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (code: number) => {
      socket.write(`HTTP/1.1 ${code} X\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const u = safeUrl(req.url);
    if (!u || u.pathname !== wsPath) return reject(404);
    const host = hosts.get(u.searchParams.get('game') ?? '');
    if (!host) return reject(404);
    // 他のサイトのページからの勝手な接続(CSWSH)を断る。ブラウザは必ず Origin を付ける(Origin 無し=ブラウザ以外はここでは許可)。
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin)) {
      log(`reject origin=${origin}`);
      return reject(403);
    }
    const ip = clientIp(req);
    const key = ipKey(ip);
    if (!connectRate.hit(key)) return reject(429);
    if (clients.size >= LIMITS.maxConnsTotal || (connsByIp.get(key) ?? 0) >= LIMITS.effectiveConnsPerIp) return reject(503);
    // 繋ぐだけで join しない接続を溜めて、他の参加者の枠を塞ぐのを防ぐ(参加済みの接続は、上の IP ごとの上限で数える)
    let idle = 0;
    for (const c of clients) if (c.key === key && !c.host.room.members.has(c.id)) idle++;
    if (idle >= LIMITS.maxUnjoinedPerIp) return reject(503);
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip, key, host));
  }

  function onConnection(ws: WebSocket, ip: string, key: string, host: GameHost): void {
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
      key,
      host,
      lastMsg: now,
      alive: true,
      windowStart: now,
      windowCount: 0,
      send: (msg: Msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code: number) => ws.close(code),
    };
    clients.add(client);
    host.clients.add(client);
    connsByIp.set(key, (connsByIp.get(key) ?? 0) + 1);
    log(`${host.id} connect id=${client.id} ip=${ip} clients=${clients.size}`);

    client.send({ t: 'status', open: true });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(1003);
      // 文字列に起こす前に、バイト数だけで弾く(他ゲームの上限は小さいまま。ws 自体の上限は最大のゲームに合わせてある)
      const size = Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
      if (size > (host.game.maxPayloadBytes ?? LIMITS.maxPayloadBytes)) return ws.close(1009);
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
    ws.on('pong', () => { client.alive = true; });
    ws.on('close', (code) => {
      log(`${host.id} disconnect id=${client.id} code=${code} clients=${clients.size - 1}`);
      host.room.leave(client.id);
      host.clients.delete(client);
      clients.delete(client);
      const n = (connsByIp.get(key) ?? 1) - 1;
      if (n <= 0) connsByIp.delete(key);
      else connsByIp.set(key, n);
    });
  }

  function handle(c: Client, msg: Msg): void {
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

  return {
    count: () => clients.size,
    handleUpgrade,
    sweep(now = Date.now()) {
      connectRate.sweep(now);
      for (const c of clients) {
        if (c.ws.readyState === c.ws.OPEN) {
          // 無言で消えた接続(Wi-Fi切れ・スリープなど)は、枠を占有し続けないよう早めに回収する
          if (!c.alive) { c.ws.terminate(); continue; }
          c.alive = false;
          c.ws.ping();
        }
        if (now - c.lastMsg > LIMITS.idleTimeoutMs) {
          if (c.ws.readyState === c.ws.CLOSING || c.ws.readyState === c.ws.CLOSED) c.ws.terminate();
          else c.ws.close(4002, 'idle');
        }
      }
    },
    closeAll(code) {
      for (const c of clients) c.ws.close(code);
    },
  };
}
