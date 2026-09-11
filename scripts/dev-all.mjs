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

let viteServers = [];

try {
  const gameViteServers = await Promise.all(
    slugs.map((slug) =>
      createViteServer({
        root: path.join(gamesDir, slug),
        base: `/games/${slug}/`,
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

httpServer.listen(PORT, () => {
  console.log(`\n  Hub -> http://localhost:${PORT}/\n`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) {
    // 2回目のシグナルは(close()が詰まっていても)強制終了する。
    process.exit(1);
  }
  shuttingDown = true;
  const results = await Promise.allSettled(viteServers.map((vite) => vite.close()));
  for (const result of results) {
    if (result.status === 'rejected') console.error(result.reason);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
