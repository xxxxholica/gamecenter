// hub + 全ゲームのdevサーバーを単一プロセス・単一ポートで起動する。
// 各ゲームは独立したVite devサーバーインスタンス(middlewareMode)として生成し、
// connect側の app.use('/games/<slug>', vite.middlewares) でパスプレフィックスルーティングする。
// vite自身のbase一致判定(baseMiddleware)には頼らない: base不一致のリクエストでも
// 最終的に各インスタンス内のvite404Middlewareがそのまま404を確定させてしまい、
// 他インスタンスへフォールスルーしないため。base設定自体は生成されるHTML/アセットURLに
// /games/<slug>/ を付与する目的だけに使う(connectが同じプレフィックスをリクエスト側で剥がす)。
// hubはプレフィックスなしで最後にマウントし、games以下にマッチしない残りを引き受ける。
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';
import connect from 'connect';
import { createServer as createViteServer } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const gamesDir = path.join(root, 'packages/games');
const hubDir = path.join(root, 'packages/hub');

const PORT = 5173;

const slugs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort();

const app = connect();
const httpServer = http.createServer(app);

// 開発用: 本番ではリバースプロキシが担う /admin/ を、ここで代わりに中継する。
// ローカル専用なので認証は無い。ブラウザで http://localhost:5173/admin/ を開く。
const DEV_PROXY_SECRET = 'dev-only-proxy-secret-0123456789';
const ONLINE_ADMIN_PORT = 8788;
app.use('/admin', (req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: ONLINE_ADMIN_PORT, method: req.method, path: req.url || '/', headers: { ...req.headers, host: 'localhost', 'x-online-proxy': DEV_PROXY_SECRET } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => res.writeHead(502).end('admin server is not running'));
  req.pipe(upstream);
});

// 開発用: 本番ではリバースプロキシが担う /api/(ランキングの保存)を、ここで同じサーバー(8787)へ中継する。
// connect はマウント先のプレフィックスを req.url から外すので、元のパスは originalUrl から取る。
const ONLINE_PORT = 8787;
app.use('/api', (req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: ONLINE_PORT, method: req.method, path: req.originalUrl || '/api/', headers: { ...req.headers, host: 'localhost' } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => res.writeHead(502).end('online server is not running'));
  req.pipe(upstream);
});

let viteServers = [];

try {
  const gameViteServers = await Promise.all(
    slugs.map((slug) =>
      createViteServer({
        root: path.join(gamesDir, slug),
        base: `/games/${slug}/`,
        appType: 'mpa',                                       // 存在しないパスにページを返さず 404 にする(本番と同じ)
        server: {
          middlewareMode: true,
          ws: { server: httpServer },
        },
      }),
    ),
  );
  slugs.forEach((slug, i) => app.use(`/games/${slug}`, gameViteServers[i].middlewares));

  const hubVite = await createViteServer({
    root: hubDir,
    base: '/',
    appType: 'mpa',                                           // /game のような打ち間違いのパスで、ハブが壊れた表示で出ないよう 404 にする
    server: {
      middlewareMode: true,
      ws: { server: httpServer },
    },
  });
  app.use(hubVite.middlewares);

  viteServers = [...gameViteServers, hubVite];
} catch (err) {
  console.error('\n  devサーバーの起動に失敗しました:\n');
  console.error(err);
  process.exit(1);
}

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

httpServer.listen(PORT, process.env.DEV_HOST, () => {
  console.log(`\n  Hub -> http://localhost:${PORT}/\n`);
});

// オンライン対戦サーバー(開発用: 全ゲームを起動時から開放)。
// 試す時は http://localhost:5173/games/<ゲーム>/ を複数タブで開き、START後のモード選択から「オンライン対戦」を選ぶ。管理画面は http://localhost:5173/admin/
const onlineServer = spawn(process.execPath, ['--watch', 'src/index.ts'], {
  cwd: path.join(root, 'packages/server'),
  env: {
    ...process.env,
    ONLINE_START_OPEN: '1',
    ONLINE_ALLOWED_ORIGINS: '*',
    // 開発中は、プレイチケット(最短プレイ時間・秒あたりの得点上限)の検証をしない。ランキングの動作確認がすぐできるように
    LEADERBOARD_TICKET_MODE: 'off',
    ONLINE_PROXY_SECRET: DEV_PROXY_SECRET,
    ONLINE_ADMIN_PORT: String(ONLINE_ADMIN_PORT),
    ONLINE_ADMIN_USER: process.env.ONLINE_ADMIN_USER ?? 'admin',
    ONLINE_ADMIN_PASS: process.env.ONLINE_ADMIN_PASS ?? 'admin',
    ONLINE_MAX_CONNS_PER_IP: '50',
    ONLINE_CONNECTS_PER_MIN: '300',
  },
  stdio: 'inherit',
});
onlineServer.on('error', (err) => console.error('[online] サーバーを起動できませんでした:', err.message));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) {
    // 2回目のシグナルは(close()が詰まっていても)強制終了する。
    process.exit(1);
  }
  shuttingDown = true;
  onlineServer.kill();
  const results = await Promise.allSettled(viteServers.map((vite) => vite.close()));
  for (const result of results) {
    if (result.status === 'rejected') console.error(result.reason);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
