// hub + 全ゲームのdevサーバーを一括起動する。
// hubはVITE_GAME_PORTS(slug->port)を受け取り、/games/<slug>/ を各ゲームのdevサーバーへプロキシする。
// 各ゲームは --base /games/<slug>/ で起動するため、hub経由でアクセスした時のパスとdist配置後のパスが一致する。
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import concurrently from 'concurrently';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const gamesDir = path.join(root, 'packages/games');

const HUB_PORT = 5173;
const GAME_BASE_PORT = 5180;

const slugs = readdirSync(gamesDir)
  .filter((entry) => !entry.startsWith('.'))
  .sort();
const ports = Object.fromEntries(slugs.map((slug, i) => [slug, GAME_BASE_PORT + i]));

console.log(`\nHub:  http://localhost:${HUB_PORT}/`);
for (const slug of slugs) {
  console.log(`  games/${slug}/  -> http://localhost:${ports[slug]}/games/${slug}/`);
}
console.log('');

const { result } = concurrently(
  [
    {
      command: `npm run dev -w packages/hub -- --port ${HUB_PORT} --strictPort`,
      name: 'hub',
      prefixColor: 'cyan',
      env: { VITE_GAME_PORTS: JSON.stringify(ports) },
    },
    ...slugs.map((slug) => ({
      command: `npm run dev -w packages/games/${slug} -- --port ${ports[slug]} --strictPort --base /games/${slug}/`,
      name: slug,
      prefixColor: 'magenta',
    })),
  ],
  { killOthers: ['failure', 'success'] },
);

result.catch(() => process.exit(1));
