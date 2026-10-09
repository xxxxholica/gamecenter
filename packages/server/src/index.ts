// オンライン対戦サーバー(複数ゲーム対応)。中継・集計のみを行い、物理は持たない。ゲームごとに対戦の場(ルーム)は1つ。
// 既定は「閉鎖」。主催者が開放している間だけ、誰でも参加できる(ゲームごとに別々に開放/閉鎖できる)。
// 管理操作は2経路: ①サーバー機上のUnixソケット(所有者のみ, npm run ctl) ②リバースプロキシの後ろに置く管理画面(admin.ts)。
// 接続: /online-ws?game=<ゲームid>、公開ステータス: /online-status(全ゲームの開催状況。個人情報なし)。
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectionManager } from './connections.ts';
import { createControlHandlers } from './controlHandlers.ts';
import { startControl, safeUrl, DEFAULT_SOCKET } from './control.ts';
import { startAdminWeb } from './admin.ts';
import { log } from './log.ts';
import { GameHost } from './host.ts';
import { LeaderboardStore } from './leaderboardStore.ts';
import { handleLeaderboardRequest } from './leaderboardApi.ts';
import { AnalyticsStore } from './analyticsStore.ts';
import { GAME_FACTORIES } from './games/index.ts';

const PORT = Number(process.env.ONLINE_PORT ?? 8787);
const HOST = process.env.ONLINE_HOST ?? '127.0.0.1';
const WS_PATH = process.env.ONLINE_WS_PATH ?? '/online-ws';
const LEADERBOARD_FILE = process.env.LEADERBOARD_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'leaderboard.json');
const ANALYTICS_FILE = process.env.ANALYTICS_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'analytics.json');
const CONTROL_SOCKET = process.env.ONLINE_CONTROL_SOCKET ?? DEFAULT_SOCKET;
const ADMIN_PORT = Number(process.env.ONLINE_ADMIN_PORT ?? 8788);
const PROXY_SECRET = process.env.ONLINE_PROXY_SECRET;
const ADMIN_USER = process.env.ONLINE_ADMIN_USER;
const ADMIN_PASS = process.env.ONLINE_ADMIN_PASS;

const hosts = new Map<string, GameHost>();
for (const [id, make] of Object.entries(GAME_FACTORIES)) hosts.set(id, new GameHost(make()));

/** 再起動したら、必ず閉鎖から始まる(開放状態は保存しない)。起動時から開放しておく(開発用): ONLINE_START_OPEN=1 */
if (process.env.ONLINE_START_OPEN === '1') for (const h of hosts.values()) if (!h.open) h.setOpen(true);

const leaderboard = new LeaderboardStore(LEADERBOARD_FILE);
const analytics = new AnalyticsStore(ANALYTICS_FILE);

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

const connections = createConnectionManager({ hosts, wsPath: WS_PATH, originAllowed, clientIp });

// 公開の読み取り専用ステータス(ゲームが「オンライン対戦」を出すかの判定用)。個人情報は含まない。
const server = http.createServer((req, res) => {
  if (handleLeaderboardRequest(req, res, clientIp(req), leaderboard, originAllowed, analytics)) return;
  if (req.method === 'GET' && safeUrl(req.url)?.pathname === '/online-status') {
    const games: Record<string, { open: boolean; players: number; max: number; phase: string }> = {};
    for (const h of hosts.values()) games[h.id] = { open: h.open, players: h.room.size, max: h.game.maxPlayers, phase: h.room.phase };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }).end(JSON.stringify({ games }));
    return;
  }
  res.writeHead(404).end();
});
server.on('upgrade', (req, socket, head) => connections.handleUpgrade(req, socket, head));

// アイドル切断・無応答の回収と、レート表の掃除。
setInterval(() => connections.sweep(), 5000);

const controlHandlers = createControlHandlers(hosts, leaderboard, () => connections.count(), analytics);
startControl(CONTROL_SOCKET, controlHandlers);
startAdminWeb(ADMIN_PORT, '127.0.0.1', PROXY_SECRET, ADMIN_USER, ADMIN_PASS, controlHandlers);

server.listen(PORT, HOST, () => {
  console.log(`[online] ws://${HOST}:${PORT}${WS_PATH}?game=<id> games=${[...hosts.keys()].join(',')} open=[${[...hosts.values()].filter((h) => h.open).map((h) => h.id).join(',')}]`);
});

// 1つの Promise の失敗でプロセスごと落ちて、開催中の対戦が全部切れないようにログだけ残す。
// (同期の uncaughtException は、状態が壊れたまま動き続けないよう握りつぶさない。落ちたらサービス管理側が再起動する)
process.on('unhandledRejection', (e) => log(`unhandledRejection: ${(e as Error)?.message ?? e}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    leaderboard.flush();
    analytics.flush();
    connections.closeAll(1001);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
