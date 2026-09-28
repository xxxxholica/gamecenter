// hub と、非表示(packages/hub/src/games.ts の hidden: true)以外のゲームだけをビルドし、dist/ に集約する。
// 非表示のゲームはビルドも配置もしないため、公開サーバーからも読み込めなくなる。
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hiddenSlugs } from '../packages/hub/src/games.ts';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const run = (args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' });

run(['run', 'build', '-w', 'packages/hub']);
for (const slug of readdirSync(path.join(root, 'packages/games'))) {
  if (slug.startsWith('.')) continue;
  if (hiddenSlugs.includes(slug)) {
    console.log(`skip hidden game: ${slug}`);
    continue;
  }
  run(['run', 'build', '--if-present', '-w', `packages/games/${slug}`]);
}
execFileSync('node', [path.join(root, 'scripts/assemble.mjs')], { stdio: 'inherit' });
